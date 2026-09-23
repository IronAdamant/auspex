import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { BrowserSession } from "@solarisdk/browser"
import { agentReceiptOk, deriveCheckReason, type CheckReason, type SpecialCheckReason } from "./check-reason.ts"
import { persistAgentManifest } from "./agent-receipt.ts"
import { loginTraceSeedExtras, recordPostHandoffTrace } from "./login-trace.ts"
import { parseDeviceOptions } from "./device-emulation.ts"
import { requireCheckUrl } from "./http-url.ts"
import { sessionCreateFromCheck } from "./launch-options.ts"
import { runPageActions } from "./page-actions.ts"
import { MAX_IMAGE_BYTES, fitPngUnderCap } from "./png-fit.ts"
import {
  emptyProfileSeedError,
  finalizeLoginGuide,
  isEmptySeed,
  persistLiveProfile,
  seedFromStorageState,
  type ProfileSaveResult,
  type ProfileSeed,
} from "./profile-persist.ts"
import {
  captureStorageState,
  isLoggedOutLanding,
  isPersistableAppUrl,
  originOf,
  PUBLIC_PROFILE_SAVE_ERROR,
} from "./profile-storage.ts"
import { stampProfileHostAdvice } from "./profile-host-advice.ts"
import { savedCheckForProfile } from "./saved-checks.ts"
import { HANDOFF_PHONE_DOOR_BAN, requireProfileName } from "./profiles.ts"
import { attachRecordedReplay } from "./replay-save.ts"
import { forgetLive, rememberLive } from "./session-ledger.ts"
import { excerptOf, haystackMatches, normalizeHaystack, prepareCheckExcerpt, requireExpect } from "./text.ts"
import { ensureRunDir, packageRoot } from "./paths.ts"
import { diffAgainstLastReceipt, type ReceiptDiff } from "./receipt-diff.ts"
import { assertRecordNotLoggedIn, assertRecordProfileAllowed } from "./tool-schema.ts"
import { assertPageActionsAllowed } from "./page-actions.ts"
import {
  createClient,
  checkOverallTimeoutMs,
  gotoWithSessionRestore,
  GOTO_TIMEOUT_MS,
  launchBrowser,
  NETWORKIDLE_TIMEOUT_MS,
  pageForSession,
  resolveProfileId,
  waitUntilReleased,
} from "./solari.ts"
import { AuspexError, classifySolariError, explainSolariError } from "./errors.ts"
import { noopProgress, type ProgressFn } from "./progress.ts"
import { completeSso, describeAuthWall, shouldFailClosedAuth, type SsoProvider } from "./sso.ts"
import {
  boundPromise,
  closeThenRelease,
  CLOSE_TIMEOUT_MS,
  observeAbort,
  ReadyRelease,
  raceWithTimeout,
  SCREENSHOT_TIMEOUT_MS,
} from "./timeout.ts"

type Page = Awaited<ReturnType<BrowserSession["newPage"]>>

export type CheckOptions = {
  url: string
  expect: string
  selector?: string
  profile?: string
  stealth?: boolean
  record?: boolean
  sso?: boolean
  ssoProvider?: SsoProvider
  allowRecordProfile?: boolean
  allowPageActions?: boolean
  waitFor?: string
  fill?: string
  value?: string
  click?: string
  proxy?: string
  proxySticky?: string
  captcha?: boolean
  saveProfile?: boolean
  verifyWithProfile?: boolean
  mobile?: boolean
  device?: string
  onProgress?: ProgressFn
}

export type { CheckReason } from "./check-reason.ts"

export type CheckResult = {
  /** Agent success: reason is matched (verify, when it ran, is folded in by toAgentReceipt). */
  ok: boolean
  /** Protocol success (URL+PNG, not loggedOut/needsHuman/recordedLoggedIn). Not the receipt `ok`. */
  protocolOk?: boolean
  reason: CheckReason
  url: string
  expect: string
  screenshotPath: string
  title: string
  finalUrl: string
  matched: boolean
  excerpt: string
  sessionId: string
  networkIdle: boolean
  replayReady?: boolean
  waitedFor?: string
  filled?: string
  clicked?: string
  needsHuman?: boolean
  next?: string
  nextCall?: import("./next-call.ts").NextCall
  profileHostMatch?: boolean
  suggestedProfile?: string
  diff?: ReceiptDiff
  profileSeed?: ProfileSeed
  profileSaved?: ProfileSaveResult
}

export { packageRoot } from "./paths.ts"

export type FinalizeLoginTargetOpts = {
  profile: string
  url?: string
  expect?: string
}

