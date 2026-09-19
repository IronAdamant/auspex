import assert from "node:assert/strict"
import test from "node:test"
import { executeAuspexCheck } from "../src/mcp-tools.ts"
import type { CheckResult } from "../src/check.ts"

function matchedCheck(over: Partial<CheckResult> = {}): CheckResult {
  return {
    ok: true,
    protocolOk: true,
    reason: "matched",
    url: "https://consistencyhub.io",
    expect: "Document Editor",
    screenshotPath: ".auspex/runs/x/screenshot.png",
    title: "Hub",
    finalUrl: "https://consistencyhub.io/dashboard",
    matched: true,
    excerpt: "Document Editor",
    sessionId: "s",
    networkIdle: true,
    ...over,
  }
}

test("MCP name=consistencyhub without verify does not call checkThenVerify", async () => {
  let verifyCalls = 0
  let checkCalls = 0
  const { verified, receipt } = await executeAuspexCheck(
    { name: "consistencyhub" },
    {
      checkThenVerify: async () => {
        verifyCalls += 1
        throw new Error("must not verify ConsistencyHub by default")
      },
      runCheck: async (opts) => {
        checkCalls += 1
        assert.equal(opts.profile, "consistencyhub")
        assert.equal(opts.expect, "Document Editor")
        return matchedCheck({ url: opts.url, expect: opts.expect })
      },
    },
  )
  assert.equal(verifyCalls, 0)
  assert.equal(checkCalls, 1)
  assert.equal(verified, false)
  assert.equal(receipt.ok, true)
  assert.equal(receipt.reason, "matched")
})

test("MCP name=consistencyhub with verify=true calls checkThenVerify", async () => {
  let verifyCalls = 0
  const { verified } = await executeAuspexCheck(
    { name: "consistencyhub", verify: true },
    {
      checkThenVerify: async () => {
        verifyCalls += 1
        return {
          check: matchedCheck(),
          verify: {
            ok: true,
            errors: [],
            claimOk: true,
            claimErrors: [],
            runDir: ".auspex/runs/x",
          },
        }
      },
      runCheck: async () => {
        throw new Error("must not runCheck when verifying")
      },
    },
  )
  assert.equal(verifyCalls, 1)
  assert.equal(verified, true)
})

test("MCP name=consistencyhub with verifyWithProfile calls checkThenVerify", async () => {
  let verifyCalls = 0
  const { verified } = await executeAuspexCheck(
    { name: "consistencyhub", verifyWithProfile: true },
    {
      checkThenVerify: async () => {
        verifyCalls += 1
        return {
          check: matchedCheck(),
          verify: {
            ok: true,
            errors: [],
            claimOk: false,
            claimErrors: ["anonymous claim skipped"],
            anonymousClaimSkipped: true,
            claimOkProfile: true,
            claimErrorsProfile: [],
            runDir: ".auspex/runs/x",
          },
        }
      },
      runCheck: async () => {
        throw new Error("must not runCheck when verifying")
      },
    },
  )
  assert.equal(verifyCalls, 1)
  assert.equal(verified, true)
})

test("MCP name=ironadamant without verify still calls checkThenVerify", async () => {
  let verifyCalls = 0
  const { verified } = await executeAuspexCheck(
    { name: "ironadamant" },
    {
      checkThenVerify: async () => {
        verifyCalls += 1
        return {
          check: matchedCheck({
            url: "https://ironadamant.com",
            expect: "One office job.",
            finalUrl: "https://ironadamant.com/",
          }),
          verify: {
            ok: true,
            errors: [],
            claimOk: true,
            claimErrors: [],
            runDir: ".auspex/runs/x",
          },
        }
      },
      runCheck: async () => {
        throw new Error("must not runCheck when verifying")
      },
    },
  )
  assert.equal(verifyCalls, 1)
  assert.equal(verified, true)
})
