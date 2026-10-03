import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { excerptOf, expectSchema, haystackMatches, normalizeHaystack } from "../src/text.ts"
import { checkUrlSchema, httpUrlSchema, isHttpOrHttpsUrl } from "../src/http-url.ts"
import { auspexCheckInputSchema, auspexLoginInputSchema } from "../src/tool-schema.ts"
import { toReceiptPath, packageRoot } from "../src/check.ts"
import { findProfileId, toPlaywrightStorageState } from "../src/solari.ts"

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

test("a late client-side redirect during extraction settles and reads again, a bounded number of times", async () => {
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
  // Two redirects in a row (MariaDB's Billing page): a third read still lands.
  let twice = 0
  const third = await extractPageSettled(
    async () => {
      twice += 1
      if (twice < 3) throw new Error("page.evaluate: Execution context was destroyed, most likely because of a navigation.")
      return "third read"
    },
    async () => undefined,
  )
  assert.equal(third, "third read")
  // A page that never stops navigating still fails, after a bounded number of reads.
  let endless = 0
  await assert.rejects(
    extractPageSettled(
      async () => {
        endless += 1
        throw new Error("Execution context was destroyed")
      },
      async () => undefined,
    ),
    /Execution context was destroyed/,
  )
  assert.equal(endless, 3)
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

test("after a click the excerpt is the open dialog; without a click a dialog (cookie banner) does not take over", async () => {
  const { excerptRegion } = await import("../src/check.ts")
  const whole = "Sidebar Upload here Choose your plan Pro €16 Business Custom"
  const main = "You have 3 tapes available. Upgrade Upload here Transcribe now"
  const dialog = "Choose your plan Built for professionals Pro €16 Business Custom"
  assert.equal(excerptRegion(whole, main, dialog, true), dialog)
  assert.equal(excerptRegion(whole, main, dialog, false), main)
  assert.equal(excerptRegion(whole, main, "OK", true), main, "a tiny dialog does not replace the page")
  assert.equal(excerptRegion(whole, "", "", true), whole)
})

test("the live check re-reads for the expect with the second browser's budget before calling a miss", async () => {
  const { LIVE_EXPECT_SETTLE_MS, LIVE_EXPECT_EMPTY_EXTRA_MS, liveExpectBudgetMs } = await import("../src/check.ts")
  const { PROFILE_CLAIM_SETTLE_MS, PROFILE_CLAIM_RETRY_MS } = await import("../src/sandbox.ts")
  assert.equal(LIVE_EXPECT_SETTLE_MS, PROFILE_CLAIM_SETTLE_MS, "the two browsers wait for the words equally long")
  assert.equal(LIVE_EXPECT_EMPTY_EXTRA_MS, PROFILE_CLAIM_RETRY_MS)
  assert.equal(liveExpectBudgetMs("tldraw - free and instant collaborative whiteboarding My workspace Search..."), 2_000)
  assert.equal(liveExpectBudgetMs("Loading…"), 5_000)
  assert.equal(liveExpectBudgetMs(""), 5_000)
  const { readFileSync } = await import("node:fs")
  const src = readFileSync(new URL("../src/check.ts", import.meta.url), "utf8")
  const loop = src.indexOf("const cap = liveExpectBudgetMs(extracted.raw)")
  assert.ok(loop > 0 && loop < src.indexOf("title = extracted.title"), "the re-read runs before the receipt fields are set")
  assert.match(src.slice(loop, loop + 600), /extracted = await readPage\(\)/)
})

test("after a click the excerpt is an overlay the click opened, not a cookie banner that was already there", async () => {
  // Live, Trello: after clicking Templates, the excerpt was Atlassian's cookie banner, open before the
  // click and still open on the new page.
  const { overlayOpenedByClick, excerptRegion } = await import("../src/check.ts")
  const banner = "Atlassian uses cookies to improve your browsing experience… Accept all"
  assert.equal(overlayOpenedByClick([banner], [banner]), "")
  assert.equal(overlayOpenedByClick([banner, "Manage workspace Name Invite teammates"], [banner]), "Manage workspace Name Invite teammates")
  assert.equal(overlayOpenedByClick(["Notifications You’re all caught up."], []), "Notifications You’re all caught up.")
  const main = "Templates Most popular templates Business Design Education Engineering Marketing"
  assert.equal(excerptRegion(`${banner} ${main}`, main, overlayOpenedByClick([banner], [banner]), true), main)
  const { readFileSync } = await import("node:fs")
  const src = readFileSync(new URL("../src/check.ts", import.meta.url), "utf8")
  const snapshot = src.indexOf("const before = await extractPage(page, opts.selector, signal)")
  assert.ok(snapshot > 0 && snapshot < src.indexOf("const actions = await runPageActions(page, opts, signal)"), "snapshot before the click")
})

test("the excerpt drops a cookie-consent banner so its 500 characters show the page", async () => {
  // Live, Trello: Atlassian's banner took 290 of 500 characters, and the new card fell off the end.
  const { withoutConsentBanners } = await import("../src/check.ts")
  const banner =
    "Atlassian uses cookies to improve your browsing experience, perform analytics and research, and conduct advertising. Accept all cookies to indicate that you agree to our use of cookies on your device. Atlassian cookies and tracking notice , (opens new window) Preferences Only necessary Accept all"
  const page = `Skip to: Board Board switcher Create 14 days left ${banner.replaceAll(". ", ".\n")} My Trello board Share Today 2 Start using Trello Auspex test card`
  const out = withoutConsentBanners(page, [banner])
  assert.equal(out.includes("Atlassian uses cookies"), false)
  assert.match(out, /My Trello board Share Today 2 Start using Trello Auspex test card$/)
  assert.equal(withoutConsentBanners("Short page", ["tiny"]), "Short page", "a tiny match is never cut")
  const { readFileSync } = await import("node:fs")
  const src = readFileSync(new URL("../src/check.ts", import.meta.url), "utf8")
  assert.match(src, /\.filter\(\(node\) => !node\.closest\('main, \[role="main"\]'\)\)/, "a cookie policy page's own <main> is never cut")
  assert.match(src, /if \(excerptSource !== opened\) excerptSource = withoutConsentBanners/)
})

test("after a click with no marked dialog, the excerpt is the text that appeared since the click", async () => {
  // Live, Trello: clicking a card opened its window (not role=dialog), and the excerpt was the board.
  const { textAppearedSince, excerptRegion, pageLines } = await import("../src/check.ts")
  const board = "Create\nMy Trello board\nToday\nStart using Trello\nAuspex test card\nAdd a card"
  const withCard = `${board}\nToday\nAuspex test card\nAdd\nLabels\nDescription\nMade by an AI agent through Auspex\nComments and activity\nAron added this card to Today`
  const appeared = textAppearedSince(withCard, pageLines(board))
  assert.equal(appeared, "Add\nLabels\nDescription\nMade by an AI agent through Auspex\nComments and activity\nAron added this card to Today")
  assert.equal(excerptRegion(withCard, "", "", true, appeared), appeared)
  // A marked dialog the click opened still wins; no click, or too little new text, keeps the page.
  assert.equal(excerptRegion(withCard, "", "Choose your plan Pro Business Custom", true, appeared), "Choose your plan Pro Business Custom")
  assert.equal(excerptRegion(withCard, "", "", false, appeared), withCard)
  assert.equal(excerptRegion(withCard, "", "", true, "5 minutes ago"), withCard)
  assert.equal(textAppearedSince(withCard, []), "", "no snapshot means no claim about what appeared")
})

test("after a click the check waits, bounded, for the page to stop changing before it reads", async () => {
  const { POST_CLICK_QUIET_MS, POST_CLICK_QUIET_TIMEOUT_MS } = await import("../src/check.ts")
  assert.equal(POST_CLICK_QUIET_MS, 500)
  assert.ok(POST_CLICK_QUIET_TIMEOUT_MS <= 3_000, "a page that never goes quiet costs at most 3 s")
  const { readFileSync } = await import("node:fs")
  const src = readFileSync(new URL("../src/check.ts", import.meta.url), "utf8")
  const idle = src.indexOf('await page.waitForLoadState("networkidle", { timeout: NETWORKIDLE_TIMEOUT_MS, signal })')
  const quiet = src.indexOf("evaluate(waitForSurfaceQuiet, { selector: \"body\"")
  const read = src.indexOf("let extracted = await readPage()")
  assert.ok(idle > 0 && quiet > idle && read > quiet, "network idle, then quiet, then read")
})
