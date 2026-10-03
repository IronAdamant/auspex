import assert from "node:assert/strict"
import test from "node:test"
import { parseReceiptV1 } from "../src/receipt-schema.ts"
import {
  STREAM_DEADLINE_GRACE_MS,
  awaitStreamPlan,
  deadStreamCheckResult,
  shouldRefuseDeadStreamSession,
} from "../src/stream-deadline.ts"

const NOW = Date.parse("2026-09-24T03:21:22.000Z")

test("awaitStreamPlan caps save-editor to streamExpiresAt plus grace", () => {
  const stamp = new Date(NOW + 120_000).toISOString()
  const plan = awaitStreamPlan({
    saveEditor: true,
    streamExpiresAt: stamp,
    timeoutMs: 1_800_000,
    nowMs: NOW,
    defaultTimeoutMs: 1_800_000,
  })
  assert.equal(plan.preflight, "proceed")
  assert.equal(plan.waitTimeoutMs, 120_000 + STREAM_DEADLINE_GRACE_MS)
  assert.equal(plan.watchStreamExpiresAt, stamp)
})

test("dead stream without a completed seed refuses a new session and remints", () => {
  const past = new Date(NOW - 1_000).toISOString()
  assert.equal(shouldRefuseDeadStreamSession({ streamExpiresAt: past, nowMs: NOW }), true)
  assert.equal(
    shouldRefuseDeadStreamSession({ streamExpiresAt: past, nowMs: NOW, seed: { sizeBytes: 0 } }),
    true,
  )
  assert.equal(
    shouldRefuseDeadStreamSession({ streamExpiresAt: past, nowMs: NOW, seed: { sizeBytes: 128 } }),
    false,
  )
  assert.equal(
    shouldRefuseDeadStreamSession({
      streamExpiresAt: new Date(NOW + 120_000).toISOString(),
      nowMs: NOW,
    }),
    false,
  )
  const receipt = deadStreamCheckResult({
    url: "https://app.example",
    expect: "Workspace ready",
    profile: "app-example",
  })
  assert.equal(receipt.ok, false)
  assert.equal(receipt.reason, "stream-expired")
  assert.equal(receipt.sessionId, "")
  assert.equal(receipt.nextCall.tool, "auspex_login")
  assert.equal(receipt.nextCall.profile, "app-example")
  const parsed = parseReceiptV1({
    schemaVersion: 1,
    ok: false,
    reason: receipt.reason,
    url: receipt.url,
    expect: receipt.expect,
    screenshotPath: receipt.screenshotPath,
    next: receipt.next,
    nextCall: receipt.nextCall,
  })
  assert.equal(parsed.reason, "stream-expired")
  assert.equal(parsed.ok, false)
})

