import assert from "node:assert/strict"
import test from "node:test"
import { isNoRetryReason, mayRetryCheck, shouldVerifyAfterCheck, shouldVerifyCheck } from "../src/fail-closed.ts"

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

test("shouldVerifyCheck is shared CLI/MCP policy: consistencyhub defaults off", () => {
  assert.equal(shouldVerifyCheck({}), true)
  assert.equal(shouldVerifyCheck({ name: "ironadamant" }), true)
  assert.equal(shouldVerifyCheck({ name: "consistencyhub" }), false)
  assert.equal(shouldVerifyCheck({ name: "ConsistencyHub" }), false)
  assert.equal(shouldVerifyCheck({ name: "consistencyhub", verify: true }), true)
  assert.equal(shouldVerifyCheck({ name: "consistencyhub", verify: false }), false)
  assert.equal(shouldVerifyCheck({ name: "consistencyhub", verifyWithProfile: true }), true)
  assert.equal(shouldVerifyCheck({ name: "consistencyhub", verify: false, verifyWithProfile: true }), false)
  assert.equal(shouldVerifyCheck({ name: "ironadamant", verify: false }), false)
})
