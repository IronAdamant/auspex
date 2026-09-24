import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import {
  CHECK_DESCRIPTION,
  LOGIN_DESCRIPTION,
  REAP_DESCRIPTION,
} from "../src/tool-copy.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function ensureDist(): string {
  const dest = path.join(root, "dist/mcp.mjs")
  if (!existsSync(dest)) {
    const built = spawnSync("npm", ["run", "build:mcp"], { cwd: root, encoding: "utf8" })
    assert.equal(built.status, 0, built.stderr || built.stdout)
  }
  return readFileSync(dest, "utf8")
}

test("source tool-copy keeps fail-closed leads and triad phrases", () => {
  assert.match(CHECK_DESCRIPTION, /Passing anonymous verify/)
  assert.match(CHECK_DESCRIPTION, /They are not equivalent/)
  assert.match(CHECK_DESCRIPTION, /schemaVersion 1 is frozen/)
  assert.match(LOGIN_DESCRIPTION, /real text field/)
  assert.match(LOGIN_DESCRIPTION, /door\.html/)
  assert.match(REAP_DESCRIPTION, /accountWide/)
})

test("auspex-mcp fail-closes DistMissing when dist is absent", () => {
  const missing = path.join(root, "dist", "no-such-mcp.mjs")
  const bins = [
    path.join(root, "bin", "auspex-mcp.mjs"),
    path.join(path.resolve(root, "../.."), "bin", "auspex-mcp.mjs"),
  ]
  for (const bin of bins) {
    const ran = spawnSync(process.execPath, [bin], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, AUSPEX_MCP_DIST: missing },
    })
    assert.notEqual(ran.status, 0, `${bin} must exit non-zero`)
    const line = ran.stdout.trim().split("\n").find((row) => row.startsWith("{")) ?? ran.stdout
    const payload = JSON.parse(line) as { ok?: boolean; schemaVersion?: number; code?: string; next?: string; error?: string }
    assert.equal(payload.ok, false)
    assert.equal(payload.schemaVersion, 1)
    assert.equal(payload.code, "DistMissing")
    assert.match(payload.error ?? "", /build:mcp/)
    assert.match(payload.next ?? "", /build:mcp/)
    assert.match(ran.stderr, /build:mcp/)
  }
})

test("built dist/mcp.mjs keeps fail-closed gates (CI builds; not committed)", () => {
  const dist = ensureDist()
  assert.match(dist, /loopback address/)
  assert.match(dist, /allowRecordProfile/)
  assert.match(dist, /sandbox kill failed/)
  assert.match(dist, /fitPngUnderCap/)
  assert.match(dist, /fitMcpAttach/)
  assert.match(dist, /packToolFailure/)
  assert.match(dist, /screenshot file is missing/)
  assert.match(dist, /inputSchema:\s*auspexCheckInputObject/)
  assert.match(dist, /auspex_reap/)
  assert.match(dist, /auspex_trace/)
  assert.match(dist, /auspex_job/)
  assert.match(dist, /auspex_job_status/)
  assert.match(dist, /AUSPEX_WAKE_WEBHOOK/)
  assert.match(dist, /auspex_await_login/)
  assert.match(dist, /auspex_finalize_login/)
  assert.match(dist, /shouldVerifyCheck/)
  assert.match(dist, /They are not equivalent/)
  assert.match(dist, /schemaVersion 1 is frozen/)
  assert.match(dist, /accountWide/)
  assert.match(dist, /real text field/)
  assert.match(dist, /door\.html/)
  assert.match(dist, /event: "post-handoff"/)
  assert.equal(dist.includes("gateUrl"), false, "dist MCP must not ship the detecting-gate URL")
  assert.equal(dist.includes("login-gate"), false, "dist MCP must not bundle login-gate.ts")
  assert.equal(dist.includes("auspex-operator-key"), false)
  assert.equal(dist.includes("issueOperatorPairingNonce"), false)
  assert.equal(dist.includes("startOperatorKeyListener"), false)
})
