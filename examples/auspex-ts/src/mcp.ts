import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { runCheck } from "./check.ts"
import { buildCheckToolContent } from "./content.ts"
import { explainSolariError } from "./errors.ts"
import { httpUrlSchema } from "./http-url.ts"
import { listProfiles, loginProfile } from "./profiles.ts"
import { checkThenVerify, verifyReceipt } from "./sandbox.ts"
import { DualStdioServerTransport } from "./stdio-transport.ts"
import { expectSchema } from "./text.ts"

const server = new McpServer({
  name: "auspex",
  version: "0.1.0",
})

server.registerTool(
  "auspex_check",
  {
    description:
      "Open a live URL in a Solari cloud browser, snapshot the page, and check that expected text is present. Returns JSON plus a PNG (or a note if the PNG exceeds 2 MiB). Always closes the session. Set verify=true to then audit the receipt in a headless sandbox and kill the VM. Use for post-deploy verification, not raw CDP.",
    inputSchema: {
      url: httpUrlSchema.describe("http or https URL to open"),
      expect: expectSchema.describe("Non-empty substring that must appear in the page text"),
      selector: z.string().optional().describe("Optional CSS selector to extract instead of body"),
      profile: z.string().optional().describe("Solari profile name to reuse cookies/storage"),
      stealth: z.boolean().optional().describe("Launch with Solari stealth (Starter plan)"),
      record: z.boolean().optional().describe("Record the session for Solari console Replay (sessionId). Does not return a presigned URL"),
      sso: z
        .boolean()
        .optional()
        .describe("Click Sign in with Microsoft and the signed-in account picker if they appear"),
      verify: z.boolean().optional().describe("After check, audit the receipt in a headless Solari sandbox and kill the VM"),
    },
  },
  async ({ url, expect, selector, profile, stealth, record, sso, verify }) => {
    try {
      const opts = { url, expect, selector, profile, stealth, record, sso }
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
    inputSchema: {
      profile: z.string().describe("Profile name to create or reuse"),
      url: httpUrlSchema.optional().describe("Optional http(s) login URL hint to show the human"),
    },
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

const transport = new DualStdioServerTransport()
await server.connect(transport)
