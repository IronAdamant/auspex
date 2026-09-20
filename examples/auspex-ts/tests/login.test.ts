import assert from "node:assert/strict"
import test from "node:test"
import {
  CONSOLE_PROFILES_URL,
  attachHandoffQr,
  formatLogin,
  loginInstructions,
  qrPayloadForHandoff,
  requestLoginHandoff,
} from "../src/profiles.ts"

test("loginInstructions returns two labeled URLs: phone handoff and computer console", () => {
  const phone = "https://console.getsolari.com/handoff/abc"
  const result = loginInstructions(
    { id: "prof_test_id", name: "auspex-goal-test" },
    "https://example.com/login",
    { url: phone, handoffId: "h1", expiresAt: "soon", version: 7 },
  )
  assert.equal(result.profileId, "prof_test_id")
  assert.equal(result.name, "auspex-goal-test")
  assert.equal(result.url, phone)
  assert.equal(result.handoffId, "h1")
  assert.equal(result.sinceVersion, 7)
  assert.equal(result.handoff?.url, phone)
  assert.equal(result.handoff?.mobileUrl, phone)
  assert.equal(result.handoff?.desktopUrl, CONSOLE_PROFILES_URL)
  assert.equal("gateUrl" in (result.handoff ?? {}), false)
  assert.match(result.next, /Show BOTH URLs, labeled/)
  assert.match(result.next, /handoff\.mobileUrl/)
  assert.match(result.next, /handoff\.desktopUrl/)
  assert.match(result.next, /Open editor/)
  assert.match(result.next, /await_login|await-login/)
  assert.match(result.next, /finalize_login|finalize-login/)
  assert.match(result.next, /Never paste/)
  assert.match(result.next, /30 minutes/)
  assert.match(result.next, /Never open handoff\.desktopUrl on a phone/)
  assert.match(result.next, /remote Chromium live view/)
  assert.match(result.next, /software keyboard will not open/)
  assert.equal(result.next.includes("handoff.qrPath"), false)
  assert.equal(result.next.includes("gateUrl"), false)
  assert.equal(/or check --profile/.test(result.next), false)
  assert.match(result.handoff?.openOnPhone ?? "", /handoff\.mobileUrl/)
  assert.match(result.handoff?.openOnPhone ?? "", /software keyboard/)
  assert.match(result.handoff?.openOnDesktop ?? "", /handoff\.desktopUrl/)
  assert.match(result.handoff?.openOnDesktop ?? "", /Open editor/)
  assert.equal(result.handoff?.oneLiner, `Auspex login (phone): ${phone}`)
  assert.match(result.handoff?.desktopOneLiner ?? "", /Auspex login \(computer\): https:\/\/console\.getsolari\.com/)
  assert.match(result.handoff?.desktopOneLiner ?? "", /Open editor/)
  assert.equal(qrPayloadForHandoff(result.handoff!), phone)
  const printed = formatLogin(result)
  assert.match(printed, /handoff\/abc/)
  assert.match(printed, /auspex-goal-test/)
  assert.match(printed, /prof_test_id/)
  assert.match(printed, /"mobileUrl"/)
  assert.match(printed, /"desktopUrl"/)
  assert.equal(printed.includes("gateUrl"), false)
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
