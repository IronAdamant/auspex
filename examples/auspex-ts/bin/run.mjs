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
  child.on("exit", (code, signal) => {
    if (signal) process.exit(1)
    process.exit(code ?? 1)
  })
}
