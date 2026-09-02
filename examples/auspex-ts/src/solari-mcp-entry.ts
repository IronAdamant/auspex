/**
 * Grok stdio entry for Solari's official MCP.
 * Starts @solarisdk/mcp only when SOLARI_API_KEY is set (env or .env).
 * Otherwise exits 1 so Grok does not advertise solari_* tools.
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadDotEnv } from "./solari.ts"
import { solariKeyReady } from "./solari-mcp-gate.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

loadDotEnv(process.env.AUSPEX_DOTENV_PATH)
if (!solariKeyReady()) {
  console.error(
    "solari MCP not started: no SOLARI_API_KEY (export it or put it in examples/auspex-ts/.env)",
  )
  process.exit(1)
}

const cli = path.join(root, "node_modules", "@solarisdk", "mcp", "dist", "cli.js")
if (!existsSync(cli)) {
  console.error("solari MCP not started: @solarisdk/mcp is not installed")
  process.exit(1)
}

const child = spawn(process.execPath, [cli], {
  stdio: "inherit",
  env: process.env,
  cwd: root,
})
child.on("exit", (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 0)
})
