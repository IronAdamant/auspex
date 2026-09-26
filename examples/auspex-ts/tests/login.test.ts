import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import vm from "node:vm"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { doorSaveSiteUrl } from "../src/live-host-change.ts"
import {
  CONSOLE_PROFILES_URL,
  EDITOR_CONSOLE_ORIGIN,
  PHONE_HANDOFF_PAGE,
  attachHandoffQr,
  stampLoginStreamExpiry,
  fetchEditorVncToken,
  editorStartConflictGuide,
  editorStartOk,
  mintStageAfterVnc,
  formatLogin,
  phoneSavePaste,
  saveProfileEditor,
  handoffTokenFromUrl,
  loginInstructions,
  phoneHandoffUrl,
  deleteSolariProfilesByName,
  persistEditorSave,
  stopEditorBeforeProfileDelete,
  stopProfileEditor,
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
  assert.equal("desktopUrl" in (result.handoff ?? {}), false)
  assert.match(result.next, /noVNC/)
  assert.match(result.next, /software keyboard will not open/)
  assert.match(result.next, /Remint auspex_login for the Auspex phone page/)
  assert.equal(result.next.includes("real text field"), false)
  assert.equal(result.next.includes("Open editor"), false)
  assert.equal(result.next.includes("desktopUrl"), false)
  assert.equal(result.next.includes("desktop.html"), false)
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
  assert.equal(result.handoff?.url, mobile)
  assert.equal(result.handoff?.url?.startsWith(`${PHONE_HANDOFF_PAGE}#`), true)
  assert.equal(result.handoff?.mobileUrl, mobile)
  assert.match(result.handoff?.url ?? "", /ironadamant\.com\/auspex\/phone\.html#/)
  assert.equal("desktopUrl" in (result.handoff ?? {}), false)
  assert.equal("openOnDesktop" in (result.handoff ?? {}), false)
  const phoneHash = new URLSearchParams(new URL(mobile).hash.slice(1))
  const urlHash = new URLSearchParams(new URL(result.handoff?.url ?? "").hash.slice(1))
  assert.equal(urlHash.get("v"), phoneHash.get("v"))
  assert.equal(urlHash.get("n"), phoneHash.get("n"))
  assert.equal(urlHash.get("exp"), phoneHash.get("exp"))
  assert.equal(urlHash.get("h"), null)
  assert.equal(urlHash.get("t"), null)
  assert.equal(urlHash.get("p"), null)
  assert.equal(urlHash.toString(), phoneHash.toString())
  assert.match(result.next, /real text field/)
  assert.match(result.next, /phone keyboard/)
  assert.match(result.next, /seed\/handoff door/)
  assert.match(result.next, /not a same-session VNC takeover/)
  assert.match(result.next, /handoff\.url/)
  assert.match(result.next, /phone\.html/)
  assert.match(result.next, /Clear empties the whole field/)
  assert.equal(result.next.includes("desktopUrl"), false)
  assert.equal(result.next.includes("desktop.html"), false)
  assert.equal(result.next.includes("door.html"), false)
  assert.equal(result.next.includes("chooser"), false)
  assert.equal(result.next.includes("Open editor"), false)
  assert.match(result.next, /Never paste/)
  assert.match(result.next, /30 minutes/)
  assert.match(result.next, /noVNC|software keyboard will not open/)
  assert.equal(result.next.includes("gateUrl"), false)
  assert.match(result.handoff?.openOnPhone ?? "", /real text field/)
  assert.match(result.handoff?.openOnPhone ?? "", /Clear empties the whole field/)
  assert.match(result.handoff?.openOnPhone ?? "", /seed\/handoff door|same-session VNC takeover/)
  assert.equal(result.handoff?.oneLiner, `Auspex login: ${mobile}`)
  assert.equal(result.handoff?.savePaste, phoneSavePaste("auspex-goal-test"))
  assert.match(result.handoff?.savePaste ?? "", /cannot read sessionStorage/)
  assert.match(result.handoff?.savePaste ?? "", /hostChanged/)
  assert.equal(result.handoff?.streamExpirySource, "unknown")
  assert.equal(qrPayloadForHandoff(result.handoff!), mobile)
  const printed = formatLogin(result)
  assert.match(printed, /phone\.html/)
  assert.equal(printed.includes("door.html"), false)
  assert.equal(printed.includes("desktop.html"), false)
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
  assert.equal(extra.get("v"), "tok.en")
  assert.equal(extra.get("h"), null)
  assert.equal(extra.get("n"), "demo")
  assert.equal(extra.get("t"), null)
  assert.equal(extra.get("exp"), null)
  const withSite = phoneHandoffUrl("tok.en", "https://console.getsolari.com/handoff/abc", {
    siteUrl: "https://consistencyhub.io",
    profileName: "auspex-phone",
  })
  assert.equal(new URL(withSite).pathname.endsWith("/phone.html"), true)
  assert.equal(new URL(withSite).hash.includes("k=1"), false)
  assert.equal(new URL(withSite).hash.includes("pair="), false)
  assert.equal(new URL(withSite).hash.includes("u=https"), true)
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
  assert.equal(withSite.includes(key), false)
  assert.equal(withSite.includes("slr_"), false)
  assert.equal(new URL(url).search, "")
  assert.equal(handoffTokenFromUrl("https://console.getsolari.com/handoff/WS2-abc"), "WS2-abc")
  assert.equal(EDITOR_CONSOLE_ORIGIN, CONSOLE_PROFILES_URL)
})

