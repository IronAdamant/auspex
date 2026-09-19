import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { USAGE } from "../src/cli.ts"

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repo = path.resolve(pkg, "../..")

test("root and package AGENTS agree on P0/P1 contract facts", () => {
  const root = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const pack = readFileSync(path.join(pkg, "AGENTS.md"), "utf8")
  const tools = readFileSync(path.join(pkg, "src", "mcp-tools.ts"), "utf8")
  for (const needle of [
    "--mobile",
    "--device",
    "weakSeed",
    "emptySave",
    "openOnPhone",
    "oneLiner",
    "qrPath",
    "auspex_finalize_login",
    "verify=false",
  ]) {
    assert.match(root, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `root AGENTS missing ${needle}`)
    assert.match(pack, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `package AGENTS missing ${needle}`)
  }
  assert.match(USAGE, /--mobile/)
  assert.match(USAGE, /--device/)
  assert.match(USAGE, /emptySave/)
  assert.match(USAGE, /weakSeed/)
  assert.match(USAGE, /finalize-login/)
  assert.match(USAGE, /consistencyhub.*--no-verify|defaults to --no-verify/)
  assert.match(tools, /auspex_finalize_login/)
  assert.match(tools, /shouldVerifyCheck/)
  assert.match(tools, /defaults to verify=false/)
})
