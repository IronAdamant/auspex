#!/usr/bin/env node
// Clone only: install the dev package (tsx, esbuild, TypeScript) under examples/auspex-ts.
// An npm install of auspex-solari gets its runtime dependencies from the root package.json and
// runs the prebuilt dist/, so it needs no nested install (and works with --ignore-scripts).
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
if (!existsSync(path.join(root, ".git"))) process.exit(0)
const run = spawnSync("npm", ["install", "--prefix", "examples/auspex-ts"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
})
process.exit(run.status ?? 1)
