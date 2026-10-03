import assert from "node:assert/strict"
import test from "node:test"
import { SolariError } from "@solarisdk/browser"
import {
  classifySolariError,
  solariFailurePayload,
} from "../src/errors.ts"

test("classifySolariError handles 413 Payload Too Large", () => {
  const issue = classifySolariError(new SolariError("payload too large", 413, undefined))
  assert.equal(issue.code, "PayloadTooLarge")
  assert.equal(issue.status, 413)
  assert.equal(issue.retryable, false)
  assert.match(issue.recovery ?? "", /1 MiB/)
  assert.match(issue.recovery ?? "", /indexedDB/)
  assert.match(issue.recovery ?? "", /not retry identical/)
})

test("exhausted 503 cause is infra-5xx and stealth text is stealth-pool-empty", () => {
  const cause = new SolariError("Solari POST /sessions: 503", 503)
  const wrapped = new SolariError("Solari POST /sessions: exhausted 2 attempts", undefined, cause)
  const infra = classifySolariError(wrapped)
  assert.equal(infra.code, "SolariSdkExhausted")
  assert.equal(infra.solariBlame, "infra-5xx")
  assert.equal(infra.status, 503)
  assert.equal(infra.retryable, false)
  assert.equal(infra.nextCall, undefined)
  assert.match(infra.recovery ?? "", /retry the same call once/)

  const stealth = classifySolariError(
    new SolariError('Solari POST /sessions: 503 No stealth pool available', 503),
  )
  assert.equal(stealth.code, "SolariSdkExhausted")
  assert.equal(stealth.solariBlame, "stealth-pool-empty")
  assert.equal(stealth.retryable, false)
  assert.match(stealth.recovery ?? "", /Drop --stealth/)
  assert.match(stealth.recovery ?? "", /Do not solve CAPTCHA/)
  assert.equal(stealth.nextCall, undefined)

  const still429 = classifySolariError(new SolariError("x", 429, undefined, "ConcurrencyLimitExceeded"))
  assert.equal(still429.code, "ConcurrencyLimitExceeded")
  assert.equal(still429.solariBlame, "concurrency")
  assert.equal(still429.nextCall?.tool, "auspex_reap")
  assert.equal(solariFailurePayload(still429 && new SolariError("x", 429)).nextCall?.tool, "auspex_reap")
})

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
