import assert from "node:assert/strict"
import test from "node:test"
import {
  SESSION_STORAGE_PREFIX,
  captureStorageState,
  foldSessionStorage,
  hydrateSessionStorageInMemory,
  hydrateSessionStorageSource,
  installSessionStorageRestore,
  isLoggedOutLanding,
  isPersistableAppUrl,
  mergeStorageStates,
  originHasLandedBytes,
  originStoreCounts,
  sessionItemsByOrigin,
} from "../src/profile-storage.ts"

test("foldSessionStorage stores session keys under the Auspex prefix", () => {
  const folded = foldSessionStorage(
    { cookies: [], origins: [] },
    "https://consistencyhub.io",
    [
      { name: "accessToken", value: "tok" },
      { name: "expiresOn", value: "9" },
    ],
  )
  const names = (folded.origins?.[0]?.localStorage ?? []).map((row) => row.name).sort()
  assert.deepEqual(names, [
    `${SESSION_STORAGE_PREFIX}accessToken`,
    `${SESSION_STORAGE_PREFIX}expiresOn`,
  ])
  const hydrated = hydrateSessionStorageInMemory({
    [`${SESSION_STORAGE_PREFIX}accessToken`]: "tok",
    [`${SESSION_STORAGE_PREFIX}expiresOn`]: "9",
    refreshToken: "enc",
  })
  assert.equal(hydrated.accessToken, "tok")
  assert.equal(hydrated.expiresOn, "9")
  assert.equal(hydrated.refreshToken, undefined)
})

test("mergeStorageStates unions cookies and origin localStorage", () => {
  const merged = mergeStorageStates(
    { cookies: [{ name: "a", value: "1", domain: "example.com", path: "/" }] },
    {
      cookies: [{ name: "b", value: "2", domain: "example.com", path: "/" }],
      origins: [{ origin: "https://example.com", localStorage: [{ name: "k", value: "v" }] }],
    },
  )
  assert.equal(merged.cookies?.length, 2)
  assert.equal(merged.origins?.[0]?.localStorage?.[0]?.value, "v")
})

test("hydrateSessionStorageSource copies prefixed keys", () => {
  const src = hydrateSessionStorageSource()
  assert.match(src, /__auspex_ss__:/)
  assert.match(src, /sessionStorage.setItem/)
})

test("installSessionStorageRestore registers a function init script with baked keys", async () => {
  const calls: unknown[] = []
  const payload = await installSessionStorageRestore(
    {
      addInitScript: async (script: unknown, arg?: unknown) => {
        calls.push({ fn: typeof script, arg })
      },
    },
    {
      cookies: [],
      origins: [
        {
          origin: "https://consistencyhub.io",
          localStorage: [{ name: `${SESSION_STORAGE_PREFIX}accessToken`, value: "tok" }],
        },
      ],
    },
  )
  assert.equal(payload.baked["https://consistencyhub.io"]?.accessToken, "tok")
  assert.equal(calls.length, 1)
  assert.equal((calls[0] as { fn: string }).fn, "function")
})

test("hydrateSessionStorageSource bakes sessionStorage for restore before navigation", () => {
  const baked = sessionItemsByOrigin({
    cookies: [],
    origins: [
      {
        origin: "https://consistencyhub.io",
        localStorage: [{ name: `${SESSION_STORAGE_PREFIX}accessToken`, value: "tok" }],
      },
    ],
  })
  assert.equal(baked["https://consistencyhub.io"]?.accessToken, "tok")
  const src = hydrateSessionStorageSource(baked)
  assert.match(src, /accessToken/)
  assert.match(src, /tok/)
  assert.match(src, /sessionStorage.setItem/)
})

test("originHasLandedBytes requires cookies or storage for that origin", () => {
  const msOnly = {
    cookies: [{ name: "ESTSAUTH", value: "x", domain: "login.microsoftonline.com" }],
    origins: [{ origin: "https://consistencyhub.io", localStorage: [] }],
  }
  assert.equal(originHasLandedBytes(msOnly, "https://consistencyhub.io"), false)
  assert.equal(originStoreCounts(msOnly, "https://consistencyhub.io").cookies, 0)
  const landed = foldSessionStorage(msOnly, "https://consistencyhub.io", [
    { name: "accessToken", value: "tok" },
  ])
  assert.equal(originHasLandedBytes(landed, "https://consistencyhub.io"), true)
  assert.equal(originStoreCounts(landed, "https://consistencyhub.io").sessionStorage, 1)
})

test("isPersistableAppUrl rejects landing and auth, allows dashboard", () => {
  assert.equal(isPersistableAppUrl("https://consistencyhub.io/landing"), false)
  assert.equal(isPersistableAppUrl("https://consistencyhub.io/"), false)
  assert.equal(isPersistableAppUrl("https://consistencyhub.io/login"), false)
  assert.equal(isPersistableAppUrl("https://login.microsoftonline.com/common/oauth2/v2.0/authorize"), false)
  assert.equal(isPersistableAppUrl("https://consistencyhub.io/dashboard"), true)
  assert.equal(isPersistableAppUrl("https://consistencyhub.io/document-editor"), true)
})

test("isLoggedOutLanding is /landing or a login page, not a generic mismatch", () => {
  assert.equal(isLoggedOutLanding("https://consistencyhub.io/landing"), true)
  assert.equal(isLoggedOutLanding("https://consistencyhub.io/landing/"), true)
  assert.equal(isLoggedOutLanding("https://consistencyhub.io/login"), true)
  assert.equal(isLoggedOutLanding("https://login.microsoftonline.com/common/oauth2/v2.0/authorize"), true)
  assert.equal(isLoggedOutLanding("https://consistencyhub.io/dashboard"), false)
  assert.equal(isLoggedOutLanding("https://ironadamant.com/"), false)
})

test("captureStorageState folds sessionStorage from open pages", async () => {
  const state = await captureStorageState({
    contexts: () => [
      {
        storageState: async () => ({
          cookies: [{ name: "sid", value: "1", domain: "consistencyhub.io" }],
          origins: [{ origin: "https://consistencyhub.io", localStorage: [{ name: "refreshToken", value: "enc" }] }],
        }),
        cookies: async () => [{ name: "sid", value: "1", domain: "consistencyhub.io", path: "/" }],
        pages: () => [
          {
            url: () => "https://consistencyhub.io/dashboard",
            evaluate: async () => [
              { name: "accessToken", value: "tok" },
              { name: "expiresOn", value: "99" },
            ],
            frames: () => [],
          },
        ],
      },
    ],
  })
  const names = (state.origins ?? []).flatMap((o) => o.localStorage ?? []).map((row) => row.name)
  assert.ok(names.includes("refreshToken"))
  assert.ok(names.includes(`${SESSION_STORAGE_PREFIX}accessToken`))
  assert.ok(names.includes(`${SESSION_STORAGE_PREFIX}expiresOn`))
  assert.equal(state.cookies?.length, 1)
})
