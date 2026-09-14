import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync, utimesSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { listCompleteRunDirs } from "../src/receipt.ts"
import { canonicalCheckUrl, diffAgainstLastReceipt } from "../src/receipt-diff.ts"
import { packLastReceipts } from "../src/receipt-pack.ts"

test("canonicalCheckUrl strips trailing slash and lowercases host", () => {
  assert.equal(canonicalCheckUrl("https://IronAdamant.com/"), "https://ironadamant.com/")
  assert.equal(
    canonicalCheckUrl("https://checkpointprojects.com/foo/"),
    "https://checkpointprojects.com/foo",
  )
})

test("listCompleteRunDirs orders complete runs by mtime, not directory name", async () => {
  const runs = mkdtempSync(path.join(tmpdir(), "auspex-mtime-runs-"))
  const alpha = path.join(runs, "zzzz-old-name")
  const iso = path.join(runs, "2026-09-14T00-00-00-000Z")
  for (const dir of [alpha, iso]) {
    mkdirSync(dir)
    writeFileSync(path.join(dir, "manifest.json"), "{}")
    writeFileSync(path.join(dir, "screenshot.png"), Buffer.from("x"))
  }
  const now = Date.now() / 1000
  utimesSync(alpha, now - 60, now - 60)
  utimesSync(iso, now, now)
  const dirs = await listCompleteRunDirs(runs)
  assert.equal(dirs[0], iso)
})

test("diffAgainstLastReceipt compares excerpt and url for the same site", async () => {
  const runs = mkdtempSync(path.join(tmpdir(), "auspex-diff-runs-"))
  const older = path.join(runs, "aaa")
  mkdirSync(older)
  writeFileSync(
    path.join(older, "manifest.json"),
    `${JSON.stringify({
      url: "https://ironadamant.com",
      finalUrl: "https://ironadamant.com/",
      excerpt: "One office job.",
      reason: "matched",
      expect: "One office job.",
    })}\n`,
  )
  writeFileSync(path.join(older, "screenshot.png"), Buffer.from("png"))
  const same = await diffAgainstLastReceipt({
    url: "https://ironadamant.com",
    excerpt: "One office job.",
    finalUrl: "https://ironadamant.com/",
    runsDir: runs,
  })
  assert.equal(same.sameUrl, true)
  assert.equal(same.excerptChanged, false)
  assert.equal(same.urlChanged, false)
  const changed = await diffAgainstLastReceipt({
    url: "https://ironadamant.com",
    excerpt: "Two office jobs.",
    finalUrl: "https://ironadamant.com/about",
    runsDir: runs,
  })
  assert.equal(changed.sameUrl, true)
  assert.equal(changed.excerptChanged, true)
  assert.equal(changed.urlChanged, true)
  const other = await diffAgainstLastReceipt({
    url: "https://checkpointprojects.com",
    excerpt: "Checkpoint",
    runsDir: runs,
  })
  assert.equal(other.sameUrl, false)
})

test("packLastReceipts copies last receipt per URL", async () => {
  const runs = mkdtempSync(path.join(tmpdir(), "auspex-pack-runs-"))
  const dest = mkdtempSync(path.join(tmpdir(), "auspex-pack-dest-"))
  for (const [stamp, url] of [
    ["aaa", "https://ironadamant.com"],
    ["bbb", "https://checkpointprojects.com"],
    ["ccc", "https://ironadamant.com"],
  ] as const) {
    const dir = path.join(runs, stamp)
    mkdirSync(dir)
    writeFileSync(
      path.join(dir, "manifest.json"),
      `${JSON.stringify({ url, expect: "x", reason: "matched", excerpt: stamp })}\n`,
    )
    writeFileSync(path.join(dir, "screenshot.png"), Buffer.from(`shot-${stamp}`))
  }
  const packed = await packLastReceipts({ destDir: dest, runsDir: runs })
  assert.equal(packed.packed.length, 2)
  assert.ok(packed.packed.every((p) => p.url))
  const urls = packed.packed.map((p) => p.url).sort()
  assert.deepEqual(urls, ["https://checkpointprojects.com", "https://ironadamant.com"])
  const iron = packed.packed.find((p) => p.url.includes("ironadamant"))
  assert.equal(iron?.reason, "matched")
  assert.match(iron?.screenshotPath ?? "", /screenshot\.png/)
})
