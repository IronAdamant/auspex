import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerAuspexTools } from "./mcp-tools.ts"
import { DualStdioServerTransport } from "./stdio-transport.ts"

const server = new McpServer({
  name: "auspex",
  version: "0.1.0",
})

registerAuspexTools(server)

const transport = new DualStdioServerTransport()
await server.connect(transport)
