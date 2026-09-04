import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { runCheck } from "./check.ts"
import { buildCheckToolContent, buildReceiptToolContent } from "./content.ts"
import { runDesktopReview } from "./desktop.ts"
import { explainSolariError } from "./errors.ts"
import { listProfiles, loginProfile } from "./profiles.ts"
import { checkThenVerify, verifyReceipt } from "./sandbox.ts"
import { assertRecordProfileAllowed, auspexCheckInputObject, auspexLoginInputSchema } from "./tool-schema.ts"

export function registerAuspexTools(server: McpServer): void {
  server.registerTool(
    "auspex_check",
    {
      description:
        "Open a live URL in a Solari cloud browser, snapshot the page, and check that expected text is present. Returns JSON plus a PNG (on-disk shot stays full-page; MCP attach is downscaled to 2 MiB if needed). Always closes the session. Set verify=true to then audit the receipt in a headless sandbox and kill the VM. Use for post-deploy verification, not raw CDP.",
      inputSchema: auspexCheckInputObject,
    },
    async ({ url, expect, selector, profile, stealth, record, sso, verify, allowRecordProfile }) => {
      try {
        const opts = { url, expect, selector, profile, stealth, record, sso, allowRecordProfile }
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
        throw new Error(explainSolariError(err))
      }
    },
  )

  server.registerTool(
    "auspex_login",
    {
      description:
        "Create or reuse a named Solari browser profile, then tell the human to log in via Console → Profiles → Open editor → Save. Does not keep a check session open. After Save, pass this profile to auspex_check.",
      inputSchema: auspexLoginInputSchema,
    },
    async ({ profile, url }) => {
      try {
        const result = await loginProfile(profile, url)
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
      } catch (err) {
        throw new Error(explainSolariError(err))
      }
    },
  )

  server.registerTool(
    "auspex_profiles",
    {
      description: "List Solari browser profile names and ids on this account.",
      inputSchema: {},
    },
    async () => {
      try {
        const profiles = await listProfiles()
        return { content: [{ type: "text" as const, text: JSON.stringify(profiles, null, 2) }] }
      } catch (err) {
        throw new Error(explainSolariError(err))
      }
    },
  )

  server.registerTool(
    "auspex_desktop",
    {
      description:
        "Minimal Solari GUI desktop: boot, screenshot, kill. Always returns an append-only ASCII log (:: booting … ==> ok=true path=…) as the tool text so Grok/Codex/Claude can show it without a TTY. Optional PNG. No VNC. Desktops need Starter or higher.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await runDesktopReview()
        const packed = await buildReceiptToolContent(
          { ok: result.ok, ready: result.ready, screenshotPath: result.screenshotPath, errors: result.errors },
          result.screenshotPath,
        )
        packed.content[0] = { type: "text", text: result.log }
        return packed
      } catch (err) {
        throw new Error(explainSolariError(err))
      }
    },
  )

  server.registerTool(
    "auspex_verify",
    {
      description:
        "After auspex_check, upload the receipt (PNG + JSON) into a headless Solari sandbox, assert it, and kill the VM. Login stays on the browser profile editor. Optional runDir; default is the latest .auspex/runs stamp.",
      inputSchema: {
        runDir: z.string().optional().describe("Optional path to an .auspex/runs/<stamp> directory"),
      },
    },
    async ({ runDir }) => {
      try {
        const result = await verifyReceipt(runDir)
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
      } catch (err) {
        throw new Error(explainSolariError(err))
      }
    },
  )
}
