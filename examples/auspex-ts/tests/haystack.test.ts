import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { excerptOf, expectSchema, haystackMatches, normalizeHaystack } from "../src/text.ts"
import { httpUrlSchema, isHttpOrHttpsUrl } from "../src/http-url.ts"
import { toReceiptPath, packageRoot } from "../src/check.ts"
import { findProfileId, toPlaywrightStorageState } from "../src/solari.ts"

test("match and excerpt agree on extra-whitespace haystacks", () => {
  const raw = "Build  it.\nShip   it."
  const haystack = normalizeHaystack(raw)
  assert.equal(haystack, "Build it. Ship it.")
  assert.equal(haystackMatches(raw, "Build it."), true)
  assert.equal(excerptOf(raw), haystack)
  assert.equal(excerptOf(haystack).includes("Build it."), haystackMatches(raw, "Build it."))
})

test("expectSchema and httpUrlSchema reject whitespace and non-http(s)", () => {
  assert.equal(expectSchema.safeParse("").success, false)
  assert.equal(expectSchema.safeParse("   ").success, false)
  assert.equal(expectSchema.safeParse("Build it.").success, true)
  assert.equal(httpUrlSchema.safeParse("file:///etc/passwd").success, false)
  assert.equal(httpUrlSchema.safeParse("javascript:alert(1)").success, false)
  assert.equal(httpUrlSchema.safeParse("https://consistencyhub.io").success, true)
  assert.equal(isHttpOrHttpsUrl("http://example.com"), true)
})

test("toReceiptPath does not embed an absolute home path", () => {
  const abs = path.join(packageRoot, ".auspex", "runs", "stamp", "screenshot.png")
  const rel = toReceiptPath(abs)
  assert.equal(rel, ".auspex/runs/stamp/screenshot.png")
  assert.equal(path.isAbsolute(rel), false)
  assert.equal(rel.startsWith("/Users/"), false)
})

test("findProfileId does not auto-create", () => {
  assert.equal(findProfileId([{ id: "p1", name: "consistencyhub" }], "consistencyhub"), "p1")
  assert.throws(
    () => findProfileId([{ id: "p1", name: "consistencyhub" }], "typo"),
    /profile not found/,
  )
})

test("toPlaywrightStorageState fills required cookie fields", () => {
  const pw = toPlaywrightStorageState({
    cookies: [{ name: "sid", value: "1", domain: "consistencyhub.io" }],
    origins: [{ origin: "https://consistencyhub.io" }],
  })
  assert.equal(pw.cookies[0]?.path, "/")
  assert.equal(pw.cookies[0]?.sameSite, "Lax")
  assert.equal(pw.cookies[0]?.httpOnly, false)
  assert.equal(pw.cookies[0]?.secure, false)
  assert.equal(pw.cookies[0]?.expires, -1)
  assert.deepEqual(pw.origins[0]?.localStorage, [])
  const dropped = toPlaywrightStorageState({ cookies: [{ name: "x", value: "y" }] })
  assert.equal(dropped.cookies.length, 0)
})
