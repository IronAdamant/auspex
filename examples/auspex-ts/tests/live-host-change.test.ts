import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { toAgentReceipt } from "../src/agent-receipt.ts"
import { deriveCheckReason } from "../src/check-reason.ts"
import type { CheckResult } from "../src/check.ts"
import {
  LIVE_HOST_CHANGED_MARK,
  adviseLiveHostChange,
  decideLiveHostPersist,
  doorSaveSiteUrl,
  httpsPageUrlFromRecord,
  noteProfileHostChanged,
} from "../src/live-host-change.ts"
import { waitForProfileSave } from "../src/profile-persist.ts"
import { loadEditorSave, persistEditorSave } from "../src/profiles.ts"
import { parseReceiptV1, SCHEMA_VERSION } from "../src/receipt-schema.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "../../..")

const SECRET = "s3cret-password-value"

function switched() {
  return adviseLiveHostChange({
    profile: "myapp-example",
    mintUrl: "https://myapp.example",
    pageUrl: "https://app.socialaize.com/home",
    state: {
      origins: [{ origin: "https://app.socialaize.com", localStorage: [{ name: "token" }] }],
      cookies: [{ domain: ".app.socialaize.com", name: "sid" }],
    },
  })
}

test("live host different from mint fails closed with a remint nextCall", () => {
  const change = switched()
  assert.ok(change)
  assert.equal(change.hostChanged, true)
  assert.equal(change.profileHostMatch, false)
  assert.equal(change.suggestedProfile, "app-socialaize-com")
  assert.equal(change.suggestedUrl, "https://app.socialaize.com")
  assert.equal(change.nextCall.tool, "auspex_login")
  assert.equal(change.nextCall.profile, "app-socialaize-com")
  assert.equal(change.nextCall.url, "https://app.socialaize.com")
  assert.equal(change.nextLead.startsWith(LIVE_HOST_CHANGED_MARK), true)
  assert.match(change.nextLead, /Do not finalize-login/)
  assert.match(change.nextLead, /Do not rename or migrate/)
  assert.equal(/soft advise/i.test(change.nextLead), false)
  assert.equal(JSON.stringify(change).includes(SECRET), false)
})

test("same host, www, saved-check subdomain, IdP, and CDN cookies are not a change", () => {
  assert.equal(
    adviseLiveHostChange({
      profile: "myapp-example",
      mintUrl: "https://myapp.example",
      pageUrl: "https://www.myapp.example/dashboard",
    }),
    undefined,
  )
  assert.equal(
    adviseLiveHostChange({
      profile: "myapp-example",
      mintUrl: "https://myapp.example",
      pageUrl: "https://login.microsoftonline.com/common",
      state: {
        cookies: [{ domain: "login.microsoftonline.com", name: "ESTSAUTH" }],
        origins: [{ origin: "https://myapp.example", localStorage: [{ name: "accessToken" }] }],
      },
    }),
    undefined,
  )
  assert.equal(
    adviseLiveHostChange({
      profile: "consistencyhub",
      mintUrl: "https://consistencyhub.io",
      pageUrl: "https://app.consistencyhub.io/docs",
    }),
    undefined,
  )
  assert.equal(
    adviseLiveHostChange({
      profile: "myapp-example",
      mintUrl: "https://myapp.example",
      pageUrl: "https://myapp.example/app",
      state: {
        cookies: [
          { domain: "cdn.myapp.example", name: "a" },
          { domain: "cdn.myapp.example", name: "b" },
        ],
      },
    }),
    undefined,
  )
})

test("storage origin wins when the page URL is still the minted host", () => {
  const change = adviseLiveHostChange({
    profile: "myapp-example",
    mintUrl: "https://myapp.example",
    pageUrl: "https://myapp.example/dashboard",
    state: {
      origins: [{ origin: "https://app.socialaize.com", localStorage: [{ name: "k" }] }],
    },
  })
  assert.equal(change?.suggestedUrl, "https://app.socialaize.com")
  assert.equal(change?.suggestedProfile, "app-socialaize-com")
})

test("profile ownership and missing mint stay honest", () => {
  assert.equal(
    adviseLiveHostChange({
      profile: "app-socialaize-com",
      mintUrl: "https://myapp.example",
      pageUrl: "https://app.socialaize.com/home",
    }),
    undefined,
  )
  assert.equal(
    adviseLiveHostChange({
      profile: "work",
      mintUrl: "https://myapp.example",
      pageUrl: "https://myapp.example/home",
    }),
    undefined,
  )
  const custom = adviseLiveHostChange({
    profile: "work",
    mintUrl: "https://myapp.example",
    pageUrl: "https://app.socialaize.com/home",
  })
  assert.equal(custom?.suggestedProfile, "app-socialaize-com")
  assert.equal(
    adviseLiveHostChange({
      profile: "consistencyhub",
      pageUrl: "https://app.socialaize.com/home",
    })?.hostChanged,
    true,
  )
  assert.equal(
    adviseLiveHostChange({
      profile: "work",
      pageUrl: "https://app.socialaize.com/home",
    }),
    undefined,
  )
})

