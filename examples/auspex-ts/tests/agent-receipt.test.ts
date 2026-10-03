import assert from "node:assert/strict"
import test from "node:test"
import { persistAgentManifest, toAgentReceipt } from "../src/agent-receipt.ts"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  agentReceiptOk,
  deriveCheckReason,
  overlayVerifyReason,
} from "../src/check-reason.ts"
import type { CheckResult } from "../src/check.ts"

function sampleCheck(over: Partial<CheckResult> = {}): CheckResult {
  return {
    ok: true,
    reason: "matched",
    url: "https://ironadamant.com",
    expect: "One office job.",
    screenshotPath: ".auspex/runs/stamp/screenshot.png",
    title: "Iron Adamant",
    finalUrl: "https://ironadamant.com/",
    matched: true,
    excerpt: "One office job.",
    sessionId: "sess",
    networkIdle: true,
    ...over,
  }
}

test("persistAgentManifest writes agent-success ok (not protocol ok) to disk", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-manifest-"))
  const shot = path.join(dir, "screenshot.png")
  const check = sampleCheck({
    ok: false,
    protocolOk: true,
    matched: false,
    reason: "mismatch",
    screenshotPath: shot,
    excerpt: "hello",
  })
  await persistAgentManifest(check)
  const written = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as {
    ok: boolean
    reason: string
    protocolOk?: boolean
  }
  assert.equal(written.ok, false)
  assert.equal(written.reason, "mismatch")
  assert.equal(written.protocolOk, true)
})

test("a public check (no saved login) carries no profileSeed or seedReadiness", async () => {
  // The CI receipt for ironadamant.com (no profile) said seedReadiness "post-save", shape "empty",
  // which reads like a failed save. AGENTS: profileSeed only "when a profile was attached".
  const receipt = toAgentReceipt(sampleCheck())
  assert.equal("profileSeed" in receipt && receipt.profileSeed !== undefined, false)
  assert.equal("seedReadiness" in receipt && receipt.seedReadiness !== undefined, false)
  const withLogin = toAgentReceipt(sampleCheck({ profileSeed: { cookies: 3, origins: 1, appOriginCookieCount: 3 } }))
  assert.ok(withLogin.seedReadiness, "a saved-login check still reports its seed")
  const { readFileSync: read } = await import("node:fs")
  const src = read(new URL("../src/check.ts", import.meta.url), "utf8")
  assert.match(src, /profileSeed: opts\.profile \? profileSeed : undefined/)
})
