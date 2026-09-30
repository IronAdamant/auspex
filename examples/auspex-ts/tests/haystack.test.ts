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

test("Dashboard does not match inside One Dashboard; case stays sensitive", () => {
  const marketing = "10+ Platforms , One Dashboard"
  assert.equal(haystackMatches(marketing, "Dashboard"), false)
  assert.equal(haystackMatches("One Dashboard", "Dashboard"), false)
  assert.equal(haystackMatches("Dashboards", "Dashboard"), false)
  assert.equal(haystackMatches("MyDashboard", "Dashboard"), false)
  assert.equal(haystackMatches("one dashboard", "Dashboard"), false)
  assert.equal(haystackMatches("Welcome to your Dashboard", "Dashboard"), true)
  assert.equal(haystackMatches("Dashboard", "Dashboard"), true)
  assert.equal(haystackMatches(marketing, "One Dashboard"), true)
  assert.equal(haystackMatches("Open the Document Editor today", "Document Editor"), true)
  assert.equal(haystackMatches("Checkpoint Projects", "Checkpoint"), true)
  assert.equal(haystackMatches("One office job. Your accounts.", "One office job."), true)
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
  assert.equal(checkUrlSchema.safeParse("http://0.0.0.0/").success, false)
  assert.equal(checkUrlSchema.safeParse("http://127.1/").success, false)
  assert.equal(checkUrlSchema.safeParse("http://169.254.169.254/").success, false)
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
  const recAllowed = auspexCheckInputSchema.safeParse({
    ...base,
    record: true,
    profile: "consistencyhub",
    allowRecordProfile: true,
  })
  assert.equal(recAllowed.success, false)
  const recMarketing = auspexCheckInputSchema.safeParse({
    ...base,
    record: true,
    profile: "demo",
    allowRecordProfile: true,
  })
  assert.equal(recMarketing.success, true)
  const recFill = auspexCheckInputSchema.safeParse({
    url: "https://ironadamant.com",
    expect: "Build it.",
    record: true,
    profile: "demo",
    allowRecordProfile: true,
    fill: "x",
    value: "y",
  })
  assert.equal(recFill.success, false)
  const recFillAllowed = auspexCheckInputSchema.safeParse({
    url: "https://ironadamant.com",
    expect: "Build it.",
    record: true,
    profile: "demo",
    allowRecordProfile: true,
    allowPageActions: true,
    fill: "x",
    value: "y",
  })
  assert.equal(recFillAllowed.success, false)
  const recSso = auspexCheckInputSchema.safeParse({
    ...base,
    record: true,
    sso: true,
  })
  assert.equal(recSso.success, false)
  const recDash = auspexCheckInputSchema.safeParse({
    url: "https://consistencyhub.io/dashboard",
    expect: "Document Editor",
    record: true,
  })
  assert.equal(recDash.success, false)
  const named = auspexCheckInputSchema.safeParse({ name: "ironadamant" })
  assert.equal(named.success, true)
  const neither = auspexCheckInputSchema.safeParse({})
  assert.equal(neither.success, false)
  const recOk = auspexCheckInputSchema.safeParse({
    ...base,
    waitFor: "#main",
    fill: "#q",
    value: "hello",
    click: "button.go",
    proxy: "us",
    captcha: true,
  })
  assert.equal(recOk.success, true)
  const fillOnly = auspexCheckInputSchema.safeParse({ ...base, fill: "#q" })
  assert.equal(fillOnly.success, false)
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
  assert.equal(pw.cookies[0]?.httpOnly, false)
  assert.equal(pw.cookies[0]?.secure, false)
  assert.equal(pw.cookies[0]?.expires, -1)
  assert.deepEqual(pw.origins[0]?.localStorage, [])
  const dropped = toPlaywrightStorageState({ cookies: [{ name: "x", value: "y" }] })
  assert.equal(dropped.cookies.length, 0)
})

