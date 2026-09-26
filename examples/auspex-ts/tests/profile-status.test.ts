import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { isWeakSeed } from "../src/profile-persist.ts"
import { checkLoggedOutNext } from "../src/check.ts"
import { profileStatus } from "../src/profile-status.ts"
import type { CheckResult } from "../src/check.ts"

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src")

const hubSaved = {
  name: "consistencyhub",
  url: "https://consistencyhub.io",
  expect: "Document Editor",
  profile: "consistencyhub",
}

test("profileStatus reports emptySave for missing or empty profiles without live", async () => {
  const missing = await profileStatus(
    { name: "consistencyhub" },
    {
      listProfiles: async () => [],
      savedForName: () => hubSaved,
      runCheck: async () => {
        throw new Error("should not live-check")
      },
    },
  )
  assert.equal(missing.reason, "emptySave")
  assert.equal(missing.ok, false)
  assert.equal(missing.live, false)
  assert.equal(missing.skippedLive, true)
  assert.match(missing.skipReason ?? "", /never types a password/i)
  assert.match(missing.skipReason ?? "", /login --profile/)
  assert.match(missing.skipReason ?? "", /await-login --profile consistencyhub --save-editor/)
  assert.match(missing.skipReason ?? "", /Do not finalize-login/)
  assert.equal((missing.skipReason ?? "").includes("--sso --save-profile"), false)

  const empty = await profileStatus(
    { profile: "consistencyhub" },
    {
      listProfiles: async () => [{ id: "p1", name: "consistencyhub", populated: false }],
      savedForProfile: () => hubSaved,
      runCheck: async () => {
        throw new Error("should not live-check")
      },
    },
  )
  assert.equal(empty.reason, "emptySave")
  assert.equal(empty.skippedLive, true)
})

test("profileStatus reports loggedIn when live lands off login", async () => {
  const result = await profileStatus(
    { name: "consistencyhub" },
    {
      listProfiles: async () => [{ id: "p1", name: "consistencyhub", populated: true }],
      savedForName: () => hubSaved,
      inspectSeed: async () => ({ cookies: 5, origins: 1, sessionStorage: 2 }),
      runCheck: async (opts) => {
        assert.equal(opts.profile, "consistencyhub")
        assert.equal(opts.sso, undefined)
        assert.equal(opts.record, undefined)
        return {
          ok: true,
          reason: "matched",
          url: opts.url,
          expect: opts.expect,
          screenshotPath: ".auspex/runs/x/screenshot.png",
          title: "Hub",
          finalUrl: "https://consistencyhub.io/dashboard",
          matched: true,
          excerpt: "Document Editor",
          sessionId: "s",
          networkIdle: true,
        } satisfies CheckResult
      },
    },
  )
  assert.equal(result.reason, "loggedIn")
  assert.equal(result.ok, true)
  assert.equal(result.live, true)
})

test("profileStatus reports loggedOut and needsHuman from live without typing a password", async () => {
  const loggedOut = await profileStatus(
    { profile: "consistencyhub" },
    {
      listProfiles: async () => [{ id: "p1", name: "consistencyhub", populated: true }],
      savedForProfile: () => hubSaved,
      inspectSeed: async () => ({ cookies: 5, origins: 1, sessionStorage: 2 }),
      runCheck: async () =>
        ({
          ok: false,
          reason: "loggedOut",
          url: "https://consistencyhub.io",
          expect: "Document Editor",
          screenshotPath: ".auspex/runs/x/screenshot.png",
          title: "Landing",
          finalUrl: "https://consistencyhub.io/landing",
          matched: false,
          excerpt: "loggedOut",
          sessionId: "s",
          networkIdle: true,
        }) satisfies CheckResult,
    },
  )
  assert.equal(loggedOut.reason, "loggedOut")
  assert.equal(loggedOut.ok, false)
  assert.match(loggedOut.skipReason ?? "", /finalize-login/)
  assert.equal((loggedOut.skipReason ?? "").includes("--sso --save-profile"), false)

  const human = await profileStatus(
    { profile: "consistencyhub" },
    {
      listProfiles: async () => [{ id: "p1", name: "consistencyhub", populated: true }],
      savedForProfile: () => hubSaved,
      inspectSeed: async () => ({ cookies: 5, origins: 1, sessionStorage: 2 }),
      runCheck: async () =>
        ({
          ok: false,
          reason: "needsHuman",
          needsHuman: true,
          url: "https://consistencyhub.io",
          expect: "Document Editor",
          screenshotPath: ".auspex/runs/x/screenshot.png",
          title: "Microsoft",
          finalUrl: "https://login.microsoftonline.com/",
          matched: false,
          excerpt: "Enter password",
          sessionId: "s",
          networkIdle: true,
        }) satisfies CheckResult,
    },
  )
  assert.equal(human.reason, "needsHuman")
  assert.equal(human.skippedLive, true)
  assert.match(human.skipReason ?? "", /never types a password/i)
  assert.match(human.skipReason ?? "", /handoff\.mobileUrl/)
  assert.match(human.skipReason ?? "", /handoff\.desktopUrl/)
  assert.match(human.skipReason ?? "", /real text field/)
  assert.match(human.skipReason ?? "", /Never open handoff\.desktopUrl on a phone/)
  assert.equal((human.skipReason ?? "").includes("finalize-login"), false)
})

