import assert from "node:assert/strict"
import test from "node:test"
import {
  CONSOLE_PROFILES_URL,
  attachHandoffQr,
  formatLogin,
  loginInstructions,
  requestLoginHandoff,
} from "../src/profiles.ts"

test("loginInstructions with handoff includes url not only Open editor", () => {
  const result = loginInstructions(
    { id: "prof_test_id", name: "auspex-goal-test" },
    "https://example.com/login",
    { url: "https://console.getsolari.com/handoff/abc", handoffId: "h1", expiresAt: "soon", version: 7 },
  )
  assert.equal(result.profileId, "prof_test_id")
  assert.equal(result.name, "auspex-goal-test")
  assert.equal(result.url, "https://console.getsolari.com/handoff/abc")
  assert.equal(result.handoffId, "h1")
  assert.equal(result.sinceVersion, 7)
  assert.match(result.next, /handoff|url/i)
  assert.match(result.next, /await_login|await-login|cookies or origins/)
  assert.match(result.next, /finalize_login|finalize-login/)
  assert.match(result.next, /phone keyboard/)
  assert.match(result.next, /Never paste/)
  assert.match(result.next, /30 minutes/)
  assert.equal(result.next.includes("handoff.qrPath"), false)
  assert.equal(result.next.includes("Open editor"), false)
  assert.equal(/or check --profile/.test(result.next), false)
  assert.match(result.handoff?.openOnPhone ?? "", /phone keyboard/)
  assert.match(result.handoff?.oneLiner ?? "", /handoff\/abc/)
  const printed = formatLogin(result)
  assert.match(printed, /handoff\/abc/)
  assert.match(printed, /auspex-goal-test/)
  assert.match(printed, /prof_test_id/)
  assert.equal(result.consoleUrl, CONSOLE_PROFILES_URL)
})

test("attachHandoffQr mentions qrPath only when a PNG was written", () => {
  const result = loginInstructions(
    { id: "prof_test_id", name: "auspex-goal-test" },
    undefined,
    { url: "https://console.getsolari.com/handoff/abc" },
  )
  assert.equal(result.next.includes("handoff.qrPath"), false)
  attachHandoffQr(result, "/tmp/handoff-qr.png")
  assert.equal(result.handoff?.qrPath, "/tmp/handoff-qr.png")
  assert.match(result.next, /handoff\.qrPath/)
  attachHandoffQr(result, "")
  assert.equal(result.handoff?.qrPath, undefined)
  assert.equal(result.next.includes("handoff.qrPath"), false)
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
