import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { excerptOf, expectSchema, haystackMatches, normalizeHaystack } from "../src/text.ts"
import { checkUrlSchema, httpUrlSchema, isHttpOrHttpsUrl } from "../src/http-url.ts"
import { auspexCheckInputSchema, auspexLoginInputSchema } from "../src/tool-schema.ts"
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
  assert.equal(isHttpOrHttpsUrl("https://user:pass@example.com/"), false)
  assert.equal(httpUrlSchema.safeParse("https://user:pass@example.com/").success, false)
})

test("checkUrlSchema rejects loopback hosts that Solari cloud Chrome cannot see", () => {
  for (const url of ["http://localhost:3000", "http://127.0.0.1/", "http://[::1]/"]) {
    const parsed = checkUrlSchema.safeParse(url)
    assert.equal(parsed.success, false, url)
    if (!parsed.success) {
      assert.match(parsed.error.message, /loopback|cloud|agent machine/i)
    }
  }
  assert.equal(checkUrlSchema.safeParse("https://ironadamant.com").success, true)
  assert.equal(httpUrlSchema.safeParse("http://localhost:3000").success, true)
})

test("MCP auspex_check schema rejects loopback, record+profile, and whitespace profile", () => {
  const base = { url: "https://ironadamant.com", expect: "Build it." }
  assert.equal(auspexCheckInputSchema.safeParse(base).success, true)
  const loop = auspexCheckInputSchema.safeParse({ ...base, url: "http://localhost:3000" })
  assert.equal(loop.success, false)
  if (!loop.success) assert.match(loop.error.message, /loopback|cloud|agent machine/i)
  const rec = auspexCheckInputSchema.safeParse({
    ...base,
    record: true,
    profile: "consistencyhub",
  })
  assert.equal(rec.success, false)
  if (!rec.success) assert.match(rec.error.message, /allow-record-profile|record/i)
  const recOk = auspexCheckInputSchema.safeParse({
    ...base,
    record: true,
    profile: "consistencyhub",
    allowRecordProfile: true,
  })
  assert.equal(recOk.success, true)
  const ws = auspexCheckInputSchema.safeParse({ ...base, profile: "   " })
  assert.equal(ws.success, false)
})

test("MCP auspex_login schema rejects whitespace-only profile names", () => {
  assert.equal(auspexLoginInputSchema.safeParse({ profile: "auspex-demo" }).success, true)
  assert.equal(auspexLoginInputSchema.safeParse({ profile: "   " }).success, false)
  const trimmed = auspexLoginInputSchema.safeParse({ profile: "  auspex-demo  " })
  assert.equal(trimmed.success, true)
  if (trimmed.success) assert.equal(trimmed.data.profile, "auspex-demo")
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
  assert.equal(findProfileId([{ id: "p1", name: "consistencyhub" }], "  consistencyhub  "), "p1")
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
  assert.equal(pw.cookies[0]?.httpOnly, true)
  assert.equal(pw.cookies[0]?.secure, true)
  assert.equal(pw.cookies[0]?.expires, -1)
  assert.deepEqual(pw.origins[0]?.localStorage, [])
  const dropped = toPlaywrightStorageState({ cookies: [{ name: "x", value: "y" }] })
  assert.equal(dropped.cookies.length, 0)
})