test("profileStatus treats unmatched / as loggedOut even if check reason is mismatch", async () => {
  const result = await profileStatus(
    { name: "consistencyhub" },
    {
      listProfiles: async () => [{ id: "p1", name: "consistencyhub", populated: true }],
      savedForName: () => hubSaved,
      inspectSeed: async () => ({ cookies: 5, origins: 1, sessionStorage: 2 }),
      runCheck: async () =>
        ({
          ok: false,
          reason: "mismatch",
          url: "https://consistencyhub.io",
          expect: "Document Editor",
          screenshotPath: ".auspex/runs/x/screenshot.png",
          title: "Hub",
          finalUrl: "https://consistencyhub.io/",
          matched: false,
          excerpt: "Sign in",
          sessionId: "s",
          networkIdle: true,
        }) satisfies CheckResult,
    },
  )
  assert.equal(result.reason, "loggedOut")
  assert.equal(result.ok, false)
})

test("inspect without URL does not claim a sessionStorage count (E8)", async () => {
  let live = 0
  const result = await profileStatus(
    { profile: "consistencyhub" },
    {
      listProfiles: async () => [{ id: "p1", name: "consistencyhub", populated: true }],
      savedForProfile: () => undefined,
      inspectSeed: async (_id, origin) => {
        assert.equal(origin, undefined)
        return { cookies: 78, origins: 5, sessionStorage: 0 }
      },
      runCheck: async () => {
        live += 1
        throw new Error("should not live-check")
      },
    },
  )
  assert.equal(result.reason, "loggedOut")
  assert.equal(result.ok, false)
  assert.equal(result.skippedLive, true)
  assert.equal(result.sessionStorage, undefined)
  assert.equal(live, 0)
})

test("isWeakSeed is counted sessionStorage 0 except public marketing saved checks", () => {
  assert.equal(
    isWeakSeed({ profile: "consistencyhub", cookies: 5, origins: 1, sessionStorage: 0 }),
    true,
  )
  assert.equal(
    isWeakSeed({ url: "https://consistencyhub.io", cookies: 5, origins: 1, sessionStorage: 0 }),
    true,
  )
  assert.equal(
    isWeakSeed({ profile: "ironadamant", cookies: 5, origins: 1, sessionStorage: 0 }),
    false,
  )
  assert.equal(
    isWeakSeed({ profile: "other-profile", cookies: 10, origins: 2, sessionStorage: 0 }),
    true,
  )
  assert.equal(
    isWeakSeed({ profile: "consistencyhub", cookies: 5, origins: 1 }),
    false,
  )
  assert.equal(
    isWeakSeed({ profile: "consistencyhub", cookies: 5, origins: 1, sessionStorage: 2 }),
    false,
  )
  assert.equal(
    isWeakSeed({
      profile: "consistencyhub",
      cookies: 5,
      origins: 1,
      sessionStorage: 2,
      sessionStorageStale: true,
    }),
    true,
  )
  assert.equal(
    isWeakSeed({
      profile: "ironadamant",
      cookies: 5,
      origins: 1,
      sessionStorage: 2,
      sessionStorageStale: true,
    }),
    false,
  )
  const kebab = "/^[a-z0-9]+(-[a-z0-9]+)*$/"
  assert.equal(readFileSync(path.join(srcRoot, "profile-status.ts"), "utf8").includes(kebab), false)
  assert.equal(readFileSync(path.join(srcRoot, "profile-persist.ts"), "utf8").includes(kebab), false)
})

test("cookie-only ironadamant logged-out is loggedOut not weakSeed", async () => {
  const result = await profileStatus(
    { profile: "ironadamant", url: "https://ironadamant.com" },
    {
      listProfiles: async () => [{ id: "p1", name: "ironadamant", populated: true }],
      runCheck: async () =>
        ({
          ok: false,
          reason: "loggedOut",
          url: "https://ironadamant.com",
          expect: "One office job.",
          screenshotPath: ".auspex/runs/x/screenshot.png",
          title: "Landing",
          finalUrl: "https://ironadamant.com/",
          matched: false,
          excerpt: "loggedOut",
          sessionId: "s",
          networkIdle: true,
          profileSeed: { cookies: 4, origins: 1, sessionStorage: 0 },
        }) satisfies CheckResult,
    },
  )
  assert.equal(result.reason, "loggedOut")
  assert.equal(result.ok, false)
  assert.equal(result.live, true)
})

