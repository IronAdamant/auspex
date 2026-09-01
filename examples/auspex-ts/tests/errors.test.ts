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
    "bad key slr_live_… and more",
  )
})