test("capitalized nav items on their own lines still match a single-word expect", () => {
  assert.equal(haystackMatches("Home\nDashboard\nSettings", "Dashboard"), true)
  assert.equal(haystackMatches("Projects\n  Checkpoint\nLogout", "Checkpoint"), true)
  assert.equal(haystackMatches("Overview. Dashboard", "Dashboard"), true)
  assert.equal(haystackMatches("Home | Dashboard | Settings", "Dashboard"), true)
  // Same-line capitalized phrase stays refused.
  assert.equal(haystackMatches("Home Dashboard Settings", "Dashboard"), false)
  assert.equal(haystackMatches("10+ Platforms ,\nOne Dashboard", "Dashboard"), false)
  // Multi-word expects still span a line break after whitespace collapse.
  assert.equal(haystackMatches("Document\nEditor", "Document Editor"), true)
})

test("sandbox assert matcher is word-bounded like the live matcher", async () => {
  const { spawnSync } = await import("node:child_process")
  const { ASSERT_RECEIPT_PY_PATH } = await import("../src/receipt.ts")
  const probe = `import importlib.util, sys
spec = importlib.util.spec_from_file_location("a", sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
for hay, needle in [("Your Dashboards", "Dashboard"), ("MyDashboard", "Dashboard"), ("Open the Dashboard now", "Dashboard"), ("One office job. Your", "One office job."), ("job.Your", "job."), ("Document\\nEditor", "Document Editor")]:
    print(m.haystack_matches(hay, needle))`
  const ran = spawnSync("python3", ["-c", probe, ASSERT_RECEIPT_PY_PATH], { encoding: "utf8" })
  if (ran.error) return
  assert.equal(ran.status, 0, ran.stderr)
  const cases: Array<[string, string]> = [
    ["Your Dashboards", "Dashboard"],
    ["MyDashboard", "Dashboard"],
    ["Open the Dashboard now", "Dashboard"],
    ["One office job. Your", "One office job."],
    ["job.Your", "job."],
    ["Document\nEditor", "Document Editor"],
  ]
  // Same answers as the live TS matcher on these cases (no title-case guard needed here).
  const expected = cases.map(([hay, needle]) => (haystackMatches(hay, needle) ? "True" : "False"))
  assert.deepEqual(expected, ["False", "False", "True", "True", "False", "True"])
  assert.deepEqual(ran.stdout.trim().split("\n"), expected)
})

test("a late client-side redirect during extraction settles and reads once more", async () => {
  const { extractPageSettled, isNavigationRace } = await import("../src/check.ts")
  let reads = 0
  let settled = 0
  const out = await extractPageSettled(
    async () => {
      reads += 1
      if (reads === 1) throw new Error("page.evaluate: Execution context was destroyed, most likely because of a navigation.")
      return "second read"
    },
    async () => {
      settled += 1
    },
  )
  assert.equal(out, "second read")
  assert.equal(reads, 2)
  assert.equal(settled, 1)
  await assert.rejects(extractPageSettled(async () => { throw new Error("boom") }, async () => undefined), /boom/)
  assert.equal(isNavigationRace(new Error("Timeout 45000ms exceeded")), false)
})

test("receipt excerpts mask key-shaped strings but keep ordinary page text", async () => {
  const { maskSecrets, prepareCheckExcerpt } = await import("../src/text.ts")
  const fakeClientKey = "Zq7Xk2Pw9Lm4Rt8Vb3Nc6Hd1Fg5Js0Ya2Ue7Wi4O"
  const page = `Overview Keys: Client Key ${fakeClientKey} Connect App Parse Server Version: 7.5.2 Database: MongoDB 3.6`
  const out = prepareCheckExcerpt({ raw: page })
  assert.equal(out.includes(fakeClientKey), false)
  assert.match(out, /Client Key \[redacted-token\] Connect App/)
  assert.match(out, /Parse Server Version: 7\.5\.2 Database: MongoDB 3\.6/)
  assert.equal(maskSecrets("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456"), "token [redacted-jwt]")
  assert.equal(maskSecrets("key sk-proj-abcdefghijklmnop1234"), "key [redacted-key]")
  assert.equal(maskSecrets("slr_live_ABCDEFGHIJKLMNOP1234"), "[redacted-key]")
  const ordinary = "Your Bookings You are not associated with any center. Clozemaster 1 Day streak, 96 to level 1."
  assert.equal(maskSecrets(ordinary), ordinary)
  // A key straddling the 500-character cut is still masked (mask runs before truncation).
  const long = `${"word ".repeat(96)}${fakeClientKey}`
  assert.equal(prepareCheckExcerpt({ raw: long }).includes(fakeClientKey.slice(0, 10)), false)
})

