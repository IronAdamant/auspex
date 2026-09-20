import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  CONSOLE_PROFILES_URL,
  PHONE_HANDOFF_PAGE,
  attachHandoffQr,
  fetchEditorVncToken,
  formatLogin,
  phoneSavePaste,
  saveProfileEditor,
  handoffTokenFromUrl,
  loginInstructions,
  phoneHandoffUrl,
  qrPayloadForHandoff,
  requestLoginHandoff,
} from "../src/profiles.ts"

test("loginInstructions without IME page warns that Solari noVNC will not open the phone keyboard", () => {
  const solari = "https://console.getsolari.com/handoff/abc"
  const result = loginInstructions(
    { id: "prof_test_id", name: "auspex-goal-test" },
    "https://example.com/login",
    { url: solari, handoffId: "h1", expiresAt: "soon", version: 7 },
  )
  assert.equal(result.url, solari)
  assert.equal(result.handoff?.url, solari)
  assert.equal(result.handoff?.mobileUrl, solari)
  assert.equal(result.handoff?.desktopUrl, CONSOLE_PROFILES_URL)
  assert.match(result.next, /noVNC/)
  assert.match(result.next, /software keyboard will not open/)
  assert.equal(result.next.includes("real text field"), false)
  assert.match(result.handoff?.openOnPhone ?? "", /noVNC/)
  assert.equal(qrPayloadForHandoff(result.handoff!), solari)
  assert.equal(result.consoleUrl, CONSOLE_PROFILES_URL)
})

test("loginInstructions with phone IME URL labels the real text-field page", () => {
  const solari = "https://console.getsolari.com/handoff/abc"
  const mobile = phoneHandoffUrl("vnc.jwt.token", solari)
  const result = loginInstructions(
    { id: "prof_test_id", name: "auspex-goal-test" },
    "https://example.com/login",
    { url: solari, handoffId: "h1", expiresAt: "soon", version: 7 },
    undefined,
    mobile,
  )
  assert.equal(result.handoff?.url, solari)
  assert.equal(result.handoff?.mobileUrl, mobile)
  assert.match(result.handoff?.mobileUrl ?? "", /ironadamant\.com\/auspex\/phone\.html/)
  assert.equal(result.handoff?.desktopUrl, CONSOLE_PROFILES_URL)
  assert.match(result.next, /real text field/)
  assert.match(result.next, /phone keyboard/)
  assert.match(result.next, /handoff\.desktopUrl/)
  assert.match(result.next, /Open editor/)
  assert.match(result.next, /Never paste/)
  assert.match(result.next, /30 minutes/)
  assert.match(result.next, /noVNC|software keyboard will not open/)
  assert.equal(result.next.includes("gateUrl"), false)
  assert.match(result.handoff?.openOnPhone ?? "", /real text field/)
  assert.match(result.handoff?.openOnDesktop ?? "", /Open editor/)
  assert.equal(result.handoff?.oneLiner, `Auspex login (phone): ${mobile}`)
  assert.equal(result.handoff?.savePaste, phoneSavePaste("auspex-goal-test"))
  assert.equal(qrPayloadForHandoff(result.handoff!), mobile)
  const printed = formatLogin(result)
  assert.match(printed, /phone\.html/)
  assert.equal(printed.includes("gateUrl"), false)
})

test("phoneHandoffUrl puts the VNC token in the hash, not the query", () => {
  const url = phoneHandoffUrl("tok.en", "https://console.getsolari.com/handoff/abc")
  assert.equal(url.startsWith(PHONE_HANDOFF_PAGE + "#"), true)
  const hash = new URL(url).hash.slice(1)
  const params = new URLSearchParams(hash)
  assert.equal(params.get("v"), "tok.en")
  assert.equal(params.get("h"), "https://console.getsolari.com/handoff/abc")
  const withIds = phoneHandoffUrl("tok.en", "https://console.getsolari.com/handoff/abc", {
    profileId: "prof_1",
    profileName: "demo",
    handoffToken: "hand_1",
  })
  const extra = new URLSearchParams(new URL(withIds).hash.slice(1))
  assert.equal(extra.get("p"), "prof_1")
  assert.equal(extra.get("n"), "demo")
  assert.equal(extra.get("t"), "hand_1")
  assert.equal(new URL(url).search, "")
  assert.equal(handoffTokenFromUrl("https://console.getsolari.com/handoff/WS2-abc"), "WS2-abc")
})

test("fetchEditorVncToken treats 409 as already running and returns the token", async () => {
  const calls: string[] = []
  const vnc = await fetchEditorVncToken("prof_1", "hand_1", {
    sleepMs: 0,
    tries: 3,
    post: async (p) => {
      calls.push(p)
      if (p.endsWith("/editor")) return { status: 409, json: { error: "Editor already running" } }
      return { status: 200, json: { token: "vnc.jwt", ready: true } }
    },
  })
  assert.equal(vnc, "vnc.jwt")
  assert.equal(calls[0]?.endsWith("/editor"), true)
  assert.equal(calls[1]?.endsWith("/editor/token"), true)
})

test("docs/phone.html has a real text field and loads the local noVNC client", () => {
  const html = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/phone.html"),
    "utf8",
  )
  assert.match(html, /<input id="ime"/)
  assert.match(html, /novnc-rfb\.js/)
  assert.match(html, /phone keyboard/)
  assert.match(html, /NoVNCRFB\.default/)
  assert.match(html, /save-editor/)
  assert.match(html, /GET editor HTTP 401/)
  assert.match(html, /Opening remote Chrome/)
  assert.match(html, /clipboard\.writeText/)
  assert.match(html, /id="boot"/)
  assert.match(html, /class="spin"/)
  assert.match(html, /id="paste"/)
  assert.equal(html.includes("location.href = saveUrl"), false)
  assert.equal(html.includes("console.log"), false)
})

test("phoneSavePaste is a line any agent chat can run", () => {
  const line = phoneSavePaste("consistencyhub")
  assert.match(line, /I tapped Save/)
  assert.match(line, /--profile consistencyhub/)
  assert.match(line, /--save-editor/)
  assert.match(line, /saveEditor true/)
})

test("saveProfileEditor POSTs editor/save", async () => {
  const calls: string[] = []
  const saved = await saveProfileEditor(
    { profileId: "prof_1", name: "demo", handoffToken: "hand_1" },
    {
      post: async (p) => {
        calls.push(p)
        return { status: 200, json: { editorStatus: "idle" } }
      },
    },
  )
  assert.equal(saved.ok, true)
  assert.equal(saved.status, 200)
  assert.equal(calls[0]?.endsWith("/editor/save"), true)
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
