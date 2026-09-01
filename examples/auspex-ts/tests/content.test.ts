import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { buildCheckToolContent } from "../src/content.ts"
import type { CheckResult } from "../src/check.ts"

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "page.png")

test("buildCheckToolContent returns JSON text and PNG image from a real file", async () => {
  const result: CheckResult = {
    title: "Software & AI tooling | Iron Adamant",
    finalUrl: "https://ironadamant.com/",
    ok: true,
    expect: "Build it.",
    matched: true,
    excerpt: "Build it. Ship it.",
    screenshotPath: fixture,
    sessionId: "test-session",
    networkIdle: true,
  }
  const { content } = await buildCheckToolContent(result)
  const text = content.find((p) => p.type === "text")
  assert.ok(text && text.type === "text")
  if (text && text.type === "text") {
    assert.match(text.text, /"ok": true/)
    assert.match(text.text, /"matched": true/)
  }
  const image = content.find((p) => p.type === "image")
  assert.ok(image && image.type === "image")
  if (image && image.type === "image") {
    assert.equal(image.mimeType, "image/png")
    assert.ok(image.data.length > 0)
    const raw = Buffer.from(image.data, "base64")
    assert.equal(raw.subarray(0, 8).toString("hex"), "89504e470d0a1a0a")
  }
})

test("buildCheckToolContent omits oversized PNGs", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const { MAX_IMAGE_BYTES } = await import("../src/content.ts")
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-img-"))
  const big = path.join(dir, "big.png")
  writeFileSync(big, Buffer.alloc(MAX_IMAGE_BYTES + 1, 0))
  const result: CheckResult = {
    title: "t",
    finalUrl: "https://ironadamant.com/",
    ok: true,
    expect: "Build it.",
    matched: true,
    excerpt: "Build it.",
    screenshotPath: big,
    sessionId: "s",
    networkIdle: true,
  }
  const { content } = await buildCheckToolContent(result)
  assert.equal(content.some((p) => p.type === "image"), false)
  const note = content.filter((p) => p.type === "text").map((p) => (p.type === "text" ? p.text : "")).join("\n")
  assert.match(note, /PNG omitted/)
})
