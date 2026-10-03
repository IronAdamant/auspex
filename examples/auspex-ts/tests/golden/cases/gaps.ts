// Branches no other test reached (found by mutation testing, round 2). One input per branch; the
// recorded outputs live in ../out/gaps.json.
import type { GoldenCases } from "../harness.ts"
import { parseArgv } from "../../../src/cli.ts"
import { isConsistencyHubTarget, isWeakSeed } from "../../../src/cookie-save.ts"
import { isCheckUrl, landedOnForbiddenHost } from "../../../src/http-url.ts"
import { parseJobFlags } from "../../../src/job-cli.ts"
import { preserveAwaitLiveHost, selectLiveHost } from "../../../src/live-host-change.ts"
import { nextCallFor } from "../../../src/next-call.ts"
import { parseFoldedExpiresOnMs } from "../../../src/profile-storage.ts"
import { receiptUrlKey } from "../../../src/receipt-diff.ts"
import { redactRrwebEvents } from "../../../src/replay-redact.ts"
import { parseSavedChecksYaml } from "../../../src/saved-checks.ts"
import { scrubUrlString } from "../../../src/scrub.ts"
import { describeAuthWall } from "../../../src/sso.ts"
import { classifySweepReceipt } from "../../../src/sweep.ts"
import { haystackMatches } from "../../../src/text.ts"
import { assertRecordProfileAllowed, isDashboardLandingUrl } from "../../../src/tool-schema.ts"
import { refuseVerifyWithProfile } from "../../../src/vwp-refuse.ts"
import { healthReceiptFromError } from "../../../src/solari-health.ts"
import { SolariError } from "@solarisdk/browser"
import { buildCheckToolContent } from "../../../src/content.ts"

const page = { name: "home", url: "https://app.example/", expect: "Workspace ready" }
const receipt = (over: Record<string, unknown>) =>
  ({ schemaVersion: 1, ok: true, reason: "matched", url: page.url, expect: page.expect, screenshotPath: "", ...over }) as never