test("ordinary second-host check is left alone; save and a marker fail closed", () => {
  const onedrive = {
    profile: "consistencyhub",
    mintUrl: "https://consistencyhub.io",
    pageUrl: "https://onedrive.live.com/",
  }
  assert.equal(decideLiveHostPersist({ ...onedrive, enforceDetect: false }), undefined)
  assert.equal(decideLiveHostPersist({ ...onedrive, enforceDetect: true })?.suggestedProfile, "onedrive-live-com")
  const marked = decideLiveHostPersist({
    profile: "myapp-example",
    mintUrl: "https://myapp.example",
    pageUrl: "https://myapp.example/home",
    marker: { suggestedProfile: "app-socialaize-com", suggestedUrl: "https://app.socialaize.com" },
    enforceDetect: false,
  })
  assert.equal(marked?.hostChanged, true)
  assert.equal(marked?.nextCall.url, "https://app.socialaize.com")
})

test("door site URL prefers a live https origin and ignores the password field", () => {
  assert.equal(
    doorSaveSiteUrl("https://app.socialaize.com/a?x=1", "https://myapp.example/b", "https://evil.example/secret"),
    "https://app.socialaize.com",
  )
  assert.equal(
    doorSaveSiteUrl("http://insecure.example", "https://myapp.example/dashboard", "https://typed.example"),
    "https://myapp.example",
  )
  assert.equal(doorSaveSiteUrl("https://user:pass@app.socialaize.com/a", "https://myapp.example"), "https://myapp.example")
  assert.equal(httpsPageUrlFromRecord({ url: "https://app.socialaize.com" }), undefined)
  assert.equal(httpsPageUrlFromRecord({ pageUrl: "https://login.microsoftonline.com/common" }), undefined)
  assert.equal(httpsPageUrlFromRecord({ pageUrl: "https://app.socialaize.com/path?q=1" }), "https://app.socialaize.com")
})

test("door pages do not use the IME as a site picker", () => {
  const page = readFileSync(path.join(repoRoot, "docs", "door-page.js"), "utf8")
  assert.match(page, /cannot read the remote address bar/)
  assert.match(page, /not a site picker/)
  assert.match(page, /doorSiteUrl\(liveSiteUrl\(\), params\.get\("u"\)\)/)
  assert.equal(page.includes('doorSiteUrl(liveSiteUrl(), params.get("u"),'), false)
  const context: Record<string, unknown> = {}
  context.window = context
  vm.runInNewContext(page, context, { filename: "door-page.js" })
  const api = context.AuspexDoorPage as {
    liveSiteUrl: () => string
    httpsSite: (value: string) => string
    doorSiteUrl: (live?: string, minted?: string, typed?: string) => string
  }
  assert.equal(api.liveSiteUrl(), "")
  assert.equal(api.httpsSite("https://app.socialaize.com/path?q=1"), "https://app.socialaize.com")
  assert.equal(api.httpsSite("http://insecure.example"), "")
  assert.equal(
    api.doorSiteUrl("https://app.socialaize.com/a", "https://myapp.example/b", "https://evil.example"),
    "https://app.socialaize.com",
  )
  assert.equal(
    api.doorSiteUrl("", "https://myapp.example/dashboard", "https://typed.example/login"),
    "https://myapp.example",
  )
  assert.equal(api.doorSiteUrl("http://insecure.example", "https://myapp.example", "https://typed.example"), "https://myapp.example")
  for (const file of ["phone.html"]) {
    const html = readFileSync(path.join(repoRoot, "docs", file), "utf8")
    assert.match(html, /door-page\.js/, `${file} loads the shared door script`)
    assert.equal(html.includes('doorSiteUrl(liveSiteUrl(), params.get("u"),'), false, file)
  }
})

function awaitDeps(liveHost: string) {
  return {
    now: () => 10_000,
    sleep: async () => undefined,
    list: async () => [{ id: "p1", name: "myapp-example", version: 2 }],
    inspect: async () => ({ cookies: 2, origins: 1, sessionStorage: 2, liveHost }),
  }
}

test("await-login host change remints and does not tell the agent to finalize the old profile", async () => {
  const changed = await waitForProfileSave("myapp-example", {
    sinceVersion: 1,
    timeoutMs: 5_000,
    url: "https://myapp.example",
    deps: awaitDeps("app.socialaize.com"),
  })
  assert.equal(changed.status, "host-changed")
  assert.equal(changed.hostChanged, true)
  assert.equal(changed.profileHostMatch, false)
  assert.equal(changed.nextCall?.tool, "auspex_login")
  assert.equal(changed.nextCall?.url, "https://app.socialaize.com")
  assert.equal(changed.next.startsWith(LIVE_HOST_CHANGED_MARK), true)
  assert.equal(/soft advise/i.test(changed.next), false)
  const same = await waitForProfileSave("myapp-example", {
    sinceVersion: 1,
    timeoutMs: 5_000,
    url: "https://myapp.example",
    deps: awaitDeps("www.myapp.example"),
  })
  assert.equal(same.status, "completed")
  assert.equal(same.hostChanged, undefined)
  assert.match(same.next, /finalize-login/)
})

