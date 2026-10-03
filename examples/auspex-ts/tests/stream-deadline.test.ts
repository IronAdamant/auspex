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

test("short timeout stays timeout while streamExpiresAt is still ahead", async () => {
  let clock = NOW
  const result = await waitForProfileSave("app-example", {
    sinceVersion: 1,
    timeoutMs: 1_000,
    streamExpiresAt: new Date(NOW + 240_000).toISOString(),
    deps: {
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
      },
      list: async () => [{ id: "p1", name: "app-example", version: 1 }],
      inspect: async () => {
        throw new Error("inspect must not run")
      },
    },
  })
  assert.equal(result.status, "timeout")
  assert.notEqual(result.nextCall?.tool, "auspex_login")
})

test("short timeout is stream-expired when the stamp is already past", async () => {
  const result = await waitForProfileSave("app-example", {
    sinceVersion: 1,
    timeoutMs: 1_000,
    streamExpiresAt: new Date(NOW - 1_000).toISOString(),
    deps: {
      now: () => NOW,
      sleep: async () => {
        throw new Error("must not poll after the stamp")
      },
      list: async () => [{ id: "p1", name: "app-example", version: 1 }],
      inspect: async () => {
        throw new Error("inspect must not run")
      },
    },
  })
  assert.equal(result.status, "stream-expired")
  assert.equal(result.nextCall?.tool, "auspex_login")
  assert.match(result.next, /status stream-expired/)
})