test("fetchEditorVncToken reuses a live editor on HTTP 409 by polling the token", async () => {
  const calls: string[] = []
  let deleted = false
  const vnc = await fetchEditorVncToken("prof_1", "hand_1", {
    sleepMs: 0,
    tries: 3,
    recover: true,
    del: async () => {
      deleted = true
      return { status: 204, json: {} }
    },
    post: async (p) => {
      calls.push(p)
      if (p.endsWith("/editor/token")) return { status: 200, json: { token: "vnc.jwt", ready: true } }
      if (p.endsWith("/editor")) return { status: 409, json: { error: "Editor already running" } }
      return { status: 500, json: {} }
    },
  })
  assert.equal(vnc.token, "vnc.jwt")
  assert.equal(vnc.editorStartStatus, 409)
  assert.equal(vnc.tokenTries, 1)
  assert.equal(deleted, false)
  assert.equal(calls[0]?.endsWith("/editor"), true)
  assert.equal(calls[1]?.endsWith("/editor/token"), true)
  assert.equal(mintStageAfterVnc(vnc, Boolean(vnc.token)), "ready")
  const guide = editorStartConflictGuide("consistencyhub")
  assert.equal(guide.nextCall.tool, "auspex_login")
  assert.match(guide.text, /status editor-busy/)
  assert.match(guide.text, /409/)
  assert.match(guide.text, /Do not finalize-login/)
  assert.match(guide.text, /still running/)
  assert.match(guide.text, /stop it/)
  assert.equal(/purge the profile after you agree/.test(guide.text), false)
  assert.equal(/--purge/.test(guide.text), false)
})

test("fetchEditorVncToken polls a 409 editor and does not DELETE unless recover is set", async () => {
  const calls: string[] = []
  let deleted = false
  const vnc = await fetchEditorVncToken("prof_1", "hand_1", {
    sleepMs: 0,
    tries: 2,
    del: async () => {
      deleted = true
      return { status: 204, json: {} }
    },
    post: async (p) => {
      calls.push(p)
      if (p.endsWith("/editor/token")) return { status: 404, json: {} }
      if (p.endsWith("/editor")) return { status: 409, json: { error: "Editor already running" } }
      return { status: 500, json: {} }
    },
  })
  assert.equal(vnc.token, undefined)
  assert.equal(vnc.editorStartStatus, 409)
  assert.equal(vnc.tokenTries, 2)
  assert.equal(deleted, false)
  assert.equal(calls.filter((p) => p.endsWith("/editor/token")).length, 2)
  assert.equal(mintStageAfterVnc(vnc), "editor-start")
})

