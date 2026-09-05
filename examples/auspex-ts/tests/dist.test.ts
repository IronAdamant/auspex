import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("dist/mcp.mjs includes current loopback, record-profile, kill, and PNG-fit gates", () => {
  const dist = readFileSync(path.join(root, "dist/mcp.mjs"), "utf8")
  assert.match(dist, /loopback address/)
  assert.match(dist, /allowRecordProfile/)
  assert.match(dist, /sandbox kill failed/)
  assert.match(dist, /fitPngUnderCap/)
  assert.match(dist, /fitMcpAttach/)
  assert.match(dist, /packToolFailure/)
  assert.match(dist, /screenshot file is missing/)
  assert.match(dist, /inputSchema:\s*auspexCheckInputObject/)
  assert.match(dist, /auspex_desktop/)
  assert.match(dist, /Starting Solari desktop review/)
})