export const cases: GoldenCases = {
  "sweep: matched but the second check failed is not a pass": () =>
    classifySweepReceipt(page, receipt({ ok: false, verify: { ok: false, claimOk: false, errors: ["claim"], claimErrors: [] } }), false),
  "sweep: matched and ok, no saved login": () => classifySweepReceipt(page, receipt({}), false),
  "record guard: allowRecordProfile alone, no record": () =>
    assertRecordProfileAllowed({ url: "https://app.example.com/home", allowRecordProfile: true }),
  "dashboard landing: a page under /dashboard/": () => isDashboardLandingUrl("https://consistencyhub.io/dashboard/home"),
  "vwp refuse: cookies but no origins": () =>
    refuseVerifyWithProfile({ profile: "app-example", url: "https://app.example", seed: { cookies: 3, origins: 0 } })?.kind ?? "runs",
  "vwp refuse: origins but no cookies": () =>
    refuseVerifyWithProfile({ profile: "app-example", url: "https://app.example", seed: { cookies: 0, origins: 2 } })?.kind ?? "runs",
  "scrub: a URL with a username only": () => scrubUrlString("https://user@example.com/x"),
  "scrub: a URL with a password only": () => scrubUrlString("https://:secret@example.com/x"),
  // A dotless host is not email-shaped, so the userinfo branch (not the email redactor) does the work.
  "scrub: userinfo on a dotless host": () => [scrubUrlString("https://user@intranet/x"), scrubUrlString("https://:pw@intranet/x")],
  "scrub: a URL with nothing to scrub": () => scrubUrlString("https://example.com"),
  "url guard: unspecified IPv6": () => [isCheckUrl("http://[::]/"), isCheckUrl("http://[0:0:0:0:0:0:0:0]/")],
  "landed on: non-http pages are not a forbidden host": () => [landedOnForbiddenHost("about:blank"), landedOnForbiddenHost("chrome-error://chromewebdata/"), landedOnForbiddenHost("not a url")],
  "landed on: unspecified and link-local IPv6": () => [landedOnForbiddenHost("http://[::]/x"), landedOnForbiddenHost("http://[fe80::1]/")],
  "auth wall: an unparseable URL": () => describeAuthWall({ url: "not a url" }),
  "weak seed: an empty consistencyhub jar": () =>
    isWeakSeed({ profile: "consistencyhub", url: "https://consistencyhub.io", cookies: 0, origins: 0, sessionStorage: 0 }),
  "consistencyhub target by URL": () => [isConsistencyHubTarget({ url: "https://consistencyhub.io/x" }), isConsistencyHubTarget({ url: "" })],
  "check: --profile followed by a flag": () => parseArgv(["check", "https://ironadamant.com", "--expect", "x", "--profile", "--sso"]),
  "next call: await retry and save-editor keep the profile": () => [
    nextCallFor("await-retry", { profile: "app-example" }),
    nextCallFor("await-save-editor", { profile: "app-example" }),
    nextCallFor("await-retry"),
  ],
  "match: a one-letter capitalised word before the expect": () => [haystackMatches("A Dashboard", "Dashboard"), haystackMatches("a Dashboard", "Dashboard")],
  "folded expiresOn: zero and negative": () => [parseFoldedExpiresOnMs("0"), parseFoldedExpiresOnMs("-5"), parseFoldedExpiresOnMs("1")],
  "job flags: a non-http URL": () => parseJobFlags(["--url", "ftp://x.example", "--expect", "y"]),
  "receipt key: empty url falls back to finalUrl": () => receiptUrlKey({ url: "", finalUrl: "https://a.example/x" }),
  "replay: text on a non-input source is kept": () =>
    redactRrwebEvents([{ type: 3, data: { source: 2, text: "keep me" } }, { type: 3, data: { source: 5, text: "secret" } }]),
  "replay: a changed attribute that is not href or src": () =>
    redactRrwebEvents([
      { type: 3, data: { source: 0, attributes: [{ id: 1, attributes: { title: "https://x.example/cb?state=abc", href: "https://x.example/cb?state=abc" } }] } },
    ]),
  "saved checks: an unknown key line": () => parseSavedChecksYaml("checks:\n  site:\n    url: https://a.example\n    expect: Hi\n    colour: blue\n"),
  "saved checks: url, expect and profile lines": () =>
    parseSavedChecksYaml("checks:\n  site:\n    url: https://a.example\n    expect: Hi\n    profile: site\n"),
  "live host: page host with and without a mint URL": () => [
    selectLiveHost({ pageUrl: "https://app.example/home", mintUrl: "https://app.example" }),
    selectLiveHost({ pageUrl: "https://other.example/home" }),
    // Two hosts with the same storage: the tie goes to the host that is not the minted one (the
    // signal for a host change), not to alphabetical order.
    selectLiveHost({
      mintUrl: "https://a.example",
      state: {
        origins: [
          { origin: "https://b.example", localStorage: [{ name: "k", value: "v" }] },
          { origin: "https://a.example", localStorage: [{ name: "k", value: "v" }] },
        ],
      } as never,
    }),
  ],
  "await host: a stamped result keeps the host change": () => [
    preserveAwaitLiveHost({ status: "completed" } as never, { status: "host-changed", hostChanged: true, suggestedUrl: "https://b.example" } as never),
    preserveAwaitLiveHost({ status: "completed" } as never, { status: "completed" } as never),
  ],
  // A password or OTP wall never goes back to the agent as a picture, whichever field says so.
  "mcp image: needsHuman by reason or by flag omits the screenshot": async () =>
    (
      await Promise.all([
        buildCheckToolContent({ screenshotPath: "demo/ironadamant.png", reason: "needsHuman" }),
        buildCheckToolContent({ screenshotPath: "demo/ironadamant.png", reason: "mismatch", needsHuman: true }),
      ])
    ).map((r) => r.content.map((c) => c.type)),
  "health: Solari 599 is infra": () => healthReceiptFromError(new SolariError("edge", 599), 5),
}
