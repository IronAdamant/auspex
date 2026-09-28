import assert from "node:assert/strict"
import test from "node:test"
import { steerAwaitLogin, type AwaitSteerSeed } from "../src/await-steer.ts"

function seed(over: Partial<AwaitSteerSeed> = {}): AwaitSteerSeed {
  return {
    status: "waiting",
    name: "app-example",
    next: "still waiting",
    cookies: 3,
    origins: 1,
    cookieHosts: ["app.example"],
    sessionStorage: 0,
    ...over,
  }
}

const foldSave = { ok: true, status: 200 }
const foldMiss = { ok: false, reason: "no-cdp" as const }

test("steer order is host patch, cookie Save, finalize, fail-closed, empty jar, IdP-only, then overlay", () => {
  const patched = steerAwaitLogin({
    patch: { next: "remint the live host", nextCall: { tool: "auspex_login", profile: "app-socialaize-com" } },
    steered: seed({ status: "host-changed" }),
    editorSave: foldSave,
    editorFold: foldMiss,
    streamExpired: true,
    editorHung: true,
    profileBusy: true,
    siteHost: "app.example",
    guideUrl: "https://app.example",
    guideExpect: "Workspace ready",
  })
  assert.equal(patched.foldLead, undefined)
  assert.equal(patched.failClosed, undefined)
  assert.equal(patched.guided.nextCall?.tool, "auspex_login")
  assert.match(patched.guided.text, /remint the live host/)

  const drainedTracker = steerAwaitLogin({
    steered: seed({ status: "timeout", cookieHosts: ["cdn.tracker.test"] }),
    editorSave: foldSave,
    editorFold: foldMiss,
    streamExpired: true,
    editorHung: true,
    profileBusy: true,
    siteHost: "app.example",
    guideUrl: "https://app.example/app",
    guideExpect: "Workspace ready",
  })
  assert.equal(drainedTracker.cookieLead, undefined)
  assert.equal(drainedTracker.foldLead, undefined)
  assert.equal(drainedTracker.failClosed?.status, "stream-expired")

  const finalize = steerAwaitLogin({
    steered: seed({ status: "waiting", cookieHosts: ["cdn.tracker.test"] }),
    editorSave: foldSave,
    editorFold: foldMiss,
    streamExpired: false,
    editorHung: false,
    profileBusy: false,
    siteHost: "app.example",
    guideUrl: "https://app.example/app",
    guideExpect: "Workspace ready",
  })
  assert.equal(finalize.cookieLead, undefined)
  assert.equal(finalize.foldLead?.status, "completed")
  assert.equal(finalize.failClosed, undefined)
  assert.equal(finalize.guided.nextCall?.tool, "auspex_finalize_login")
  assert.match(finalize.guided.text, /Finalize-login NOW/)

  const cookie = steerAwaitLogin({
    steered: seed({ status: "timeout" }),
    editorSave: foldSave,
    editorFold: foldMiss,
    streamExpired: true,
    editorHung: true,
    profileBusy: true,
    siteHost: "app.example",
    guideUrl: "https://app.example/app",
    guideExpect: "Workspace ready",
  })
  assert.equal(cookie.cookieLead?.status, "completed")
  assert.equal(cookie.foldLead, undefined)
  assert.equal(cookie.guided.nextCall?.tool, "auspex_check")
  assert.equal(cookie.guided.nextCall?.verifyWithProfile, true)
  assert.match(cookie.guided.text, /solariSaveReady is not claimOkProfile/)
  assert.equal(cookie.guided.text.includes("Run auspex check"), false)

  const expired = steerAwaitLogin({
    steered: seed({ status: "waiting", cookies: 0, origins: 0, cookieHosts: [] }),
    streamExpired: true,
    editorHung: true,
    profileBusy: true,
  })
  assert.equal(expired.foldLead, undefined)
  assert.equal(expired.failClosed?.status, "stream-expired")
  assert.equal(expired.guided.nextCall?.tool, "auspex_login")

  const hung = steerAwaitLogin({
    steered: seed({ status: "waiting", cookies: 0, origins: 0, cookieHosts: [] }),
    streamExpired: false,
    editorHung: true,
    profileBusy: true,
  })
  assert.equal(hung.failClosed?.status, "editor-save-hung")

  const busy = steerAwaitLogin({
    steered: seed({ status: "waiting", cookies: 0, origins: 0, cookieHosts: [] }),
    streamExpired: false,
    editorHung: false,
    profileBusy: true,
  })
  assert.equal(busy.failClosed?.status, "profile-busy")

  const visible = steerAwaitLogin({
    steered: seed({
      status: "idp-only-save",
      next: "picture is not a saved login",
      nextCall: undefined,
      cookieHosts: ["login.microsoftonline.com"],
      liveHost: "app.example",
    }),
    editorSave: foldSave,
    editorFold: foldMiss,
    streamExpired: true,
    editorHung: false,
    profileBusy: false,
    siteHost: "app.example",
  })
  assert.equal(visible.foldLead, undefined)
  assert.equal(visible.failClosed, undefined)
  assert.equal(visible.guided.nextCall, undefined)
  assert.equal(visible.guided.text, "picture is not a saved login")

  const wall = steerAwaitLogin({
    steered: seed({
      status: "idp-only-save",
      next: "finish sign-in",
      nextCall: { tool: "auspex_login", profile: "app-example" },
      cookieHosts: ["login.microsoftonline.com"],
      liveHost: "login.microsoftonline.com",
    }),
    editorSave: foldSave,
    editorFold: foldMiss,
    streamExpired: true,
    editorHung: false,
    profileBusy: false,
    siteHost: "app.example",
  })
  assert.equal(wall.guided.nextCall?.tool, "auspex_login")
  assert.equal(wall.foldLead, undefined)

  const drained = steerAwaitLogin({
    steered: seed({
      status: "stream-expired",
      cookieHosts: ["login.microsoftonline.com"],
      cookies: 2,
    }),
    editorSave: foldSave,
    editorFold: foldMiss,
    streamExpired: true,
    editorHung: false,
    profileBusy: false,
    siteHost: "app.example",
  })
  assert.equal(drained.foldLead, undefined)
  assert.equal(drained.failClosed?.status, "stream-expired")
  assert.equal(drained.guided.nextCall?.tool, "auspex_login")

  const missed = steerAwaitLogin({
    steered: seed({
      status: "completed",
      next: "saved",
      nextCall: { tool: "auspex_finalize_login", profile: "app-example" },
    }),
    editorSave: { ok: false, status: 401, error: "unauthorized" },
    streamExpired: false,
    editorHung: false,
    profileBusy: false,
    siteHost: "app.example",
  })
  assert.equal(missed.cookieLead, undefined)
  assert.equal(missed.foldLead, undefined)
  assert.equal(missed.guided.nextCall?.tool, "auspex_login")
  assert.match(missed.guided.text, /Do not finalize-login/)
  assert.equal(missed.failClosed, undefined)
})

