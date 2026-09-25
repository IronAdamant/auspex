import assert from "node:assert/strict"
import test from "node:test"
import { pageForSession, toPlaywrightStorageState } from "../src/solari.ts"
import {
  AWAIT_LOGIN_DEFAULT_MS,
  AWAIT_LOGIN_MAX_MS,
  EMPTY_ORIGIN_SAVE_ERROR,
  EMPTY_PROFILE_SAVE_ERROR,
  bindInspectProfileSeed,
  clampAwaitLoginTimeoutMs,
  inspectOriginForAwait,
  isWeakSeed,
  loginWaitAwaitOpts,
  persistProfileState,
  seedFromStorageState,
  waitForProfileSave,
} from "../src/profile-persist.ts"
import { shouldSteerToFinalize } from "../src/fold-steer.ts"
import { SESSION_STORAGE_PREFIX } from "../src/profile-storage.ts"
import { PUBLIC_CHECKS, publicCheckExitCode, runPublicChecks } from "../scripts/public-check.ts"

test("await-login default and max match the 30-minute cold handoff", () => {
  assert.equal(AWAIT_LOGIN_DEFAULT_MS, 1_800_000)
  assert.equal(AWAIT_LOGIN_MAX_MS, 1_800_000)
  assert.equal(clampAwaitLoginTimeoutMs(), 1_800_000)
  assert.equal(clampAwaitLoginTimeoutMs(1_000), 5_000)
  assert.equal(clampAwaitLoginTimeoutMs(9_000_000), 1_800_000)
})

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

test("persistProfileState writes via profiles.save and skips empty seeds", async () => {
  let saved = 0
  const empty = await persistProfileState({
    profileId: "prof_1",
    state: { cookies: [], origins: [] },
    save: async () => {
      saved += 1
      return { version: 2, sizeBytes: 9 }
    },
  })
  assert.equal(empty.ok, false)
  assert.equal(empty.error, EMPTY_PROFILE_SAVE_ERROR)
  assert.equal(saved, 0)

  const written = await persistProfileState({
    profileId: "prof_1",
    state: {
      cookies: [{ name: "a", value: "1", domain: "example.com" }],
      origins: [{ origin: "https://example.com", localStorage: [{ name: "__auspex_ss__:accessToken", value: "t" }] }],
    },
    save: async (id, state) => {
      saved += 1
      assert.equal(id, "prof_1")
      assert.equal(state.cookies?.[0]?.name, "a")
      assert.equal(state.origins?.[0]?.localStorage?.[0]?.name, "__auspex_ss__:accessToken")
      return { version: 6, sizeBytes: 80 }
    },
  })
  assert.equal(written.ok, true)
  assert.equal(written.via, "profiles.save")
  assert.equal(written.version, 6)
  assert.equal(written.cookies, 1)
  assert.equal(written.origins, 1)
  assert.equal(saved, 1)
})

test("persistProfileState fails when the page origin has no landed bytes", async () => {
  let saved = 0
  const emptyOrigin = await persistProfileState({
    profileId: "prof_1",
    origin: "https://consistencyhub.io",
    state: {
      cookies: [{ name: "ESTSAUTH", value: "x", domain: "login.microsoftonline.com" }],
      origins: [{ origin: "https://consistencyhub.io", localStorage: [] }],
    },
    save: async () => {
      saved += 1
      return { version: 2, sizeBytes: 40 }
    },
  })
  assert.equal(emptyOrigin.ok, false)
  assert.equal(emptyOrigin.error, EMPTY_ORIGIN_SAVE_ERROR)
  assert.equal(saved, 0)

  const landed = await persistProfileState({
    profileId: "prof_1",
    origin: "https://consistencyhub.io",
    state: {
      cookies: [{ name: "ESTSAUTH", value: "x", domain: "login.microsoftonline.com" }],
      origins: [
        {
          origin: "https://consistencyhub.io",
          localStorage: [{ name: "__auspex_ss__:accessToken", value: "t" }],
        },
      ],
    },
    save: async () => {
      saved += 1
      return { version: 7, sizeBytes: 80 }
    },
  })
  assert.equal(landed.ok, true)
  assert.equal(saved, 1)
})

