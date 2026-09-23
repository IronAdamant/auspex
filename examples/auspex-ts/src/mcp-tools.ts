import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { toAgentReceipt } from "./agent-receipt.ts"
import { runCheck, runFinalizeLogin, type CheckOptions, type CheckResult } from "./check.ts"
import { shouldVerifyCheck } from "./fail-closed.ts"
import { buildCheckToolContent, buildReceiptToolContent, packToolFailure } from "./content.ts"
import { defaultDesktopDeps, runDesktopReview } from "./desktop.ts"
import { createProgress, type ProgressExtra } from "./progress.ts"
import { ensureRunDir } from "./paths.ts"
import { generateQRCode } from "./qr-gen.ts"
import { attachMatchedPurgeNext, noteAfterSignupWait, OPERATOR_PURGE_QUESTION, SIGNUP_BUSY_MS } from "./operator-session.ts"
import { attachHandoffQr, HANDOFF_PHONE_DOOR_BAN, listProfiles, loginProfile, qrPayloadForHandoff, withOperatorSession } from "./profiles.ts"
import { loginWaitPublicFields, preserveAwaitLiveHost } from "./live-host-change.ts"
import { stampAwaitLoginHost, stampLoginHost, stampProfileHostAdvice } from "./profile-host-advice.ts"
import { resolveLoginProfile } from "./profile-slug.ts"
import { liveAwaitLogin, loginWaitAwaitOpts } from "./profile-persist.ts"
import { profileStatus } from "./profile-status.ts"
import { reapLeftovers } from "./reap.ts"
import { readLoginTrace } from "./login-trace.ts"
import { checkThenVerify, defaultVerifyDeps, verifyReceipt } from "./sandbox.ts"
import { assertPageActionsAllowed } from "./page-actions.ts"
import { applySavedCheckName } from "./saved-checks.ts"
import { stampSchema } from "./schema-version.ts"
import {
  assertRecordNotLoggedIn,
  assertRecordProfileAllowed,
  auspexAwaitLoginInputSchema,
  auspexCheckInputObject,
  auspexDesktopInputSchema,
  auspexFinalizeLoginInputSchema,
  auspexLoginInputObject,
  auspexProfileStatusInputSchema,
  auspexProfilesInputSchema,
  auspexReapInputSchema,
  auspexTraceInputSchema,
} from "./tool-schema.ts"

export const CHECK_DESCRIPTION =
  "Passing anonymous verify (verify=true / --verify) on an auth-gated page poisons ok. Open a live URL in a Solari cloud browser, optional wait-for (fill/click only without a profile, or with allowPageActions), snapshot, check expected text, close. Verifies by default in a headless sandbox (HTTP fetch + OCR) except name=consistencyhub, profile=consistencyhub, or an attached profile on a non-public-marketing URL (not ironadamant.com / checkpointprojects.com), which defaults to verify=false because anonymous sandbox fetch cannot see auth-gated UI (same policy as CLI --name consistencyhub). Public marketing still verifies with a leftover profile. No profile still verifies. verify=true / --verify forces anonymous sandbox verify — on auth-gated pages this poisons ok (claimOk false). verifyWithProfile / --verify-with-profile is the dogfood path: enables the sandbox, skips anonymous claim, adds claimOkProfile from a second profile-seeded browser; claimOkProfile is the profile-reuse gate — ok=true is not enough to treat the profile as reusable; read claimOkProfile, do not treat ok as that signal. They are not equivalent. Pass verify=false to skip. Do not also call auspex_verify when verifying. Parseable receipt: schemaVersion 1 is frozen; required schemaVersion, ok, reason (matched|loggedOut|needsHuman|mismatch|network|recordedLoggedIn|expectMatchedPublicLanding|hostChanged), url, expect, screenshotPath. Extra keys (diff, verify, protocolOk, …) stay optional. excerpt is fenced untrusted page text. loggedOut/needsHuman/expectMatchedPublicLanding/hostChanged skip verify and are not retried. Expect must be unique to the logged-in app and absent from public marketing copy (case-sensitive, word-bounded; Dashboard does not match the capitalized phrase One Dashboard). A text hit on /, /landing, /login, /signup, or /auth during saveProfile is reason expectMatchedPublicLanding (ok false, matched false, profile not saved). needsHuman omits the screenshot/MCP image and strips digit runs. Saved checks: name=ironadamant|checkpoint|consistencyhub (consistencyhub is profile only, no sso/record; fill/click refused unless allowPageActions). JSON plus JPEG attach; on-disk shot is a PNG scaled under 2 MiB. stealth/proxy/captcha are Starter+ (402 not retryable). record+profile forbidden unless allowRecordProfile on a public marketing host. allowRecordProfile is refused for consistencyhub. Never record a logged-in session (sso/saveProfile/dashboard landing). saveProfile persists cookies/localStorage/sessionStorage via POST /profiles/:id/save (not a public /landing session; origin must have bytes). Concurrent save of the same profile is locked (ProfileBusy, not retryable). Profile reuse that lands on /landing or / without a matched expect is ok:false reason:loggedOut. Microsoft and Google password/OTP sets needsHuman (never typed). 429: call auspex_reap, then retry. mobile=true and device=<name> apply Playwright BrowserContextOptions (viewport, userAgent, deviceScaleFactor, isMobile, hasTouch) to browser.newContext(). Best-effort: effectiveness depends on Solari cloud Chrome respecting Playwright viewport/UA overrides; not verified against live Solari."