/** Agent `next` when a profile-seeded check lands logged-out with cookies. */
export function checkLoggedOutGuide(profile: string, cookies: number): {
  text: string
  nextCall: import("./next-call.ts").NextCall
} {
  const fin = finalizeLoginGuide(profile)
  return {
    text: `Profile has ${cookies} cookie(s) but landed on logged-out page. Cookies alone may not restore app session (e.g., Microsoft OAuth SPA needs sessionStorage). ${fin.text}`,
    nextCall: fin.nextCall,
  }
}

export function checkLoggedOutNext(profile: string, cookies: number): string {
  return checkLoggedOutGuide(profile, cookies).text
}

/** Agent `next` on a Microsoft/Google password wall. Finalize only after human Save — never during the wall. */
export function needsHumanGuide(profile?: string): {
  text: string
  nextCall: import("./next-call.ts").NextCall
} {
  const name = profile?.trim() || "<yours>"
  const text =
    `Stop. Microsoft or Google password/OTP wall detected. Call auspex_login --profile ${name} and show handoff.url (chooser: Phone or Desktop, same hash). Labeled deep links: handoff.mobileUrl (Auspex phone page with a real text field so the phone keyboard can open) and handoff.desktopUrl (Auspex desktop page when minted, otherwise console Open editor, hardware keyboard). ` +
    HANDOFF_PHONE_DOOR_BAN +
    ` Never fill password via agent tools. After human completes sign-in and Save: await-login --profile ${name} --save-editor then finalize-login --profile ${name} --url <url> --expect <string>. Do not retry check on cookies alone. Never --record.`
  const nextCall: import("./next-call.ts").NextCall = { tool: "auspex_login" }
  if (profile?.trim()) nextCall.profile = profile.trim()
  return { text, nextCall }
}

export function needsHumanNext(profile?: string): string {
  return needsHumanGuide(profile).text
}

/** Resolve URL/expect for finalize-login. Saved-check profiles supply defaults; unknown profiles require both. */
export function resolveFinalizeLoginTarget(opts: FinalizeLoginTargetOpts): { url: string; expect: string } {
  const saved = savedCheckForProfile(opts.profile)
  const url = opts.url || saved?.url
  const expect = opts.expect || saved?.expect
  if (!url || !expect) {
    throw new Error(
      "finalize-login requires --url and --expect unless --profile matches a saved check (e.g. consistencyhub)",
    )
  }
  return { url, expect }
}

/** CLI/MCP finalize-login: SSO + save-profile to capture sessionStorage. */
export async function runFinalizeLogin(opts: {
  profile: string
  url?: string
  expect?: string
  ssoProvider?: SsoProvider
  onProgress?: ProgressFn
}): Promise<CheckResult> {
  const { url, expect } = resolveFinalizeLoginTarget(opts)
  const result = await runCheck({
    url,
    expect,
    profile: requireProfileName(opts.profile),
    sso: true,
    ssoProvider: opts.ssoProvider ?? "auto",
    saveProfile: true,
    onProgress: opts.onProgress,
  })
  return stampProfileHostAdvice(result, { profile: opts.profile, url })
}

export function toReceiptPath(absPath: string): string {
  return path.relative(packageRoot, absPath).replaceAll("\\", "/")
}

export function runDirFromResult(result: CheckResult): string {
  const abs = path.isAbsolute(result.screenshotPath)
    ? result.screenshotPath
    : path.join(packageRoot, result.screenshotPath)
  return path.dirname(abs)
}

async function extractPage(
  page: Page,
  selector: string | undefined,
  signal: AbortSignal,
): Promise<{ title: string; finalUrl: string; raw: string; hasPassword: boolean }> {
  return observeAbort(
    page.evaluate((sel: string | null) => {
      const el = sel ? (document.querySelector(sel) as HTMLElement | null) : document.body
      return {
        title: document.title,
        finalUrl: location.href,
        raw: el?.innerText ?? "",
        hasPassword: Boolean(document.querySelector('input[type="password"]')),
      }
    }, selector ?? null),
    signal,
  )
}

async function writeFittedScreenshot(abs: string): Promise<void> {
  const png = await readFile(abs)
  const fitted = fitPngUnderCap(png, MAX_IMAGE_BYTES)
  if (fitted !== png) await writeFile(abs, fitted)
}

