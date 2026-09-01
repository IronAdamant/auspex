import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { replayHtmlFromNdjson } from "../scripts/save-demo-receipt.ts"

const demo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "demo")

test("demo receipt has sessionId and no replayUrl", () => {
  const receipt = JSON.parse(readFileSync(path.join(demo, "receipt.json"), "utf8")) as {
    ok: boolean
    sessionId: string
    replayUrl?: string
    finalUrl: string
  }
  assert.equal(receipt.ok, true)
  assert.match(receipt.sessionId, /:/)
  assert.equal(receipt.replayUrl, undefined)
  assert.equal(receipt.finalUrl, "https://ironadamant.com/")
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
})
