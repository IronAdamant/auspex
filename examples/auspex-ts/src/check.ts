import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { BrowserSession } from "@solarisdk/browser"
import {
  agentReceiptOk,
  deriveCheckReason,
  expectOnUnpersistableLanding,
  recordedLoggedInLanding,
  type CheckReason,
  type SpecialCheckReason,
} from "./check-reason.ts"
import { persistAgentManifest } from "./agent-receipt.ts"
import { loginTraceSeedExtras, recordPostHandoffTrace } from "./login-trace.ts"
import { parseDeviceOptions } from "./device-emulation.ts"
import { FORBIDDEN_LANDING_NEXT, landedOnForbiddenHost, LOOPBACK_URL_ERROR, requireCheckUrl, resolvesToForbiddenHost } from "./http-url.ts"
import { sessionCreateFromCheck } from "./launch-options.ts"
import { assertVisibleFillLanded, clickMissedNext, runPageActions } from "./page-actions.ts"
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
import { deadStreamCheckResult, shouldRefuseDeadStreamSession } from "./stream-deadline.ts"
import {
  captureStorageState,
  isLoggedOutLanding,
  isPersistableAppUrl,
  originOf,
  PUBLIC_PROFILE_SAVE_ERROR,
} from "./profile-storage.ts"
import { stampProfileHostAdvice } from "./profile-host-advice.ts"
import { savedCheckForProfile } from "./saved-checks.ts"
import { decideLiveHostPersist, LIVE_HOST_CHANGED_SAVE_ERROR, noteProfileHostChanged, type LiveHostChange } from "./live-host-change.ts"
import { NOT_OVERNIGHT_SAFE, RE_GATE_STOP } from "./door-await-contract.ts"
import { finalizeLoginNextCall, remintLoginNextCall } from "./next-call.ts"
import { HANDOFF_PHONE_DOOR_BAN, loadEditorSave, requireProfileName } from "./profiles.ts"
import { attachRecordedReplay } from "./solari.ts"
import { forgetLive, rememberLive } from "./session-ledger.ts"
import { excerptOf, haystackMatches, normalizeHaystack, prepareCheckExcerpt, requireExpect, isBotChallengePage } from "./text.ts"
import { ensureRunDir, packageRoot, resolveStatePath, toStatePath } from "./paths.ts"
import { diffAgainstLastReceipt, type ReceiptDiff } from "./receipt-diff.ts"
import { assertRecordNotLoggedIn, assertRecordProfileAllowed } from "./tool-schema.ts"
import { assertPageActionsAllowed } from "./page-actions.ts"
import {
  createClient,
  checkOverallTimeoutMs,
  gotoWithSessionRestore,
  GOTO_TIMEOUT_MS,
  isNavigationRace,
  launchBrowser,
  NETWORKIDLE_TIMEOUT_MS,
  findProfileId,
  pageForSession,
  waitUntilReleased,
} from "./solari.ts"
import { AuspexError, classifySolariError, explainSolariError } from "./errors.ts"
import { noopProgress, type ProgressFn } from "./progress.ts"
import { redactUrlSecrets, redactUrlSecretsInText } from "./scrub.ts"
import { completeSso, describeAuthWall, shouldFailClosedAuth, type SsoProvider } from "./sso.ts"
import {
  boundPromise,
  closeThenRelease,
  CLOSE_TIMEOUT_MS,
  abortableSleep,
  observeAbort,
  ReadyRelease,
  raceWithTimeout,
  SCREENSHOT_TIMEOUT_MS,
} from "./timeout.ts"

type Page = Awaited<ReturnType<BrowserSession["newPage"]>>

/** Each bounded wait for the page to settle before a fill or click. */
export const PRE_ACTION_IDLE_MS = 8_000

/**
 * How long the live check keeps re-reading for the expect before it calls a miss. The same budget as
 * the second browser (sandbox PROFILE_CLAIM_SETTLE_MS / PROFILE_CLAIM_RETRY_MS; a test keeps them
 * equal), so the two browsers do not disagree about a page that draws its words late.
 */
