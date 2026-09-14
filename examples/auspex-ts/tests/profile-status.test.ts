import assert from "node:assert/strict"
import test from "node:test"
import { profileStatus } from "../src/profile-status.ts"
import type { CheckResult } from "../src/check.ts"

const hubSaved = {
  name: "consistencyhub",
  url: "https://consistencyhub.io",
  expect: "Document Editor",
  profile: "consistencyhub",
}

test("profileStatus reports loggedOut for missing or empty profiles without live", async () => {
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
  assert.equal(missing.reason, "loggedOut")
  assert.equal(missing.ok, false)
  assert.equal(missing.live, false)
  assert.equal(missing.skippedLive, true)
  assert.match(missing.skipReason ?? "", /never types a password/i)

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
  assert.equal(empty.reason, "loggedOut")
  assert.equal(empty.skippedLive, true)
})

test("profileStatus reports loggedIn when live lands off login", async () => {
  const result = await profileStatus(
    { name: "consistencyhub" },
    {
      listProfiles: async () => [{ id: "p1", name: "consistencyhub", populated: true }],
      savedForName: () => hubSaved,
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

  const human = await profileStatus(
    { profile: "consistencyhub" },
    {
      listProfiles: async () => [{ id: "p1", name: "consistencyhub", populated: true }],
      savedForProfile: () => hubSaved,
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
})

test("profileStatus treats unmatched / as loggedOut even if check reason is mismatch", async () => {
  const result = await profileStatus(
    { name: "consistencyhub" },
    {
      listProfiles: async () => [{ id: "p1", name: "consistencyhub", populated: true }],
      savedForName: () => hubSaved,
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
