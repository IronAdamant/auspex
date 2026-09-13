import assert from "node:assert/strict"
import test from "node:test"
import { parseArgv } from "../src/cli.ts"

const live = process.env.AUSPEX_LIVE === "1" && Boolean(process.env.SOLARI_API_KEY?.trim())

test("live Solari smoke is opt-in via AUSPEX_LIVE=1", { skip: !live }, async () => {
  const parsed = parseArgv(["check", "https://example.com", "--expect", "Example Domain"])
  assert.equal(parsed.status, "ok")
  const { runCheck } = await import("../src/check.ts")
  if (parsed.status !== "ok" || parsed.command.cmd !== "check") throw new Error("parse")
  const result = await runCheck(parsed.command.opts)
  assert.equal(result.ok, true)
  assert.equal(result.matched, true)
  assert.match(result.finalUrl, /example\.com/)
})
