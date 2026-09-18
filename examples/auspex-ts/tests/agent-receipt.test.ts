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

test("toAgentReceipt is parseable: schemaVersion, ok, reason, url, expect, screenshotPath", () => {
  const receipt = toAgentReceipt(sampleCheck())
  assert.equal(receipt.schemaVersion, 1)
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

test("toAgentReceipt does not overlay a skipped verify after loggedOut", () => {
  const receipt = toAgentReceipt(sampleCheck({ ok: false, matched: false, reason: "loggedOut" }), {
    verify: {
      ok: false,
      errors: [],
      claimOk: false,
      claimErrors: [],
      runDir: ".auspex/runs/stamp",
      skipped: true,
      skipReason: "loggedOut",
    },
  })
  assert.equal(receipt.ok, false)
  assert.equal(receipt.reason, "loggedOut")
  assert.equal(receipt.verify?.skipped, true)
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

test("toAgentReceipt adds next hint when live matched but claimOk false (auth-gated)", () => {
  const receipt = toAgentReceipt(sampleCheck({ matched: true }), {
    verify: {
      ok: true,
      errors: [],
      claimOk: false,
      claimErrors: ["fetched page text does not contain expect"],
      runDir: ".auspex/runs/stamp",
    },
  })
  assert.equal(receipt.matched, true)
  assert.equal(receipt.ok, false)
  assert.equal(receipt.reason, "mismatch")
  assert.match(receipt.next ?? "", /live matched/i)
  assert.match(receipt.next ?? "", /independent fetch/i)
  assert.match(receipt.next ?? "", /--no-verify/i)
  assert.match(receipt.next ?? "", /auth-gated/i)
})

test("toAgentReceipt does not add auth-gated hint when OCR was attempted", () => {
  const receipt = toAgentReceipt(sampleCheck({ matched: true }), {
    verify: {
      ok: true,
      errors: [],
      claimOk: false,
      claimErrors: ["fetched page text does not contain expect", "ocr of screenshot does not contain expect"],
      runDir: ".auspex/runs/stamp",
    },
  })
  assert.equal(receipt.matched, true)
  assert.equal(receipt.ok, false)
  assert.equal((receipt.next ?? "").includes("independent fetch"), false)
})

test("toAgentReceipt adds OCR unavailable note when tesseract missing", () => {
  const receipt = toAgentReceipt(sampleCheck({ matched: true }), {
    verify: {
      ok: true,
      errors: [],
      claimOk: false,
      claimErrors: ["fetched page text does not contain expect", "ocr unavailable (tesseract not installed)"],
      runDir: ".auspex/runs/stamp",
    },
  })
  assert.equal(receipt.matched, true)
  assert.equal(receipt.ok, false)
  assert.match(receipt.next ?? "", /live matched/i)
  assert.match(receipt.next ?? "", /ocr was unavailable/i)
  assert.match(receipt.next ?? "", /tesseract missing/i)
})

test("overlayVerifyReason preserves matched when anonymousClaimSkipped", () => {
  assert.equal(
    overlayVerifyReason("matched", {
      ok: true,
      claimOk: false,
      anonymousClaimSkipped: true,
      claimErrors: ["anonymous claim skipped"],
    }),
    "matched",
  )
})

test("agentReceiptOk returns true when live matched and anonymousClaimSkipped", () => {
  assert.equal(
    agentReceiptOk({
      protocolOk: true,
      reason: "matched",
      verify: {
        ok: true,
        claimOk: false,
        anonymousClaimSkipped: true,
      },
    }),
    true,
  )
})

test("toAgentReceipt produces ok=true when live matched and anonymousClaimSkipped", () => {
  const receipt = toAgentReceipt(sampleCheck({ matched: true }), {
    verify: {
      ok: true,
      errors: [],
      claimOk: false,
      claimErrors: ["anonymous claim skipped"],
      anonymousClaimSkipped: true,
      runDir: ".auspex/runs/stamp",
    },
  })
  assert.equal(receipt.matched, true)
  assert.equal(receipt.ok, true)
  assert.equal(receipt.reason, "matched")
  assert.equal(receipt.verify?.anonymousClaimSkipped, true)
})
