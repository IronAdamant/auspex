import assert from "node:assert/strict"
import test from "node:test"
import { SolariError } from "@solarisdk/browser"
import { explainSolariError } from "../src/errors.ts"

test("explainSolariError maps 402 and 429", () => {
  assert.match(
    explainSolariError(new SolariError("x", 402, undefined, "FeatureRequiresPlan")),
    /Starter/,
  )
  assert.match(
    explainSolariError(new SolariError("x", 429, undefined, "ConcurrencyLimitExceeded")),
    /leftover sessions/,
  )
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
