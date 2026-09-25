import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import {
  CHECK_THEN_VERIFY_WORST_MS,
  PROFILE_CLAIM_RETRY_MS,
  PROFILE_CLAIM_RETURN_BUFFER_MS,
  PROFILE_CLAIM_SETTLE_MS,
  profileClaimBudgetMs,
  SANDBOX_ASSERT_TIMEOUT_MS,
  VERIFY_OVERALL_MS,
} from "../src/sandbox.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function toolTimeoutMs(toml: string, server: string): number {
  const re = new RegExp(`\\[mcp_servers\\.${server}\\][\\s\\S]*?tool_timeout_sec\\s*=\\s*(\\d+)`)
  const m = toml.match(re)
  assert.ok(m, `missing tool_timeout_sec for ${server}`)
  return Number(m[1]) * 1000
}

test("check+verify worst-case budget fits Auspex MCP host timeout; Solari stays 300s", () => {
  const toml = readFileSync(path.join(root, "grok.mcp.example.toml"), "utf8")
  const auspex = toolTimeoutMs(toml, "auspex")
  const solari = toolTimeoutMs(toml, "solari")
  assert.equal(solari, 300_000)
  assert.ok(
    CHECK_THEN_VERIFY_WORST_MS <= auspex,
    `CHECK_THEN_VERIFY_WORST_MS ${CHECK_THEN_VERIFY_WORST_MS} exceeds Auspex tool_timeout_sec ${auspex}`,
  )
  assert.ok(
    auspex >= 1_800_000,
    `Auspex tool_timeout_sec ${auspex} is under the 30-minute await-login cap`,
  )
})

test("profile claim budget is the remainder of VERIFY_OVERALL_MS, not a second envelope", () => {
  assert.equal(PROFILE_CLAIM_SETTLE_MS, 2_000)
  assert.equal(PROFILE_CLAIM_RETRY_MS, 3_000)
  assert.equal(profileClaimBudgetMs(90_000, 60_000), 90_000 - 60_000 - PROFILE_CLAIM_RETURN_BUFFER_MS)
  const afterAssert = profileClaimBudgetMs(VERIFY_OVERALL_MS, SANDBOX_ASSERT_TIMEOUT_MS)
  assert.ok(afterAssert > 0, "60s assert must leave room for profile claim inside 90s")
  assert.ok(
    afterAssert > PROFILE_CLAIM_SETTLE_MS + PROFILE_CLAIM_RETRY_MS,
    "2s+3s settles sit inside the remainder; they are not a separate host budget",
  )
  assert.ok(profileClaimBudgetMs(VERIFY_OVERALL_MS, VERIFY_OVERALL_MS) <= 0)
  assert.ok(CHECK_THEN_VERIFY_WORST_MS + PROFILE_CLAIM_SETTLE_MS + PROFILE_CLAIM_RETRY_MS <= 300_000)
})