export const VERIFY_DESCRIPTION =
  "Calling auspex_verify after a default auspex_check double-counts verify and can contradict the receipt. After auspex_check with verify=false, upload the on-disk receipt into a headless Solari sandbox, independently re-check expect (fetch/OCR, not JSON echo). Integrity ok vs claim claimOk. Kill the VM. Do not call this if auspex_check already verified (the default). 429: auspex_reap leftover VMs first."

export const LOGIN_DESCRIPTION =
  "Typing a password, or opening Solari noVNC on a phone, fails this handoff because the phone keyboard will not open. Create or reuse a named Solari browser profile and mint once. handoff.url / oneLiner is the chooser (ironadamant.com/auspex/door.html). Labeled deep links stay on handoff.mobileUrl (phone.html) and handoff.desktopUrl (desktop.html). Requires profile or url. url without profile derives a safe host slug (app.example.com → app-example-com) and echoes it on stdout, next, and phone Save paste. Explicit profile wins (dogfood profile=consistencyhub is unchanged). Phone: handoff.mobileUrl is the Auspex phone page (ironadamant.com/auspex/phone.html) with a real text field so the phone keyboard can open; ironadamant.com does not see the password or any keystrokes. Keys go into Solari remote Chrome and the destination site only; the destination site logs its own login. If cookies or cache are cleared, or the remote session or saved profile is wiped, type the login again. Auspex and ironadamant.com do not host those credentials or session secrets; they live only in the remote Chrome session and on the destination site. They stay off agent chat / MCP / receipts. That page is a seed/handoff door for off-site typing, not a same-session VNC takeover. Solari's own handoff/editor is noVNC and will not open the phone keyboard. Computer: handoff.desktopUrl is the Auspex desktop page (desktop.html) with the same link hash as the phone when login minted a remote Chrome; otherwise Solari console → Profiles → Open editor. Hardware keyboard. One typing field: click the remote address bar (or the remote field you mean to fill) before typing anything. Keys stream into Solari remote Chrome as you type (no Paste button). Enter sends Enter and clears the local field. Show as bullets is off by default so a password manager can paste into the text field. ironadamant.com does not see the password or any keystrokes. " +
  HANDOFF_PHONE_DOOR_BAN +
  " The agent never copies the password. Packet also has openOnPhone, openOnDesktop, oneLiner (chooser SMS), desktopOneLiner, qrPath (QR of the chooser URL), plus a QR PNG attach. url is a start hint in the handoff reason. After they tap Save on the phone or desktop page, call auspex_await_login with saveEditor true (do not open Solari's handoff page on a phone: GET editor HTTP 401). wait:true / --wait is the composed path: it waits for Save and passes saveEditor true (same as auspex_await_login --save-editor). saveEditor / --save-editor POSTs Solari editor/save then probes for editor CDP; claim a fold only when editorFold.ok. Solari's editor is noVNC today (editorFold.reason=no-cdp) so leftover sessionStorage is not refreshed. If editorSave fails (e.g. 401) or editorFold is no-cdp, next says finalize-login NOW while the token is live; do not run verify-with-profile on a dead fold (claimOkProfile will not pass). Remint if finalize-login returns needsHuman. If next says stale/weakSeed: remint or finalize-now. Then auspex_finalize_login (unknown profiles need url and expect), then auspex_check. A Save with 0 cookies is not success. Do not skip finalize-login after Save. Do not intern-ping. If profile is set and does not match the URL host slug (case-insensitive; saved-check host affinity such as consistencyhub on consistencyhub.io still matches; same profileSlugFromUrl helper as url-only login), the command still runs and JSON sets profileHostMatch false, suggestedProfile, and next/nextCall to remint with that slug or omit profile. profileHostMatch true when they match. Omitted when there is no URL — omission is not a match. Do not carry a previous profile onto a new host."

