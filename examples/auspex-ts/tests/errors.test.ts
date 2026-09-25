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

test("classifySolariError handles 413 Payload Too Large", () => {
  const issue = classifySolariError(new SolariError("payload too large", 413, undefined))
  assert.equal(issue.code, "PayloadTooLarge")
  assert.equal(issue.status, 413)
  assert.equal(issue.retryable, false)
  assert.match(issue.recovery ?? "", /1 MiB/)
  assert.match(issue.recovery ?? "", /indexedDB/)
  assert.match(issue.recovery ?? "", /not retry identical/)
})

test("classifySolariError handles 5xx transient errors", () => {
  const issue502 = classifySolariError(new SolariError("bad gateway", 502, undefined))
  assert.equal(issue502.code, "SolariInfraTransient")
  assert.equal(issue502.status, 502)
  assert.equal(issue502.retryable, true)
  assert.match(issue502.recovery ?? "", /transient/)
  assert.match(issue502.recovery ?? "", /auspex_reap/)
  assert.match(issue502.recovery ?? "", /not conflate/)

  const issue503 = classifySolariError(new SolariError("service unavailable", 503, undefined))
  assert.equal(issue503.code, "SolariInfraTransient")
  assert.equal(issue503.status, 503)
  assert.equal(issue503.retryable, true)

  const issue504 = classifySolariError(new SolariError("gateway timeout", 504, undefined))
  assert.equal(issue504.code, "SolariInfraTransient")
  assert.equal(issue504.status, 504)
  assert.equal(issue504.retryable, true)
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
  const busy = classifySolariError(new ProfileBusyError("consistencyhub"))
  assert.equal(busy.code, "ProfileBusy")
  assert.equal(busy.retryable, false)
})

test("AuspexError preserves receipt fields", () => {
  const err = new AuspexError("boom", { sessionId: "sess-1", screenshotPath: "shot.png" })
  assert.equal(err.sessionId, "sess-1")
  assert.equal(err.screenshotPath, "shot.png")
  assert.equal(classifySolariError(err).message, "boom")
})

test("exhaustion without status is SolariSdkExhausted and not a login failure", () => {
  const err = new SolariError("Solari POST /sessions: exhausted 2 attempts")
  assert.equal(err.status, undefined)
  const issue = classifySolariError(err)
  assert.equal(issue.code, "SolariSdkExhausted")
  assert.equal(issue.solariBlame, "unknown-exhausted")
  assert.equal(issue.retryable, false)
  assert.equal(issue.nextCall?.tool, "auspex_login")
  assert.match(issue.recovery ?? "", /Wait once/)
  assert.match(issue.recovery ?? "", /not loggedOut or needsHuman/)
  assert.equal(issue.message.includes("loggedOut"), false)
  assert.equal(issue.message.includes("needsHuman"), false)
  const payload = solariFailurePayload(err)
  assert.equal(payload.ok, false)
  assert.equal(payload.code, "SolariSdkExhausted")
  assert.equal(payload.solariBlame, "unknown-exhausted")
  assert.equal(payload.nextCall?.tool, "auspex_login")
  assert.equal(payload.status, undefined)
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
