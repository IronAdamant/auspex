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
    const disk = (await import("node:fs")).readFileSync(fixture)
    assert.notEqual(raw.equals(disk), true)
    const { decodePng } = await import("../src/png-fit.ts")
    const decoded = decodePng(raw)
    assert.ok(decoded.width >= 1 && decoded.height >= 1)
  }
})

test("buildCheckToolContent downscales oversized on-disk PNGs without rewriting the file", async () => {
  const { mkdtempSync, writeFileSync, statSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const { randomBytes } = await import("node:crypto")
  const { MAX_IMAGE_BYTES } = await import("../src/content.ts")
  const { encodePng } = await import("../src/png-fit.ts")
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-img-"))
  const big = path.join(dir, "big.png")
  const width = 1024
  const height = 1024
  const pixels = randomBytes(width * height * 3)
  const png = encodePng(width, height, pixels, 3)
  assert.ok(png.length > MAX_IMAGE_BYTES)
  writeFileSync(big, png)
  const before = statSync(big).size
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
  assert.equal(statSync(big).size, before)
  const image = content.find((p) => p.type === "image")
  assert.ok(image && image.type === "image")
  if (image && image.type === "image") {
    const raw = Buffer.from(image.data, "base64")
    assert.ok(raw.length <= MAX_IMAGE_BYTES)
    assert.ok(raw.length < before)
    assert.equal(image.mimeType, "image/png")
    const { decodePng } = await import("../src/png-fit.ts")
    const decoded = decodePng(raw)
    assert.ok(decoded.width >= 1 && decoded.height >= 1)
  }
})

test("fitMcpAttach bytes decode as a real PNG (inflate IDAT + sips)", async () => {
  const { mkdtempSync, writeFileSync, readFileSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const { spawnSync } = await import("node:child_process")
  const { fitMcpAttach, decodePng, encodePng } = await import("../src/png-fit.ts")
  const pixels = Buffer.alloc(64 * 48 * 3, 80)
  const png = encodePng(64, 48, pixels, 3)
  const { buf, mimeType } = fitMcpAttach(png)
  assert.equal(mimeType, "image/png")
  const decoded = decodePng(buf)
  assert.ok(decoded.width >= 1 && decoded.height >= 1)
  assert.ok(decoded.pixels.length >= decoded.width * decoded.height * 3)
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-sips-"))
  const file = path.join(dir, "attach.png")
  writeFileSync(file, buf)
  const sips = spawnSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file], { encoding: "utf8" })
  assert.equal(sips.status, 0, sips.stderr)
  assert.match(sips.stdout, /pixelWidth: \d+/)
  assert.doesNotMatch(sips.stderr + sips.stdout, /error 13|Unable to render/i)
  assert.ok(readFileSync(file).equals(buf))
})

test("buildCheckToolContent notes a missing screenshot file", async () => {
  const result: CheckResult = {
    title: "t",
    finalUrl: "https://ironadamant.com/",
    ok: true,
    expect: "Build it.",
    matched: true,
    excerpt: "Build it.",
    screenshotPath: path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "no-such-page.png"),
    sessionId: "s",
    networkIdle: true,
  }
  const { content } = await buildCheckToolContent(result)
  assert.equal(content.some((p) => p.type === "image"), false)
  const note = content.filter((p) => p.type === "text").map((p) => (p.type === "text" ? p.text : "")).join("\n")
  assert.match(note, /PNG omitted/)
  assert.match(note, /missing/)
})

test("packToolFailure attaches a screenshot when AuspexError has a path", async () => {
  const { packToolFailure } = await import("../src/content.ts")
  const { AuspexError } = await import("../src/errors.ts")
  const packed = await packToolFailure(
    new AuspexError("check failed", {
      sessionId: "sess-shot",
      screenshotPath: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "demo", "ironadamant.png"),
    }),
  )
  assert.equal(packed.isError, true)
  const text = packed.content.filter((p) => p.type === "text").map((p) => (p.type === "text" ? p.text : "")).join("\n")
  assert.match(text, /sess-shot/)
  assert.ok(packed.content.some((p) => p.type === "image"))
})

test("packToolFailure includes structured 429 and receipt sessionId", async () => {
  const { packToolFailure } = await import("../src/content.ts")
  const { AuspexError } = await import("../src/errors.ts")
  const { SolariError } = await import("@solarisdk/browser")
  const packed = await packToolFailure(
    new AuspexError("x", {
      issue: {
        code: "ConcurrencyLimitExceeded",
        retryable: false,
        message: "leftover",
        recovery: "solari_kill",
      },
      sessionId: "sess-fail",
      cause: new SolariError("x", 429, undefined, "ConcurrencyLimitExceeded"),
    }),
  )
  assert.equal(packed.isError, true)
  const text = packed.content.filter((p) => p.type === "text").map((p) => (p.type === "text" ? p.text : "")).join("\n")
  assert.match(text, /sess-fail/)
  assert.match(text, /ConcurrencyLimitExceeded|"retryable": false/)
})
