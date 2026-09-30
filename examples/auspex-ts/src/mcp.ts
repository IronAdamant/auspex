import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
// The published package's version. esbuild inlines it into dist/mcp.mjs, so a release bump is one edit.
import pkg from "../../../package.json" with { type: "json" }
import { registerAuspexTools } from "./mcp-tools.ts"
import { releaseOwnSessionsOnSignal } from "./shutdown.ts"
import { DualStdioServerTransport } from "./stdio-transport.ts"

const server = new McpServer({
  name: "auspex",
  version: pkg.version,
})

registerAuspexTools(server)
// A host that stops the server mid-call (SIGTERM) or Ctrl-C: close the browsers those calls opened.
releaseOwnSessionsOnSignal()

const transport = new DualStdioServerTransport()
await server.connect(transport)