export const DESKTOP_DESCRIPTION =
  "Passing a password or OTP-like string to type is refused, and desktops return 402 on the Free plan. Named Solari sandbox desktop demo: boot a cloud GUI VM, wait for X11, open mousepad by default. This is not the user's Mac and not a fourth primitive. Wait/expect/ok share one process haystack (processList + ps). windowOk only if a real window list exists. clicked only if verified. FAIL-CLOSED type refuses password/OTP-like strings (6-8 digits, password keywords, API-key patterns, high-complexity no-space strings) because desktop cannot detect password fields. Use only for demo text. Returns ASCII log, JSON, optional PNG, and streamUrl (VNC). Desktops may 402 on Free. 429: auspex_reap."

export const PROFILES_DESCRIPTION =
  "Treating a populated profile in this list as logged-in is a lie; this tool does not open the page. List Solari browser profile names, ids, version, and populated (whether a non-empty storage state was saved). " +
  OPERATOR_PURGE_QUESTION +
  " Pass purge with humanAgree true only after the human agrees. This tool has no username field and no password field. The Solari key is not an argument."

export const PROFILE_STATUS_DESCRIPTION =
  "Treating weakSeed as loggedIn skips the fold and the next check lands logged out. Report loggedIn vs loggedOut vs needsHuman vs weakSeed vs emptySave for a named Solari profile. emptySave = profile not found or empty. weakSeed is cookies/origins with a counted sessionStorage of 0, or folded __auspex_ss__:expiresOn past/within ~5m (leftover count is not fresh). Public marketing saved checks stay loggedOut. Default path uses one browser session: inspect only when there is no URL, otherwise one live check. Live probe never uses --sso or --record and never types a password. Microsoft or Google password/OTP wall is needsHuman: call auspex_login and show handoff.url (chooser) plus labeled deep links (handoff.mobileUrl is the Auspex phone page with a real text field; handoff.desktopUrl on the computer). " +
  HANDOFF_PHONE_DOOR_BAN +
  " Path / is loggedOut unless expect matched."

export const AWAIT_LOGIN_DESCRIPTION =
  "Treating an empty Save (a version bump with zero cookies) as success is a lie; the profile is still logged out. Wait until the human Save stores cookies or origins (default 30 minutes). After they tap Save on the Auspex phone or desktop page, pass saveEditor true so the agent POSTs Solari editor/save (do not open Solari's handoff page on a phone: GET editor HTTP 401) and probes for editor CDP. A version bump with 0 cookies is empty-save (not success). Soft-warns if the profile has cookies/origins but no counted sessionStorage, or folded expiresOn is past/within ~5m (leftover count is not fresh). If editorSave fails (e.g. 401) or editorFold is no-cdp, next says finalize-login NOW while the token is live; do not run verify-with-profile on a dead fold (claimOkProfile will not pass). Remint if finalize-login returns needsHuman. next then remint or finalize-now. --save-editor / saveEditor does not refresh folded sessionStorage unless editorFold.ok. SPAs that keep tokens in sessionStorage still need auspex_finalize_login while the token is valid (url and expect unless a saved check). Then auspex_finalize_login, then auspex_check. Do not ask the human to paste the password. Pass url for the site host. If profile does not match that host slug, JSON sets profileHostMatch false, suggestedProfile, and next/nextCall to remint (soft advise; the wait still runs). A stored login site URL is used when url is omitted. profileHostMatch true on a match. Do not carry a previous profile onto a new host. If the live remote host diverges from the minted site, status is host-changed, ok is false, hostChanged is true, and nextCall remints auspex_login for that https origin. claimOkProfile is not granted. The door cannot read the address bar (noVNC). The password field is not a site picker. If the VNC/phone stream expiry is past, status is stream-expired and nextCall remints auspex_login (do not poll 30 minutes). If editorSave or editorFold times out, status is editor-save-hung — do not run finalize-login in parallel. If the profile lock is held, status is profile-busy — retry await-login after that save ends."

