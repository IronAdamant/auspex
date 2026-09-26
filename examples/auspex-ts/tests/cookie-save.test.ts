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
