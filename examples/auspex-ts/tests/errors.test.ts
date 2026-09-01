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
  assert.equal(explainSolariError(new Error("plain")), "plain")
})
