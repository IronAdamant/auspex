import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { packageRoot, resolveStateDir, resolveStatePath, stateDir, toStatePath } from "../src/paths.ts"

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

test("two runs started in the same second get their own folders", async () => {
  const { ensureRunDir } = await import("../src/paths.ts")
  const { mkdtemp } = await import("node:fs/promises")
  const runs = await mkdtemp(path.join(tmpdir(), "auspex-runs-"))
  const dirs = await Promise.all([ensureRunDir(runs), ensureRunDir(runs), ensureRunDir(runs)])
  assert.equal(new Set(dirs).size, 3)
  for (const dir of dirs) assert.match(path.basename(dir), /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(-\d+)?$/)
})

test("pruneRuns keeps the newest runs, never a young one, and touches only run folders", async () => {
  const { pruneRuns, keepRunsFromEnv, DEFAULT_KEEP_RUNS } = await import("../src/paths.ts")
  const { mkdtemp, mkdir, readdir, utimes, writeFile } = await import("node:fs/promises")
  const runs = await mkdtemp(path.join(tmpdir(), "auspex-runs-"))
  const old = new Date(Date.now() - 2 * 60 * 60 * 1000)
  const names = ["2026-09-01T08-29-14-714Z", "2026-09-02T00-00-00", "2026-09-03T00-00-00", "2026-09-04T00-00-00", "2026-09-05T00-00-00"]
  for (const name of names) {
    await mkdir(path.join(runs, name))
    await writeFile(path.join(runs, name, "manifest.json"), "{}")
    await utimes(path.join(runs, name), old, old)
  }
  await mkdir(path.join(runs, "notes"))
  await utimes(path.join(runs, "notes"), old, old)
  // The oldest-named run was touched a minute ago: it may belong to a running command.
  const recent = new Date(Date.now() - 60_000)
  await utimes(path.join(runs, "2026-09-02T00-00-00"), recent, recent)
  assert.deepEqual(await pruneRuns(runs, 2), ["2026-09-03T00-00-00", "2026-09-01T08-29-14-714Z"])
  assert.deepEqual((await readdir(runs)).sort(), ["2026-09-02T00-00-00", "2026-09-04T00-00-00", "2026-09-05T00-00-00", "notes"])
  assert.deepEqual(await pruneRuns(runs, 0), [], "0 keeps every run")
  assert.equal(keepRunsFromEnv({}), DEFAULT_KEEP_RUNS)
  assert.equal(keepRunsFromEnv({ AUSPEX_KEEP_RUNS: "0" }), 0)
  assert.equal(keepRunsFromEnv({ AUSPEX_KEEP_RUNS: "50" }), 50)
  assert.equal(keepRunsFromEnv({ AUSPEX_KEEP_RUNS: "lots" }), DEFAULT_KEEP_RUNS)
})
