import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { buildCheckToolContent } from "../src/content.ts"
import type { CheckResult } from "../src/check.ts"

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "page.png")

test("buildCheckToolContent notes a missing screenshot file", async () => {
  const result: CheckResult = {
    title: "t",
    finalUrl: "https://ironadamant.com/",
    ok: true,
    reason: "matched",
    url: "https://ironadamant.com",
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

test("packDesktopToolContent unshifts ASCII log then JSON", async () => {
  const { packDesktopToolContent } = await import("../src/content.ts")
  const desktopPayload = {
    log: ":: booting\n==> ok=true",
    screenshotPath: fixture,
    ok: true,
    desktopId: "desk-pack",
  }
  const packed = await packDesktopToolContent(desktopPayload)
  const texts = packed.content.filter((p) => p.type === "text").map((p) => (p.type === "text" ? p.text : ""))
  assert.equal(texts[0], ":: booting\n==> ok=true")
  assert.match(texts.join("\n"), /desk-pack/)
  assert.ok(packed.content.some((p) => p.type === "image"))
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