export const LIVE_EXPECT_SETTLE_MS = 2_000
/** Extra when the first read is nearly empty (under 50 characters): the page is still drawing. */
export const LIVE_EXPECT_EMPTY_EXTRA_MS = 3_000
const LIVE_EXPECT_POLL_MS = 250

export function liveExpectBudgetMs(raw: string): number {
  return !raw.trim() || raw.length < 50 ? LIVE_EXPECT_SETTLE_MS + LIVE_EXPECT_EMPTY_EXTRA_MS : LIVE_EXPECT_SETTLE_MS
}

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
  /** Extra localStorage auth key names. Merged with the default allowlist. Names only. */
  authKeyNames?: string[]
  onProgress?: ProgressFn
}

export type { CheckReason } from "./check-reason.ts"

export type CheckResult = {
  /** Agent success: reason is matched (verify, when it ran, is folded in by toAgentReceipt). */
  ok: boolean
  /** Protocol success (URL+PNG, not loggedOut/needsHuman/recordedLoggedIn/expectMatchedPublicLanding/hostChanged). Not the receipt `ok`. */
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
  /** Click target not found or not clickable; ok is false and the screenshot shows the page. */
  clickMissed?: string
  needsHuman?: boolean
  /** The site served a bot check instead of the page. Not loggedOut; nothing was matched. */
  botWall?: boolean
  next?: string
  nextCall?: import("./next-call.ts").NextCall
  profileHostMatch?: boolean
  suggestedProfile?: string
  hostChanged?: boolean
  suggestedUrl?: string
  diff?: ReceiptDiff
  profileSeed?: ProfileSeed
  profileSaved?: ProfileSaveResult
  seedReadiness?: import("./cookie-save.ts").SeedReadiness
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
    text: `Profile has ${cookies} cookie(s) but landed on logged-out page. Cookies alone may not restore app session (e.g., Microsoft OAuth SPA needs sessionStorage). ${fin.text} ${NOT_OVERNIGHT_SAFE}`,
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
    `Stop. Microsoft or Google password/OTP wall detected. Call auspex_login --profile ${name} and show handoff.url (phone.html, the only login door, on a phone or a computer). handoff.mobileUrl is that same page, with a real text field so the phone keyboard can open. ` +
    HANDOFF_PHONE_DOOR_BAN +
    ` Never fill password via agent tools. After human completes sign-in and Save: await-login --profile ${name} --save-editor then finalize-login --profile ${name} --url <url> --expect <string>. Do not retry check on cookies alone. Never --record. ${RE_GATE_STOP}`
  return { text, nextCall: remintLoginNextCall(profile) }
}

export function needsHumanNext(profile?: string): string {
  return needsHumanGuide(profile).text
}

/** Agent next when expect text hit a URL that `--save-profile` will not persist. */
export function expectMatchedPublicLandingGuide(profile?: string): {
  text: string
  nextCall: import("./next-call.ts").NextCall
} {
  const name = profile?.trim() || "<yours>"
  const text =
    `Expect text was found, but the live URL is not a persistable app page (/, /landing, /login, /signup, or /auth). ` +
    `${PUBLIC_PROFILE_SAVE_ERROR}. reason expectMatchedPublicLanding means ok is false and matched is false; no profile bytes were written. ` +
    `Choose an expect that appears only on the logged-in app surface and does not appear in public marketing copy. ` +
    `A capitalized word does not match inside a capitalized phrase (Dashboard does not match One Dashboard); a full marketing phrase still matches and is not saved from a public URL. ` +
    `Run finalize-login --profile ${name} --url <persistable-app-url> --expect <unique-logged-in-text>.`
  return { text, nextCall: finalizeLoginNextCall(profile) }
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
  if (result.hostChanged) return result
  return stampProfileHostAdvice(result, { profile: opts.profile, url })
}

export function toReceiptPath(absPath: string): string {
  return toStatePath(absPath)
}

export function runDirFromResult(result: CheckResult): string {
  return path.dirname(resolveStatePath(result.screenshotPath))
}

