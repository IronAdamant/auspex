import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { BrowserSession } from "@solarisdk/browser"
import { deriveCheckReason, type CheckReason, type SpecialCheckReason } from "./check-reason.ts"
import { requireCheckUrl } from "./http-url.ts"
import { sessionCreateFromCheck } from "./launch-options.ts"
import { runPageActions } from "./page-actions.ts"
import { MAX_IMAGE_BYTES, fitPngUnderCap } from "./png-fit.ts"
import {
  emptyProfileSeedError,
  isEmptySeed,
  persistLiveProfile,
  seedFromStorageState,
  type ProfileSaveResult,
  type ProfileSeed,
} from "./profile-persist.ts"
import {
  captureStorageState,
  hydrateSessionStorage,
  isLoggedOutLanding,
  isPersistableAppUrl,
  originOf,
  PUBLIC_PROFILE_SAVE_ERROR,
} from "./profile-storage.ts"
import { requireProfileName } from "./profiles.ts"
import { attachRecordedReplay } from "./replay-save.ts"
import { forgetLive, rememberLive } from "./session-ledger.ts"
import { excerptOf, haystackMatches, normalizeHaystack, requireExpect } from "./text.ts"
import { packageRoot } from "./paths.ts"
import { diffAgainstLastReceipt, type ReceiptDiff } from "./receipt-diff.ts"
import { assertRecordNotLoggedIn, assertRecordProfileAllowed } from "./tool-schema.ts"
import {
  createClient,
  checkOverallTimeoutMs,
  GOTO_TIMEOUT_MS,
  launchBrowser,
  NETWORKIDLE_TIMEOUT_MS,
  pageForSession,
  resolveProfileId,
  waitUntilReleased,
} from "./solari.ts"
import { AuspexError, classifySolariError, explainSolariError } from "./errors.ts"
import { noopProgress, type ProgressFn } from "./progress.ts"
import { completeSso, shouldFailClosedAuth, type SsoProvider } from "./sso.ts"
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
  waitFor?: string
  fill?: string
  value?: string
  click?: string
  proxy?: string
  proxySticky?: string
  captcha?: boolean
  saveProfile?: boolean
  onProgress?: ProgressFn
}

export type { CheckReason } from "./check-reason.ts"

export type CheckResult = {
  ok: boolean
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
  diff?: ReceiptDiff
  profileSeed?: ProfileSeed
  profileSaved?: ProfileSaveResult
}

export { packageRoot } from "./paths.ts"

export function toReceiptPath(absPath: string): string {
  return path.relative(packageRoot, absPath).replaceAll("\\", "/")
}

export function runDirFromResult(result: CheckResult): string {
  const abs = path.isAbsolute(result.screenshotPath)
    ? result.screenshotPath
    : path.join(packageRoot, result.screenshotPath)
  return path.dirname(abs)
}

function runDir(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  return path.join(packageRoot, ".auspex", "runs", stamp)
}

async function extractPage(
  page: Page,
  selector: string | undefined,
  signal: AbortSignal,
): Promise<{ title: string; finalUrl: string; raw: string }> {
  return observeAbort(
    page.evaluate((sel: string | null) => {
      const el = sel ? (document.querySelector(sel) as HTMLElement | null) : document.body
      return {
        title: document.title,
        finalUrl: location.href,
        raw: el?.innerText ?? "",
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
  if (opts.profile) opts = { ...opts, profile: requireProfileName(opts.profile) }
  const onProgress = opts.onProgress ?? noopProgress
  const solari = createClient()
  const closer = new ReadyRelease()
  let sessionId = ""
  const outDir = runDir()
  await mkdir(outDir, { recursive: true })
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
      profileSeed = seedFromStorageState(browser.session.storageState)
      if (opts.profile && !opts.sso && isEmptySeed(profileSeed)) {
        throw new Error(emptyProfileSeedError(opts.profile))
      }
      const page = await pageForSession(browser)
      if (isCancelled()) return
      onProgress("goto")
      await page.goto(opts.url, {
        timeout: GOTO_TIMEOUT_MS,
        waitUntil: "domcontentloaded",
        signal,
      })
      if (isCancelled()) return
      const restored = await hydrateSessionStorage(page)
      if (opts.profile && restored > 0 && !isPersistableAppUrl(page.url())) {
        await page.goto(opts.url, {
          timeout: GOTO_TIMEOUT_MS,
          waitUntil: "domcontentloaded",
          signal,
        })
      }
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
      try {
        const extracted = await extractPage(page, opts.selector, signal)
        title = extracted.title
        finalUrl = extracted.finalUrl || page.url()
        raw = extracted.raw
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
      if (needsHuman) {
        matched = false
        excerpt = `needsHuman: Microsoft password or OTP wall at ${finalUrl || page.url()}. ${excerpt}`
      } else if (opts.profile && finalUrl && isLoggedOutLanding(finalUrl)) {
        special = "loggedOut"
        matched = false
        excerpt = `loggedOut: landed on ${finalUrl}. ${excerpt}`
      }
      onProgress("screenshot")
      await page.screenshot({
        path: screenshotAbs,
        type: "png",
        fullPage: true,
        signal,
        timeout: SCREENSHOT_TIMEOUT_MS,
      })
      await writeFittedScreenshot(screenshotAbs)
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
    const diff = await diffAgainstLastReceipt({
      url: opts.url,
      excerpt,
      finalUrl,
      excludeDir: outDir,
    })
    const result: CheckResult = {
      ok: protocolOk,
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
      diff,
      profileSeed,
      profileSaved,
    }
    await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(result, null, 2)}\n`)
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
