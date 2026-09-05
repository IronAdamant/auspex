import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { runCheck } from "./check.ts"
import { buildCheckToolContent, buildReceiptToolContent, packToolFailure } from "./content.ts"
import { runDesktopReview } from "./desktop.ts"
import { createProgress, type ProgressExtra } from "./progress.ts"
import { listProfiles, loginProfile } from "./profiles.ts"
import { checkThenVerify, defaultVerifyDeps, verifyReceipt } from "./sandbox.ts"
import { defaultDesktopDeps } from "./desktop.ts"
import { assertRecordProfileAllowed, auspexCheckInputObject, auspexDesktopInputSchema, auspexLoginInputSchema } from "./tool-schema.ts"

const CHECK_DESCRIPTION =
  "Open a live URL in a Solari cloud browser (fast pool by default), snapshot the page, and check that expected text is present. Always closes/releases the session. Returns JSON plus a downscaled JPEG attach; the on-disk shot stays full-page PNG. Set verify=true for one-shot check-then-sandbox (do not also call auspex_verify). Integrity ok vs claim claimOk are separate: a missed expect can still be a valid receipt. stealth is Starter+ (402 FeatureRequiresPlan, not retryable). record+profile is forbidden unless allowRecordProfile. 429 ConcurrencyLimitExceeded is not retryable — solari_browser_close / solari_kill leftover sessions, then retry."

const VERIFY_DESCRIPTION =
  "After auspex_check without verify=true, upload the on-disk receipt (PNG + JSON) into a headless Solari sandbox, assert integrity (ok) vs claim (claimOk), and kill the VM. Do not call this if you already passed verify=true on auspex_check. 429 is not retryable: solari_kill leftover VMs first."

const LOGIN_DESCRIPTION =
  "Create or reuse a named Solari browser profile and return a single-use login-handoff URL for the human (agent never handles the password). Show the url, wait for them to Save, then pass this profile to auspex_check."

const DESKTOP_DESCRIPTION =
  "Solari GUI desktop: boot, one computer-use action (default click center; optional open/type), screenshot, kill. Returns ASCII log plus structured JSON and optional PNG. Desktops may 402 FeatureRequiresPlan on Free (not retryable). 429: solari_kill leftovers, do not retry create."

const PROFILES_DESCRIPTION = "List Solari browser profile names and ids on this account."

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
    async ({ url, expect, selector, profile, stealth, record, sso, verify, allowRecordProfile }, extra) => {
      try {
        const onProgress = progressFromExtra(extra)
        onProgress("auspex_check")
        const opts = { url, expect, selector, profile, stealth, record, sso, allowRecordProfile, onProgress }
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
    async ({ profile, url }) => {
      try {
        const result = await loginProfile(profile, url)
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
    async ({ open, type, clickX, clickY }, extra) => {
      try {
        const onProgress = progressFromExtra(extra)
        onProgress("auspex_desktop")
        const result = await runDesktopReview({
          ...defaultDesktopDeps(),
          task: {
            open,
            type,
            click: clickX !== undefined && clickY !== undefined ? { x: clickX, y: clickY } : undefined,
          },
          status: process.stderr,
        })
        const packed = await buildReceiptToolContent(
          {
            ok: result.ok,
            ready: result.ready,
            screenshotPath: result.screenshotPath,
            errors: result.errors,
            desktopId: result.desktopId,
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
}
