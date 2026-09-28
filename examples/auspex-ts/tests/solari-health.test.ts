import assert from "node:assert/strict"
import test from "node:test"
import { SolariError } from "@solarisdk/browser"
import { parseArgv, USAGE } from "../src/cli.ts"
import { AuspexError } from "../src/errors.ts"
import {
  healthReceiptFromError,
  healthSolariOptions,
  readSolariHealthList,
  SOLARI_HEALTH_ENDPOINT,
  SOLARI_HEALTH_PROBE,
  SOLARI_HEALTH_TIMEOUT_MS,
  solariHealth,
  type SolariHealthClient,
  type SolariHealthResponse,
} from "../src/solari-health.ts"

function jsonRes(status: number, body: unknown): SolariHealthResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
  }
}

function client(res: SolariHealthResponse | ((method: string, path: string) => SolariHealthResponse)): {
  client: SolariHealthClient
  calls: Array<{ method: string; path: string }>
  closed: { n: number }
} {
  const calls: Array<{ method: string; path: string }> = []
  const closed = { n: 0 }
  return {
    calls,
    closed,
    client: {
      request: async (method, path) => {
        calls.push({ method, path })
        return typeof res === "function" ? res(method, path) : res
      },
      close: async () => {
        closed.n += 1
      },
    },
  }
}

function assertNoLoginClaim(body: object) {
  const text = JSON.stringify(body)
  assert.equal("claimOk" in body, false)
  assert.equal("claimOkProfile" in body, false)
  assert.equal(text.includes("claimOk"), false)
  assert.equal(body && (body as { minted?: boolean }).minted, false)
  assert.equal((body as { appLogin?: boolean }).appLogin, false)
  assert.equal((body as { probe?: string }).probe, SOLARI_HEALTH_PROBE)
  assert.equal((body as { endpoint?: string }).endpoint, SOLARI_HEALTH_ENDPOINT)
}

test("health client options are one attempt and an 8s cap", () => {
  const opts = healthSolariOptions("slr_live_testkeyvalue")
  assert.equal(opts.maxAttempts, 1)
  assert.equal(opts.timeoutMs, SOLARI_HEALTH_TIMEOUT_MS)
  assert.equal(opts.timeoutMs, 8_000)
  assert.equal(opts.backoffMs, 0)
  assert.equal("sessions" in opts, false)
})

test("GET /profiles success counts rows and drops names and storage", async () => {
  const fake = client(
    jsonRes(200, [
      { id: "p1", name: "secret-profile", storageState: { cookies: [{ value: "sekrit-cookie" }] } },
      { id: "p2", name: "other-site" },
    ]),
  )
  const listed = await readSolariHealthList(fake.client)
  assert.deepEqual(listed, { profileCount: 2 })
  assert.deepEqual(fake.calls, [{ method: "GET", path: "/profiles" }])
  const receipt = await solariHealth({ probe: async () => listed, now: () => 1_000 })
  assert.equal(receipt.ok, true)
  assert.equal(receipt.schemaVersion, 1)
  assert.equal(receipt.reason, "reachable")
  assert.equal(receipt.called, true)
  assert.equal(receipt.profileCount, 2)
  assert.equal(receipt.elapsedMs, 0)
  assert.match(receipt.next, /not a saved login/)
  assert.match(receipt.next, /profile-status/)
  assertNoLoginClaim(receipt)
  const text = JSON.stringify(receipt)
  assert.equal(text.includes("secret-profile"), false)
  assert.equal(text.includes("sekrit-cookie"), false)
  assert.equal(text.includes("other-site"), false)
  assert.equal("nextCall" in receipt, false)
})

test("an empty profile list is still reachable", async () => {
  const receipt = await solariHealth({ probe: async () => ({ profileCount: 0 }) })
  assert.equal(receipt.ok, true)
  assert.equal(receipt.profileCount, 0)
  assert.equal(receipt.reason, "reachable")
})

test("a non-list body fails closed and does not echo the body", async () => {
  const fake = client(jsonRes(200, { name: "secret-profile", note: "not-a-list" }))
  await assert.rejects(() => readSolariHealthList(fake.client), /profile list/)
  const receipt = await solariHealth({
    probe: () => readSolariHealthList(fake.client),
  })
  assert.equal(receipt.ok, false)
  assert.equal(receipt.reason, "error")
  assert.equal(receipt.called, true)
  assert.equal(JSON.stringify(receipt).includes("secret-profile"), false)
  assert.equal(JSON.stringify(receipt).includes("not-a-list"), false)
})

test("missing key does not call Solari", async () => {
  let called = false
  const receipt = await solariHealth({
    probe: async () => {
      called = true
      throw new AuspexError("SOLARI_API_KEY is not set. Export SOLARI_API_KEY.", {
        issue: { code: "MissingApiKey", retryable: false },
      })
    },
  })
  assert.equal(called, true)
  assert.equal(receipt.ok, false)
  assert.equal(receipt.called, false)
  assert.equal(receipt.reason, "missing-key")
  assert.equal(receipt.code, "MissingApiKey")
  assert.match(receipt.next, /did not call Solari/)
  assert.equal(receipt.nextCall, undefined)
})

