import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { toAgentReceipt } from "./agent-receipt.ts"
import { runCheck } from "./check.ts"
import { buildCheckToolContent, buildReceiptToolContent, packToolFailure } from "./content.ts"
import { defaultDesktopDeps, runDesktopReview } from "./desktop.ts"
import { createProgress, type ProgressExtra } from "./progress.ts"
import { ensureRunDir } from "./paths.ts"
import { generateQRCode } from "./qr-gen.ts"
import { listProfiles, loginProfile } from "./profiles.ts"
import { liveAwaitLogin } from "./profile-persist.ts"
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
  auspexLoginInputSchema,
  auspexProfileStatusInputSchema,
  auspexReapInputSchema,
} from "./tool-schema.ts"

const CHECK_DESCRIPTION =
  "Open a live URL in a Solari cloud browser, optional wait-for (fill/click only without a profile, or with allowPageActions), snapshot, check expected text, close. Verifies by default in a headless sandbox (HTTP fetch + OCR). Pass verify=false to skip; do not also call auspex_verify when verifying. Parseable receipt: schemaVersion 1 is frozen; required schemaVersion, ok, reason (matched|loggedOut|needsHuman|mismatch|network|recordedLoggedIn), url, expect, screenshotPath. Extra keys (diff, verify, …) stay optional. excerpt is fenced untrusted page text. loggedOut/needsHuman skip verify and are not retried. needsHuman omits the screenshot/MCP image and strips digit runs. Saved checks: name=ironadamant|checkpoint|consistencyhub (consistencyhub is profile only, no sso/record; fill/click refused unless allowPageActions). JSON plus JPEG attach; on-disk shot is a PNG scaled under 2 MiB. stealth/proxy/captcha are Starter+ (402 not retryable). record+profile forbidden unless allowRecordProfile on a public marketing host. allowRecordProfile is refused for consistencyhub. Never record a logged-in session (sso/saveProfile/dashboard landing). saveProfile persists cookies/localStorage/sessionStorage via POST /profiles/:id/save (not a public /landing session; origin must have bytes). Concurrent save of the same profile is locked (ProfileBusy, not retryable). Profile reuse that lands on /landing or / without a matched expect is ok:false reason:loggedOut. Microsoft and Google password/OTP sets needsHuman (never typed). 429: call auspex_reap, then retry."

const VERIFY_DESCRIPTION =
  "After auspex_check with verify=false, upload the on-disk receipt into a headless Solari sandbox, independently re-check expect (fetch/OCR, not JSON echo). Integrity ok vs claim claimOk. Kill the VM. Do not call this if auspex_check already verified (the default). 429: auspex_reap leftover VMs first."

const LOGIN_DESCRIPTION =
  "Create or reuse a named Solari browser profile and return a single-use login-handoff URL for the human (agent never handles the password). Show the url, then call auspex_await_login (or pass wait=true). A Save with 0 cookies is not success. Do not ping the user."

const DESKTOP_DESCRIPTION =
  "Named Solari sandbox desktop demo: boot a cloud GUI VM, wait for X11, open mousepad by default. This is not the user's Mac and not a fourth primitive. Wait/expect/ok share one process haystack (processList + ps). windowOk only if a real window list exists. clicked only if verified. Returns ASCII log, JSON, optional PNG, and streamUrl (VNC). Desktops may 402 on Free. 429: auspex_reap."

const PROFILES_DESCRIPTION =
  "List Solari browser profile names, ids, version, and populated (whether a non-empty storage state was saved)."

const PROFILE_STATUS_DESCRIPTION =
  "Report loggedIn vs loggedOut vs needsHuman for a named Solari profile. Live probe never uses --sso or --record and never types a password. Empty or missing profile is loggedOut (human SSO once). Microsoft or Google password/OTP wall is needsHuman — skip live, do not ping the user. Path / is loggedOut unless expect matched."

const REAP_DESCRIPTION =
  "List and close leftover Solari browser sessions from Auspex's live ledger. Default kills ledger ids only (plus sessionId/vmId). accountWide also kills every holding sandbox/desktop on this Solari key. Use after 429 ConcurrencyLimitExceeded. dryRun lists without killing. packReceipts copies last receipts per URL into .auspex/pack for an agent to attach to a PR."

function toolJson(obj: object): string {
  return JSON.stringify(stampSchema(obj), null, 2)
}

function progressFromExtra(extra: unknown) {
  return createProgress({ extra: extra as ProgressExtra })
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
        const merged = applySavedCheckName(args)
        const url = merged.url
        const expect = merged.expect
        if (!url || !expect) {
          throw new Error("auspex_check requires name or url+expect")
        }
        const { verify, name, ...rest } = merged
        const opts = { ...rest, url, expect, onProgress }
        assertPageActionsAllowed({ ...opts, name })
        assertRecordProfileAllowed({ ...opts, name })
        assertRecordNotLoggedIn(opts)
        const shouldVerify = verify !== false
        if (shouldVerify) {
          const both = await checkThenVerify(opts)
          const receipt = toAgentReceipt(both.check, { verify: both.verify })
          const packed = await buildCheckToolContent(receipt)
          packed.content[0] = { type: "text", text: toolJson(receipt) }
          return packed
        }
        const result = await runCheck(opts)
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
    "auspex_login",
    {
      description: LOGIN_DESCRIPTION,
      inputSchema: auspexLoginInputSchema,
    },
    async ({ profile, url, wait }) => {
      try {
        const runDir = await ensureRunDir()
        const result = await loginProfile(profile, url)
        if (result.handoff?.url) {
          const qr = await generateQRCode(result.handoff.url, runDir)
          result.handoff.qrPath = qr.qrPath
        }
        if (!wait) {
          return { content: [{ type: "text" as const, text: toolJson({ ok: true, ...result }) }] }
        }
        const waited = await liveAwaitLogin(profile, { sinceVersion: result.sinceVersion })
        return {
          content: [{ type: "text" as const, text: toolJson({ ok: waited.status === "completed", ...result, wait: waited }) }],
        }
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_await_login",
    {
      description:
        "Wait until the human Save on an auspex_login handoff stores cookies or origins. A version bump with 0 cookies is empty-save (not success). Then pass this profile to auspex_check. Do not ping the user.",
      inputSchema: auspexAwaitLoginInputSchema,
    },
    async ({ profile, sinceVersion, timeoutMs }) => {
      try {
        const result = await liveAwaitLogin(profile, { sinceVersion, timeoutMs })
        return { content: [{ type: "text" as const, text: toolJson({ ok: result.status === "completed", ...result }) }] }
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
