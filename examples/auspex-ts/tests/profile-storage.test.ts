import assert from "node:assert/strict"
import test from "node:test"
import {
  FOLDED_EXPIRES_ON_SKEW_MS,
  SESSION_STORAGE_PREFIX,
  captureStorageState,
  foldSessionStorage,
  hydrateSessionStorageInMemory,
  hydrateSessionStorageSource,
  installSessionStorageRestore,
  isFoldedExpiresOnStale,
  isLoggedOutLanding,
  isPersistableAppUrl,
  mergeStorageStates,
  originHasLandedBytes,
  originStoreCounts,
  parseFoldedExpiresOnMs,
  sessionItemsByOrigin,
} from "../src/profile-storage.ts"

test("installSessionStorageRestore registers a content init script with baked keys", async () => {
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
  const first = calls[0] as { fn: string; arg?: unknown }
  assert.equal(first.fn, "object")
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
