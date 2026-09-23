import assert from "node:assert/strict"
import test from "node:test"
import {
  isAuthGatedAnonymousVerifyHost,
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

test("shouldVerifyCheck skips anonymous verify for ad-hoc auth hosts with a profile", () => {
  assert.equal(shouldVerifyCheck({ profile: "consistencyhub" }), false)
  assert.equal(shouldVerifyCheck({ profile: "ConsistencyHub" }), false)
  assert.equal(
    shouldVerifyCheck({
      url: "https://onedrive.live.com/",
      profile: "consistencyhub",
    }),
    false,
  )
  assert.equal(
    shouldVerifyCheck({
      url: "https://consistencyhub.io",
      profile: "consistencyhub",
    }),
    false,
  )
  assert.equal(
    shouldVerifyCheck({
      url: "https://onedrive.live.com/",
      profile: "other-ms",
    }),
    false,
    "any profile on an auth-gated host skips anonymous verify",
  )
  assert.equal(
    shouldVerifyCheck({
      url: "https://ironadamant.com",
      profile: "other-ms",
    }),
    true,
    "public marketing still verifies with a leftover profile",
  )
  assert.equal(
    shouldVerifyCheck({
      url: "https://onedrive.live.com/",
      profile: "consistencyhub",
      verify: true,
    }),
    true,
    "explicit --verify still forces anonymous verify",
  )
  assert.equal(
    shouldVerifyCheck({
      url: "https://onedrive.live.com/",
      profile: "consistencyhub",
      verifyWithProfile: true,
    }),
    true,
  )
  assert.equal(isAuthGatedAnonymousVerifyHost("https://onedrive.live.com/"), true)
  assert.equal(isAuthGatedAnonymousVerifyHost("https://www.onedrive.live.com/"), true)
  assert.equal(isAuthGatedAnonymousVerifyHost("https://ironadamant.com"), false)
  assert.equal(isAuthGatedAnonymousVerifyHost("https://example.com"), false)
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