test("fetchEditorVncToken restarts only after a 409 token poll misses", async () => {
  const calls: string[] = []
  let tokenPolls = 0
  let editorPosts = 0
  const vnc = await fetchEditorVncToken("prof_1", "hand_1", {
    sleepMs: 0,
    tries: 2,
    recover: true,
    del: async (p) => {
      calls.push(`DELETE ${p}`)
      return { status: 204, json: {} }
    },
    post: async (p) => {
      calls.push(`POST ${p}`)
      if (p.endsWith("/editor/token")) {
        tokenPolls += 1
        if (tokenPolls <= 2) return { status: 404, json: {} }
        return { status: 200, json: { token: "vnc.jwt" } }
      }
      if (p.endsWith("/editor")) {
        editorPosts += 1
        return { status: editorPosts === 1 ? 409 : 202, json: {} }
      }
      return { status: 500, json: {} }
    },
  })
  assert.equal(vnc.token, "vnc.jwt")
  assert.equal(calls[0]?.startsWith("POST "), true)
  assert.match(calls[0] ?? "", /\/editor$/)
  const deleteAt = calls.findIndex((call) => call.startsWith("DELETE "))
  assert.ok(deleteAt > 2)
  assert.match(calls[deleteAt] ?? "", /\/editor$/)
  assert.equal(calls[deleteAt + 1]?.startsWith("POST "), true)
  assert.equal(mintStageAfterVnc(vnc, Boolean(vnc.token)), "ready")
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

function phoneHtmlSavePaste(name?: string): string {
  const context: Record<string, unknown> = {}
  context.window = context
  vm.runInNewContext(
    readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/door-page.js"), "utf8"),
    context,
    { filename: "door-page.js" },
  )
  const api = context.AuspexDoorPage as { savePasteLine: (profile?: string) => string }
  return api.savePasteLine(name)
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

test("phone Save paste names the phone page", () => {
  assert.match(phoneSavePaste("app-example"), /Auspex phone page/)
  assert.equal(phoneSavePaste("app-example").includes("chooser"), false)
  assert.equal(phoneSavePaste("app-example").includes("desktop door"), false)
  assert.equal(phoneSavePaste("app-example").includes("desktop page"), false)
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

test("stopProfileEditor DELETEs /editor with the handoff token", async () => {
  const seen: Array<{ method: string; url: string; token: string }> = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const headers = new Headers(init?.headers)
    seen.push({
      method: init?.method ?? "",
      url: String(url),
      token: headers.get("x-handoff-token") ?? "",
    })
    return new Response(null, { status: 204 })
  }
  try {
    const stopped = await stopProfileEditor("prof_1", "hand_1")
    assert.equal(stopped.ok, true)
    assert.equal(stopped.status, 204)
    assert.equal(seen[0]?.method, "DELETE")
    assert.match(seen[0]?.url ?? "", /\/api\/profiles\/prof_1\/editor$/)
    assert.equal(seen[0]?.token, "hand_1")
  } finally {
    globalThis.fetch = original
  }
})

test("profile wipe stops the editor before profiles.delete and reports wipeFailed", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "auspex-wipe-"))
  const calls: string[] = []
  await persistEditorSave({ profileId: "prof_1", name: "hub", handoffToken: "hand_1" }, root)
  await stopEditorBeforeProfileDelete(
    { id: "prof_1", name: "hub" },
    {
      root,
      del: async (p) => {
        calls.push(`DELETE ${p}`)
        return { status: 204, json: {} }
      },
    },
  )
  assert.match(calls[0] ?? "", /\/api\/profiles\/prof_1\/editor$/)

  const order: string[] = []
  const failed = await deleteSolariProfilesByName(["hub"], {
    list: async () => [{ id: "prof_1", name: "hub" }],
    stopEditor: async (row) => {
      order.push(`DELETE editor ${row.id}`)
    },
    deleteProfile: async (id) => {
      order.push(`profiles.delete ${id}`)
      throw new Error("409 editor is open")
    },
  })
  assert.deepEqual(order, ["DELETE editor prof_1", "profiles.delete prof_1"])
  assert.deepEqual(failed.wiped, [])
  assert.equal(failed.wipeFailed[0]?.name, "hub")
  assert.match(failed.wipeFailed[0]?.error ?? "", /409 editor is open/)

  const wiped = await deleteSolariProfilesByName(["hub"], {
    list: async () => [{ id: "prof_1", name: "hub" }],
    stopEditor: async (row) => {
      order.push(`stop ${row.id}`)
    },
    deleteProfile: async (id) => {
      order.push(`gone ${id}`)
    },
  })
  assert.deepEqual(wiped.wiped, ["hub"])
  assert.deepEqual(wiped.wipeFailed, [])
})
