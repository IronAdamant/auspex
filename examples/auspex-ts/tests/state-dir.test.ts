import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { packageRoot, resolveStateDir, resolveStatePath, stateDir, toStatePath } from "../src/paths.ts"

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

test("receipt paths: relative in the package, ~/ under home (no username), absolute elsewhere", () => {
  assert.equal(toStatePath(path.join(packageRoot, ".auspex", "runs", "s", "screenshot.png")), ".auspex/runs/s/screenshot.png")
  const home = path.join(path.parse(packageRoot).root, "home-for-test", "u")
  const shot = path.join(home, ".auspex", "runs", "s", "screenshot.png")
  assert.equal(toStatePath(shot, home), "~/.auspex/runs/s/screenshot.png")
  assert.equal(resolveStatePath("~/.auspex/runs/s/screenshot.png", home), shot)
  const outside = path.join(path.parse(packageRoot).root, "srv", "auspex", "runs", "s", "screenshot.png")
  assert.equal(toStatePath(outside, home), outside.replaceAll("\\", "/"))
  assert.equal(resolveStatePath(".auspex/runs/s/screenshot.png"), path.join(packageRoot, ".auspex", "runs", "s", "screenshot.png"))
})

test("sandbox assert flags home paths only; ~/ and AUSPEX_HOME paths verify", async () => {
  const { spawnSync } = await import("node:child_process")
  const { ASSERT_RECEIPT_PY_PATH } = await import("../src/receipt.ts")
  const probe = `import importlib.util, re, sys
spec = importlib.util.spec_from_file_location("a", sys.argv[1]); src = open(sys.argv[1]).read()
rx = re.search(r're\\.match\\((r"[^"]+")', src).group(1)
pat = eval(rx)
for s in sys.argv[2:]: print(s, bool(re.match(pat, s)))`
  const cases = ["/Users/a/.auspex/x", "/home/a/x", "C:\\Users\\a\\x", "~/.auspex/runs/x", ".auspex/runs/x", "/srv/auspex/runs/x"]
  const ran = spawnSync("python3", ["-c", probe, ASSERT_RECEIPT_PY_PATH, ...cases], { encoding: "utf8" })
  if (ran.error) return // python3 missing on this runner
  assert.equal(ran.status, 0, ran.stderr)
  const flagged = Object.fromEntries(ran.stdout.trim().split("\n").map((l) => { const i = l.lastIndexOf(" "); return [l.slice(0, i), l.slice(i + 1) === "True"] }))
  assert.deepEqual(flagged, {
    "/Users/a/.auspex/x": true, "/home/a/x": true, "C:\\Users\\a\\x": true,
    "~/.auspex/runs/x": false, ".auspex/runs/x": false, "/srv/auspex/runs/x": false,
  })
})
