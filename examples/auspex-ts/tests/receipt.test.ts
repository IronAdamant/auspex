import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { MAX_IMAGE_BYTES } from "../src/content.ts"
import { parseArgv } from "../src/cli.ts"
import { assertRunDirUnderRuns, findLatestRun, RUNS_DIR } from "../src/receipt.ts"
import { verifyReceipt } from "../src/sandbox.ts"

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}

test("assertRunDirUnderRuns rejects paths outside .auspex/runs", () => {
  assert.throws(() => assertRunDirUnderRuns("/etc/passwd"), /under \.auspex\/runs/)
  const ok = assertRunDirUnderRuns(path.join(RUNS_DIR, "stamp"))
  assert.ok(ok.startsWith(RUNS_DIR))
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

test("findLatestRun names an empty runs folder with ~, never the account's home path", async () => {
  const { homedir } = await import("node:os")
  const runs = path.join(homedir(), ".auspex-test-never-created", "runs")
  await assert.rejects(findLatestRun(runs), (err: Error) => {
    assert.match(err.message, /in ~\/\.auspex-test-never-created\/runs$/)
    assert.equal(err.message.includes(homedir()), false)
    return true
  })
})

test("verifyReceipt does not write when the receipt is oversized", async () => {
  const dir = path.join(RUNS_DIR, `cap-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, "manifest.json"), "{}\n")
  writeFileSync(path.join(dir, "screenshot.png"), Buffer.alloc(MAX_IMAGE_BYTES + 8))
  let created = false
  await assert.rejects(
    () =>
      verifyReceipt(dir, {
        create: async () => {
          created = true
          throw new Error("should not create")
        },
      }),
    /exceeds/,
  )
  assert.equal(created, false)
})

test("parseArgv check --verify requests verify-after-check", () => {
  const parsed = parseArgv([
    "check",
    "https://ironadamant.com",
    "--expect",
    "Build it.",
    "--verify",
  ])
  assert.equal(parsed.status, "ok")
  if (parsed.status === "ok" && parsed.command.cmd === "check") {
    assert.equal(parsed.command.verifyAfter, true)
  }
})

test("profileClaimVerdict: a sign-in page never confirms the saved login, even with the words on it", async () => {
  const { profileClaimVerdict } = await import("../src/sandbox.ts")
  const words = "Welcome back to Workspace ready"
  assert.equal(profileClaimVerdict({ raw: words, expect: "Workspace ready", landedUrl: "https://app.example/dash" }).claimOk, true)
  for (const landedUrl of [
    "https://app.example/login?next=/dash",
    "https://app.example/auth/callback",
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    "https://accounts.google.com/o/oauth2/v2/auth",
  ]) {
    const v = profileClaimVerdict({ raw: words, expect: "Workspace ready", landedUrl })
    assert.equal(v.claimOk, false, landedUrl)
    assert.match(v.claimErrors[0] ?? "", /sign-in page/)
    assert.equal((v.claimErrors[0] ?? "").includes("next="), false)
  }
  const miss = profileClaimVerdict({ raw: "Something else", expect: "Workspace ready", landedUrl: "https://app.example/dash" })
  assert.equal(miss.claimOk, false)
  assert.match(miss.claimErrors[0] ?? "", /does not contain expect/)
})

test("profileClaimVerdict keeps nothing from a landing on cloud metadata, not even the sample", async () => {
  const { profileClaimVerdict } = await import("../src/sandbox.ts")
  const verdict = profileClaimVerdict({
    raw: "ami-id instance-id iam security-credentials",
    expect: "Workspace ready",
    landedUrl: "http://169.254.169.254/latest/meta-data/",
  })
  assert.equal(verdict.claimOk, false)
  assert.equal(verdict.claimErrors.join(" ").includes("security-credentials"), false)
  assert.match(verdict.claimErrors[0] ?? "", /cloud-metadata address; nothing from it was kept/)
  // And a sign-in page on the wider rule (/users/sign_in) still never confirms.
  assert.equal(profileClaimVerdict({ raw: "Workspace ready", expect: "Workspace ready", landedUrl: "https://app.example/users/sign_in" }).claimOk, false)
})

