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
import { attachHandoffQr, HANDOFF_PHONE_DOOR_BAN, listProfiles, loginProfile, qrPayloadForHandoff } from "./profiles.ts"
import { resolveLoginProfile } from "./profile-slug.ts"
import { liveAwaitLogin, loginWaitAwaitOpts } from "./profile-persist.ts"
import { profileStatus } from "./profile-status.ts"
import { reapLeftovers } from "./reap.ts"
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
  auspexReapInputSchema,
} from "./tool-schema.ts"

const CHECK_DESCRIPTION =
  "Open a live URL in a Solari cloud browser, optional wait-for (fill/click only without a profile, or with allowPageActions), snapshot, check expected text, close. Verifies by default in a headless sandbox (HTTP fetch + OCR) except name=consistencyhub, profile=consistencyhub, or an attached profile on a non-public-marketing URL (not ironadamant.com / checkpointprojects.com), which defaults to verify=false because anonymous sandbox fetch cannot see auth-gated UI (same policy as CLI --name consistencyhub). Public marketing still verifies with a leftover profile. No profile still verifies. verify=true / --verify forces anonymous sandbox verify — on auth-gated pages this poisons ok (claimOk false). verifyWithProfile / --verify-with-profile is the dogfood path: enables the sandbox, skips anonymous claim, adds claimOkProfile from a second profile-seeded browser; claimOkProfile is the profile-reuse gate — ok=true is not enough to treat the profile as reusable; read claimOkProfile, do not treat ok as that signal. They are not equivalent. Pass verify=false to skip. Do not also call auspex_verify when verifying. Parseable receipt: schemaVersion 1 is frozen; required schemaVersion, ok, reason (matched|loggedOut|needsHuman|mismatch|network|recordedLoggedIn), url, expect, screenshotPath. Extra keys (diff, verify, protocolOk, …) stay optional. excerpt is fenced untrusted page text. loggedOut/needsHuman skip verify and are not retried. needsHuman omits the screenshot/MCP image and strips digit runs. Saved checks: name=ironadamant|checkpoint|consistencyhub (consistencyhub is profile only, no sso/record; fill/click refused unless allowPageActions). JSON plus JPEG attach; on-disk shot is a PNG scaled under 2 MiB. stealth/proxy/captcha are Starter+ (402 not retryable). record+profile forbidden unless allowRecordProfile on a public marketing host. allowRecordProfile is refused for consistencyhub. Never record a logged-in session (sso/saveProfile/dashboard landing). saveProfile persists cookies/localStorage/sessionStorage via POST /profiles/:id/save (not a public /landing session; origin must have bytes). Concurrent save of the same profile is locked (ProfileBusy, not retryable). Profile reuse that lands on /landing or / without a matched expect is ok:false reason:loggedOut. Microsoft and Google password/OTP sets needsHuman (never typed). 429: call auspex_reap, then retry. mobile=true and device=<name> apply Playwright BrowserContextOptions (viewport, userAgent, deviceScaleFactor, isMobile, hasTouch) to browser.newContext(). Best-effort: effectiveness depends on Solari cloud Chrome respecting Playwright viewport/UA overrides; not verified against live Solari."

const VERIFY_DESCRIPTION =
  "After auspex_check with verify=false, upload the on-disk receipt into a headless Solari sandbox, independently re-check expect (fetch/OCR, not JSON echo). Integrity ok vs claim claimOk. Kill the VM. Do not call this if auspex_check already verified (the default). 429: auspex_reap leftover VMs first."

const LOGIN_DESCRIPTION =
  "Create or reuse a named Solari browser profile and return TWO labeled login URLs. Requires profile or url. url without profile derives a safe host slug (app.example.com → app-example-com) and echoes it on stdout, next, and phone Save paste. Explicit profile wins (dogfood profile=consistencyhub is unchanged). Phone: handoff.mobileUrl is the Auspex phone page (ironadamant.com/auspex/phone.html) with a real text field so the phone keyboard can open; keys go into remote Chrome, not into chat. That page is a seed/handoff door for off-site typing, not a same-session VNC takeover. Solari's own handoff/editor is noVNC and will not open the phone keyboard. Computer: handoff.desktopUrl (Solari console → Profiles → Open editor, hardware keyboard). Show both, labeled. " +
  HANDOFF_PHONE_DOOR_BAN +
  " The agent never copies the password. Packet also has openOnPhone, openOnDesktop, oneLiner (phone SMS), desktopOneLiner, qrPath (QR of the phone URL), plus a QR PNG attach. url is a start hint in the handoff reason. After they tap Save on the phone page, call auspex_await_login with saveEditor true (do not open Solari's handoff page on a phone: GET editor HTTP 401). wait:true / --wait is the composed path: it waits for Save and passes saveEditor true (same as auspex_await_login --save-editor). saveEditor / --save-editor POSTs Solari editor/save then probes for editor CDP; claim a fold only when editorFold.ok. Solari's editor is noVNC today (editorFold.reason=no-cdp) so leftover sessionStorage is not refreshed. If editorSave fails (e.g. 401) or editorFold is no-cdp, next says finalize-login NOW while the token is live; do not run verify-with-profile on a dead fold (claimOkProfile will not pass). Remint if finalize-login returns needsHuman. If next says stale/weakSeed: remint or finalize-now. Then auspex_finalize_login (unknown profiles need url and expect), then auspex_check. A Save with 0 cookies is not success. Do not skip finalize-login after Save. Do not intern-ping."