test("429 is concurrency and points at auspex_reap", async () => {
  const fake = client(jsonRes(429, { code: "ConcurrencyLimitExceeded", message: "slot held" }))
  const receipt = await solariHealth({ probe: () => readSolariHealthList(fake.client) })
  assert.equal(receipt.ok, false)
  assert.equal(receipt.reason, "concurrency")
  assert.equal(receipt.code, "ConcurrencyLimitExceeded")
  assert.equal(receipt.status, 429)
  assert.equal(receipt.solariBlame, "concurrency")
  assert.equal(receipt.retryable, false)
  assert.deepEqual(receipt.nextCall, { tool: "auspex_reap" })
  assert.match(receipt.next, /auspex reap/)
  assert.equal(receipt.next.includes("auspex_login"), false)
  assert.equal(JSON.stringify(receipt).includes("slot held"), false)
  assertNoLoginClaim(receipt)
})

test("402 and 403 are plan, not a remint", () => {
  const plan = healthReceiptFromError(new SolariError("nope", 402, undefined, "FeatureRequiresPlan"), 12)
  assert.equal(plan.ok, false)
  assert.equal(plan.reason, "plan")
  assert.equal(plan.code, "FeatureRequiresPlan")
  assert.equal(plan.status, 402)
  assert.equal(plan.nextCall, undefined)
  assert.match(plan.next, /did not start a browser/)
  const limit = healthReceiptFromError(new SolariError("cap", 403, undefined, "PlanLimitExceeded"), 4)
  assert.equal(limit.reason, "plan")
  assert.equal(limit.code, "PlanLimitExceeded")
})

test("401 is auth and BrowserUnhealthy keeps that code", () => {
  const auth = healthReceiptFromError(new SolariError("Solari GET /profiles failed: 401", 401), 3)
  assert.equal(auth.reason, "auth")
  assert.equal(auth.status, 401)
  assert.match(auth.next, /rejected the API key/)
  assert.equal(auth.nextCall, undefined)
  const unhealthy = healthReceiptFromError(
    new SolariError("Solari BrowserUnhealthy: the cloud Chrome failed its health probe", undefined, undefined, "BrowserUnhealthy"),
    5,
  )
  assert.equal(unhealthy.reason, "BrowserUnhealthy")
  assert.equal(unhealthy.code, "BrowserUnhealthy")
  assert.equal(unhealthy.retryable, true)
  assert.match(unhealthy.next, /not loggedOut/)
})

test("503 is infra-5xx and does not remint", () => {
  const infra = healthReceiptFromError(new SolariError("down", 503, undefined, "ServiceUnavailable"), 8)
  assert.equal(infra.reason, "infra-5xx")
  assert.equal(infra.solariBlame, "infra-5xx")
  assert.equal(infra.status, 503)
  assert.equal(infra.retryable, true)
  assert.equal(infra.nextCall, undefined)
  assert.match(infra.next, /Wait 5-10 seconds/)
  assert.match(infra.next, /not an app login/)
})

test("SDK abort exhaustion is timeout, not a login remint", () => {
  const abort = new DOMException("The operation was aborted", "AbortError")
  const err = new SolariError("Solari GET /profiles: exhausted 1 attempts", undefined, abort)
  const receipt = healthReceiptFromError(err, 8_000)
  assert.equal(receipt.reason, "timeout")
  assert.equal(receipt.code, "Timeout")
  assert.equal(receipt.retryable, true)
  assert.equal(receipt.called, true)
  assert.equal(receipt.nextCall, undefined)
  assert.match(receipt.next, /Do not remint/)
  assert.equal(receipt.solariBlame, undefined)
})

test("fetch failure is network", () => {
  const err = new SolariError("Solari GET /profiles: exhausted 1 attempts", undefined, new TypeError("fetch failed"))
  const receipt = healthReceiptFromError(err, 20)
  assert.equal(receipt.reason, "network")
  assert.equal(receipt.code, "Network")
  assert.match(receipt.next, /api\.getsolari\.com/)
  assert.equal(receipt.nextCall, undefined)
})

test("exhausted 503 cause stays infra-5xx", () => {
  const cause = new SolariError("upstream", 503)
  const err = new SolariError("Solari GET /profiles: exhausted 1 attempts", undefined, cause)
  const receipt = healthReceiptFromError(err, 9)
  assert.equal(receipt.reason, "infra-5xx")
  assert.equal(receipt.status, 503)
  assert.equal(receipt.solariBlame, "infra-5xx")
})

test("unknown exhaustion does not remint from this probe", () => {
  const err = new SolariError("Solari GET /profiles: exhausted 2 attempts")
  const receipt = healthReceiptFromError(err, 11)
  assert.equal(receipt.reason, "unknown-exhausted")
  assert.equal(receipt.solariBlame, "unknown-exhausted")
  assert.equal(receipt.nextCall, undefined)
  assert.match(receipt.next, /Do not remint from this probe/)
})

test("error body codes are read and the body is not copied onto the receipt", async () => {
  const fake = client(jsonRes(402, { code: "FeatureRequiresPlan", detail: "upgrade-me-secret" }))
  const receipt = await solariHealth({ probe: () => readSolariHealthList(fake.client) })
  assert.equal(receipt.reason, "plan")
  assert.equal(receipt.code, "FeatureRequiresPlan")
  assert.equal(JSON.stringify(receipt).includes("upgrade-me-secret"), false)
})

test("CLI parses solari-health with no flags", () => {
  assert.match(USAGE, /npx auspex solari-health/)
  assert.match(USAGE, /does not log in/)
  const parsed = parseArgv(["solari-health"])
  assert.equal(parsed.status, "ok")
  if (parsed.status === "ok") assert.deepEqual(parsed.command, { cmd: "solari-health" })
  const extra = parseArgv(["solari-health", "--profile", "app-example"])
  assert.equal(extra.status, "error")
  const help = parseArgv(["solari-health", "--help"])
  assert.equal(help.status, "ok")
  if (help.status === "ok") assert.equal(help.command.cmd, "help")
})
