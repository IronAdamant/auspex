import assert from "node:assert/strict"
import test from "node:test"
import {
  CONSOLE_PROFILES_URL,
  formatLogin,
  loginInstructions,
  requestLoginHandoff,
} from "../src/profiles.ts"

test("loginInstructions with handoff includes url not only Open editor", () => {
  const result = loginInstructions(
    { id: "prof_test_id", name: "auspex-goal-test" },
    "https://example.com/login",
    { url: "https://console.getsolari.com/handoff/abc", handoffId: "h1", expiresAt: "soon" },
  )
  assert.equal(result.profileId, "prof_test_id")
  assert.equal(result.name, "auspex-goal-test")
  assert.equal(result.url, "https://console.getsolari.com/handoff/abc")
  assert.equal(result.handoffId, "h1")
  assert.match(result.next, /handoff|url/i)
  assert.equal(result.next.includes("Open editor"), false)
  const printed = formatLogin(result)
  assert.match(printed, /handoff\/abc/)
  assert.match(printed, /auspex-goal-test/)
  assert.match(printed, /prof_test_id/)
  assert.equal(result.consoleUrl, CONSOLE_PROFILES_URL)
})

test("requestLoginHandoff uses injected HTTP and requires url", async () => {
  let path = ""
  let body: unknown
  const handoff = await requestLoginHandoff("prof_1", "Auspex login", {
    post: async (p, b) => {
      path = p
      body = b
      return { url: "https://handoff.example/u", handoffId: "hid" }
    },
  })
  assert.match(path, /\/profiles\/prof_1\/login-handoff/)
  assert.equal((body as { reason: string }).reason, "Auspex login")
  assert.equal(handoff.url, "https://handoff.example/u")
  await assert.rejects(
    () => requestLoginHandoff("prof_1", "x", { post: async () => ({}) }),
    /no url/,
  )
})