const DESKTOP_DESCRIPTION =
  "Named Solari sandbox desktop demo: boot a cloud GUI VM, wait for X11, open mousepad by default. This is not the user's Mac and not a fourth primitive. Wait/expect/ok share one process haystack (processList + ps). windowOk only if a real window list exists. clicked only if verified. FAIL-CLOSED type refuses password/OTP-like strings (6-8 digits, password keywords, API-key patterns, high-complexity no-space strings) because desktop cannot detect password fields. Use only for demo text. Returns ASCII log, JSON, optional PNG, and streamUrl (VNC). Desktops may 402 on Free. 429: auspex_reap."

const PROFILES_DESCRIPTION =
  "List Solari browser profile names, ids, version, and populated (whether a non-empty storage state was saved)."

const PROFILE_STATUS_DESCRIPTION =
  "Report loggedIn vs loggedOut vs needsHuman vs weakSeed vs emptySave for a named Solari profile. emptySave = profile not found or empty. weakSeed is cookies/origins with a counted sessionStorage of 0, or folded __auspex_ss__:expiresOn past/within ~5m (leftover count is not fresh). Public marketing saved checks stay loggedOut. Default path uses one browser session: inspect only when there is no URL, otherwise one live check. Live probe never uses --sso or --record and never types a password. Microsoft or Google password/OTP wall is needsHuman: call auspex_login and show BOTH labeled URLs (handoff.mobileUrl is the Auspex phone page with a real text field; handoff.desktopUrl on the computer). " +
  HANDOFF_PHONE_DOOR_BAN +
  " Path / is loggedOut unless expect matched."

const FINALIZE_LOGIN_DESCRIPTION =
  "Post-login one-shot: after await-login (or a weak-seed / stale-expiresOn warn), run SSO + save-profile in one step to capture sessionStorage. Saved-check profiles (e.g. consistencyhub) supply URL and expect; unknown profiles require url and expect. Same as CLI finalize-login / check --profile --sso --save-profile. Use when console Save or --save-editor alone is insufficient; --save-editor does not refresh folded sessionStorage unless editorFold.ok. If editorSave failed or editorFold is no-cdp, run this NOW while the token is live; remint auspex_login if this returns needsHuman. Stale/weak next means remint or finalize-now — do not run verify-with-profile on a dead fold (claimOkProfile will not pass). Later reuse requires claimOkProfile=true from verify-with-profile; ok alone is not enough to treat the profile as reusable. SPAs that keep tokens in sessionStorage still need finalize-login while the token is valid."

const REAP_DESCRIPTION =
  "List and close leftover Solari browser sessions from Auspex's live ledger. Default kills ledger ids only (plus sessionId/vmId). accountWide also kills every holding sandbox/desktop on this Solari key. Use after 429 ConcurrencyLimitExceeded. dryRun lists without killing. packReceipts copies last receipts per URL into .auspex/pack for an agent to attach to a PR."

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
        const { receipt } = await executeAuspexCheck({ ...args, onProgress })
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
        const runDir = await ensureRunDir()
        const result = await loginProfile(resolved.name, url, undefined, undefined, {
          profileDerived: resolved.derived,
        })
        if (result.handoff?.url) {
          const qr = await generateQRCode(qrPayloadForHandoff(result.handoff), runDir)
          if (qr.qrPath) attachHandoffQr(result, qr.qrPath, url)
        }
        if (!wait) {
          const payload = stampSchema({ ok: true, ...result })
          return buildReceiptToolContent(payload, result.handoff?.qrPath)
        }
        const waited = await liveAwaitLogin(resolved.name, loginWaitAwaitOpts({ sinceVersion: result.sinceVersion, url }))
        const payload = stampSchema({
          ok: waited.status === "completed",
          ...result,
          wait: waited,
        })
        return buildReceiptToolContent(payload, result.handoff?.qrPath)
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_await_login",
    {
      description:
        "Wait until the human Save stores cookies or origins (default 30 minutes). After they tap Save on the Auspex phone page, pass saveEditor true so the agent POSTs Solari editor/save (do not open Solari's handoff page on a phone: GET editor HTTP 401) and probes for editor CDP. A version bump with 0 cookies is empty-save (not success). Soft-warns if the profile has cookies/origins but no counted sessionStorage, or folded expiresOn is past/within ~5m (leftover count is not fresh). If editorSave fails (e.g. 401) or editorFold is no-cdp, next says finalize-login NOW while the token is live; do not run verify-with-profile on a dead fold (claimOkProfile will not pass). Remint if finalize-login returns needsHuman. next then remint or finalize-now. --save-editor / saveEditor does not refresh folded sessionStorage unless editorFold.ok. SPAs that keep tokens in sessionStorage still need auspex_finalize_login while the token is valid (url and expect unless a saved check). Then auspex_finalize_login, then auspex_check. Do not ask the human to paste the password.",
      inputSchema: auspexAwaitLoginInputSchema,
    },
    async ({ profile, sinceVersion, timeoutMs, saveEditor }) => {
      try {
        const result = await liveAwaitLogin(profile, { sinceVersion, timeoutMs, saveEditor })
        return { content: [{ type: "text" as const, text: toolJson({ ok: result.status === "completed", ...result }) }] }
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
        const result = await runFinalizeLogin({ profile, url, expect, ssoProvider, onProgress })
        const receipt = toAgentReceipt(result)
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
      inputSchema: {},
    },
    async () => {
      try {
        const profiles = await listProfiles()
        return { content: [{ type: "text" as const, text: toolJson({ ok: true, profiles }) }] }
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
        const result = await profileStatus(args)
        return { content: [{ type: "text" as const, text: toolJson(result) }] }
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
}
