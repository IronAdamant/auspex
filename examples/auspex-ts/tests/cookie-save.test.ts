import assert from "node:assert/strict"
import test from "node:test"
import {
  classifySeedReadiness,
  } from "../src/cookie-save.ts"

test("public marketing and a fresh session fold are not solariSaveReady", () => {
  const marketing = classifySeedReadiness({
    profile: "ironadamant",
    url: "https://ironadamant.com",
    cookies: 4,
    origins: 1,
    sessionStorage: 0,
    cookieHosts: ["ironadamant.com"],
  })
  assert.equal(marketing.shape, "unknown")
  assert.equal(marketing.solariSaveReady, false)
  assert.equal(marketing.weakSeed, false)

  const folded = classifySeedReadiness({
    profile: "app-example",
    url: "https://app.example",
    cookies: 2,
    origins: 1,
    sessionStorage: 3,
    cookieHosts: ["cdn.tracker.test"],
  })
  assert.equal(folded.shape, "session-strong")
  assert.equal(folded.solariSaveReady, false)

  const weak = classifySeedReadiness({
    profile: "app-example",
    url: "https://app.example",
    cookies: 2,
    origins: 1,
    sessionStorage: 0,
    cookieHosts: ["cdn.tracker.test"],
  })
  assert.equal(weak.shape, "weak-seed")
  assert.equal(weak.solariSaveReady, false)
})

test("an explicit app-origin cookie count of 0 wins over matching hosts", () => {
  const counted = classifySeedReadiness({
    url: "https://app.example",
    cookies: 3,
    origins: 1,
    sessionStorage: 0,
    cookieHosts: ["app.example"],
    appOriginCookieCount: 0,
  })
  assert.equal(counted.appOriginCookies, false)
  assert.equal(counted.solariSaveReady, false)
  assert.equal(counted.shape, "weak-seed")
})

test("seed inventory names login cookies on the app's site and lists third-party hosts", async () => {
  const { cookieInventory } = await import("../src/profile-persist.ts")
  // Shapes seen live: Supabase chunked token, Appwrite session, Clerk, Rails session, trackers, IdP.
  const inv = cookieInventory(
    [
      { name: "sb-secure-auth-token.0", domain: ".goodtape.io" },
      { name: "sb-secure-auth-token.1", domain: ".goodtape.io" },
      { name: "_ga", domain: ".goodtape.io" },
      { name: "_fbp", domain: ".facebook.com" },
      { name: "li_sugr", domain: ".linkedin.com" },
      { name: "ESTSAUTHPERSISTENT", domain: "login.microsoftonline.com" },
    ],
    "app.goodtape.io",
  )
  assert.deepEqual(inv.authCookieNames, ["sb-secure-auth-token.0", "sb-secure-auth-token.1"])
  assert.deepEqual(inv.thirdPartyCookieHosts, ["facebook.com", "linkedin.com"])
  const clerk = cookieInventory(
    [
      { name: "__session", domain: "www.tldraw.com" },
      { name: "__client", domain: "clerk.tldraw.com" },
      { name: "zero", domain: "production-zero-vs.fly.dev" },
    ],
    "www.tldraw.com",
  )
  assert.deepEqual(clerk.authCookieNames, ["__client", "__session"])
  assert.deepEqual(clerk.thirdPartyCookieHosts, ["production-zero-vs.fly.dev"])
  // Sibling subdomain of the app (Appwrite on appwrite.lorari.com, app on app.lorari.com) is the same site.
  assert.deepEqual(cookieInventory([{ name: "a_session_abc", domain: "appwrite.lorari.com" }], "app.lorari.com").authCookieNames, ["a_session_abc"])
  const { registeredDomain } = await import("../src/profile-persist.ts")
  assert.equal(registeredDomain("app.example.co.uk"), "example.co.uk")
  assert.equal(registeredDomain("dashboard.back4app.com"), "back4app.com")
  assert.deepEqual(cookieInventory([{ name: "_clozemaster_session", domain: "www.clozemaster.com" }], "www.clozemaster.com").authCookieNames, ["_clozemaster_session"])
  // Short names on two-letter TLDs are ordinary domains, not co.uk-style suffixes.
  assert.equal(registeredDomain("grok.x.ai"), "x.ai")
  assert.equal(registeredDomain("app.cal.io"), "cal.io")
  assert.equal(registeredDomain("shop.example.com.au"), "example.com.au")
  const parent = cookieInventory(
    [
      { name: "sso_session", domain: ".x.ai" },
      { name: "session", domain: "api.cal.io" },
    ],
    "grok.x.ai",
  )
  assert.deepEqual(parent.authCookieNames, ["sso_session"])
  assert.deepEqual(parent.thirdPartyCookieHosts, ["api.cal.io"])
  assert.deepEqual(cookieInventory([{ name: "session", domain: "api.cal.io" }], "app.cal.io").authCookieNames, ["session"])
})
