import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { DEMO_SYNTHETIC_SESSION_ID, replayHtmlFromNdjson } from "../scripts/save-demo-receipt.ts"
import { assertNoCredentialLeak } from "../src/replay-redact.ts"
import { parseReceiptV1 } from "../src/receipt-schema.ts"

const demo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "demo")

test("demo receipt has sessionId and no replayUrl", () => {
  const receipt = JSON.parse(readFileSync(path.join(demo, "receipt.json"), "utf8")) as {
    ok: boolean
    sessionId: string
    replayUrl?: string
    finalUrl: string
    networkIdle?: boolean
    expect?: string
    matched?: boolean
    claimOk?: boolean
    verifyOk?: boolean
    note?: string
  }
  assert.equal(receipt.ok, true)
  assert.equal(typeof receipt.sessionId, "string")
  assert.equal(receipt.sessionId, DEMO_SYNTHETIC_SESSION_ID)
  assert.ok(receipt.sessionId.startsWith("demo_synthetic_"))
  assert.equal(receipt.replayUrl, undefined)
  assert.equal(receipt.finalUrl, "https://ironadamant.com/")
  assert.equal(typeof receipt.networkIdle, "boolean")
  assert.equal(receipt.networkIdle, true)
  assert.equal(receipt.expect, "One office job.")
  assert.equal(receipt.matched, true)
  assert.equal(receipt.verifyOk, true)
  assert.equal(receipt.claimOk, true)
  assert.equal((receipt.note ?? "").includes("open demo/replay.html"), false)
  assert.match(receipt.note ?? "", /stub/)
  assert.match(receipt.note ?? "", /generate:replay/)
})

test("demo ironadamant-receipt.json is schema v1", () => {
  const raw = JSON.parse(readFileSync(path.join(demo, "ironadamant-receipt.json"), "utf8")) as Record<
    string,
    unknown
  >
  const receipt = parseReceiptV1(raw)
  assert.equal(receipt.schemaVersion, 1)
  assert.equal(receipt.ok, true)
  assert.equal(receipt.reason, "matched")
  assert.equal(receipt.url, "https://ironadamant.com")
  assert.equal(receipt.expect, "One office job.")
  assert.match(receipt.screenshotPath, /ironadamant\.png/)
  assert.equal(receipt.matched, true)
  assert.equal(receipt.sessionId, DEMO_SYNTHETIC_SESSION_ID)
  assert.equal(receipt.verify?.claimOk, true)
  assert.equal("replayUrl" in raw, false)
})

test("demo consistencyhub-receipt.json notes omitted sessionStorage or counts it", () => {
  const raw = JSON.parse(readFileSync(path.join(demo, "consistencyhub-receipt.json"), "utf8")) as Record<
    string,
    unknown
  >
  const receipt = parseReceiptV1(raw)
  assert.equal(receipt.schemaVersion, 1)
  assert.equal(receipt.ok, true)
  assert.equal(receipt.verify?.claimOkProfile, true)
  const note = typeof raw.demoNote === "string" ? raw.demoNote : ""
  const seed = raw.profileSeed as { sessionStorage?: number } | undefined
  const count = seed?.sessionStorage
  const notesOmit = /sessionStorage/i.test(note) && /omitted/i.test(note)
  assert.ok(
    typeof count === "number" || notesOmit,
    "CH receipt must have numeric profileSeed.sessionStorage or demoNote that sessionStorage was omitted",
  )
})