test("host-changed marker roundtrip clears on the next login write", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "auspex-host-"))
  try {
    await persistEditorSave(
      { profileId: "p", name: "myapp-example", handoffToken: "hand", siteUrl: "https://myapp.example" },
      root,
    )
    const change = switched()
    assert.ok(change)
    await noteProfileHostChanged("myapp-example", change, root)
    const marked = await loadEditorSave("myapp-example", root)
    assert.equal(marked?.hostChanged, true)
    assert.equal(marked?.suggestedProfile, "app-socialaize-com")
    assert.equal(marked?.suggestedUrl, "https://app.socialaize.com")
    await persistEditorSave(
      {
        profileId: "p",
        name: "myapp-example",
        handoffToken: "hand",
        siteUrl: "https://myapp.example",
        hostChanged: true,
        suggestedUrl: "javascript:alert(1)",
        suggestedProfile: "nope",
      },
      root,
    )
    assert.equal((await loadEditorSave("myapp-example", root))?.hostChanged, undefined)
    await persistEditorSave(
      { profileId: "p", name: "myapp-example", handoffToken: "hand", siteUrl: "https://app.socialaize.com" },
      root,
    )
    const cleared = await loadEditorSave("myapp-example", root)
    assert.equal(cleared?.hostChanged, undefined)
    assert.equal(cleared?.siteUrl, "https://app.socialaize.com")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("receipt refuses claimOkProfile when the live host changed", () => {
  const check: CheckResult = {
    ok: true,
    protocolOk: true,
    reason: "hostChanged",
    hostChanged: true,
    profileHostMatch: false,
    suggestedProfile: "app-socialaize-com",
    suggestedUrl: "https://app.socialaize.com",
    url: "https://myapp.example",
    expect: "Workspace ready",
    screenshotPath: ".auspex/runs/x/screenshot.png",
    title: "App",
    finalUrl: "https://app.socialaize.com/",
    matched: false,
    excerpt: "switched",
    sessionId: "sess",
    networkIdle: true,
    next: `${LIVE_HOST_CHANGED_MARK} remint`,
    nextCall: { tool: "auspex_login", profile: "app-socialaize-com", url: "https://app.socialaize.com" },
  }
  const receipt = toAgentReceipt(check, {
    verify: {
      ok: true,
      errors: [],
      claimOk: false,
      claimErrors: [],
      claimOkProfile: true,
      runDir: ".auspex/runs/x",
      skipped: true,
      skipReason: "hostChanged",
    },
  })
  assert.equal(receipt.ok, false)
  assert.equal(receipt.reason, "hostChanged")
  assert.equal(receipt.hostChanged, true)
  assert.equal(receipt.verify?.claimOkProfile, false)
  assert.equal(/finalize-login while the token is live/.test(receipt.next ?? ""), false)
  assert.equal(
    deriveCheckReason({
      special: "hostChanged",
      needsHuman: true,
      matched: true,
      networkIdle: true,
      finalUrl: "https://app.socialaize.com/",
      excerpt: "x",
      screenshotOk: true,
    }),
    "hostChanged",
  )
  const parsed = parseReceiptV1({
    schemaVersion: SCHEMA_VERSION,
    ok: false,
    reason: "hostChanged",
    url: "https://myapp.example",
    expect: "Workspace ready",
    screenshotPath: "a.png",
    hostChanged: true,
    suggestedUrl: "https://app.socialaize.com",
  })
  assert.equal(parsed.hostChanged, true)
  assert.throws(
    () =>
      parseReceiptV1({
        schemaVersion: SCHEMA_VERSION,
        ok: false,
        reason: "hostChanged",
        url: "https://myapp.example",
        expect: "Workspace ready",
        screenshotPath: "a.png",
        hostChanged: "false",
      }),
    /hostChanged/,
  )
})

test("check, cli, and mcp keep the live-host refuse in front of soft host advice", () => {
  const src = (rel: string) => readFileSync(path.join(here, "..", rel), "utf8")
  const check = src("src/check.ts")
  assert.match(check, /decideLiveHostPersist/)
  assert.match(check, /if \(result\.hostChanged\) return result/)
  assert.match(src("src/cli.ts"), /runLoginDoor|runAwaitLoginDoor/)
  assert.match(src("src/runners.ts"), /preserveAwaitLiveHost/)
  const persist = src("src/profile-persist.ts")
  assert.match(persist, /persist-blocked/)
  assert.match(persist, /import type \{ LiveHostChange \}/)
  assert.equal(/import \{[^}]*\} from "\.\/live-host-change\.ts"/.test(persist), false)
})
