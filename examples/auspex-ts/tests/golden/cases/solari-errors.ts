// Who is to blame for a failure: the Solari answers Auspex has met, and how each one is classified.
// Inputs come from the error tests this table replaced; outputs live in ../out/solari-errors.json.
import { SolariError } from "@solarisdk/browser"
import type { GoldenCases } from "../harness.ts"
import { AuspexError, classifySolariError, explainSolariError, solariFailurePayload } from "../../../src/errors.ts"
import { ProfileBusyError } from "../../../src/profile-lock.ts"
import { healthReceiptFromError } from "../../../src/solari-health.ts"

const errors: Record<string, () => unknown> = {
  "402 FeatureRequiresPlan": () => new SolariError("x", 402, undefined, "FeatureRequiresPlan"),
  "403 PlanLimitExceeded": () => new SolariError("cap", 403, undefined, "PlanLimitExceeded"),
  "429 ConcurrencyLimitExceeded": () => new SolariError("x", 429, undefined, "ConcurrencyLimitExceeded"),
  "429 bare": () => new SolariError("x", 429),
  "401 on GET /profiles": () => new SolariError("Solari GET /profiles failed: 401", 401),
  "404 InvalidSessionId": () => new SolariError("x", 404, undefined, "InvalidSessionId"),
  "413 payload too large": () => new SolariError("payload too large", 413, undefined),
  "502 bad gateway": () => new SolariError("bad gateway", 502, undefined),
  "503 ServiceUnavailable": () => new SolariError("down", 503, undefined, "ServiceUnavailable"),
  "504 gateway timeout": () => new SolariError("gateway timeout", 504, undefined),
  "503 no stealth pool": () => new SolariError("Solari POST /sessions: 503 No stealth pool available", 503),
  "BrowserUnhealthy, no status": () =>
    new SolariError("Solari BrowserUnhealthy: the cloud Chrome failed its health probe", undefined, undefined, "BrowserUnhealthy"),
  "exhausted, status stripped": () => new SolariError("Solari POST /sessions: exhausted 2 attempts"),
  "exhausted, 503 cause": () =>
    new SolariError("Solari POST /sessions: exhausted 2 attempts", undefined, new SolariError("Solari POST /sessions: 503", 503)),
  "exhausted, abort cause": () =>
    new SolariError("Solari GET /profiles: exhausted 1 attempts", undefined, new DOMException("The operation was aborted", "AbortError")),
  "exhausted, fetch failed": () =>
    new SolariError("Solari GET /profiles: exhausted 1 attempts", undefined, new TypeError("fetch failed")),
  "profile busy": () => new ProfileBusyError("consistencyhub"),
  "AuspexError with receipt fields": () => new AuspexError("boom", { sessionId: "sess-1", screenshotPath: "shot.png" }),
  "plain Error": () => new Error("plain"),
  "key in message (slr_live_)": () => new Error("bad key slr_live_abc123XYZ and more"),
  "keys in message (slr_test_, sk-, Bearer)": () =>
    new Error("slr_test_zzz111 and sk-abcdefghijklmnopqrst and Bearer abc.def"),
  "ANSI colour codes in message": () => new Error("\u001b[2mlocator.click: Timeout 5000ms exceeded.\u001b[22m"),
}

export const cases: GoldenCases = {}
for (const [name, make] of Object.entries(errors)) {
  cases[`classify: ${name}`] = () => classifySolariError(make())
  cases[`explain: ${name}`] = () => explainSolariError(make())
  cases[`failure payload: ${name}`] = () => solariFailurePayload(make())
  cases[`health receipt: ${name}`] = () => healthReceiptFromError(make(), 10)
}
