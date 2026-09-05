import assert from "node:assert/strict"
import test from "node:test"
import { SolariError } from "@solarisdk/browser"
import {
  AuspexError,
  classifySolariError,
  CLOSE_KILL_RECOVERY,
  explainSolariError,
} from "../src/errors.ts"

test("explainSolariError maps 402 and 429", () => {
  assert.match(
    explainSolariError(new SolariError("x", 402, undefined, "FeatureRequiresPlan")),
    /Starter/,
  )
  const r429 = explainSolariError(new SolariError("x", 429, undefined, "ConcurrencyLimitExceeded"))
  assert.match(r429, /leftover sessions/)
  assert.match(r429, /solari_kill|solari_browser_close/)
  assert.equal(r429.includes("in the console"), false)
  assert.match(
    explainSolariError(new SolariError("x", 403, undefined, "PlanLimitExceeded")),
    /plan limit/,
  )
  assert.match(
    explainSolariError(new SolariError("x", undefined, undefined, "BrowserUnhealthy")),
    /health probe/,
  )
  assert.match(
    explainSolariError(new SolariError("x", 404, undefined, "InvalidSessionId")),
    /not released/,
  )
  assert.equal(explainSolariError(new Error("plain")), "plain")
})

test("classifySolariError is structured, 402/429 not retryable, recovery names close/kill", () => {
  const a = classifySolariError(new SolariError("x", 402, undefined, "FeatureRequiresPlan"))
  assert.equal(a.code, "FeatureRequiresPlan")
  assert.equal(a.retryable, false)
  assert.match(a.recovery ?? "", /not retry/i)
  const b = classifySolariError(new SolariError("x", 429, undefined, "ConcurrencyLimitExceeded"))
  assert.equal(b.code, "ConcurrencyLimitExceeded")
  assert.equal(b.retryable, false)
  assert.equal(b.recovery, CLOSE_KILL_RECOVERY)
  assert.match(b.recovery ?? "", /solari_browser_close/)
  assert.match(b.recovery ?? "", /solari_kill/)
  assert.equal((b.recovery ?? "").includes("in the console"), false)
})

test("AuspexError preserves receipt fields", () => {
  const err = new AuspexError("boom", { sessionId: "sess-1", screenshotPath: "shot.png" })
  assert.equal(err.sessionId, "sess-1")
  assert.equal(err.screenshotPath, "shot.png")
  assert.equal(classifySolariError(err).message, "boom")
})

test("explainSolariError redacts slr_live_ tokens", () => {
  assert.equal(
    explainSolariError(new Error("bad key slr_live_abc123XYZ and more")),
    "bad key slr_… and more",
  )
})

test("explainSolariError redacts other key-like tokens", () => {
  const out = explainSolariError(new Error("slr_test_zzz111 and sk-abcdefghijklmnopqrst and Bearer abc.def"))
  assert.equal(out.includes("slr_test_zzz111"), false)
  assert.equal(out.includes("sk-abcdefghijklmnopqrst"), false)
  assert.equal(out.includes("Bearer abc.def"), false)
  assert.match(out, /slr_…/)
  assert.match(out, /sk-…/)
  assert.match(out, /Bearer …/)
})
