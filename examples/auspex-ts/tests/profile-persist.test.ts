import assert from "node:assert/strict"
import test from "node:test"
import {
  AWAIT_LOGIN_DEFAULT_MS,
  AWAIT_LOGIN_MAX_MS,
  clampAwaitLoginTimeoutMs,
  } from "../src/profile-persist.ts"

test("await-login default and max match the 30-minute cold handoff", () => {
  assert.equal(AWAIT_LOGIN_DEFAULT_MS, 1_800_000)
  assert.equal(AWAIT_LOGIN_MAX_MS, 1_800_000)
  assert.equal(clampAwaitLoginTimeoutMs(), 1_800_000)
  assert.equal(clampAwaitLoginTimeoutMs(1_000), 5_000)
  assert.equal(clampAwaitLoginTimeoutMs(9_000_000), 1_800_000)
})