export async function runCheck(opts: CheckOptions): Promise<CheckResult> {
  requireExpect(opts.expect)
  requireCheckUrl(opts.url, "url")
  assertRecordProfileAllowed(opts)
  assertRecordNotLoggedIn(opts)
  assertPageActionsAllowed(opts)
  if (opts.profile) opts = { ...opts, profile: requireProfileName(opts.profile) }
  const onProgress = opts.onProgress ?? noopProgress
  const solari = createClient()
  const closer = new ReadyRelease()
  let sessionId = ""
  const outDir = await ensureRunDir()
  const screenshotAbs = path.join(outDir, "screenshot.png")
  const screenshotPath = toReceiptPath(screenshotAbs)

  let title = ""
  let finalUrl = ""
  let excerpt = ""
  let matched = false
  let networkIdle = false
  let replayReady = false
  let waitedFor: string | undefined
  let filled: string | undefined
  let clicked: string | undefined
  let profileSeed: ProfileSeed | undefined
  let profileSaved: ProfileSaveResult | undefined
  let needsHuman = false
  let special: SpecialCheckReason | undefined
  let workError: unknown

  const work = async (isCancelled: () => boolean, signal: AbortSignal) => {
    try {
      const deviceContextOptions = parseDeviceOptions({ mobile: opts.mobile, device: opts.device })
      onProgress("launching")
      const profileId = opts.profile ? await resolveProfileId(solari, opts.profile) : undefined
      if (isCancelled()) return
      const browser = await observeAbort(
        launchBrowser(solari, sessionCreateFromCheck({ ...opts, profileId }), signal),
        signal,
      )
      closer.set(async () => {
        onProgress("closing")
        await closeThenRelease(
          () => browser.close(),
          async () => {
            await solari.sessions.releaseAndWait(browser.id)
            await waitUntilReleased(browser.id).catch(() => undefined)
          },
          CLOSE_TIMEOUT_MS,
        )
      })
      sessionId = browser.id
      await rememberLive("browser", sessionId).catch(() => undefined)
      if (isCancelled()) return
      profileSeed = {
        ...seedFromStorageState(browser.session.storageState, originOf(opts.url)),
        ...loginTraceSeedExtras(browser.session.storageState, originOf(opts.url)),
      }
      if (opts.profile && !opts.sso && isEmptySeed(profileSeed)) {
        throw new Error(emptyProfileSeedError(opts.profile))
      }
      const page = await pageForSession(browser, deviceContextOptions)
      if (isCancelled()) return
      onProgress("goto")
      await gotoWithSessionRestore(page, {
        url: opts.url,
        signal,
        profile: Boolean(opts.profile),
      })
      if (isCancelled()) return
      if (opts.sso) {
        onProgress("sso")
        const sso = await completeSso(page, { provider: opts.ssoProvider ?? "auto", isCancelled, signal })
        if (sso.needsHuman) {
          needsHuman = true
          special = "needsHuman"
        }
      }
      if (isCancelled()) return
      if (!needsHuman) {
        const actions = await runPageActions(page, opts, signal)
        waitedFor = actions.waitedFor
        filled = actions.filled
        clicked = actions.clicked
      }
      onProgress("settle")
      try {
        await page.waitForLoadState("networkidle", { timeout: NETWORKIDLE_TIMEOUT_MS, signal })
        networkIdle = true
      } catch {
        networkIdle = false
      }
      if (opts.profile && !needsHuman) {
        await page
          .waitForURL((url) => isPersistableAppUrl(url.toString()), { timeout: 20_000, signal })
          .catch(() => undefined)
      }
      if (isCancelled()) return
      onProgress("extract")
      let raw = ""
      let hasPassword = false
      try {
        const extracted = await extractPage(page, opts.selector, signal)
        title = extracted.title
        finalUrl = extracted.finalUrl || page.url()
        raw = extracted.raw
        hasPassword = extracted.hasPassword
        const haystack = normalizeHaystack(raw)
        excerpt = excerptOf(haystack)
        matched = haystackMatches(raw, opts.expect)
      } catch (extractErr) {
        title = title || (await observeAbort(page.title(), signal).catch(() => ""))
        finalUrl = page.url()
        const authUrl = new URL(finalUrl)
        if (shouldFailClosedAuth(authUrl, opts)) {
          matched = false
          excerpt = `still on ${finalUrl}. ${extractErr instanceof Error ? extractErr.message : String(extractErr)}`
        } else {
          throw extractErr
        }
      }
      if (finalUrl && shouldFailClosedAuth(new URL(finalUrl), opts)) {
        matched = false
        excerpt = `still on ${finalUrl}. ${excerpt}`
      }
      if (!needsHuman && finalUrl) {
        const wall = describeAuthWall({ url: finalUrl, hasPasswordInput: hasPassword, text: raw || excerpt })
        if (wall.needsHuman) {
          needsHuman = true
          special = "needsHuman"
          matched = false
        }
      }
      if (needsHuman) {
        matched = false
        excerpt = prepareCheckExcerpt({
          raw: raw || excerpt,
          needsHuman: true,
          prefix: `needsHuman: password or OTP wall at ${finalUrl || page.url()}.`,
        })
      } else if (opts.profile && finalUrl && isLoggedOutLanding(finalUrl, { matched })) {
        special = "loggedOut"
        matched = false
        excerpt = prepareCheckExcerpt({
          raw: raw || excerpt,
          prefix: `loggedOut: landed on ${finalUrl}.`,
        })
      } else {
        excerpt = prepareCheckExcerpt({ raw: raw || excerpt })
      }
      if (!needsHuman) {
        onProgress("screenshot")
        await page.screenshot({
          path: screenshotAbs,
          type: "png",
          fullPage: true,
          signal,
          timeout: SCREENSHOT_TIMEOUT_MS,
        })
        await writeFittedScreenshot(screenshotAbs)
      }
      if (opts.saveProfile && profileId && !isCancelled() && !needsHuman) {
        onProgress("save-profile")
        const liveUrl = finalUrl || page.url()
        if (!isPersistableAppUrl(liveUrl)) {
          profileSaved = {
            ok: false,
            cookies: 0,
            origins: 0,
            error: PUBLIC_PROFILE_SAVE_ERROR,
          }
        } else {
          const state = await captureStorageState(browser)
          const origin = originOf(liveUrl)
          profileSaved = await persistLiveProfile({
            solari,
            profileId,
            sessionId,
            state,
            origin,
            lockName: opts.profile,
          })
        }
      }
    } finally {
      closer.skip()
    }
  }

  try {
    try {
      await raceWithTimeout(
        work,
        checkOverallTimeoutMs(opts),
        `auspex check timed out after ${checkOverallTimeoutMs(opts)}ms`,
      )
    } catch (err) {
      workError = err
    } finally {
      try {
        await closer.release()
        if (sessionId) await forgetLive("browser", sessionId).catch(() => undefined)
      } catch (closeErr) {
        const closeMsg = `session close failed: ${explainSolariError(closeErr)}`
        if (workError) throw new Error(`${explainSolariError(workError)}; ${closeMsg}`)
        throw new Error(closeMsg)
      }
    }
    if (workError) {
      throw new AuspexError(explainSolariError(workError), {
        issue: classifySolariError(workError),
        sessionId: sessionId || undefined,
        screenshotPath: existsSync(screenshotAbs) ? screenshotPath : undefined,
        cause: workError,
      })
    }

    if (opts.record && finalUrl && isPersistableAppUrl(finalUrl)) {
      special = "recordedLoggedIn"
    } else if (opts.record && sessionId) {
      onProgress("replay")
      replayReady = await attachRecordedReplay(solari, sessionId, outDir)
    }

    const authFail = Boolean(finalUrl && shouldFailClosedAuth(new URL(finalUrl), opts))
    const loggedOut = special === "loggedOut"
    const blockedHuman = special === "needsHuman" || needsHuman
    const savedOk = !opts.saveProfile || profileSaved?.ok === true
    const protocolOk = Boolean(
      finalUrl &&
        existsSync(screenshotAbs) &&
        !authFail &&
        savedOk &&
        !loggedOut &&
        !blockedHuman &&
        special !== "recordedLoggedIn",
    )
    const reason = deriveCheckReason({
      special,
      needsHuman,
      matched,
      networkIdle,
      finalUrl,
      excerpt,
      screenshotOk: existsSync(screenshotAbs),
    })
    
    let next: string | undefined
    let nextCall: CheckResult["nextCall"]
    if (reason === "loggedOut" && profileSeed && profileSeed.cookies > 0) {
      const guided = checkLoggedOutGuide(opts.profile ?? "<name>", profileSeed.cookies)
      next = guided.text
      nextCall = guided.nextCall
    } else if (reason === "needsHuman") {
      const guided = needsHumanGuide(opts.profile)
      next = guided.text
      nextCall = guided.nextCall
    }
    
    const diff = await diffAgainstLastReceipt({
      url: opts.url,
      excerpt,
      finalUrl,
      excludeDir: outDir,
    })
    const result: CheckResult = {
      ok: agentReceiptOk({ protocolOk, reason }),
      protocolOk,
      reason,
      url: opts.url,
      expect: opts.expect,
      screenshotPath,
      title,
      finalUrl,
      matched,
      excerpt,
      sessionId,
      networkIdle,
      replayReady: opts.record ? replayReady : undefined,
      waitedFor,
      filled,
      clicked,
      needsHuman: needsHuman || undefined,
      next,
      nextCall,
      diff,
      profileSeed,
      profileSaved,
    }
    await persistAgentManifest(result)
    if (opts.sso && opts.saveProfile && reason === "needsHuman" && opts.profile) {
      await recordPostHandoffTrace({
        profile: opts.profile,
        status: "needsHuman",
        foldReason: "needsHuman",
      }).catch(() => undefined)
    }
    return result
  } finally {
    try {
      await boundPromise(
        solari.close(),
        CLOSE_TIMEOUT_MS,
        `solari close timed out after ${CLOSE_TIMEOUT_MS}ms`,
      )
    } catch {
      /* local proxy stop is bounded; session already released */
    }
  }
}
