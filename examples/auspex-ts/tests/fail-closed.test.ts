import assert from "node:assert/strict"
import test from "node:test"
import {
  isNoRetryReason,
  mayRetryCheck,
  shouldVerifyAfterCheck,
  shouldVerifyCheck,
} from "../src/fail-closed.ts"

test("recordedLoggedIn needs an attached profile; an anonymous public deep link is not logged in", async () => {
  const { recordedLoggedInLanding } = await import("../src/check-reason.ts")
  assert.equal(recordedLoggedInLanding({ record: true, finalUrl: "https://example.com/docs" }), false)
  assert.equal(recordedLoggedInLanding({ record: true, profile: "p", finalUrl: "https://ironadamant.com/app" }), true)
  assert.equal(recordedLoggedInLanding({ record: true, profile: "p", finalUrl: "https://ironadamant.com/" }), false)
  assert.equal(recordedLoggedInLanding({ record: false, profile: "p", finalUrl: "https://x.com/app" }), false)
})