test("completed editorSave 502 lands on the save overlay and does not deny Solari 5xx", () => {
  const overlay = steerAwaitLogin({
    steered: seed({
      status: "timeout",
      cookies: 0,
      origins: 0,
      cookieHosts: [],
      next: "No non-empty Save yet for app-example.",
    }),
    editorSave: { ok: false, status: 502, error: "Failed to export storageState" },
    streamExpired: false,
    editorHung: false,
    profileBusy: false,
  })
  assert.equal(overlay.failClosed, undefined)
  assert.equal(overlay.cookieLead, undefined)
  assert.equal(overlay.foldLead, undefined)
  assert.match(overlay.guided.text, /editorSave failed \(502: Failed to export storageState\)/)
  assert.equal(/or a Solari 502/i.test(overlay.guided.text), false)
  assert.equal(/not a Solari 502/i.test(overlay.guided.text), false)

  for (const status of [502, 503, 504]) {
    const expired = steerAwaitLogin({
      steered: seed({ status: "timeout", cookies: 0, origins: 0, cookieHosts: [] }),
      editorSave: { ok: false, status, error: "Failed to export storageState" },
      streamExpired: true,
      editorHung: false,
      profileBusy: false,
    })
    assert.equal(expired.failClosed?.status, "stream-expired")
    assert.equal(/or a Solari 502/i.test(expired.guided.text), false)
    assert.equal(/not a Solari 502/i.test(expired.guided.text), false)
    assert.equal(/not a Solari 5\d\d/i.test(expired.guided.text), false)
    assert.match(expired.guided.text, new RegExp(`editorSave returned Solari ${status}`))
  }
})

