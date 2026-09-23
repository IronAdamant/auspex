import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function findTsx() {
  return [
    path.join(pkgRoot, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(pkgRoot, "node_modules", "tsx", "dist", "cli.js"),
  ].find((p) => existsSync(p))
}

export function mcpDistPath() {
  return process.env.AUSPEX_MCP_DIST || path.join(pkgRoot, "dist", "mcp.mjs")
}

export function distMissingPayload() {
  return {
    ok: false,
    schemaVersion: 1,
    error:
      "Clone MCP needs a built dist/. From the repository root run: npm install && npm run build:mcp. Then retry npx auspex-mcp / Cursor MCP. Equivalent without dist: npx tsx src/mcp.ts from examples/auspex-ts. Do not commit dist/.",
    code: "DistMissing",
    next: "npm install && npm run build:mcp",
  }
}

function writeFailClosed(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
  process.stderr.write(`${payload.error}\nnext: ${payload.next}\n`)
}

function inheritChild(child) {
  child.on("exit", (code, signal) => {
    if (signal) process.exit(1)
    process.exit(code ?? 1)
  })
}

export function spawnAuspex(entryRel, extraArgs = []) {
  const tsx = findTsx()
  if (!tsx) {
    const payload = {
      ok: false,
      schemaVersion: 1,
      error:
        "Auspex is not installed. From the repository root run: npm install (installs examples/auspex-ts).",
      code: "NotInstalled",
    }
    process.stdout.write(`${JSON.stringify(payload)}\n`)
    process.exit(1)
  }
  const entry = path.join(pkgRoot, entryRel)
  const child = spawn(process.execPath, [tsx, entry, ...extraArgs], {
    stdio: "inherit",
    cwd: pkgRoot,
    env: process.env,
  })
  inheritChild(child)
}

/** MCP bin: require CI-built dist/mcp.mjs. Missing dist is DistMissing, not a silent empty server. */
export function spawnAuspexMcp() {
  const dist = mcpDistPath()
  if (!existsSync(dist)) {
    writeFailClosed(distMissingPayload())
    process.exit(1)
  }
  const child = spawn(process.execPath, [dist], {
    stdio: "inherit",
    cwd: pkgRoot,
    env: process.env,
  })
  inheritChild(child)
}
