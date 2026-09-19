import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { DEMO_SYNTHETIC_SESSION_ID, replayHtmlFromNdjson } from "../scripts/save-demo-receipt.ts"
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

test("no committed OneDrive receipt artifact", () => {
  assert.equal(existsSync(path.join(demo, "onedrive-receipt.json")), false)
  assert.equal(existsSync(path.join(demo, "onedrive.png")), false)
})

test("demo PNG is a real PNG", () => {
  const png = readFileSync(path.join(demo, "ironadamant.png"))
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a")
  assert.ok(png.length > 1000)
})

test("demo replay.ndjson is rrweb events and replay.html inlines them", () => {
  const ndjson = readFileSync(path.join(demo, "replay.ndjson"), "utf8")
  const events = ndjson
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { type: number })
  assert.ok(events.length >= 2)
  assert.equal(typeof events[0]?.type, "number")
  const html = readFileSync(path.join(demo, "replay.html"), "utf8")
  const generated = replayHtmlFromNdjson(ndjson)
  const block = (s: string) => {
    const m = s.match(/<script type="application\/json" id="events">([\s\S]*?)<\/script>/)
    assert.ok(m)
    const parsed = JSON.parse(m[1] ?? "null") as unknown[]
    return parsed
  }
  const fromFile = block(html)
  const fromFn = block(generated)
  assert.equal(fromFile.length, events.length)
  assert.equal(fromFn.length, events.length)
  assert.match(html, /integrity="sha384-/)
  assert.match(generated, /integrity="sha384-/)
  const remoteScripts = [...html.matchAll(/<script[^>]*src="[^"]+"[^>]*>/g)].map((m) => m[0])
  for (const tag of remoteScripts) {
    assert.match(tag, /integrity=/)
  }
})
