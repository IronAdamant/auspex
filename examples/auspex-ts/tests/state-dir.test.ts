import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { packageRoot, resolveStateDir, stateDir, toStatePath } from "../src/paths.ts"

test("tests never share the operator's real .auspex", () => {
  assert.notEqual(stateDir, path.join(packageRoot, ".auspex"))
})

test("AUSPEX_HOME wins, then test isolation, then npm install vs clone", () => {
  assert.equal(resolveStateDir({ AUSPEX_HOME: "/srv/auspex" }, "/any", "/home/u"), path.resolve("/srv/auspex"))
  assert.match(resolveStateDir({ NODE_TEST_CONTEXT: "child-v8" }, "/any", "/home/u"), /auspex-test-state-/)
  const npx = path.join("/home/u/.npm/_npx/abc/node_modules/auspex-solari/examples/auspex-ts")
  assert.equal(resolveStateDir({}, npx, "/home/u"), path.join("/home/u", ".auspex"))
  assert.equal(resolveStateDir({}, "/code/auspex/examples/auspex-ts", "/home/u"), path.join("/code/auspex/examples/auspex-ts", ".auspex"))
})

test("receipt paths stay relative inside the package and go absolute outside it", () => {
  assert.equal(toStatePath(path.join(packageRoot, ".auspex", "runs", "s", "screenshot.png")), ".auspex/runs/s/screenshot.png")
  const outside = path.join(path.parse(packageRoot).root, "tmp", "x", "runs", "s", "screenshot.png")
  assert.equal(toStatePath(outside), outside.replaceAll("\\", "/"))
})