async function extractPage(
  page: Page,
  selector: string | undefined,
  signal: AbortSignal,
): Promise<{ title: string; finalUrl: string; raw: string; main: string; dialog: string; hasPassword: boolean }> {
  return observeAbort(
    page.evaluate((sel: string | null) => {
      const el = sel ? (document.querySelector(sel) as HTMLElement | null) : document.body
      // Excerpt only: the page's main region when it has one (menus and promo cards otherwise fill it).
      const main = sel ? null : (document.querySelector('main, [role="main"]') as HTMLElement | null)
      // Excerpt only: the last visible dialog, or the popup an expanded menu button names with
      // aria-controls (a click usually opened it). No named helpers in here: this function runs in
      // the page, where the bundler's __name() wrapper does not exist.
      const popupIds = sel
        ? []
        : Array.from(
            document.querySelectorAll('[aria-haspopup]:not([aria-haspopup="false"])[aria-expanded="true"][aria-controls]'),
          ).flatMap((trigger) => (trigger.getAttribute("aria-controls") ?? "").split(/\s+/).filter(Boolean))
      const dialogs = sel
        ? []
        : [
            ...Array.from(document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"]')),
            ...popupIds.map((id) => document.getElementById(id)).filter((node): node is HTMLElement => node !== null),
          ].filter((node) =>
            typeof (node as HTMLElement & { checkVisibility?: () => boolean }).checkVisibility === "function"
              ? (node as HTMLElement & { checkVisibility: () => boolean }).checkVisibility()
              : node.getClientRects().length > 0,
          )
      const dialog = dialogs.length ? (dialogs[dialogs.length - 1] as HTMLElement) : null
      return {
        title: document.title,
        finalUrl: location.href,
        raw: el?.innerText ?? "",
        main: main?.innerText ?? "",
        dialog: dialog?.innerText ?? "",
        hasPassword: Boolean(document.querySelector('input[type="password"]')),
      }
    }, selector ?? null),
    signal,
  )
}

/**
 * Text for the receipt excerpt. Matching always uses the whole page; the excerpt prefers the
 * page's main region (<main> / role=main) when it holds real content, so menus and promo cards
 * do not use up the 500 characters. After a click, an open dialog or menu popup is what the click
 * showed, so it wins (without a click, an open dialog is usually a cookie banner and <main> stays
 * the excerpt).
 */
export function excerptRegion(whole: string, main: string, dialog = "", clicked = false): string {
  if (clicked && dialog.trim().length >= 20) return dialog
  return main.trim().length >= 40 ? main : whole
}

export { isNavigationRace }

/** Reads of one page, in all, when client-side redirects keep replacing it mid-read. */
export const EXTRACT_READ_ATTEMPTS = 3

/**
 * Read the page; if a late client-side redirect replaced it mid-read, settle on the new page and
 * read again. An app can redirect twice (MariaDB's Billing did), so this tries a few times.
 */
export async function extractPageSettled<T>(
  read: () => Promise<T>,
  settle: () => Promise<void>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read()
    } catch (err) {
      if (!isNavigationRace(err) || attempt >= EXTRACT_READ_ATTEMPTS) throw err
      await settle().catch(() => undefined)
    }
  }
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
  // The literal host passed; its DNS must not point the cloud browser at loopback or metadata either.
  if (await resolvesToForbiddenHost(opts.url)) throw new Error(LOOPBACK_URL_ERROR)
  const onProgress = opts.onProgress ?? noopProgress
  const solari = createClient()
  const closer = new ReadyRelease()
  let sessionId = ""
  const outDir = await ensureRunDir()
  const screenshotAbs = path.join(outDir, "screenshot.png")
  const screenshotPath = toReceiptPath(screenshotAbs)

  let title = ""
  let botWall = false
  let finalUrl = ""
  let excerpt = ""
  let matched = false
  let networkIdle = false
  let replayReady = false
  let waitedFor: string | undefined
  let filled: string | undefined
  let clicked: string | undefined
  let clickMissed: string | undefined
  let profileSeed: ProfileSeed | undefined
  let profileSaved: ProfileSaveResult | undefined
  let needsHuman = false
  let special: SpecialCheckReason | undefined
  let liveHostChange: LiveHostChange | undefined
  let workError: unknown
  let refusedDeadStream = false
  let forbiddenLanding = false

  const work = async (isCancelled: () => boolean, signal: AbortSignal) => {
    try {
      const deviceContextOptions = parseDeviceOptions({ mobile: opts.mobile, device: opts.device })
      onProgress("launching")
      // One GET /profiles serves both the profile id and the dead-stream check below.
      const rows = opts.profile ? await solari.profiles.list() : []
      const profileId = opts.profile ? findProfileId(rows, opts.profile) : undefined
      const mintHandle = opts.profile ? await loadEditorSave(opts.profile).catch(() => undefined) : undefined
      const marker =
        mintHandle?.hostChanged && mintHandle.suggestedProfile && mintHandle.suggestedUrl
          ? { suggestedProfile: mintHandle.suggestedProfile, suggestedUrl: mintHandle.suggestedUrl }
          : undefined
      if (opts.profile && mintHandle?.streamExpiresAt) {
        const row = rows.find((p) => p.name.trim() === opts.profile)
        const raw = row as { sizeBytes?: unknown; storageStateS3Key?: unknown } | undefined
        const sizeBytes = typeof raw?.sizeBytes === "number" ? raw.sizeBytes : undefined
        if (
          shouldRefuseDeadStreamSession({
            streamExpiresAt: mintHandle.streamExpiresAt,
            nowMs: Date.now(),
            seed: { sizeBytes, storageStateS3Key: raw?.storageStateS3Key },
          })
        ) {
          refusedDeadStream = true
          return
        }
      }
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
        ...seedFromStorageState(browser.session.storageState, originOf(opts.url), opts.authKeyNames),
        ...loginTraceSeedExtras(browser.session.storageState, originOf(opts.url)),
      }
      if (opts.profile && !opts.sso && isEmptySeed(profileSeed)) {
        // Structured so the agent goes straight to the login door instead of reasoning about it.
        throw new AuspexError(emptyProfileSeedError(opts.profile), {
          issue: {
            code: "EmptySave",
            retryable: false,
            recovery: `Mint the login door: auspex_login --profile ${opts.profile}. A profile listed as populated can still be an empty jar.`,
            nextCall: remintLoginNextCall(opts.profile),
          },
        })
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
        if (opts.fill || opts.click) {
          // A logged-in app often refreshes its session right after load (an OAuth redirect and
          // back). A click in that window lands on a page that is then replaced, or waits on a
          // page that is navigating away. Let the page settle first; both waits are bounded.
          await page.waitForLoadState("networkidle", { timeout: PRE_ACTION_IDLE_MS, signal }).catch(() => undefined)
          if (opts.profile) {
            await page
              .waitForURL((url) => isPersistableAppUrl(url.toString()), { timeout: PRE_ACTION_IDLE_MS, signal })
              .catch(() => undefined)
          }
        }
        const actions = await runPageActions(page, opts, signal)
        waitedFor = actions.waitedFor
        filled = actions.filled
        clicked = actions.clicked
        // A Playwright error names the URL it navigated to, which can carry an OAuth code.
        clickMissed = actions.clickMissed ? redactUrlSecretsInText(actions.clickMissed) : undefined
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
      let excerptSource = ""
      let hasPassword = false
      let sawPageText = false
      try {
        const readPage = () =>
          extractPageSettled(
            () => extractPage(page, opts.selector, signal),
            async () => {
              await page.waitForLoadState("domcontentloaded", { timeout: 15_000, signal }).catch(() => undefined)
              await page.waitForLoadState("networkidle", { timeout: 5_000, signal }).catch(() => undefined)
            },
          )
        let extracted = await readPage()
        // A canvas or live-sync app can draw its words after network idle: live on tldraw the first
        // read had only the sidebar, the screenshot a moment later showed "Page 1", and the second
        // browser (which re-reads) saw it. Re-read the same way before calling a miss.
        if (!needsHuman && !haystackMatches(extracted.raw, opts.expect)) {
          const cap = liveExpectBudgetMs(extracted.raw)
          const started = Date.now()
          while (!isCancelled() && Date.now() - started < cap) {
            await abortableSleep(Math.min(LIVE_EXPECT_POLL_MS, Math.max(0, cap - (Date.now() - started))), signal)
            extracted = await readPage()
            if (haystackMatches(extracted.raw, opts.expect)) break
          }
        }
        title = extracted.title
        finalUrl = extracted.finalUrl || page.url()
        raw = extracted.raw
        excerptSource = excerptRegion(extracted.raw, extracted.main, extracted.dialog, Boolean(clicked))
        hasPassword = extracted.hasPassword
        sawPageText = true
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
      const landedAt = finalUrl || page.url()
      if (landedOnForbiddenHost(landedAt) || (landedAt !== opts.url && (await resolvesToForbiddenHost(landedAt)))) {
        // Redirected to loopback / link-local / cloud metadata: keep nothing from that page.
        forbiddenLanding = true
        matched = false
        raw = ""
        excerptSource = ""
        hasPassword = false
        title = ""
        excerpt = "forbiddenLanding: the page redirected to a loopback, link-local or cloud-metadata address. Nothing from it was kept."
        await page.goto("about:blank", { timeout: 10_000 }).catch(() => undefined)
      }
      if (sawPageText && filled && opts.fill && opts.value !== undefined && !forbiddenLanding) {
        await assertVisibleFillLanded(page, opts.fill, opts.value, raw)
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
      const liveUrl = finalUrl || page.url()
      const unpersistableHit = expectOnUnpersistableLanding({
        saveProfile: Boolean(opts.saveProfile && profileId),
        textMatched: matched,
        finalUrl: liveUrl,
        needsHuman,
      })
      if (needsHuman) {
        matched = false
        excerpt = prepareCheckExcerpt({
          raw: excerptSource || raw || excerpt,
          needsHuman: true,
          prefix: `needsHuman: password or OTP wall at ${finalUrl || page.url()}.`,
        })
      } else if (unpersistableHit) {
        special = "expectMatchedPublicLanding"
        matched = false
        excerpt = prepareCheckExcerpt({
          raw: excerptSource || raw || excerpt,
          prefix: `expectMatchedPublicLanding: expect text is on ${liveUrl}, which is not a persistable app URL. Profile was not saved.`,
        })
      } else if (!matched && isBotChallengePage(title, raw || excerpt)) {
        botWall = true
        excerpt = prepareCheckExcerpt({
          raw: excerptSource || raw || excerpt,
          prefix: `botWall: the site served a bot check ("${title.slice(0, 60)}") at ${liveUrl}, not the page.`,
        })
      } else if (opts.profile && finalUrl && isLoggedOutLanding(finalUrl, { matched })) {
        special = "loggedOut"
        matched = false
        excerpt = prepareCheckExcerpt({
          raw: excerptSource || raw || excerpt,
          prefix: `loggedOut: landed on ${finalUrl}.`,
        })
      } else {
        excerpt = prepareCheckExcerpt({ raw: excerptSource || raw || excerpt })
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
      if (opts.saveProfile && profileId && !isCancelled() && !needsHuman && !forbiddenLanding) {
        onProgress("save-profile")
        const state = await captureStorageState(browser)
        const gate = decideLiveHostPersist({
          profile: opts.profile,
          mintUrl: mintHandle?.siteUrl || opts.url,
          pageUrl: liveUrl,
          state,
          marker,
          enforceDetect: true,
        })
        if (gate) {
          liveHostChange = gate
          const seed = seedFromStorageState(state)
          profileSaved = { ok: false, cookies: seed.cookies, origins: seed.origins, error: LIVE_HOST_CHANGED_SAVE_ERROR }
        } else if (!isPersistableAppUrl(liveUrl)) {
          profileSaved = { ok: false, cookies: 0, origins: 0, error: PUBLIC_PROFILE_SAVE_ERROR }
        } else {
          profileSaved = await persistLiveProfile({
            solari,
            profileId,
            sessionId,
            state,
            origin: originOf(liveUrl),
            lockName: opts.profile,
          })
        }
      } else if (marker && opts.profile) {
        liveHostChange = decideLiveHostPersist({
          profile: opts.profile,
          mintUrl: mintHandle?.siteUrl || opts.url,
          pageUrl: liveUrl,
          marker,
          enforceDetect: false,
        })
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
    if (refusedDeadStream && opts.profile) {
      return deadStreamCheckResult({ url: opts.url, expect: opts.expect, profile: opts.profile })
    }
    if (workError) {
      throw new AuspexError(redactUrlSecretsInText(explainSolariError(workError)), {
        issue: classifySolariError(workError),
        sessionId: sessionId || undefined,
        screenshotPath: existsSync(screenshotAbs) ? screenshotPath : undefined,
        cause: workError,
      })
    }

    if (liveHostChange) {
      special = "hostChanged"
      matched = false
    } else if (recordedLoggedInLanding({ record: opts.record, profile: opts.profile, finalUrl })) {
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
        !clickMissed &&
        special !== "recordedLoggedIn" &&
        special !== "expectMatchedPublicLanding" &&
        special !== "hostChanged",
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
    if (forbiddenLanding) {
      next = FORBIDDEN_LANDING_NEXT
    } else if (liveHostChange) {
      next = liveHostChange.nextLead
      nextCall = liveHostChange.nextCall
    } else if (botWall) {
      next =
        "The site showed a bot check (for example Cloudflare \"Just a moment...\") to the cloud browser instead of the page. " +
        "This is not loggedOut and not a failed sign-in, and it does not prove the login is bad or good. Auspex does not solve bot checks. " +
        "Do not remint or finalize for this; the site is blocking cloud browsers."
    } else if (reason === "loggedOut" && profileSeed && profileSeed.cookies > 0) {
      const guided = checkLoggedOutGuide(opts.profile ?? "<name>", profileSeed.cookies)
      next = guided.text
      nextCall = guided.nextCall
    } else if (reason === "needsHuman") {
      const guided = needsHumanGuide(opts.profile)
      next = guided.text
      nextCall = guided.nextCall
    } else if (reason === "mismatch" && (profileSeed?.cookies ?? 0) > 0) {
      next =
        `Expect miss with cookies present (not proof of login). The seed has ${profileSeed?.cookies} cookies` +
        (title ? ` and the page title is "${title.slice(0, 120)}"` : "") +
        `. The expect still failed. ` +
        `Pass the URL the logged-in app itself lands on (after redirects) and an expect that appears only there.`
    } else if (reason === "expectMatchedPublicLanding") {
      const guided = expectMatchedPublicLandingGuide(opts.profile)
      next = guided.text
      nextCall = guided.nextCall
    }
    if (clickMissed && opts.click) {
      const lead = clickMissedNext(opts.click, clickMissed)
      next = next ? `${lead} ${next}` : lead
    }
    
    // Decisions above used the real landing URL; the receipt keeps it without secret parameters.
    const receiptFinalUrl = finalUrl ? redactUrlSecrets(finalUrl) : finalUrl
    const diff = await diffAgainstLastReceipt({
      url: opts.url,
      excerpt,
      finalUrl: receiptFinalUrl,
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
      finalUrl: receiptFinalUrl,
      matched,
      excerpt,
      sessionId,
      networkIdle,
      replayReady: opts.record ? replayReady : undefined,
      waitedFor,
      filled,
      clicked,
      clickMissed,
      needsHuman: needsHuman || undefined,
      botWall: botWall || undefined,
      next,
      nextCall,
      ...(liveHostChange
        ? {
            hostChanged: true as const,
            profileHostMatch: false as const,
            suggestedProfile: liveHostChange.suggestedProfile,
            suggestedUrl: liveHostChange.suggestedUrl,
          }
        : {}),
      diff,
      // Only with a saved login (AGENTS: "when a profile was attached"). A public check's fresh
      // browser has an empty jar, and "seedReadiness: post-save, empty" read like a failed save.
      profileSeed: opts.profile ? profileSeed : undefined,
      profileSaved,
    }
    if (liveHostChange && opts.profile) {
      await noteProfileHostChanged(opts.profile, liveHostChange).catch(() => undefined)
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
