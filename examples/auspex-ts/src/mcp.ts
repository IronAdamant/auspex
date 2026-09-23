import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { startOperatorKeyListener } from "./operator-session.ts"
import { packageRoot } from "./paths.ts"
import { registerAuspexTools } from "./mcp-tools.ts"
import { DualStdioServerTransport } from "./stdio-transport.ts"

startOperatorKeyListener(packageRoot)

const server = new McpServer({
  name: "auspex",
  version: "0.1.0",
})

registerAuspexTools(server)

const transport = new DualStdioServerTransport()
await server.connect(transport)
