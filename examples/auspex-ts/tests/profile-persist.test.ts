import assert from "node:assert/strict"
import test from "node:test"
import { pageForSession, toPlaywrightStorageState } from "../src/solari.ts"
import {
  EMPTY_PROFILE_SAVE_ERROR,
  persistProfileState,
  seedFromStorageState,
  waitForProfileSave,
} from "../src/profile-persist.ts"
import { PUBLIC_CHECKS, publicCheckExitCode, runPublicChecks } from "../scripts/public-check.ts"

test("seedFromStorageState counts cookies and origins without requiring values", () => {
  assert.deepEqual(seedFromStorageState(undefined), { cookies: 0, origins: 0 })
  assert.deepEqual(seedFromStorageState({ cookies: [], origins: [] }), { cookies: 0, origins: 0 })
  assert.deepEqual(
    seedFromStorageState({
      cookies: [{ name: "sid", value: "1", domain: "example.com" }, { name: "", value: "x" }],
      origins: [{ origin: "https://example.com" }, { origin: "" }],
    }),
    { cookies: 1, origins: 1 },
  )
})

test("persistProfileState refuses an empty seed and does not call save", async () => {
  let posted = 0
  let saved = 0
  const empty = await persistProfileState({
    profileId: "prof_1",
    sessionId: "sess_1",
    state: { cookies: [], origins: [] },
    http: {
      post: async () => {
        posted += 1
        return {}
      },
    },
    save: async () => {
      saved += 1
      return { version: 2, sizeBytes: 9 }
    },
  })
  assert.equal(empty.ok, false)
  assert.equal(empty.error, EMPTY_PROFILE_SAVE_ERROR)
  assert.equal(posted, 0)
  assert.equal(saved, 0)
})

test("persistProfileState uses save-profile then falls back on 404", async () => {
  const native = await persistProfileState({
    profileId: "prof_1",
    sessionId: "sess:1",
    state: { cookies: [{ name: "a", value: "1", domain: "example.com" }] },
    http: {
      post: async (path, body) => {
        assert.match(path, /\/sessions\/sess%3A1\/save-profile/)
        assert.deepEqual(body, { profileId: "prof_1" })
        return { version: 4, sizeBytes: 120, cookies: 1, origins: 0 }
      },
    },
    save: async () => {
      throw new Error("should not fallback")
    },
  })
  assert.equal(native.ok, true)
  assert.equal(native.via, "save-profile")
  assert.equal(native.version, 4)
  assert.equal(native.cookies, 1)

  const fallback = await persistProfileState({
    profileId: "prof_1",
    sessionId: "sess_1",
    state: { cookies: [{ name: "a", value: "1", domain: "example.com" }] },
    http: {
      post: async () => {
        throw new Error("save-profile 404")
      },
    },
    save: async (id, state) => {
      assert.equal(id, "prof_1")
      assert.equal(state.cookies?.[0]?.name, "a")
      return { version: 5, sizeBytes: 40 }
    },
  })
  assert.equal(fallback.ok, true)
  assert.equal(fallback.via, "profiles.save")
  assert.equal(fallback.version, 5)
})

test("waitForProfileSave treats a 0-cookie version bump as empty-save", async () => {
  let clock = 0
  const empty = await waitForProfileSave("consistencyhub", {
    sinceVersion: 3,
    timeoutMs: 5_000,
    deps: {
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
      },
      list: async () => [{ id: "p1", name: "consistencyhub", version: 3 }],
      inspect: async () => ({ cookies: 0, origins: 0 }),
    },
  })
  assert.equal(empty.status, "timeout")

  let listed = 0
  const bumped = await waitForProfileSave("consistencyhub", {
    sinceVersion: 10,
    timeoutMs: 5_000,
    deps: {
      now: (() => {
        let t = 0
        return () => {
          t += 1_000
          return t
        }
      })(),
      sleep: async () => undefined,
      list: async () => {
        listed += 1
        return [{ id: "p1", name: "consistencyhub", version: listed === 0 ? 10 : 11 }]
      },
      inspect: async () => ({ cookies: 0, origins: 0 }),
    },
  })
  assert.equal(bumped.status, "empty-save")
  assert.match(bumped.next, /0 cookies|no cookies/i)

  const ok = await waitForProfileSave("auspex-demo", {
    sinceVersion: 1,
    timeoutMs: 5_000,
    deps: {
      now: (() => {
        let t = 0
        return () => {
          t += 1_000
          return t
        }
      })(),
      sleep: async () => undefined,
      list: async () => [{ id: "p2", name: "auspex-demo", version: 2 }],
      inspect: async () => ({ cookies: 2, origins: 1 }),
    },
  })
  assert.equal(ok.status, "completed")
  assert.equal(ok.cookies, 2)
  assert.equal(ok.origins, 1)
})

test("pageForSession uses the default context even when storageState has cookies", async () => {
  let newContextCalls = 0
  const defaultPage = { id: "default" }
  const browser = {
    session: {
      storageState: {
        cookies: [{ name: "sid", value: "1", domain: "example.com" }],
        origins: [{ origin: "https://example.com", localStorage: [{ name: "visits", value: "1" }] }],
      },
    },
    contexts: () => [
      {
        pages: () => [defaultPage],
        newPage: async () => ({ id: "new-in-default" }),
      },
    ],
    newContext: async () => {
      newContextCalls += 1
      throw new Error("must not create an isolated context when the default is seeded")
    },
  }
  const page = await pageForSession(browser as never)
  assert.equal(page, defaultPage)
  assert.equal(newContextCalls, 0)
})

test("toPlaywrightStorageState does not force httpOnly or secure true", () => {
  const pw = toPlaywrightStorageState({
    cookies: [{ name: "sid", value: "1", domain: "example.com" }],
  })
  assert.equal(pw.cookies[0]?.httpOnly, false)
  assert.equal(pw.cookies[0]?.secure, false)
})

test("public checks target ironadamant One office job and Checkpoint", () => {
  assert.equal(PUBLIC_CHECKS.length, 2)
  assert.equal(PUBLIC_CHECKS[0]?.url, "https://ironadamant.com")
  assert.equal(PUBLIC_CHECKS[0]?.expect, "One office job.")
  assert.equal(PUBLIC_CHECKS[1]?.url, "https://checkpointprojects.com")
  assert.equal(PUBLIC_CHECKS[1]?.expect, "Checkpoint")
})

test("runPublicChecks skips without a key and fails closed on a miss", async () => {
  const skipped = await runPublicChecks({ key: "" })
  assert.equal(skipped.skipped, true)
  assert.equal(publicCheckExitCode(skipped), 0)
  const ran = await runPublicChecks({
    key: "slr_live_test",
    check: async (url, expect) => ({
      ok: true,
      matched: expect === "One office job.",
      finalUrl: url,
    }),
  })
  assert.equal(ran.skipped, undefined)
  assert.equal(ran.results.length, 2)
  assert.equal(ran.results[0]?.matched, true)
  assert.equal(ran.results[1]?.matched, false)
  assert.equal(publicCheckExitCode(ran), 1)
})
