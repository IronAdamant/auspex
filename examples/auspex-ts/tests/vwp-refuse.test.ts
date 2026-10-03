import assert from "node:assert/strict"
import test from "node:test"
import { toAgentReceipt } from "../src/agent-receipt.ts"
import { checkThenVerify } from "../src/sandbox.ts"
import type { CheckResult } from "../src/check.ts"

function matchedCheck(seed: CheckResult["profileSeed"]): CheckResult {
  return {
    ok: true,
    protocolOk: true,
    reason: "matched",
    url: "https://app.example",
    expect: "Workspace ready",
    screenshotPath: ".auspex/runs/stamp/screenshot.png",
    title: "App",
    finalUrl: "https://app.example/home",
    matched: true,
    excerpt: "Workspace ready",
    sessionId: "sess-check",
    networkIdle: true,
    profileSeed: seed,
  }
}

test("verify-with-profile refuses weakSeed and does not open a claim session", async () => {
  let claims = 0
  const both = await checkThenVerify(
    {
      url: "https://app.example",
      expect: "Workspace ready",
      profile: "app-example",
      verifyWithProfile: true,
    },
    {
      check: async () => matchedCheck({ cookies: 2, origins: 1, sessionStorage: 0 }),
      verify: async () => {
        claims += 1
        throw new Error("claim session must not start")
      },
    },
  )
  assert.equal(claims, 0)
  assert.equal(both.check.ok, false)
  assert.equal(both.check.protocolOk, false)
  assert.equal(both.verify.skipped, true)
  assert.equal(both.verify.vwpRefused, "weakSeed")
  assert.equal(both.verify.claimOkProfile, false)
  assert.equal(both.check.nextCall?.tool, "auspex_finalize_login")
  assert.match(both.check.next ?? "", /refused/)
  const receipt = toAgentReceipt(both.check, { verify: both.verify })
  assert.equal(receipt.ok, false)
  assert.equal((receipt as { vwpRefused?: string }).vwpRefused, "weakSeed")
})

test("verify-with-profile refuses an empty seed", async () => {
  let claims = 0
  const both = await checkThenVerify(
    {
      url: "https://app.example",
      expect: "Workspace ready",
      profile: "app-example",
      verifyWithProfile: true,
    },
    {
      check: async () => matchedCheck({ cookies: 0, origins: 0 }),
      verify: async () => {
        claims += 1
        throw new Error("claim session must not start")
      },
    },
  )
  assert.equal(claims, 0)
  assert.equal(both.verify.vwpRefused, "emptySave")
  assert.equal(both.check.nextCall?.tool, "auspex_login")
})

test("verify-with-profile still runs when sessionStorage was counted", async () => {
  let claims = 0
  const both = await checkThenVerify(
    {
      url: "https://app.example",
      expect: "Workspace ready",
      profile: "app-example",
      verifyWithProfile: true,
    },
    {
      check: async () => matchedCheck({ cookies: 2, origins: 1, sessionStorage: 3 }),
      verify: async () => {
        claims += 1
        return {
          ok: true,
          errors: [],
          claimOk: false,
          claimErrors: [],
          anonymousClaimSkipped: true,
          claimOkProfile: true,
          claimErrorsProfile: [],
          runDir: ".auspex/runs/stamp",
        }
      },
    },
  )
  assert.equal(claims, 1)
  assert.equal(both.verify.vwpRefused, undefined)
  assert.equal(both.verify.claimOkProfile, true)
})