export const FINALIZE_LOGIN_DESCRIPTION =
  "Calling finalize-login without url and expect on an unknown profile fails the call. Post-login one-shot: after await-login (or a weak-seed / stale-expiresOn warn), run SSO + save-profile in one step to capture sessionStorage. Saved-check profiles (e.g. consistencyhub) supply URL and expect; unknown profiles require url and expect. Same as CLI finalize-login / check --profile --sso --save-profile. Use when console Save or --save-editor alone is insufficient; --save-editor does not refresh folded sessionStorage unless editorFold.ok. If editorSave failed or editorFold is no-cdp, run this NOW while the token is live; remint auspex_login if this returns needsHuman. Stale/weak next means remint or finalize-now — do not run verify-with-profile on a dead fold (claimOkProfile will not pass). Later reuse requires claimOkProfile=true from verify-with-profile; ok alone is not enough to treat the profile as reusable. SPAs that keep tokens in sessionStorage still need finalize-login while the token is valid. If profile does not match the URL host slug, the call still runs and the receipt sets profileHostMatch false, suggestedProfile, and next/nextCall to remint. Saved-check host affinity (consistencyhub on consistencyhub.io) is profileHostMatch true. Do not carry a previous profile onto a new host. Expect must be unique to the logged-in app and absent from public marketing copy. If the text hits a public or landing URL, reason is expectMatchedPublicLanding (not matched); pass a persistable app URL and a better expect. If the live browser host diverges from the minted site, ok is false, reason is hostChanged, the profile is not saved, claimOkProfile is not granted, and nextCall remints auspex_login for the live https origin."

export const REAP_DESCRIPTION =
  "Passing accountWide to clear one 429 kills every sandbox and desktop on the key. List and close leftover Solari browser sessions from Auspex's live ledger. Default kills ledger ids only (plus sessionId/vmId). accountWide also kills every holding sandbox/desktop on this Solari key. Use after 429 ConcurrencyLimitExceeded. dryRun lists without killing. packReceipts copies last receipts per URL into .auspex/pack for an agent to attach to a PR."

export const TRACE_DESCRIPTION =
  "Treating auspex_trace as a log of check rows, tokens, or session ids is a lie. Read the last Solari LOGIN MINT episode plus one redacted post-handoff row (status and fold reason: empty-save, editor 401, no-cdp, or finalize needsHuman) after the handoff is ready. Check rows are not written. Default last mint plus traceSummary: why mint stopped (missing key, 429, 402, 503, no handoff url, editor-start HTTP, VNC timeout, empty handoff token) or Mint ready (only when VNC/token mint succeeded). all=true dumps history. Never tokens, passwords, excerpts, or session ids. If mint is silent or fails, read this before reminting. Not a fourth primitive. Same as CLI auspex trace."

function toolJson(obj: object): string {
  return JSON.stringify(stampSchema(obj), null, 2)
}

function progressFromExtra(extra: unknown) {
  return createProgress({ extra: extra as ProgressExtra })
}

export type AuspexCheckArgs = {
  name?: string
  url?: string
  expect?: string
  verify?: boolean
  verifyWithProfile?: boolean
  [key: string]: unknown
}

export type AuspexCheckDeps = {
  checkThenVerify?: typeof checkThenVerify
  runCheck?: (opts: CheckOptions) => Promise<CheckResult>
}

