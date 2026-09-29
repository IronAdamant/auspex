import assert from "node:assert/strict"
import test from "node:test"
import {
  COOKIE_SAVE_CONTRACT,
  classifySeedReadiness,
  cookieSaveGuide,
  isSafeAuthKeyName,
  localStorageAuthKeyNames,
  parseAuthKeyNames,
} from "../src/cookie-save.ts"
import { isWeakSeed } from "../src/profile-persist.ts"

const secret = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig"

test("cookie Save contract is pre-save and does not claim reuse", () => {
  assert.equal(COOKIE_SAVE_CONTRACT.phase, "pre-save")
  assert.deepEqual(COOKIE_SAVE_CONTRACT.solariEditorSavePersists, ["cookies", "localStorage"])
  assert.equal(COOKIE_SAVE_CONTRACT.sessionStorageOnEditorSave, "not-captured")
  assert.equal(COOKIE_SAVE_CONTRACT.refuseShape, "idp-hosts-alone")
  assert.equal(COOKIE_SAVE_CONTRACT.reuseGate, "claimOkProfile")
  assert.match(COOKIE_SAVE_CONTRACT.solariSaveReadyMeaning, /not claimOkProfile/)
})

test("classify reports cookie-strong, local-storage-auth, and IdP-only without token values", () => {
  const cookies = classifySeedReadiness({
    profile: "app-example-com",
    url: "https://app.example.com/home",
    cookies: 4,
    origins: 1,
    sessionStorage: 0,
    cookieHosts: ["example.com", "login.microsoftonline.com"],
  })
  assert.equal(cookies.shape, "cookie-strong")
  assert.equal(cookies.solariSaveReady, true)
  assert.equal(cookies.idpOnly, false)
  assert.equal(cookies.weakSeed, false)
  assert.equal(cookies.sessionStorageMiss, true)
  assert.equal(cookies.appOriginCookieCount > 0, true)

  const named = classifySeedReadiness({
    profile: "consistencyhub",
    url: "https://consistencyhub.io",
    cookies: 6,
    origins: 2,
    sessionStorage: 0,
    cookieHosts: ["login.microsoftonline.com", "login.live.com"],
    localStorageAuthKeyNames: ["accessToken"],
  })
  assert.equal(named.shape, "local-storage-auth")
  assert.equal(named.solariSaveReady, true)
  assert.equal(named.idpOnly, false)
  assert.deepEqual(named.localStorageAuthKeyNames, ["accessToken"])

  const idp = classifySeedReadiness({
    profile: "consistencyhub",
    url: "https://consistencyhub.io",
    cookies: 6,
    origins: 2,
    sessionStorage: 0,
    cookieHosts: ["login.microsoftonline.com", "www.google.com"],
    liveHost: "consistencyhub.io",
  })
  assert.equal(idp.shape, "idp-only")
  assert.equal(idp.solariSaveReady, false)
  assert.equal(idp.idpOnlyKind, "app-visible")
  assert.equal(idp.weakSeed, false)

  const dumped = JSON.stringify({ cookies, named, idp, contract: COOKIE_SAVE_CONTRACT })
  assert.equal(dumped.includes(secret), false)
  assert.equal(dumped.includes("slr_live"), false)
})

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

test("parseAuthKeyNames accepts names and rejects token-shaped strings", () => {
  assert.deepEqual(parseAuthKeyNames("msal.token, accessToken"), ["msal.token", "accessToken"])
  assert.equal(isSafeAuthKeyName("access_token"), true)
  assert.throws(() => parseAuthKeyNames(secret), /names only/)
  assert.throws(() => parseAuthKeyNames("slr_live_secret"), /names only/)
  assert.throws(() => parseAuthKeyNames("has space"), /names only/)
  assert.throws(() => parseAuthKeyNames(""), /at least one/)
})

test("localStorage auth names skip folded sessionStorage and values", () => {
  const names = localStorageAuthKeyNames(
    {
      cookies: [],
      origins: [
        {
          origin: "https://app.example",
          localStorage: [
            { name: "accessToken", value: secret },
            { name: "__auspex_ss__:accessToken", value: secret },
            { name: "theme", value: "dark" },
          ],
        },
      ],
    },
    "https://app.example",
  )
  assert.deepEqual(names, ["accessToken"])
  assert.equal(JSON.stringify(names).includes(secret), false)
})

test("ConsistencyHub with only IdP cookies stays weak; app cookies do not", () => {
  assert.equal(
    isWeakSeed({
      profile: "consistencyhub",
      url: "https://consistencyhub.io",
      cookies: 4,
      origins: 1,
      sessionStorage: 0,
      cookieHosts: ["login.microsoftonline.com"],
    }),
    true,
  )
  assert.equal(
    isWeakSeed({
      profile: "consistencyhub",
      url: "https://consistencyhub.io",
      cookies: 4,
      origins: 1,
      sessionStorage: 0,
      cookieHosts: ["consistencyhub.io"],
    }),
    false,
  )
})

test("cookie guide points at check and does not print a token", () => {
  const readiness = classifySeedReadiness({
    url: "https://app.example",
    cookies: 2,
    origins: 1,
    sessionStorage: 0,
    appOriginCookieCount: 2,
  })
  const guide = cookieSaveGuide({
    profile: "app-example",
    readiness,
    url: "https://app.example/home",
    expect: "Workspace ready",
  })
  assert.equal(guide.nextCall.tool, "auspex_check")
  assert.equal(guide.nextCall.verifyWithProfile, true)
  assert.match(guide.text, /not claimOkProfile/)
  assert.match(guide.text, /Do not finalize to invent sessionStorage/)
  assert.equal(guide.text.includes(secret), false)
  assert.equal(JSON.stringify(guide.nextCall).includes("cookie"), false)
})

test("a refresh-token-only localStorage Save says finalize is next if the check lands loggedOut", async () => {
  const { classifySeedReadiness, cookieSaveGuide, refreshTokenOnly } = await import("../src/cookie-save.ts")
  // Live ConsistencyHub shape: Microsoft cookies only, app origin holds refreshToken.
  const msal = classifySeedReadiness({
    url: "https://consistencyhub.io/",
    cookies: 32,
    origins: 2,
    sessionStorage: 0,
    cookieHosts: ["live.com", "login.live.com", "login.microsoftonline.com"],
    liveHost: "consistencyhub.io",
    appOriginCookieCount: 0,
    localStorageCount: 82,
    localStorageAuthKeyNames: ["refreshToken"],
  })
  assert.equal(msal.shape, "local-storage-auth")
  assert.equal(refreshTokenOnly(msal), true)
  const guide = cookieSaveGuide({ profile: "consistencyhub", readiness: msal })
  assert.match(guide.text, /If that check lands loggedOut, run finalize-login --profile consistencyhub next/)
  assert.equal(guide.text.includes("Do not finalize to invent sessionStorage"), false)
  assert.equal(guide.nextCall.tool, "auspex_check")
  // An access token keeps the old rule.
  const access = classifySeedReadiness({
    url: "https://app.example.com/",
    cookies: 3,
    origins: 1,
    sessionStorage: 0,
    cookieHosts: ["login.microsoftonline.com"],
    liveHost: "app.example.com",
    appOriginCookieCount: 0,
    localStorageCount: 4,
    localStorageAuthKeyNames: ["accessToken", "refreshToken"],
  })
  assert.equal(refreshTokenOnly(access), false)
  assert.match(cookieSaveGuide({ profile: "p", readiness: access }).text, /Do not finalize to invent sessionStorage/)
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