test("persistProfileState fails when save writes 0 bytes", async () => {
  const emptyBytes = await persistProfileState({
    profileId: "prof_1",
    state: { cookies: [{ name: "a", value: "1", domain: "example.com" }] },
    save: async () => ({ version: 3, sizeBytes: 0 }),
  })
  assert.equal(emptyBytes.ok, false)
  assert.equal(emptyBytes.error, EMPTY_PROFILE_SAVE_ERROR)
})

test("persistProfileState maps 409 editor lock without throwing", async () => {
  const locked = await persistProfileState({
    profileId: "prof_1",
    state: { cookies: [{ name: "a", value: "1", domain: "example.com" }] },
    save: async () => {
      throw new Error("Solari POST /profiles/prof_1/save failed: 409 editor is open")
    },
  })
  assert.equal(locked.ok, false)
  assert.match(locked.error ?? "", /editor is open/i)
})

test("waitForProfileSave warns when consistencyhub has cookies but no sessionStorage", async () => {
  const completed = await waitForProfileSave("consistencyhub", {
    sinceVersion: 14,
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
      list: async () => [{ id: "p1", name: "consistencyhub", version: 15 }],
      inspect: async (_id, origin) => {
        if (origin === "https://consistencyhub.io") {
          return { cookies: 78, origins: 5, sessionStorage: 0 }
        }
        return { cookies: 78, origins: 5 }
      },
    },
  })
  assert.equal(completed.status, "completed")
  assert.equal(completed.cookies, 78)
  assert.equal(completed.origins, 5)
  assert.equal(completed.sessionStorage, 0)
  assert.match(completed.next, /warning/i)
  assert.match(completed.next, /sessionStorage/i)
  assert.match(completed.next, /counted sessionStorage|sessionStorage/)
  assert.match(completed.next, /finalize-login/)
  assert.match(completed.next, /Finalize-login NOW/)
  assert.match(completed.next, /claimOkProfile will not pass/)
  assert.equal(completed.next.includes("Run auspex check"), false)
  assert.equal(completed.next.includes("--sso --save-profile"), false)
})

test("waitForProfileSave warns cookie-only sessionStorage 0 for unknown profiles", async () => {
  const completed = await waitForProfileSave("other-profile", {
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
      list: async () => [{ id: "p2", name: "other-profile", version: 2 }],
      inspect: async () => ({ cookies: 10, origins: 2, sessionStorage: 0 }),
    },
  })
  assert.equal(completed.status, "completed")
  assert.equal(completed.cookies, 10)
  assert.equal(completed.origins, 2)
  assert.equal(completed.sessionStorage, 0)
  assert.match(completed.next, /warning/i)
  assert.match(completed.next, /finalize-login/)
  assert.match(completed.next, /claimOkProfile will not pass/)
  assert.equal(completed.next.includes("Run auspex check"), false)
})

test("bindInspectProfileSeed forwards origin so live await-login can warn", async () => {
  const calls: Array<{ id: string; origin?: string }> = []
  const inspect = async (_solari: unknown, id: string, origin?: string) => {
    calls.push({ id, origin })
    return { cookies: 78, origins: 5, sessionStorage: origin ? 0 : undefined }
  }
  const bound = bindInspectProfileSeed(inspect as never, {} as never)
  const completed = await waitForProfileSave("consistencyhub", {
    sinceVersion: 14,
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
      list: async () => [{ id: "p1", name: "consistencyhub", version: 15 }],
      inspect: bound,
    },
  })
  assert.deepEqual(calls, [{ id: "p1", origin: "https://consistencyhub.io" }])
  assert.equal(completed.sessionStorage, 0)
  assert.match(completed.next, /warning/i)
  assert.match(completed.next, /sessionStorage/i)
})

