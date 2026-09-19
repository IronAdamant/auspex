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

test("docs doors do not teach pre-#38 ok or flatten verify vs verifyWithProfile", () => {
  const rootReadme = readFileSync(path.join(repo, "README.md"), "utf8")
  const packReadme = readFileSync(path.join(pkg, "README.md"), "utf8")
  const pitch = readFileSync(path.join(repo, "PITCH.md"), "utf8")
  const security = readFileSync(path.join(pkg, "SECURITY.md"), "utf8")
  const rootAgents = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const packAgents = readFileSync(path.join(pkg, "AGENTS.md"), "utf8")
  const tools = readFileSync(path.join(pkg, "src", "mcp-tools.ts"), "utf8")
  const cursorRule = readFileSync(path.join(repo, ".cursor", "rules", "auspex.mdc"), "utf8")

  assert.equal(packReadme.includes("ok is protocol success"), false, "package README must not teach pre-#38 ok")
  assert.match(packReadme, /finalize-login/)
  assert.match(packReadme, /--verify-with-profile/)
  assert.match(packReadme, /weakSeed|emptySave/)
  assert.match(packReadme, /auspex_finalize_login/)

  assert.match(rootReadme, /auspex_finalize_login/)
  assert.match(rootReadme, /weakSeed/)
  assert.match(rootReadme, /emptySave/)
  assert.match(rootReadme, /claimOkProfile/)

  assert.equal(pitch.includes("After anonymous verify"), false, "PITCH must not say VWP runs after anonymous verify")
  assert.match(pitch, /Skips\*\* anonymous claim|Skips anonymous claim/)

  assert.equal(security.includes("232/235"), false, "SECURITY must not ship a rotting test-count")
  assert.match(security, /npm test/)

  assert.match(rootAgents, /FAIL-CLOSED `--type`/)
  assert.match(packAgents, /FAIL-CLOSED `--type`/)
  assert.match(rootAgents, /verify=true.*is not.*verifyWithProfile|not `verifyWithProfile`/)
  assert.match(packAgents, /verify=true.*is not.*verifyWithProfile|not `verifyWithProfile`/)

  assert.match(tools, /They are not equivalent/)
  assert.match(tools, /claimOkProfile/)
  assert.match(USAGE, /They are not the same/)
  assert.match(USAGE, /FAIL-CLOSED --type/)

  assert.match(cursorRule, /verify-with-profile/)
  assert.match(cursorRule, /auspex_finalize_login/)
  assert.match(cursorRule, /weakSeed/)
})
