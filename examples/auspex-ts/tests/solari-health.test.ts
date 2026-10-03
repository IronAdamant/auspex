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

test("error body codes are read and the body is not copied onto the receipt", async () => {
  const fake = client(jsonRes(402, { code: "FeatureRequiresPlan", detail: "upgrade-me-secret" }))
  const receipt = await solariHealth({ probe: () => readSolariHealthList(fake.client) })
  assert.equal(receipt.reason, "plan")
  assert.equal(receipt.code, "FeatureRequiresPlan")
  assert.equal(JSON.stringify(receipt).includes("upgrade-me-secret"), false)
})