export async function executeAuspexCheck(
  args: AuspexCheckArgs,
  deps?: AuspexCheckDeps,
): Promise<{ receipt: ReturnType<typeof toAgentReceipt>; verified: boolean }> {
  const merged = applySavedCheckName(args)
  const url = merged.url
  const expect = merged.expect
  if (!url || !expect) {
    throw new Error("auspex_check requires name or url+expect")
  }
  const { verify, name, ...rest } = merged
  const opts = { ...rest, url, expect } as CheckOptions
  assertPageActionsAllowed({ ...opts, name })
  assertRecordProfileAllowed({ ...opts, name })
  assertRecordNotLoggedIn(opts)
  const verified = shouldVerifyCheck({
    name,
    profile: opts.profile,
    url,
    verify,
    verifyWithProfile: opts.verifyWithProfile,
  })
  if (verified) {
    const both = await (deps?.checkThenVerify ?? checkThenVerify)(opts)
    return { receipt: toAgentReceipt(both.check, { verify: both.verify }), verified: true }
  }
  const result = await (deps?.runCheck ?? runCheck)(opts)
  return { receipt: toAgentReceipt(result), verified: false }
}

export function registerAuspexTools(server: McpServer): void {
  server.registerTool(
    "auspex_check",
    {
      description: CHECK_DESCRIPTION,
      inputSchema: auspexCheckInputObject,
    },
    async (args, extra) => {
      try {
        const onProgress = progressFromExtra(extra)
        onProgress("auspex_check")
        const named = applySavedCheckName(args)
        const book = await withOperatorSession({
          note: named.profile ? { profile: named.profile, site: named.url } : undefined,
        })
        const { receipt: checked } = await executeAuspexCheck({ ...args, onProgress })
        const receipt = attachMatchedPurgeNext(checked, book.agent)
        const packed = await buildCheckToolContent(receipt)
        packed.content[0] = { type: "text", text: toolJson(receipt) }
        return packed
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_login",
    {
      description: LOGIN_DESCRIPTION,
      inputSchema: auspexLoginInputObject,
    },
    async ({ profile, url, wait }) => {
      try {
        const resolved = resolveLoginProfile({ profile, url })
        const book = await withOperatorSession({
          note: { profile: resolved.name, site: url, busyMs: SIGNUP_BUSY_MS },
        })
        const runDir = await ensureRunDir()
        const result = await loginProfile(resolved.name, url, undefined, undefined, {
          profileDerived: resolved.derived,
        })
        if (result.handoff?.url) {
          const qr = await generateQRCode(qrPayloadForHandoff(result.handoff), runDir)
          if (qr.qrPath) attachHandoffQr(result, qr.qrPath, url)
        }
        const shown = stampLoginHost(result, url)
        if (!wait) {
          const payload = stampSchema({ ok: true, ...shown, operator: book.agent })
          return buildReceiptToolContent(payload, shown.handoff?.qrPath)
        }
        const rawWait = await liveAwaitLogin(resolved.name, loginWaitAwaitOpts({ sinceVersion: result.sinceVersion, url }))
        const waited = preserveAwaitLiveHost(
          stampProfileHostAdvice(rawWait, { profile: resolved.name, url }),
          rawWait,
        )
        const finished = await withOperatorSession({
          note: noteAfterSignupWait({ profile: resolved.name, site: url, status: waited.status }),
        })
        const payload = stampSchema({
          ...shown,
          ...loginWaitPublicFields(waited),
          wait: waited,
          operator: finished.agent,
        })
        return buildReceiptToolContent(payload, shown.handoff?.qrPath)
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_await_login",
    {
      description: AWAIT_LOGIN_DESCRIPTION,
      inputSchema: auspexAwaitLoginInputSchema,
    },
    async ({ profile, sinceVersion, timeoutMs, saveEditor, url }) => {
      try {
        await withOperatorSession({
          note: { profile, site: url, busyMs: Math.max(SIGNUP_BUSY_MS, timeoutMs ?? 0) },
        })
        const rawWait = await liveAwaitLogin(profile, { sinceVersion, timeoutMs, saveEditor, url })
        const result = preserveAwaitLiveHost(
          await stampAwaitLoginHost(rawWait, { profile, url }),
          rawWait,
        )
        const finished = await withOperatorSession({
          note: noteAfterSignupWait({ profile, status: result.status }),
        })
        return {
          content: [
            {
              type: "text" as const,
              text: toolJson({ ok: result.status === "completed", ...result, operator: finished.agent }),
            },
          ],
        }
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_finalize_login",
    {
      description: FINALIZE_LOGIN_DESCRIPTION,
      inputSchema: auspexFinalizeLoginInputSchema,
    },
    async ({ profile, url, expect, ssoProvider }, extra) => {
      try {
        const onProgress = progressFromExtra(extra)
        onProgress("auspex_finalize_login")
        const book = await withOperatorSession({ note: { profile, site: url } })
        const result = await runFinalizeLogin({ profile, url, expect, ssoProvider, onProgress })
        const receipt = attachMatchedPurgeNext(toAgentReceipt(result), book.agent)
        const packed = await buildCheckToolContent(receipt)
        packed.content[0] = { type: "text", text: toolJson(receipt) }
        return packed
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_profiles",
    {
      description: PROFILES_DESCRIPTION,
      inputSchema: auspexProfilesInputSchema,
    },
    async ({ purge, humanAgree }) => {
      try {
        const book = await withOperatorSession({
          humanAgree,
          voluntary: purge ? [purge] : [],
        })
        const profiles = await listProfiles()
        return {
          content: [
            {
              type: "text" as const,
              text: toolJson({ ok: true, profiles, operator: book.agent, wiped: book.wiped }),
            },
          ],
        }
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_profile_status",
    {
      description: PROFILE_STATUS_DESCRIPTION,
      inputSchema: auspexProfileStatusInputSchema,
    },
    async (args) => {
      try {
        const named = applySavedCheckName(args)
        const book = await withOperatorSession({
          note: named.profile ? { profile: named.profile, site: named.url } : undefined,
        })
        const result = await profileStatus(args)
        return { content: [{ type: "text" as const, text: toolJson({ ...result, operator: book.agent }) }] }
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_desktop",
    {
      description: DESKTOP_DESCRIPTION,
      inputSchema: auspexDesktopInputSchema,
    },
    async ({ open, type, clickX, clickY, expect }, extra) => {
      try {
        const onProgress = progressFromExtra(extra)
        onProgress("auspex_desktop")
        const result = await runDesktopReview({
          ...defaultDesktopDeps(),
          task: {
            open,
            type,
            expect,
            click: clickX !== undefined && clickY !== undefined ? { x: clickX, y: clickY } : undefined,
          },
          status: process.stderr,
        })
        const packed = await buildReceiptToolContent(
          stampSchema({
            ok: result.ok,
            ready: result.ready,
            processOk: result.processOk,
            windowOk: result.windowOk,
            clicked: result.clicked,
            click: result.click,
            matched: result.matched,
            screenshotPath: result.screenshotPath,
            errors: result.errors,
            desktopId: result.desktopId,
            streamUrl: result.streamUrl,
            overview: result.overview,
          }),
          result.screenshotPath,
        )
        packed.content.unshift({ type: "text", text: result.log })
        return packed
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_verify",
    {
      description: VERIFY_DESCRIPTION,
      inputSchema: {
        runDir: z.string().optional().describe("Optional path to an .auspex/runs/<stamp> directory"),
      },
    },
    async ({ runDir }, extra) => {
      try {
        const onProgress = progressFromExtra(extra)
        onProgress("auspex_verify")
        const result = await verifyReceipt(runDir, { ...defaultVerifyDeps(), onProgress })
        return { content: [{ type: "text" as const, text: toolJson(result) }] }
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_reap",
    {
      description: REAP_DESCRIPTION,
      inputSchema: auspexReapInputSchema,
    },
    async (args) => {
      try {
        const result = await reapLeftovers(args)
        return { content: [{ type: "text" as const, text: toolJson(result) }] }
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_trace",
    {
      description: TRACE_DESCRIPTION,
      inputSchema: auspexTraceInputSchema,
    },
    async ({ profile, limit, all }) => {
      try {
        const result = stampSchema({ ok: true, ...(await readLoginTrace({ profile, limit, all })) })
        return { content: [{ type: "text" as const, text: toolJson(result) }] }
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )
}
