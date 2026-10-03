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

function probe(over: Partial<CheckResult>): CheckResult {
  return {
    ok: false,
    reason: "mismatch",
    url: "https://app.example/home",
    expect: "Workspace ready",
    screenshotPath: ".auspex/runs/x/screenshot.png",
    title: "App",
    finalUrl: "https://app.example/home",
    matched: false,
    excerpt: "home",
    sessionId: "s",
    networkIdle: true,
    ...over,
  }
}

test("unmatched app page with counted sessionStorage 0 stays weakSeed", async () => {
  const result = await profileStatus(
    { name: "consistencyhub" },
    {
      listProfiles: async () => [{ id: "p1", name: "consistencyhub", populated: true }],
      savedForName: () => hubSaved,
      runCheck: async () =>
        probe({
          url: "https://consistencyhub.io/dashboard",
          expect: "Document Editor",
          finalUrl: "https://consistencyhub.io/dashboard",
          profileSeed: { cookies: 5, origins: 1, sessionStorage: 0 },
        }),
    },
  )
  assert.equal(result.reason, "weakSeed")
  assert.match(result.skipReason ?? "", /did not see expect "Document Editor"/)
  assert.match(result.skipReason ?? "", /Finalize-login NOW/)
})

