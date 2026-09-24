import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { parseReceiptV1 } from "../src/receipt-schema.ts"
import { waitForProfileSave } from "../src/profile-persist.ts"
import {
  STREAM_DEADLINE_GRACE_MS,
  STREAM_LOW_REMAINING_MS,
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

test("awaitStreamPlan low-JWT preflight does not keep the 30-minute timeout", () => {
  const stamp = new Date(NOW + 80_000).toISOString()
  const low = awaitStreamPlan({
    saveEditor: true,
    streamExpiresAt: stamp,
    timeoutMs: 1_800_000,
    nowMs: NOW,
    defaultTimeoutMs: 1_800_000,
  })
  assert.ok(80_000 < STREAM_LOW_REMAINING_MS)
  assert.equal(low.preflight, "low")
  assert.equal(low.waitTimeoutMs, undefined)
  const past = awaitStreamPlan({
    saveEditor: true,
    streamExpiresAt: new Date(NOW - 1_000).toISOString(),
    timeoutMs: 1_800_000,
    nowMs: NOW,
    defaultTimeoutMs: 1_800_000,
  })
  assert.equal(past.preflight, "past")
  const noSave = awaitStreamPlan({
    saveEditor: false,
    streamExpiresAt: stamp,
    timeoutMs: 1_800_000,
    nowMs: NOW,
    defaultTimeoutMs: 1_800_000,
  })
  assert.equal(noSave.preflight, "proceed")
  assert.equal(noSave.waitTimeoutMs, 1_800_000)
  assert.equal(noSave.watchStreamExpiresAt, undefined)
})

test("waitForProfileSave returns stream-expired when the VNC stamp passes mid-poll", async () => {
  let clock = NOW
  const exp = NOW + 5_000
  const sleeps: number[] = []
  const result = await waitForProfileSave("app-example", {
    sinceVersion: 1,
    timeoutMs: 1_800_000,
    streamExpiresAt: new Date(exp).toISOString(),
    deps: {
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms)
        clock += ms
      },
      list: async () => [{ id: "p1", name: "app-example", version: 1 }],
      inspect: async () => {
        throw new Error("inspect must not run after the stream dies")
      },
    },
  })
  assert.equal(result.status, "stream-expired")
  assert.match(result.next, /status stream-expired/)
  assert.equal(result.nextCall?.tool, "auspex_login")
  assert.equal(result.nextCall?.profile, "app-example")
  assert.ok(clock < NOW + 30_000)
  assert.ok(sleeps.length > 0)
  assert.ok(sleeps.every((ms) => ms <= STREAM_DEADLINE_GRACE_MS + 2_000))
})

test("waitForProfileSave still completes when Save lands before the VNC stamp", async () => {
  let clock = NOW
  let listed = 0
  const result = await waitForProfileSave("app-example", {
    sinceVersion: 4,
    timeoutMs: 1_800_000,
    streamExpiresAt: new Date(NOW + 60_000).toISOString(),
    deps: {
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
      },
      list: async () => {
        listed += 1
        return [{ id: "p1", name: "app-example", version: listed < 2 ? 4 : 5 }]
      },
      inspect: async () => ({ cookies: 2, origins: 1 }),
    },
  })
  assert.equal(result.status, "completed")
  assert.equal(result.cookies, 2)
  assert.equal(result.nextCall?.tool, "auspex_finalize_login")
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

test("check refuses POST /sessions before launch when the dead-stream gate matches", () => {
  const src = readFileSync(new URL("../src/check.ts", import.meta.url), "utf8")
  const gate = src.indexOf("shouldRefuseDeadStreamSession")
  const launch = src.indexOf("launchBrowser(")
  assert.ok(gate > 0 && launch > gate)
  assert.match(src, /deadStreamCheckResult/)
})
