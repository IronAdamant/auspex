import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { runCheck } from "./check.ts"
import { buildCheckToolContent } from "./content.ts"
import { explainSolariError } from "./errors.ts"
import { httpUrlSchema } from "./http-url.ts"
import { listProfiles, loginProfile } from "./profiles.ts"
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
      "Open a live URL in a Solari cloud browser, snapshot the page, and check that expected text is present. Returns JSON plus a PNG (or a note if the PNG exceeds 2 MiB). Always closes the session. Use for post-deploy verification, not raw CDP.",
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
    },
  },
  async ({ url, expect, selector, profile, stealth, record, sso }) => {
    try {
      const result = await runCheck({
        url,
        expect,
        selector,
        profile,
        stealth,
        record,
        sso,
      })
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

const transport = new DualStdioServerTransport()
await server.connect(transport)
