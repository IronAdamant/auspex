import assert from "node:assert/strict"
import test from "node:test"
import { isNoRetryReason, mayRetryCheck, shouldVerifyAfterCheck } from "../src/fail-closed.ts"

test("loggedOut and needsHuman are not retried and skip sandbox verify", () => {
  assert.equal(isNoRetryReason("loggedOut"), true)
  assert.equal(isNoRetryReason("needsHuman"), true)
  assert.equal(mayRetryCheck("loggedOut"), false)
  assert.equal(mayRetryCheck("needsHuman"), false)
  assert.equal(shouldVerifyAfterCheck("loggedOut"), false)
  assert.equal(shouldVerifyAfterCheck("needsHuman"), false)
  assert.equal(shouldVerifyAfterCheck("recordedLoggedIn"), false)
  assert.equal(mayRetryCheck("matched"), true)
  assert.equal(mayRetryCheck("mismatch"), true)
  assert.equal(mayRetryCheck("network"), true)
  assert.equal(shouldVerifyAfterCheck("matched"), true)
  assert.equal(shouldVerifyAfterCheck("mismatch"), true)
})