test("seedFromStorageState marks stale folded expiresOn without dropping the count", () => {
  const past = String(Date.now() - 60_000)
  const near = String(Date.now() + 60_000)
  const fresh = String(Date.now() + 20 * 60_000)
  const state = (expiresOn: string) => ({
    cookies: [{ name: "sid", value: "1", domain: "consistencyhub.io" }],
    origins: [
      {
        origin: "https://consistencyhub.io",
        localStorage: [
          { name: `${SESSION_STORAGE_PREFIX}accessToken`, value: "tok" },
          { name: `${SESSION_STORAGE_PREFIX}expiresOn`, value: expiresOn },
        ],
      },
    ],
  })
  const stale = seedFromStorageState(state(past), "https://consistencyhub.io")
  assert.equal(stale.sessionStorage, 2)
  assert.equal(stale.sessionStorageStale, true)
  const skew = seedFromStorageState(state(near), "https://consistencyhub.io")
  assert.equal(skew.sessionStorage, 2)
  assert.equal(skew.sessionStorageStale, true)
  const ok = seedFromStorageState(state(fresh), "https://consistencyhub.io")
  assert.equal(ok.sessionStorage, 2)
  assert.equal(ok.sessionStorageStale, undefined)
})

test("waitForProfileSave warns when consistencyhub folded expiresOn is stale even if count is 2", async () => {
  const completed = await waitForProfileSave("consistencyhub", {
    sinceVersion: 37,
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
      list: async () => [{ id: "p1", name: "consistencyhub", version: 38 }],
      inspect: async () => ({ cookies: 74, origins: 5, sessionStorage: 2, sessionStorageStale: true }),
    },
  })
  assert.equal(completed.status, "completed")
  assert.equal(completed.sessionStorage, 2)
  assert.equal(completed.sessionStorageStale, true)
  assert.match(completed.next, /warning/i)
  assert.match(completed.next, /expiresOn|stale leftover|stale folded/i)
  assert.match(completed.next, /save-editor does not refresh folded sessionStorage/)
  assert.match(completed.next, /finalize-login/)
  assert.match(completed.next, /Remint now/)
  assert.match(completed.next, /claimOkProfile will not pass/)
  assert.equal(completed.next.includes("Run auspex check"), false)
  assert.equal(isWeakSeed({ profile: "consistencyhub", cookies: 74, origins: 5, sessionStorage: 2 }), false)
  assert.equal(
    isWeakSeed({
      profile: "consistencyhub",
      cookies: 74,
      origins: 5,
      sessionStorage: 2,
      sessionStorageStale: true,
    }),
    true,
  )
})

test("waitForProfileSave does not warn on a fresh folded expiresOn with count 2", async () => {
  const completed = await waitForProfileSave("consistencyhub", {
    sinceVersion: 35,
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
      list: async () => [{ id: "p1", name: "consistencyhub", version: 36 }],
      inspect: async () => ({ cookies: 74, origins: 5, sessionStorage: 2 }),
    },
  })
  assert.equal(completed.status, "completed")
  assert.equal(completed.sessionStorage, 2)
  assert.equal(completed.sessionStorageStale, undefined)
  assert.equal(/warning/i.test(completed.next), false)
  assert.equal(completed.next.includes("Run auspex check"), false)
  assert.match(completed.next, /finalize-login/)
  assert.match(completed.next, /claimOkProfile/)
  assert.match(completed.next, /Reuse gate is claimOkProfile/)
})

test("seedFromStorageState counts sessionStorage when origin is passed", () => {
  const state = {
    cookies: [{ name: "sid", value: "1", domain: "consistencyhub.io" }],
    origins: [
      {
        origin: "https://consistencyhub.io",
        localStorage: [{ name: "theme", value: "dark" }],
      },
    ],
  }
  const counted = seedFromStorageState(state, "https://consistencyhub.io")
  assert.equal(counted.cookies, 1)
  assert.equal(counted.origins, 1)
  assert.equal(counted.sessionStorage, 0)
  const noOrigin = seedFromStorageState(state)
  assert.equal(noOrigin.sessionStorage, undefined)
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
  assert.equal(ok.sessionStorage, undefined)
  assert.equal(ok.next.includes("Run auspex check"), false)
  assert.match(ok.next, /Inspect did not count sessionStorage/)
  assert.match(ok.next, /Unknown sessionStorage is not weakSeed/)
  assert.match(ok.next, /finalize-login/)
  assert.match(ok.next, /claimOkProfile/)
})