test("not-savable exhaustion is stream-expired and does not claim a cookie Save", () => {
  const exhausted = steerAwaitLogin({
    steered: seed({
      status: "completed",
      cookies: 4,
      origins: 1,
      next: "saved",
      nextCall: { tool: "auspex_check", profile: "app-example", verifyWithProfile: true },
    }),
    editorSave: { ok: false, status: 409, error: "not in a savable state" },
    streamExpired: true,
    editorHung: false,
    profileBusy: false,
    notSavableExhausted: true,
    siteHost: "app.example",
  })
  assert.equal(exhausted.cookieLead, undefined)
  assert.equal(exhausted.foldLead, undefined)
  assert.equal(exhausted.failClosed?.status, "stream-expired")
  assert.equal(exhausted.guided.nextCall?.tool, "auspex_login")
  assert.match(exhausted.guided.text, /POST \/editor\/token has no TTL/)
  assert.match(exhausted.guided.text, /or a Solari 502/)
})

test("empty jar after a completed non-2xx names the status and does not finalize", () => {
  const empty = steerAwaitLogin({
    steered: seed({
      status: "empty-save",
      cookies: 0,
      origins: 0,
      cookieHosts: [],
      next: "Save bumped the profile to v3 but stored no cookies or origins. Do not reuse --profile app-example until a non-empty Save.",
    }),
    editorSave: { ok: false, status: 413, error: "Payload Too Large" },
    editorFold: foldMiss,
    streamExpired: false,
    editorHung: false,
    profileBusy: false,
  })
  assert.equal(empty.foldLead, undefined)
  assert.equal(empty.failClosed, undefined)
  assert.equal(empty.guided.nextCall?.tool, "auspex_login")
  assert.match(empty.guided.text, /editorSave failed \(413: Payload Too Large\)/)
  assert.match(empty.guided.text, /The jar is empty/)
  assert.match(empty.guided.text, /POST finished/)
  assert.match(empty.guided.text, /Not a 30-minute wait/)
  assert.equal(/Finalize-login NOW/.test(empty.guided.text), false)
  assert.equal(/Keep the handoff open/.test(empty.guided.text), false)
})

test("empty jar after editorSave 200 does not append finalize", () => {
  const next =
    "Save bumped the profile to v4 but stored no cookies or origins. Do not reuse --profile app-example until a non-empty Save."
  const empty = steerAwaitLogin({
    steered: seed({
      status: "empty-save",
      cookies: 0,
      origins: 0,
      cookieHosts: [],
      next,
    }),
    editorSave: foldSave,
    editorFold: foldMiss,
    streamExpired: false,
    editorHung: false,
    profileBusy: false,
    siteHost: "app.example",
  })
  assert.equal(empty.foldLead, undefined)
  assert.equal(empty.guided.text, next)
  assert.equal(empty.guided.nextCall, undefined)
  assert.equal(/finalize-login/i.test(empty.guided.text), false)
})

test("completed 502 next copy drops the waiting lead and keeps the Solari status", () => {
  const overlay = steerAwaitLogin({
    steered: seed({
      status: "timeout",
      cookies: 0,
      origins: 0,
      cookieHosts: [],
      next: "No non-empty Save yet for app-example. Keep the handoff open, Save, then retry auspex_await_login.",
    }),
    editorSave: { ok: false, status: 502, error: "Failed to export storageState" },
    streamExpired: false,
    editorHung: false,
    profileBusy: false,
  })
  assert.match(overlay.guided.text, /editorSave failed \(502: Failed to export storageState\)/)
  assert.match(overlay.guided.text, /Solari 502 stands/)
  assert.match(overlay.guided.text, /not loggedOut or needsHuman/)
  assert.equal(/Keep the handoff open/.test(overlay.guided.text), false)
  assert.equal(/No non-empty Save yet/.test(overlay.guided.text), false)
  assert.equal(/or a Solari 502/i.test(overlay.guided.text), false)
})