test("demo onedrive-receipt.json is redacted schema v1 and receipt-only", () => {
  const raw = JSON.parse(readFileSync(path.join(demo, "onedrive-receipt.json"), "utf8")) as Record<
    string,
    unknown
  >
  const receipt = parseReceiptV1(raw)
  assert.equal(receipt.schemaVersion, 1)
  assert.equal(receipt.ok, true)
  assert.equal(receipt.reason, "matched")
  assert.equal(receipt.url, "https://onedrive.live.com/")
  assert.equal(receipt.expect, "My files")
  assert.equal(receipt.screenshotPath, "")
  assert.equal(receipt.matched, true)
  assert.equal(receipt.sessionId, undefined)
  assert.equal("sessionId" in raw, false)
  assert.equal(receipt.verify?.claimOk, false)
  assert.equal(receipt.verify?.claimOkProfile, true)
  assert.equal(receipt.verify?.anonymousClaimSkipped, true)
  const excerpt = typeof receipt.excerpt === "string" ? receipt.excerpt : ""
  assert.match(excerpt, /REDACTED/)
  assert.equal(/@[a-z0-9.-]+\.[a-z]{2,}/i.test(excerpt), false, "OneDrive excerpt must not include emails")
  assert.equal(/\b\d+(\.\d+)?\s*(GB|TB|MB)\b/i.test(excerpt), false, "OneDrive excerpt must not include storage amounts")
  const note = typeof raw.demoNote === "string" ? raw.demoNote : ""
  assert.match(note, /[Rr]eceipt-only|no public OneDrive PNG/)
  assert.equal(existsSync(path.join(demo, "onedrive.png")), false, "do not commit a raw OneDrive PNG")
})

test("demo host-changed-receipt.json is schema v1 fail-closed remint", () => {
  const raw = JSON.parse(readFileSync(path.join(demo, "host-changed-receipt.json"), "utf8")) as Record<
    string,
    unknown
  >
  const receipt = parseReceiptV1(raw)
  assert.equal(receipt.schemaVersion, 1)
  assert.equal(receipt.ok, false)
  assert.equal(receipt.reason, "hostChanged")
  assert.equal(receipt.hostChanged, true)
  assert.equal(receipt.profileHostMatch, false)
  assert.equal(receipt.suggestedProfile, "app-socialaize-com")
  assert.equal(receipt.suggestedUrl, "https://app.socialaize.com")
  assert.equal(receipt.nextCall?.tool, "auspex_login")
  assert.equal(receipt.nextCall?.url, "https://app.socialaize.com")
  assert.equal(receipt.screenshotPath, "")
  assert.equal("sessionId" in raw, false)
  const pack = JSON.parse(readFileSync(path.join(demo, "dogfood-pack.json"), "utf8")) as {
    items: Array<{ id: string; receipt: string }>
  }
  const ids = pack.items.map((row) => row.id)
  assert.deepEqual(ids, ["consistencyhub", "onedrive", "hostChanged"])
  assert.ok(existsSync(path.join(demo, "login-trace-sample.jsonl")))
})

test("demo PNG is a real PNG", () => {
  const png = readFileSync(path.join(demo, "ironadamant.png"))
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a")
  assert.ok(png.length > 1000)
})

test("committed replay.html is a stub; ndjson generates the player", () => {
  const stub = readFileSync(path.join(demo, "replay.html"), "utf8")
  assert.ok(stub.length < 8_192, "committed replay.html must stay a stub")
  assert.match(stub, /generate:replay/)
  const ndjson = readFileSync(path.join(demo, "replay.ndjson"), "utf8")
  const events = ndjson
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { type: number })
  assert.ok(events.length >= 2)
  assert.equal(typeof events[0]?.type, "number")
  const generated = replayHtmlFromNdjson(ndjson)
  const block = generated.match(/<script type="application\/json" id="events">([\s\S]*?)<\/script>/)
  assert.ok(block)
  const fromFn = JSON.parse(block[1] ?? "null") as unknown[]
  assert.equal(fromFn.length, events.length)
  assert.match(generated, /integrity="sha384-/)
  const remoteScripts = [...generated.matchAll(/<script[^>]*src="[^"]+"[^>]*>/g)].map((m) => m[0])
  for (const tag of remoteScripts) {
    assert.match(tag, /integrity=/)
  }
})

test("watch replay ndjson is ConsistencyHub Microsoft wall with emails and passwords stripped", () => {
  const ndjson = readFileSync(path.join(demo, "replay.ndjson"), "utf8")
  const html = replayHtmlFromNdjson(ndjson)
  assert.match(html, /consistencyhub\.io/)
  assert.match(html, /Microsoft/)
  assert.equal(assertNoCredentialLeak(html).length, 0)
  assert.equal(assertNoCredentialLeak(ndjson).length, 0)
})