test("waitForProfileSave fail-closes an IdP-only jar without a second version bump", async () => {
  const hosts = ["live.com", "login.live.com", "login.microsoft.com", "login.microsoftonline.com"]
  let slept = 0
  const idp = await waitForProfileSave("consistencyhub", {
    sinceVersion: 20,
    timeoutMs: 60_000,
    url: "https://consistencyhub.io",
    inspectExisting: true,
    deps: {
      now: () => 0,
      sleep: async () => {
        slept += 1
      },
      list: async () => [{ id: "p1", name: "consistencyhub", version: 20 }],
      inspect: async () => ({
        cookies: 4,
        origins: 1,
        sessionStorage: 0,
        cookieHosts: hosts,
        liveHost: "login.microsoftonline.com",
      }),
    },
  })
  assert.equal(idp.status, "idp-only-save")
  assert.equal(idp.idpCookies, true)
  assert.deepEqual(idp.cookieHosts, hosts)
  assert.equal(idp.idpOnlyKind, "sign-in-wall")
  assert.equal(idp.nextCall?.tool, "auspex_login")
  assert.match(idp.next, /Finish Microsoft or Google/)
  assert.match(idp.next, /land on the app UI, then tap Save/)
  assert.equal(/finalize-login NOW/.test(idp.next), false)
  assert.equal(slept, 0)

  const visible = await waitForProfileSave("consistencyhub-io", {
    sinceVersion: 1,
    timeoutMs: 60_000,
    url: "https://consistencyhub.io",
    inspectExisting: true,
    deps: {
      now: () => 0,
      sleep: async () => undefined,
      list: async () => [{ id: "p71", name: "consistencyhub-io", version: 2 }],
      inspect: async () => ({
        cookies: 30,
        origins: 2,
        sessionStorage: 0,
        cookieHosts: hosts,
        liveHost: "consistencyhub.io",
      }),
    },
  })
  assert.equal(visible.status, "idp-only-save")
  assert.equal(visible.idpOnlyKind, "app-visible")
  assert.equal(visible.nextCall, undefined)
  assert.match(visible.next, /liveHost is already consistencyhub.io/)
  assert.match(visible.next, /Do not remint to finish Microsoft/)
  assert.equal(/Finish Microsoft or Google/.test(visible.next), false)
  assert.equal(shouldSteerToFinalize({
    editorSave: { ok: true, status: 200 },
    editorFold: { ok: false, reason: "no-cdp" },
    cookies: visible.cookies,
    cookieHosts: visible.cookieHosts,
    siteHost: "consistencyhub.io",
    sessionStorage: visible.sessionStorage,
  }), false)

  const site = await waitForProfileSave("consistencyhub", {
    sinceVersion: 20,
    timeoutMs: 5_000,
    url: "https://consistencyhub.io",
    inspectExisting: true,
    deps: {
      now: (() => {
        let t = 0
        return () => (t += 1_000)
      })(),
      sleep: async () => undefined,
      list: async () => [{ id: "p1", name: "consistencyhub", version: 21 }],
      inspect: async () => ({
        cookies: 5,
        origins: 2,
        sessionStorage: 0,
        cookieHosts: [...hosts, "consistencyhub.io"],
      }),
    },
  })
  assert.equal(site.status, "completed")
  assert.equal(site.idpCookies, undefined)
})

test("inspectExisting with no pre-save sinceVersion does not poll a non-app jar until the JWT dies", async () => {
  const hosts = [
    "google.com",
    "live.com",
    "login.live.com",
    "login.microsoft.com",
    "login.microsoftonline.com",
    "www.google.com",
  ]
  let slept = 0
  const started = Date.now()
  const saved = await waitForProfileSave("consistencyhub-io", {
    timeoutMs: 180_000,
    url: "https://consistencyhub.io",
    streamExpiresAt: new Date(started + 171_000).toISOString(),
    inspectExisting: true,
    deps: {
      now: () => started,
      sleep: async () => {
        slept += 1
      },
      list: async () => [{ id: "p71", name: "consistencyhub-io", version: 2 }],
      inspect: async () => ({
        cookies: 39,
        origins: 3,
        sessionStorage: 0,
        cookieHosts: hosts,
        liveHost: "consistencyhub.io",
      }),
    },
  })
  assert.equal(saved.status, "idp-only-save")
  assert.equal(saved.idpOnlyKind, "app-visible")
  assert.equal(saved.nextCall, undefined)
  assert.equal(/finalize-login NOW/.test(saved.next), false)
  assert.equal(slept, 0)
})

