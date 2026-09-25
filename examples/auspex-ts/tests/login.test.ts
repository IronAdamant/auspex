import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { doorSaveSiteUrl } from "../src/live-host-change.ts"
import {
  CONSOLE_PROFILES_URL,
  DOOR_HANDOFF_PAGE,
  PHONE_HANDOFF_PAGE,
  attachHandoffQr,
  stampLoginStreamExpiry,
  fetchEditorVncToken,
  editorStartConflictGuide,
  editorStartOk,
  mintStageAfterVnc,
  formatLogin,
  desktopSavePaste,
  phoneSavePaste,
  saveProfileEditor,
  handoffTokenFromUrl,
  loginInstructions,
  desktopHandoffUrlFromPhone,
  doorHandoffUrlFromPhone,
  phoneHandoffUrl,
  qrPayloadForHandoff,
  requestLoginHandoff,
  publicHandoffUrl,
  classifyHandoffHost,
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
  const chooser = doorHandoffUrlFromPhone(mobile)
  assert.equal(result.handoff?.url, chooser)
  assert.equal(result.handoff?.url?.startsWith(`${DOOR_HANDOFF_PAGE}#`), true)
  assert.equal(result.handoff?.mobileUrl, mobile)
  assert.match(result.handoff?.url ?? "", /ironadamant\.com\/auspex\/door\.html#/)
  assert.match(result.handoff?.mobileUrl ?? "", /ironadamant\.com\/auspex\/phone\.html/)
  assert.match(result.handoff?.desktopUrl ?? "", /ironadamant\.com\/auspex\/desktop\.html#/)
  const phoneHash = new URLSearchParams(new URL(mobile).hash.slice(1))
  const desktopHash = new URLSearchParams(new URL(result.handoff?.desktopUrl ?? "").hash.slice(1))
  const chooserHash = new URLSearchParams(new URL(result.handoff?.url ?? "").hash.slice(1))
  assert.equal(desktopHash.get("v"), phoneHash.get("v"))
  assert.equal(chooserHash.get("v"), phoneHash.get("v"))
  assert.equal(desktopHash.get("n"), phoneHash.get("n"))
  assert.equal(desktopHash.get("exp"), phoneHash.get("exp"))
  assert.equal(desktopHash.get("h"), null)
  assert.equal(desktopHash.get("t"), null)
  assert.equal(desktopHash.get("p"), null)
  assert.equal(chooserHash.toString(), phoneHash.toString())
  assert.match(result.next, /real text field/)
  assert.match(result.next, /phone keyboard/)
  assert.match(result.next, /seed\/handoff door/)
  assert.match(result.next, /not a same-session VNC takeover/)
  assert.match(result.next, /handoff\.desktopUrl/)
  assert.match(result.next, /desktop\.html/)
  assert.match(result.next, /handoff\.url/)
  assert.match(result.next, /chooser/)
  assert.equal(result.next.includes("Open editor"), false)
  assert.match(result.next, /Never paste/)
  assert.match(result.next, /30 minutes/)
  assert.match(result.next, /noVNC|software keyboard will not open/)
  assert.equal(result.next.includes("gateUrl"), false)
  assert.match(result.handoff?.openOnPhone ?? "", /real text field/)
  assert.match(result.handoff?.openOnPhone ?? "", /seed\/handoff door|same-session VNC takeover/)
  assert.match(result.handoff?.openOnDesktop ?? "", /desktop\.html/)
  assert.match(result.handoff?.desktopOneLiner ?? "", /desktop\.html#/)
  assert.equal(result.handoff?.oneLiner, `Auspex login: ${chooser}`)
  assert.equal(result.handoff?.savePaste, phoneSavePaste("auspex-goal-test"))
  assert.match(result.handoff?.savePaste ?? "", /cannot read sessionStorage/)
  assert.match(result.handoff?.savePaste ?? "", /hostChanged/)
  assert.equal(result.handoff?.streamExpirySource, "unknown")
  assert.equal(qrPayloadForHandoff(result.handoff!), chooser)
  const printed = formatLogin(result)
  assert.match(printed, /phone\.html/)
  assert.match(printed, /door\.html/)
  assert.equal(printed.includes("gateUrl"), false)
})

test("phoneHandoffUrl puts the VNC token in the hash, not the query", () => {
  const url = phoneHandoffUrl("tok.en", "https://console.getsolari.com/handoff/abc")
  assert.equal(url.startsWith(PHONE_HANDOFF_PAGE + "#"), true)
  const hash = new URL(url).hash.slice(1)
  const params = new URLSearchParams(hash)
  assert.equal(params.get("v"), "tok.en")
  assert.equal(params.get("h"), null)
  assert.equal(params.get("t"), null)
  assert.equal(params.get("p"), null)
  assert.equal(params.get("saved"), null)
  assert.equal(params.get("plist"), null)
  for (const key of params.keys()) {
    assert.ok(["v", "n", "exp", "u"].includes(key), key)
  }
  const withIds = phoneHandoffUrl("tok.en", "https://console.getsolari.com/handoff/abc", {
    profileId: "prof_1",
    profileName: "demo",
    handoffToken: "hand_1",
    saved: "should-not-mint",
    plist: "also-not-mint",
  })
  const extra = new URLSearchParams(new URL(withIds).hash.slice(1))
  assert.equal(extra.get("p"), null)
  assert.equal(extra.get("n"), "demo")
  assert.equal(extra.get("t"), null)
  assert.equal(extra.get("h"), null)
  assert.equal(extra.get("saved"), null)
  assert.equal(extra.get("plist"), null)
  const desktop = desktopHandoffUrlFromPhone(withIds)
  const chooser = doorHandoffUrlFromPhone(withIds)
  assert.match(desktop ?? "", /\/desktop\.html#/)
  assert.match(chooser ?? "", /\/door\.html#/)
  const desk = new URLSearchParams(new URL(desktop ?? "").hash.slice(1))
  const door = new URLSearchParams(new URL(chooser ?? "").hash.slice(1))
  assert.equal(desk.get("v"), "tok.en")
  assert.equal(desk.get("h"), null)
  assert.equal(desk.get("n"), "demo")
  assert.equal(desk.get("t"), null)
  assert.equal(desk.get("exp"), extra.get("exp"))
  assert.equal(door.toString(), desk.toString())
  const withSite = phoneHandoffUrl("tok.en", "https://console.getsolari.com/handoff/abc", {
    siteUrl: "https://consistencyhub.io",
    profileName: "auspex-desktop",
  })
  const desktopWithSite = desktopHandoffUrlFromPhone(withSite) ?? ""
  assert.equal(new URL(withSite).hash.includes("k=1"), false)
  assert.equal(new URL(withSite).hash.includes("pair="), false)
  assert.equal(new URL(desktopWithSite).pathname.endsWith("/desktop.html"), true)
  assert.equal(new URL(desktopWithSite).hash, new URL(withSite).hash)
  assert.equal(new URL(desktopWithSite).hash.includes("u=https"), true)
  assert.equal(doorSaveSiteUrl("", "https://consistencyhub.io", ""), "https://consistencyhub.io")
  assert.equal(
    doorSaveSiteUrl("", "https://consistencyhub.io", "https://app.example/login"),
    "https://consistencyhub.io",
  )
  assert.equal(doorSaveSiteUrl("", "http://insecure.example", "notaurl"), "")
  assert.equal(
    doorSaveSiteUrl("https://app.socialaize.com/home?q=1", "https://myapp.example/dashboard", "https://typed.example/secret"),
    "https://app.socialaize.com",
  )
  const secret = "fixture-login-password"
  const key = "slr_live_fixture_login_key"
  assert.equal(withSite.includes(secret), false)
  assert.equal(desktopWithSite.includes(secret), false)
  assert.equal(withSite.includes(key), false)
  assert.equal(desktopWithSite.includes(key), false)
  assert.equal(withSite.includes("slr_"), false)
  assert.equal(new URL(url).search, "")
  assert.equal(handoffTokenFromUrl("https://console.getsolari.com/handoff/WS2-abc"), "WS2-abc")
})

test("fetchEditorVncToken treats 409 as a live editor and does not mint a token", async () => {
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
  assert.equal(vnc.token, undefined)
  assert.equal(vnc.editorStartStatus, 409)
  assert.equal(vnc.tokenTries, 0)
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.endsWith("/editor"), true)
  assert.equal(mintStageAfterVnc(vnc), "editor-start")
  const guide = editorStartConflictGuide("consistencyhub")
  assert.equal(guide.nextCall.tool, "auspex_login")
  assert.match(guide.text, /status editor-busy/)
  assert.match(guide.text, /409/)
  assert.match(guide.text, /Do not finalize-login/)
  assert.match(guide.text, /purge/)
})

test("editorStartOk treats 202 Accepted as starting (poll token)", () => {
  assert.equal(editorStartOk(200), true)
  assert.equal(editorStartOk(201), true)
  assert.equal(editorStartOk(202), true)
  assert.equal(editorStartOk(409), false)
  assert.equal(editorStartOk(401), false)
  assert.equal(editorStartOk(503), false)
})

test("fetchEditorVncToken polls token after editor-start 202", async () => {
  const calls: string[] = []
  const vnc = await fetchEditorVncToken("prof_1", "hand_1", {
    sleepMs: 0,
    tries: 3,
    post: async (p) => {
      calls.push(p)
      if (p.endsWith("/editor")) return { status: 202, json: { status: "starting" } }
      return { status: 200, json: { token: "vnc.jwt", ready: true } }
    },
  })
  assert.equal(vnc.token, "vnc.jwt")
  assert.equal(vnc.editorStartStatus, 202)
  assert.equal(calls[0]?.endsWith("/editor"), true)
  assert.equal(calls[1]?.endsWith("/editor/token"), true)
})

test("fetchEditorVncToken keeps editor-start HTTP status when start is not 200/201/202", async () => {
  const mint = await fetchEditorVncToken("prof_1", "hand_1", {
    sleepMs: 0,
    tries: 2,
    post: async () => ({ status: 503, json: { error: "unconditional drop: overload" } }),
  })
  assert.equal(mint.token, undefined)
  assert.equal(mint.editorStartStatus, 503)
  assert.equal(mint.tokenTries, 0)
  assert.equal(mintStageAfterVnc(mint), "editor-start")
})

test("empty handoffToken does not report mintStage ready", async () => {
  let posted = false
  const mint = await fetchEditorVncToken("prof_1", "", {
    sleepMs: 0,
    tries: 2,
    post: async () => {
      posted = true
      return { status: 200, json: { token: "should-not-run" } }
    },
  })
  assert.equal(posted, false)
  assert.equal(mint.token, undefined)
  assert.equal(mint.editorStartStatus, 0)
  assert.equal(mint.tokenTries, 0)
  assert.equal(mintStageAfterVnc(mint, Boolean(mint.token)), "editor-token")
  assert.notEqual(mintStageAfterVnc(mint, Boolean(mint.token)), "ready")
  const blankId = await fetchEditorVncToken("", "hand_1", {
    post: async () => ({ status: 200, json: { token: "nope" } }),
  })
  assert.equal(mintStageAfterVnc(blankId, Boolean(blankId.token)), "editor-token")
  assert.equal(
    mintStageAfterVnc({ token: "vnc", editorStartStatus: 200, tokenTries: 1 }, true),
    "ready",
  )
  assert.equal(
    mintStageAfterVnc({ editorStartStatus: 200, tokenTries: 20 }, false),
    "editor-token",
  )
})

test("docs/phone.html has a real text field and loads the local noVNC client", () => {
  const docs = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../docs")
  const html = `${readFileSync(path.join(docs, "phone.html"), "utf8")}\n${readFileSync(path.join(docs, "door-page.js"), "utf8")}`
  assert.match(html, /<input id="ime"/)
  assert.match(html, /novnc-rfb\.js/)
  assert.match(html, /phone keyboard/)
  assert.match(html, /NoVNCRFB\.default/)
  assert.match(html, /save-editor/)
  assert.equal(html.includes("Seed/handoff door for typing"), false)
  assert.equal(html.includes("not a live-session takeover"), false)
  assert.match(html, /Tap the remote field you want, then type here/)
  assert.match(html, /does not refresh folded sessionStorage/)
  assert.match(html, /GET editor HTTP 401/)
  assert.match(html, /Opening remote Chrome/)
  assert.match(html, /clipboard\.writeText/)
  assert.match(html, /execCommand\("copy"\)/)
  assert.match(html, /Copied\. Paste it in your AI chat/)
  assert.match(html, /id="copyScratch"/)
  assert.match(html, /id="copied"/)
  assert.match(html, /id="boot"/)
  assert.match(html, /class="spin"/)
  assert.match(html, /id="paste"/)
  assert.match(html, /id="ttl"/)
  assert.match(html, /id="expired"/)
  assert.match(html, /Link expiry unknown — remint/)
  assert.match(html, /status stream-expired/)
  assert.match(html, /handshake-no-frames/)
  assert.match(html, /nextCall auspex_login/)
  assert.match(html, /jwtExpSeconds/)
  assert.match(html, /params\.get\("exp"\)/)
  assert.match(html, /if \(fromHash\) return fromHash/)
  assert.match(html, /parts\.length < 2 \? parts\.length : 2/)
  assert.match(html, /VNC ~5 min/)
  assert.equal(html.includes("short-lived"), false)
  assert.match(html, /body\.classList\.add\("locked"\)/)
  assert.match(html, /autocomplete="current-password"/)
  assert.match(html, /door-stream\.js/)
  assert.match(html, /reconnectStream/)
  assert.equal(html.includes('id="zoomBar"'), false)
  assert.equal(html.includes("bindPreviewZoom"), false)
  assert.equal(html.includes("Chrome on this phone is the dogfood browser"), false)
  assert.equal(html.includes('id="banner"'), false)
  assert.equal(html.includes("location.href = saveUrl"), false)
  assert.equal(html.includes("console.log"), false)
  assert.equal(html.includes('autocomplete="off"'), false)
})

function doorSaveLine(surface: "phone" | "desktop", name?: string): string {
  const context: Record<string, unknown> = {}
  context.window = context
  vm.runInNewContext(
    readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/door-page.js"), "utf8"),
    context,
    { filename: "door-page.js" },
  )
  const api = context.AuspexDoorPage as { savePasteLine: (profile?: string, door?: string) => string }
  return api.savePasteLine(name, surface)
}

function phoneHtmlSavePaste(name?: string): string {
  return doorSaveLine("phone", name)
}

test("phoneSavePaste is a line any agent chat can run", () => {
  const line = phoneSavePaste("consistencyhub")
  assert.match(line, /I tapped Save/)
  assert.match(line, /--profile consistencyhub/)
  assert.match(line, /--save-editor/)
  assert.match(line, /saveEditor true/)
  assert.match(line, /finalize-login NOW/)
  assert.match(line, /editorSave 200 with editorFold no-cdp/)
  assert.match(line, /verify-with-profile/)
  assert.match(line, /the URL the logged-in app lands on/)
  assert.equal(/Microsoft/.test(line), false)
  assert.match(phoneSavePaste(), /--profile <yours>/)
  assert.match(phoneSavePaste(""), /--profile <yours>/)
})

test("phone.html clipboard equals phoneSavePaste", () => {
  assert.equal(phoneHtmlSavePaste("consistencyhub"), phoneSavePaste("consistencyhub"))
  assert.equal(phoneHtmlSavePaste(""), phoneSavePaste())
  assert.equal(phoneHtmlSavePaste("  myapp  "), phoneSavePaste("  myapp  "))
  assert.equal(phoneHtmlSavePaste(), phoneSavePaste())
})

function desktopHtmlSavePaste(name?: string): string {
  return doorSaveLine("desktop", name)
}

test("desktop.html clipboard equals desktopSavePaste and says desktop page", () => {
  assert.equal(desktopHtmlSavePaste("consistencyhub"), desktopSavePaste("consistencyhub"))
  assert.equal(desktopHtmlSavePaste(""), desktopSavePaste())
  assert.match(desktopSavePaste("app-example"), /chooser\/desktop door/)
  assert.equal(desktopSavePaste("app-example").includes("chooser/phone door"), false)
  assert.match(phoneSavePaste("app-example"), /chooser\/phone door/)
  assert.equal(phoneSavePaste("app-example").includes("chooser/desktop door"), false)
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

test("loginInstructions echoes a derived host slug on next and savePaste", () => {
  const solari = "https://console.getsolari.com/handoff/abc"
  const mobile = phoneHandoffUrl("vnc.jwt.token", solari)
  const result = loginInstructions(
    { id: "prof_test_id", name: "app-example-com" },
    "https://app.example.com",
    { url: solari, handoffId: "h1", expiresAt: "soon", version: 7 },
    undefined,
    mobile,
    { profileDerived: true },
  )
  assert.equal(result.profileDerived, true)
  assert.match(result.next, /derived from URL host: app-example-com/)
  assert.match(result.next, /--profile app-example-com/)
  assert.match(result.next, /--profile <yours>/)
  assert.match(result.handoff?.savePaste ?? "", /--profile app-example-com/)
  assert.equal(result.next.includes("consistencyhub"), false)
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

test("stampLoginStreamExpiry writes ISO expiry and never the JWT", () => {
  const exp = 1_700_000_000
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url")
  const jwt = `${header}.${payload}.sig`
  const mobile = phoneHandoffUrl(jwt, "https://console.getsolari.com/handoff/abc")
  const result = loginInstructions(
    { id: "p", name: "app-example" },
    undefined,
    { url: "https://console.getsolari.com/handoff/abc", expiresAt: "2027-01-15T08:00:00.000Z" },
    undefined,
    mobile,
  )
  stampLoginStreamExpiry(result, "2027-01-15T08:00:00.000Z")
  assert.equal(result.handoff?.streamExpirySource, "jwt")
  assert.equal(result.handoff?.streamExpiresAt, new Date(exp * 1000).toISOString())
  assert.equal((result.handoff?.streamExpiresAt ?? "").includes(jwt), false)
  assert.equal((result.handoff?.streamExpiresAt ?? "").includes("nbf"), false)
})

test("publicHandoffUrl rewrites cluster-internal hosts and keeps the path", () => {
  const raw = "http://console.example.svc.cluster.local/handoff/abc"
  assert.equal(classifyHandoffHost(raw), "cluster-internal")
  assert.equal(publicHandoffUrl(raw), "https://console.getsolari.com/handoff/abc")
  assert.equal(classifyHandoffHost("https://console.getsolari.com/handoff/abc"), "public")
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
  assert.equal(handoff.hostKind, "other")

  const internal = await requestLoginHandoff("prof_1", "Auspex login", {
    post: async () => ({
      url: "http://console.example.svc.cluster.local/handoff/tok",
      handoffId: "tok",
    }),
  })
  assert.equal(internal.hostKind, "cluster-internal")
  assert.equal(internal.url, "https://console.getsolari.com/handoff/tok")
  await assert.rejects(
    () => requestLoginHandoff("prof_1", "x", { post: async () => ({}) }),
    /no url/,
  )
})
