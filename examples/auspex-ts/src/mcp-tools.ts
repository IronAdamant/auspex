import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { runCheck } from "./check.ts"
import { buildCheckToolContent, buildReceiptToolContent, packToolFailure } from "./content.ts"
import { defaultDesktopDeps, runDesktopReview } from "./desktop.ts"
import { createProgress, type ProgressExtra } from "./progress.ts"
import { listProfiles, loginProfile } from "./profiles.ts"
import { liveAwaitLogin } from "./profile-persist.ts"
import { reapLeftovers } from "./reap.ts"
import { checkThenVerify, defaultVerifyDeps, verifyReceipt } from "./sandbox.ts"
import {
  assertRecordProfileAllowed,
  auspexAwaitLoginInputSchema,
  auspexCheckInputObject,
  auspexDesktopInputSchema,
  auspexLoginInputSchema,
  auspexReapInputSchema,
} from "./tool-schema.ts"

const CHECK_DESCRIPTION =
  "Open a live URL in a Solari cloud browser, optional click/fill/wait-for, snapshot, check expected text, close. JSON plus JPEG attach; on-disk shot is a PNG scaled under 2 MiB. verify=true is one-shot check-then-sandbox (do not also call auspex_verify). Integrity ok vs claim claimOk are separate. stealth/proxy/captcha are Starter+ (402 not retryable). record+profile forbidden unless allowRecordProfile. Never record a logged-in session (sso/saveProfile/dashboard). saveProfile persists cookies/localStorage/sessionStorage via POST /profiles/:id/save (not a public /landing session; origin must have bytes). Profile reuse that lands on /landing is ok:false reason:loggedOut. Microsoft password/OTP sets needsHuman (never typed). 429: call auspex_reap, then retry."

const VERIFY_DESCRIPTION =
  "After auspex_check without verify=true, upload the on-disk receipt into a headless Solari sandbox, independently re-check expect (fetch/OCR, not JSON echo). Integrity ok vs claim claimOk. Kill the VM. Do not call this if you already passed verify=true. 429: auspex_reap leftover VMs first."

const LOGIN_DESCRIPTION =
  "Create or reuse a named Solari browser profile and return a single-use login-handoff URL for the human (agent never handles the password). Show the url, then call auspex_await_login (or pass wait=true). A Save with 0 cookies is not success."

const DESKTOP_DESCRIPTION =
  "Solari GUI desktop: boot, wait for X11, open mousepad by default (the demo is opening the app). Wait/expect/ok share one process haystack (processList + ps). windowOk only if a real window list exists. clicked only if verified (coordinate clicks are not). Returns ASCII log, JSON, optional PNG, and streamUrl (VNC). Desktops may 402 on Free. 429: auspex_reap."

const PROFILES_DESCRIPTION =
  "List Solari browser profile names, ids, version, and populated (whether a non-empty storage state was saved)."

const REAP_DESCRIPTION =
  "List and close leftover Solari browser sessions (from Auspex's live ledger) and kill holding sandboxes/desktops. Use after 429 ConcurrencyLimitExceeded. dryRun lists without killing."

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
        const { verify, ...rest } = args
        const opts = { ...rest, onProgress }
        assertRecordProfileAllowed(opts)
        if (verify) {
          const both = await checkThenVerify(opts)
          const packed = await buildCheckToolContent(both.check)
          packed.content[0] = { type: "text", text: JSON.stringify(both, null, 2) }
          return packed
        }
        const result = await runCheck(opts)
        return await buildCheckToolContent(result)
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
        const result = await loginProfile(profile, url)
        if (!wait) {
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
        }
        const waited = await liveAwaitLogin(profile, { sinceVersion: result.sinceVersion })
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ ...result, wait: waited }, null, 2) }],
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
        "Wait until the human Save on an auspex_login handoff stores cookies or origins. A version bump with 0 cookies is empty-save (not success). Then pass this profile to auspex_check.",
      inputSchema: auspexAwaitLoginInputSchema,
    },
    async ({ profile, sinceVersion, timeoutMs }) => {
      try {
        const result = await liveAwaitLogin(profile, { sinceVersion, timeoutMs })
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
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
        return { content: [{ type: "text" as const, text: JSON.stringify(profiles, null, 2) }] }
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
          {
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
          },
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
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
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
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )
}
