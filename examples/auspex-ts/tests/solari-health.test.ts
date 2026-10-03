import assert from "node:assert/strict"
import test from "node:test"
import { SolariError } from "@solarisdk/browser"
import {
  healthReceiptFromError,
  readSolariHealthList,
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

