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

test("steer order is host patch, then finalize, then fail-closed, then IdP-only, then overlay", () => {
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

  const finalize = steerAwaitLogin({
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
  assert.equal(finalize.foldLead?.status, "completed")
  assert.equal(finalize.failClosed, undefined)
  assert.equal(finalize.guided.nextCall?.tool, "auspex_finalize_login")
  assert.match(finalize.guided.text, /Finalize-login NOW/)

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
  assert.equal(missed.foldLead, undefined)
  assert.equal(missed.guided.nextCall?.tool, "auspex_login")
  assert.match(missed.guided.text, /Do not finalize-login/)
})
