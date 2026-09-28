import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

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

/**
 * How to start the CLI. A clone (tsx installed next to src/) runs the source, so an edit never meets
 * a stale bundle. An npm install has no tsx and runs the prebuilt dist/cli.mjs.
 */
export function cliLaunch(entryRel = "src/cli.ts", opts = {}) {
  const root = opts.root ?? pkgRoot
  const exists = opts.exists ?? existsSync
  const tsx = [
    path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(root, "node_modules", "tsx", "dist", "cli.js"),
  ].find((p) => exists(p))
  const source = path.join(root, entryRel)
  if (tsx && exists(source)) return { kind: "source", args: [tsx, source] }
  const dist = path.join(root, "dist", "cli.mjs")
  if (exists(dist)) return { kind: "dist", args: [dist] }
  return { kind: "missing", args: [] }
}

export function spawnAuspex(entryRel, extraArgs = []) {
  const launch = cliLaunch(entryRel)
  if (launch.kind === "missing") {
    const payload = {
      ok: false,
      schemaVersion: 1,
      error:
        "Auspex is not installed. npm: reinstall auspex-solari (its dist/cli.mjs is missing). Clone: from the repository root run npm install && npm run build:mcp.",
      code: "NotInstalled",
    }
    process.stdout.write(`${JSON.stringify(payload)}\n`)
    process.exit(1)
  }
  const child = spawn(process.execPath, [...launch.args, ...extraArgs], {
    stdio: "inherit",
    cwd: pkgRoot,
    // The CLI runs from the package root; relative user paths (sweep --plan) resolve from here.
    env: { ...process.env, AUSPEX_CALLER_CWD: process.env.AUSPEX_CALLER_CWD || process.cwd() },
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
    env: { ...process.env, AUSPEX_CALLER_CWD: process.env.AUSPEX_CALLER_CWD || process.cwd() },
  })
  inheritChild(child)
}
