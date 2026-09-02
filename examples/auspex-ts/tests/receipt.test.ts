import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { parseArgv } from "../src/cli.ts"
import { assertRunDirUnderRuns, findLatestRun, RECEIPT_ASSERT_PY, RUNS_DIR } from "../src/receipt.ts"
import { parseAssertStdout } from "../src/sandbox.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const demoPng = path.join(root, "demo", "ironadamant.png")

function runAssert(work: string) {
  return spawnSync("python3", ["-c", RECEIPT_ASSERT_PY, work], { encoding: "utf8" })
}

test("RECEIPT_ASSERT_PY accepts a good public receipt", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-receipt-"))
  writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify({
      ok: true,
      matched: true,
      screenshotPath: ".auspex/runs/stamp/screenshot.png",
      finalUrl: "https://ironadamant.com/",
    })}\n`,
  )
  writeFileSync(path.join(dir, "screenshot.png"), readFileSync(demoPng))
  const out = runAssert(dir)
  assert.equal(out.status, 0, out.stderr + out.stdout)
  const parsed = JSON.parse(out.stdout) as { ok: boolean; errors: string[] }
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.errors, [])
})

test("RECEIPT_ASSERT_PY fails leftover-auth URLs and non-PNGs", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-receipt-"))
  writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify({
      ok: true,
      matched: true,
      screenshotPath: ".auspex/runs/stamp/screenshot.png",
      finalUrl: "https://consistencyhub.io/login",
    })}\n`,
  )
  writeFileSync(path.join(dir, "screenshot.png"), Buffer.from("not a png"))
  const out = runAssert(dir)
  assert.notEqual(out.status, 0)
  const parsed = JSON.parse(out.stdout) as { ok: boolean; errors: string[] }
  assert.equal(parsed.ok, false)
  assert.ok(parsed.errors.some((e) => /PNG/i.test(e)))
  assert.ok(parsed.errors.some((e) => /auth path/i.test(e)))
})

test("assertRunDirUnderRuns rejects paths outside .auspex/runs", () => {
  assert.throws(() => assertRunDirUnderRuns("/etc/passwd"), /under \.auspex\/runs/)
  const ok = assertRunDirUnderRuns(path.join(RUNS_DIR, "stamp"))
  assert.ok(ok.includes(".auspex"))
})

test("findLatestRun picks the complete newest stamp", async () => {
  const runs = mkdtempSync(path.join(tmpdir(), "auspex-runs-"))
  mkdirSync(path.join(runs, "older"))
  writeFileSync(path.join(runs, "older", "manifest.json"), "{}")
  const newest = path.join(runs, "zzzz-new")
  mkdirSync(newest)
  writeFileSync(path.join(newest, "manifest.json"), "{}")
  writeFileSync(path.join(newest, "screenshot.png"), Buffer.alloc(8))
  const found = await findLatestRun(runs)
  assert.equal(found, newest)
})

test("parseAssertStdout uses the last JSON line and rejects garbage", () => {
  const ok = parseAssertStdout('noise\n{"ok":true,"errors":[]}\n')
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.errors, [])
  const bad = parseAssertStdout("not json")
  assert.equal(bad.ok, false)
  assert.match(bad.errors[0] ?? "", /not JSON/)
  const empty = parseAssertStdout("   ")
  assert.equal(empty.ok, false)
})

test("RECEIPT_ASSERT_PY does not treat a suffix host as Microsoft", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-receipt-"))
  writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify({
      ok: true,
      matched: true,
      screenshotPath: ".auspex/runs/stamp/screenshot.png",
      finalUrl: "https://login.microsoftonline.com.evil.com/",
    })}\n`,
  )
  writeFileSync(path.join(dir, "screenshot.png"), readFileSync(demoPng))
  const out = runAssert(dir)
  assert.equal(out.status, 0, out.stderr + out.stdout)
})

test("runCheck source does not auto-save Solari profiles", () => {
  const src = readFileSync(path.join(root, "src", "check.ts"), "utf8")
  assert.equal(src.includes("profiles.save"), false)
  assert.equal(src.includes(".save("), false)
})

test("parseArgv verify accepts an optional run dir", () => {
  const a = parseArgv(["verify"])
  assert.equal(a.status, "ok")
  if (a.status === "ok" && a.command.cmd === "verify") assert.equal(a.command.runDir, undefined)
  const b = parseArgv(["verify", ".auspex/runs/stamp"])
  assert.equal(b.status, "ok")
  if (b.status === "ok" && b.command.cmd === "verify") {
    assert.equal(b.command.runDir, ".auspex/runs/stamp")
  }
})
