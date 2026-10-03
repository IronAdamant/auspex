import assert from "node:assert/strict"
import test from "node:test"
import { SolariError } from "@solarisdk/browser"
import {
  AuspexError,
  classifySolariError,
  CLOSE_KILL_RECOVERY,
  explainSolariError,
  solariFailurePayload,
} from "../src/errors.ts"
import { ProfileBusyError } from "../src/profile-lock.ts"

test("failure JSON carries no terminal colour codes from Playwright's call log", async () => {
  const { solariFailurePayload, stripAnsi } = await import("../src/errors.ts")
  // Live, tldraw --wait-for: the error field read "\u001b[2m  - waiting for locator(…)\u001b[22m".
  const err = new Error(
    "page.waitForSelector: Timeout 15000ms exceeded.\nCall log:\n\u001b[2m  - waiting for locator('input[placeholder=\"Search...\"]') to be visible\u001b[22m\n",
  )
  const body = solariFailurePayload(err)
  assert.equal(body.error.includes("\u001b"), false)
  assert.match(body.error, /waiting for locator\('input\[placeholder="Search\.\.\."\]'\) to be visible/)
  assert.equal(stripAnsi("\u001b[31mred\u001b[0m plain"), "red plain")
})
