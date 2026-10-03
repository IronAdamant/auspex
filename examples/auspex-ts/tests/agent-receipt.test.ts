import assert from "node:assert/strict"
import test from "node:test"
import { persistAgentManifest, toAgentReceipt } from "../src/agent-receipt.ts"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
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

test("deriveCheckReason covers matched, mismatch, network, loggedOut, needsHuman", () => {
  assert.equal(
    deriveCheckReason({
      matched: true,
      networkIdle: true,
      finalUrl: "https://ironadamant.com/",
      excerpt: "One office job.",
      screenshotOk: true,
    }),
    "matched",
  )
  assert.equal(
    deriveCheckReason({
      matched: false,
      networkIdle: true,
      finalUrl: "https://ironadamant.com/",
      excerpt: "hello",
      screenshotOk: true,
    }),
    "mismatch",
  )
  assert.equal(
    deriveCheckReason({
      matched: false,
      networkIdle: false,
      finalUrl: "",
      excerpt: "",
      screenshotOk: false,
    }),
    "network",
  )
  assert.equal(
    deriveCheckReason({
      special: "loggedOut",
      matched: false,
      networkIdle: true,
      finalUrl: "https://consistencyhub.io/landing",
      excerpt: "Sign in",
      screenshotOk: true,
    }),
    "loggedOut",
  )
  assert.equal(
    deriveCheckReason({
      special: "needsHuman",
      needsHuman: true,
      matched: false,
      networkIdle: true,
      finalUrl: "https://login.microsoftonline.com/",
      excerpt: "password",
      screenshotOk: true,
    }),
    "needsHuman",
  )
})

test("overlayVerifyReason maps claim miss to mismatch and fetch fail to network", () => {
  assert.equal(
    overlayVerifyReason("matched", { ok: true, claimOk: true, errors: [], claimErrors: [] }),
    "matched",
  )
  assert.equal(
    overlayVerifyReason("matched", {
      ok: true,
      claimOk: false,
      errors: [],
      claimErrors: ["expect not found"],
    }),
    "mismatch",
  )
  assert.equal(
    overlayVerifyReason("loggedOut", { ok: false, claimOk: false, errors: ["fetch failed"] }),
    "loggedOut",
  )
  assert.equal(
    overlayVerifyReason("expectMatchedPublicLanding", {
      ok: false,
      claimOk: false,
      errors: ["expect not found"],
    }),
    "expectMatchedPublicLanding",
  )
  assert.equal(
    overlayVerifyReason("matched", { ok: false, claimOk: false, errors: ["network timeout"] }),
    "network",
  )
})

test("mismatch is not agent ok even when protocolOk is true", () => {
  const receipt = toAgentReceipt(
    sampleCheck({ ok: false, protocolOk: true, matched: false, reason: "mismatch" }),
  )
  assert.equal(receipt.ok, false)
  assert.equal(receipt.reason, "mismatch")
  assert.equal((receipt as { protocolOk?: boolean }).protocolOk, true)
})

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