test("profileStatus with a URL skips production inspect (one live session)", async () => {
  let live = 0
  const result = await profileStatus(
    { name: "consistencyhub" },
    {
      listProfiles: async () => [{ id: "p1", name: "consistencyhub", populated: true }],
      savedForName: () => hubSaved,
      runCheck: async (opts) => {
        live += 1
        return {
          ok: true,
          reason: "matched",
          url: opts.url,
          expect: opts.expect,
          screenshotPath: ".auspex/runs/x/screenshot.png",
          title: "Hub",
          finalUrl: "https://consistencyhub.io/dashboard",
          matched: true,
          excerpt: "Document Editor",
          sessionId: "s",
          networkIdle: true,
          profileSeed: { cookies: 5, origins: 1, sessionStorage: 2 },
        } satisfies CheckResult
      },
    },
  )
  assert.equal(result.reason, "loggedIn")
  assert.match(result.next ?? "", /not claimOkProfile and not overnight-safe/)
  assert.match(result.next ?? "", /no keepalive/)
  assert.equal(result.nextCall, undefined)
  assert.equal(live, 1)
  assert.equal(result.cookies, 5)
  assert.equal(result.sessionStorage, 2)
})

test("profileStatus derives weakSeed from live profileSeed when inspect is skipped", async () => {
  const result = await profileStatus(
    { name: "consistencyhub" },
    {
      listProfiles: async () => [{ id: "p1", name: "consistencyhub", populated: true }],
      savedForName: () => hubSaved,
      runCheck: async () =>
        ({
          ok: false,
          reason: "loggedOut",
          url: "https://consistencyhub.io",
          expect: "Document Editor",
          screenshotPath: ".auspex/runs/x/screenshot.png",
          title: "Landing",
          finalUrl: "https://consistencyhub.io/landing",
          matched: false,
          excerpt: "loggedOut",
          sessionId: "s",
          networkIdle: true,
          profileSeed: { cookies: 78, origins: 5, sessionStorage: 0 },
        }) satisfies CheckResult,
    },
  )
  assert.equal(result.reason, "weakSeed")
  assert.equal(result.live, true)
  assert.equal(result.sessionStorage, 0)
  assert.match(result.skipReason ?? "", /finalize-login/)
  assert.equal((result.skipReason ?? "").includes("--sso --save-profile"), false)
})

test("profileStatus reports weakSeed when inspect finds stale folded expiresOn", async () => {
  let live = 0
  const result = await profileStatus(
    { name: "consistencyhub" },
    {
      listProfiles: async () => [{ id: "p1", name: "consistencyhub", populated: true }],
      savedForName: () => hubSaved,
      inspectSeed: async () => ({ cookies: 74, origins: 5, sessionStorage: 2, sessionStorageStale: true }),
      runCheck: async () => {
        live += 1
        throw new Error("should not live-check a stale seed")
      },
    },
  )
  assert.equal(result.reason, "weakSeed")
  assert.equal(result.ok, false)
  assert.equal(result.skippedLive, true)
  assert.equal(result.sessionStorage, 2)
  assert.equal(result.sessionStorageStale, true)
  assert.equal(live, 0)
  assert.match(result.skipReason ?? "", /expiresOn|stale folded/i)
  assert.match(result.skipReason ?? "", /save-editor does not refresh folded sessionStorage/)
  assert.match(result.skipReason ?? "", /finalize-login/)
  assert.match(result.skipReason ?? "", /Remint now/)
  assert.match(result.skipReason ?? "", /claimOkProfile will not pass/)
})

test("profileStatus derives weakSeed from live stale profileSeed when inspect is skipped", async () => {
  const result = await profileStatus(
    { name: "consistencyhub" },
    {
      listProfiles: async () => [{ id: "p1", name: "consistencyhub", populated: true }],
      savedForName: () => hubSaved,
      runCheck: async () =>
        ({
          ok: false,
          reason: "loggedOut",
          url: "https://consistencyhub.io",
          expect: "Document Editor",
          screenshotPath: ".auspex/runs/x/screenshot.png",
          title: "Landing",
          finalUrl: "https://consistencyhub.io/landing",
          matched: false,
          excerpt: "loggedOut",
          sessionId: "s",
          networkIdle: true,
          profileSeed: { cookies: 74, origins: 5, sessionStorage: 2, sessionStorageStale: true },
        }) satisfies CheckResult,
    },
  )
  assert.equal(result.reason, "weakSeed")
  assert.equal(result.live, true)
  assert.equal(result.sessionStorage, 2)
  assert.equal(result.sessionStorageStale, true)
  assert.match(result.skipReason ?? "", /stale folded sessionStorage expiresOn/)
  assert.match(result.skipReason ?? "", /Remint now|claimOkProfile will not pass/)
  assert.equal((result.skipReason ?? "").includes("--sso --save-profile"), false)
})

test("loggedOut check next names finalize-login not remint sso save-profile", () => {
  const next = checkLoggedOutNext("consistencyhub", 78)
  assert.match(next, /finalize-login/)
  assert.match(next, /auspex_finalize_login/)
  assert.equal(next.includes("--sso --save-profile"), false)
  assert.equal(next.includes("--url"), false)
  const unknown = checkLoggedOutNext("acme", 3)
  assert.match(unknown, /finalize-login --profile acme --url <url> --expect <string>/)
  assert.equal(unknown.includes("Document Editor"), false)
})