test("check URL guard blocks cloud metadata by name and AWS IPv6, not ordinary hosts", async () => {
  const { isCheckUrl } = await import("../src/http-url.ts")
  for (const url of ["http://169.254.169.254/latest", "http://metadata.google.internal/computeMetadata/v1/", "http://[fd00:ec2::254]/", "http://localhost:3000"]) {
    assert.equal(isCheckUrl(url), false, url)
  }
  assert.equal(isCheckUrl("https://example.com/metadata"), true)
})

test("excerpt prefers the main region when it has real content", async () => {
  const { excerptRegion } = await import("../src/check.ts")
  const whole = "Menu Promo Faster macros Read more Dismiss Main text of the page here that matters a lot"
  assert.equal(excerptRegion(whole, "Main text of the page here that matters a lot to the reader"), "Main text of the page here that matters a lot to the reader")
  assert.equal(excerptRegion(whole, "tiny"), whole)
  assert.equal(excerptRegion(whole, ""), whole)
})

test("landedOnForbiddenHost flags a redirect to loopback, link-local or metadata", async () => {
  const { landedOnForbiddenHost } = await import("../src/http-url.ts")
  assert.equal(landedOnForbiddenHost("http://169.254.169.254/latest/meta-data/"), true)
  assert.equal(landedOnForbiddenHost("http://metadata.google.internal/"), true)
  assert.equal(landedOnForbiddenHost("http://localhost:3000/"), true)
  assert.equal(landedOnForbiddenHost("https://example.com/"), false)
  assert.equal(landedOnForbiddenHost("about:blank"), false)
  assert.equal(landedOnForbiddenHost(""), false)
  // check.ts blanks the page and keeps no text on such a landing.
  const { readFileSync } = await import("node:fs")
  const src = readFileSync(new URL("../src/check.ts", import.meta.url), "utf8")
  assert.match(src, /const landedAt = finalUrl \|\| page\.url\(\)/)
  assert.match(src, /landedOnForbiddenHost\(landedAt\)/)
  assert.match(src, /page\.goto\("about:blank"/)
  assert.match(src, /!needsHuman && !forbiddenLanding\) \{/)
})

test("installInfo names the install, its state folder and its command, never the account", async () => {
  const { installInfo } = await import("../src/paths.ts")
  const clone = installInfo({}, "/Users/someone/code/auspex/examples/auspex-ts", "/Users/someone")
  assert.equal(clone.install, "clone")
  assert.equal(clone.command, "npx auspex")
  const npm = installInfo({}, "/Users/someone/.npm/_npx/abc/node_modules/auspex-solari/examples/auspex-ts", "/Users/someone")
  assert.equal(npm.install, "npm")
  assert.equal(npm.command, "npx auspex-solari")
  assert.equal(installInfo({ AUSPEX_HOME: "/tmp/x" }, "/any").install, "AUSPEX_HOME")
  assert.equal(clone.stateDir, "~/code/auspex/examples/auspex-ts/.auspex")
  assert.equal(npm.stateDir, "~/.auspex")
  for (const info of [clone, npm]) assert.equal(info.stateDir.includes("someone"), false, info.stateDir)
})

test("receipt excerpts do not keep the account's email; matching still sees it", async () => {
  const { prepareCheckExcerpt, haystackMatches, maskSecrets } = await import("../src/text.ts")
  const page = "adamant_test adamant_test@outlook.com Vídeos Settings Your Bookings"
  const excerpt = prepareCheckExcerpt({ raw: page })
  assert.equal(excerpt.includes("@outlook.com"), false)
  assert.match(excerpt, /\[redacted-email\] Vídeos Settings Your Bookings/)
  assert.equal(haystackMatches(page, "adamant_test@outlook.com"), true)
  assert.equal(maskSecrets("Contact support at help@lorari.com today"), "Contact support at [redacted-email] today")
})
