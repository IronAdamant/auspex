import assert from "node:assert/strict"
import test from "node:test"
import { haystackMatches } from "../src/text.ts"
import { checkUrlSchema, httpUrlSchema } from "../src/http-url.ts"
import { auspexCheckInputSchema } from "../src/tool-schema.ts"
import { toPlaywrightStorageState } from "../src/solari.ts"

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

