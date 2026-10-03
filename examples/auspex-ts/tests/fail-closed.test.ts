import assert from "node:assert/strict"
import test from "node:test"
import {
  isNoRetryReason,
  mayRetryCheck,
  shouldVerifyAfterCheck,
  shouldVerifyCheck,
} from "../src/fail-closed.ts"

test("loggedOut and needsHuman are not retried and skip sandbox verify", () => {
  assert.equal(isNoRetryReason("loggedOut"), true)
  assert.equal(isNoRetryReason("needsHuman"), true)
  assert.equal(mayRetryCheck("loggedOut"), false)
  assert.equal(mayRetryCheck("needsHuman"), false)
  assert.equal(shouldVerifyAfterCheck("loggedOut"), false)
  assert.equal(shouldVerifyAfterCheck("needsHuman"), false)
  assert.equal(shouldVerifyAfterCheck("recordedLoggedIn"), false)
  assert.equal(isNoRetryReason("expectMatchedPublicLanding"), true)
  assert.equal(mayRetryCheck("expectMatchedPublicLanding"), false)
  assert.equal(shouldVerifyAfterCheck("expectMatchedPublicLanding"), false)
  assert.equal(isNoRetryReason("hostChanged"), true)
  assert.equal(mayRetryCheck("hostChanged"), false)
  assert.equal(shouldVerifyAfterCheck("hostChanged"), false)
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

test("shouldVerifyCheck skips anonymous verify for any attached profile except public marketing", () => {
  assert.equal(shouldVerifyCheck({ profile: "acme", url: "https://app.example.com" }), false)
  assert.equal(shouldVerifyCheck({ profile: "acme", url: "https://ironadamant.com" }), true)
  assert.equal(shouldVerifyCheck({ url: "https://app.example.com" }), true)
  assert.equal(shouldVerifyCheck({ name: "consistencyhub" }), false)
  assert.equal(shouldVerifyCheck({ name: "consistencyhub", verify: true }), true)
  assert.equal(shouldVerifyCheck({ name: "consistencyhub", verifyWithProfile: true }), true)
  assert.equal(
    shouldVerifyCheck({
      url: "https://ironadamant.com",
      profile: "other-ms",
    }),
    true,
    "leftover profile on ironadamant still verifies",
  )
})

test("recordedLoggedIn needs an attached profile; an anonymous public deep link is not logged in", async () => {
  const { recordedLoggedInLanding } = await import("../src/check-reason.ts")
  assert.equal(recordedLoggedInLanding({ record: true, finalUrl: "https://example.com/docs" }), false)
  assert.equal(recordedLoggedInLanding({ record: true, profile: "p", finalUrl: "https://ironadamant.com/app" }), true)
  assert.equal(recordedLoggedInLanding({ record: true, profile: "p", finalUrl: "https://ironadamant.com/" }), false)
  assert.equal(recordedLoggedInLanding({ record: false, profile: "p", finalUrl: "https://x.com/app" }), false)
})