test("inspectExisting still waits for a real pre-save sinceVersion when the jar is empty", async () => {
  let slept = 0
  const waiting = await waitForProfileSave("consistencyhub", {
    sinceVersion: 2,
    timeoutMs: 5_000,
    inspectExisting: true,
    deps: {
      now: (() => {
        let t = 0
        return () => (t += 1_000)
      })(),
      sleep: async () => {
        slept += 1
      },
      list: async () => [{ id: "p1", name: "consistencyhub", version: 2 }],
      inspect: async () => ({ cookies: 0, origins: 0 }),
    },
  })
  assert.equal(waiting.status, "timeout")
  assert.ok(slept > 0)
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

test("pageForSession applies storageState when connect exposes no default context", async () => {
  let baked = ""
  const createdPage = { id: "from-new" }
  const browser = {
    session: {
      storageState: {
        cookies: [{ name: "sid", value: "1", domain: "example.com" }],
        origins: [
          {
            origin: "https://consistencyhub.io",
            localStorage: [{ name: "__auspex_ss__:accessToken", value: "t" }],
          },
        ],
      },
    },
    contexts: () => [],
    newContext: async (opts: { storageState?: { origins?: Array<{ localStorage?: Array<{ name: string }> }> } }) => {
      assert.equal(opts.storageState?.origins?.[0]?.localStorage?.[0]?.name, "__auspex_ss__:accessToken")
      return {
        addInitScript: async (script: { content?: string } | string, arg?: { baked?: Record<string, Record<string, string>> }) => {
          if (typeof script === "object" && script.content) baked = script.content
          else baked = JSON.stringify(arg ?? {})
        },
        pages: () => [createdPage],
        newPage: async () => ({ id: "new" }),
      }
    },
  }
  const page = await pageForSession(browser as never)
  assert.equal(page, createdPage)
  assert.match(baked, /accessToken/)
  assert.match(baked, /consistencyhub\.io/)
})

test("toPlaywrightStorageState does not force httpOnly or secure true", () => {
  const pw = toPlaywrightStorageState({
    cookies: [{ name: "sid", value: "1", domain: "example.com" }],
  })
  assert.equal(pw.cookies[0]?.httpOnly, false)
  assert.equal(pw.cookies[0]?.secure, false)
})

test("inspectOriginForAwait forwards saved-check and login --url, not public marketing", () => {
  assert.equal(inspectOriginForAwait({ name: "consistencyhub" }), "https://consistencyhub.io")
  assert.equal(inspectOriginForAwait({ name: "ironadamant" }), undefined)
  assert.equal(inspectOriginForAwait({ name: "checkpoint" }), undefined)
  assert.equal(inspectOriginForAwait({ name: "myapp" }), undefined)
  assert.equal(inspectOriginForAwait({ name: "myapp", url: "https://app.example/login" }), "https://app.example")
  assert.equal(inspectOriginForAwait({ name: "myapp", url: "https://ironadamant.com" }), undefined)
})

test("loginWaitAwaitOpts always passes saveEditor", () => {
  assert.deepEqual(loginWaitAwaitOpts(), { saveEditor: true })
  assert.deepEqual(loginWaitAwaitOpts({ sinceVersion: 4, url: "https://app.example" }), {
    sinceVersion: 4,
    url: "https://app.example",
    saveEditor: true,
  })
})

test("waitForProfileSave forwards login --url origin for unknown profiles", async () => {
  const origins: Array<string | undefined> = []
  const completed = await waitForProfileSave("myapp", {
    sinceVersion: 1,
    url: "https://app.example/dash",
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
      list: async () => [{ id: "p3", name: "myapp", version: 2 }],
      inspect: async (_id, origin) => {
        origins.push(origin)
        return origin ? { cookies: 3, origins: 1, sessionStorage: 0 } : { cookies: 3, origins: 1 }
      },
    },
  })
  assert.deepEqual(origins, ["https://app.example"])
  assert.equal(completed.sessionStorage, 0)
  assert.match(completed.next, /warning/i)
  assert.match(completed.next, /finalize-login/)
  assert.equal(completed.next.includes("Run auspex check"), false)
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
