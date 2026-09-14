import assert from "node:assert/strict"
import test from "node:test"
import { toAgentReceipt } from "../src/agent-receipt.ts"
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
    overlayVerifyReason("matched", { ok: false, claimOk: false, errors: ["network timeout"] }),
    "network",
  )
})

test("toAgentReceipt is parseable: ok, reason, url, expect, screenshotPath", () => {
  const receipt = toAgentReceipt(sampleCheck())
  assert.equal(receipt.ok, true)
  assert.equal(receipt.reason, "matched")
  assert.equal(receipt.url, "https://ironadamant.com")
  assert.equal(receipt.expect, "One office job.")
  assert.equal(receipt.screenshotPath, ".auspex/runs/stamp/screenshot.png")
  const failed = toAgentReceipt(sampleCheck({ ok: true, matched: false, reason: "mismatch" }))
  assert.equal(failed.ok, false)
  assert.equal(failed.reason, "mismatch")
  assert.equal(agentReceiptOk({ protocolOk: true, reason: "matched" }), true)
  assert.equal(agentReceiptOk({ protocolOk: true, reason: "mismatch" }), false)
})

test("toAgentReceipt folds sandbox verify into ok/reason", () => {
  const receipt = toAgentReceipt(sampleCheck(), {
    verify: {
      ok: true,
      errors: [],
      claimOk: false,
      claimErrors: ["expect missing"],
      runDir: ".auspex/runs/stamp",
    },
  })
  assert.equal(receipt.ok, false)
  assert.equal(receipt.reason, "mismatch")
  assert.equal(receipt.verify?.claimOk, false)
})
