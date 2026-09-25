import assert from "node:assert/strict"
import test from "node:test"
import { foldMissFinalizeGuide, idpOnlySaveGuide, isIdpOnlySave, shouldSteerToFinalize } from "../src/fold-steer.ts"
import { profileClaimSessionCreate } from "../src/launch-options.ts"
import { sameProductAdopt, sameProductHosts } from "../src/live-host-change.ts"
import { adviseLiveHostChange } from "../src/live-host-change.ts"

test("editorSave 200 and fold no-cdp with cookies steers to finalize", () => {
  assert.equal(
    shouldSteerToFinalize({
      editorSave: { ok: true, status: 200 },
      editorFold: { ok: false, reason: "no-cdp" },
      cookies: 4,
    }),
    true,
  )
  const guide = foldMissFinalizeGuide({
    profile: "app-example",
    editorSave: { ok: true, status: 200 },
    editorFold: { ok: false, reason: "no-cdp" },
    streamNoted: true,
    url: "https://app.example/languages",
    expect: "Your courses",
  })
  assert.match(guide.text, /Finalize-login NOW/)
  assert.match(guide.text, /editorSave 200/)
  assert.match(guide.text, /not a remint/)
  assert.match(guide.text, /claimOkProfile will not pass on a dead fold/)
  assert.equal(guide.nextCall.tool, "auspex_finalize_login")
  assert.equal(guide.nextCall.profile, "app-example")
  assert.equal(guide.nextCall.url, "https://app.example/languages")
  assert.equal(guide.nextCall.expect, "Your courses")
  assert.equal(/auspex_login/.test(guide.text) && /Remint now:/.test(guide.text), false)
})

const TODAY_IDP_HOSTS = ["live.com", "login.live.com", "login.microsoft.com", "login.microsoftonline.com"]

test("IdP-only jar for consistencyhub.io does not steer to finalize", () => {
  const seed = {
    editorSave: { ok: true, status: 200 },
    editorFold: { ok: false, reason: "no-cdp" as const },
    cookies: 4,
    cookieHosts: TODAY_IDP_HOSTS,
    siteHost: "consistencyhub.io",
    sessionStorage: 0,
  }
  assert.equal(isIdpOnlySave(seed), true)
  assert.equal(isIdpOnlySave({ ...seed, sessionStorage: 2 }), false)
  assert.equal(
    isIdpOnlySave({ ...seed, cookieHosts: ["accounts.google.com"] }),
    true,
  )
  assert.equal(shouldSteerToFinalize(seed), false)
  const guide = idpOnlySaveGuide("consistencyhub")
  assert.match(guide.text, /Finish Microsoft or Google/)
  assert.match(guide.text, /land on the app UI, then tap Save/)
  assert.match(guide.text, /Do not finalize-login/)
  assert.equal(guide.nextCall.tool, "auspex_login")
  assert.equal(guide.nextCall.profile, "consistencyhub")
})

test("a jar that includes the site host still steers to finalize", () => {
  const seed = {
    editorSave: { ok: true, status: 200 },
    editorFold: { ok: false, reason: "no-cdp" as const },
    cookies: 5,
    cookieHosts: [...TODAY_IDP_HOSTS, "consistencyhub.io"],
    siteHost: "consistencyhub.io",
    sessionStorage: 0,
  }
  assert.equal(isIdpOnlySave(seed), false)
  assert.equal(shouldSteerToFinalize(seed), true)
})

test("editorSave 401 with cookies does not steer to finalize", () => {
  assert.equal(
    shouldSteerToFinalize({
      editorSave: { ok: false, status: 401, error: "Unauthorized" },
      editorFold: { ok: false, reason: "no-cdp" },
      cookies: 2,
      origins: 3,
    }),
    false,
  )
})

test("empty seed and a real hijack do not steer to finalize", () => {
  assert.equal(
    shouldSteerToFinalize({
      editorSave: { ok: true, status: 200 },
      editorFold: { ok: false, reason: "no-cdp" },
      cookies: 0,
      origins: 0,
    }),
    false,
  )
  assert.equal(
    shouldSteerToFinalize({
      editorSave: { ok: true, status: 200 },
      editorFold: { ok: false, reason: "no-cdp" },
      cookies: 3,
      hostChanged: true,
    }),
    false,
  )
})

test("SkySQL and MariaDB are one product; an unrelated host is not", () => {
  assert.equal(sameProductHosts("app.skysql.com", "cloud.mariadb.com"), true)
  const adopt = sameProductAdopt({
    mintUrl: "https://app.skysql.com",
    pageUrl: "https://cloud.mariadb.com/dashboard",
  })
  assert.equal(adopt?.canonicalUrl, "https://cloud.mariadb.com")
  assert.equal(
    adviseLiveHostChange({
      profile: "app-skysql-com",
      mintUrl: "https://app.skysql.com",
      pageUrl: "https://cloud.mariadb.com/",
    }),
    undefined,
  )
  const hijack = adviseLiveHostChange({
    profile: "app-skysql-com",
    mintUrl: "https://app.skysql.com",
    pageUrl: "https://evil.example/steal",
  })
  assert.equal(hijack?.hostChanged, true)
  assert.equal(hijack?.nextCall.tool, "auspex_login")
})

test("profile claim session is only the saved profile id", () => {
  const opts = profileClaimSessionCreate("prof_saved")
  assert.deepEqual(opts, { profileId: "prof_saved" })
  assert.equal("stealth" in opts, false)
  assert.equal(JSON.stringify(opts).includes("editor"), false)
})
