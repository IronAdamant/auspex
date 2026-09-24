import assert from "node:assert/strict"
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import vm from "node:vm"
import { USAGE } from "../src/cli.ts"
import { PROFILES_DESCRIPTION } from "../src/tool-copy.ts"
import { OPERATOR_PURGE_QUESTION } from "../src/operator-session.ts"
import { formatHandoffNext, HANDOFF_OPEN_ON_DESKTOP_PAGE, HANDOFF_OPEN_ON_PHONE } from "../src/profiles.ts"
import {
  auspexAwaitLoginInputSchema,
  auspexCheckInputObject,
  auspexDesktopInputSchema,
  auspexFinalizeLoginInputSchema,
  auspexLoginInputObject,
  auspexProfileStatusInputSchema,
  auspexProfilesInputSchema,
  auspexReapInputSchema,
  auspexTraceInputSchema,
} from "../src/tool-schema.ts"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const PASSWORD = "fixture-door-password"
const USERNAME = "fixture-door-username"
const SOLARI_KEY = "slr_live_fixture_door_key"

function readDoor(name: string): string {
  return readFileSync(path.join(repo, "docs", name), "utf8")
}

function assertTypingDoor(html: string, label: string) {
  assert.match(html, /data-solari-remote="vnc"/, `${label} remote mount`)
  assert.match(html, /novnc-rfb\.js/, `${label} noVNC client`)
  assert.match(html, /wss:\/\/api\.getsolari\.com\/vnc-proxy/, `${label} Solari remote UI`)
  assert.match(html, /id="ime"/, `${label} one typing field`)
  assert.equal(html.includes('id="paste-btn"'), false, `${label} no Paste button`)
  assert.match(html, /id="bullets"/, `${label} bullets checkbox`)
  assert.match(html, /Show as bullets/, `${label} bullets label`)
  assert.match(html, /id="imeHint"/, `${label} typing hint`)
  assert.match(html, /before typing anything/, `${label} click-before-type hint`)
  assert.match(html, /remote address bar/, `${label} address bar hint`)
  assert.match(html, /ironadamant\.com does not see/, `${label} privacy copy`)
  assert.match(html, /destination site logs its own login/, `${label} destination-site login`)
  assert.match(html, /type the login again/, `${label} retype after wipe`)
  assert.match(html, /do not host those credentials or session secrets/, `${label} credentials not hosted`)
  assert.match(html, /off by default/, `${label} bullets default documented`)
  assert.match(html, /<input id="ime"[^>]*type="text"/, `${label} visible text by default`)
  assert.equal(/<input id="bullets"[^>]*\schecked/.test(html), false, `${label} bullets default off`)
  assert.match(html, /<form id="imeForm"/, `${label} autofill form`)
  assert.match(html, /form-action 'none'/, `${label} form cannot post off-origin`)
  assert.match(html, /autocomplete="current-password"/, `${label} password autocomplete`)
  assert.match(html, /id="imeUser"/, `${label} username pairing field`)
  assert.match(html, /id="banner"/, `${label} notification banner`)
  assert.equal(html.includes('autocomplete="off"'), false, `${label} autocomplete stays discoverable`)
  assert.equal(html.includes("sendBeacon"), false, `${label} no beacon`)
  assert.equal(html.includes("XMLHttpRequest"), false, `${label} no XHR`)
  assert.equal(/\bfetch\s*\(/.test(html), false, `${label} no fetch`)
  assert.equal(/\blocalStorage\b/.test(html), false, `${label} no localStorage`)
  assert.equal(/\bsessionStorage\s*[.\[]/.test(html), false, `${label} no sessionStorage API`)
  assert.equal(html.includes("google-analytics"), false, `${label} no analytics`)
  assert.equal(html.includes("gtag("), false, `${label} no gtag`)
  assert.deepEqual(
    [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]),
    ["./novnc-rfb.js", "./door-stream.js"],
    `${label} local noVNC plus door-stream helpers`,
  )
  assert.equal(html.includes(">Paste URL<"), false, `${label} no URL paste`)
  assert.equal(html.includes('id="paste-url"'), false, `${label} no URL field`)
  assert.equal(html.includes(">Paste username<"), false, `${label} no username paste`)
  assert.equal(html.includes(">Paste password<"), false, `${label} no password paste`)
  assert.equal(html.includes('id="paste-username"'), false)
  assert.equal(html.includes('id="paste-password"'), false)
  assert.equal(html.includes(PASSWORD), false)
  assert.equal(html.includes(SOLARI_KEY), false)
  assert.match(html, /stay off the AI chat/)
  assert.match(html, /next Auspex command after 30 minutes/)
  assert.equal(html.includes("stay in these boxes on this device only"), false)
  assert.equal(html.includes("They stay on the page"), false)
}

test("phone and desktop doors mount Solari and one typing field", () => {
  const phone = readDoor("phone.html")
  const desktop = readDoor("desktop.html")
  const chooser = readDoor("door.html")
  assertTypingDoor(phone, "phone")
  assertTypingDoor(desktop, "desktop")
  assert.match(chooser, /id="phone"/)
  assert.match(chooser, /id="desktop"/)
  assert.match(chooser, /\.\/phone\.html/)
  assert.match(chooser, /\.\/desktop\.html/)
  assert.match(chooser, /location\.hash/)
  assert.match(chooser, /Seed\/handoff door for typing/)
  assert.match(chooser, /not a live-session takeover/)
  assert.match(chooser, /before typing anything/)
  assert.match(chooser, /ironadamant\.com does not see/)
  assert.match(chooser, /type the login again/)
  assert.match(chooser, /do not host those credentials or session secrets/)
  assert.match(chooser, /Console Solari Save does not capture Microsoft\/SPA sessionStorage/)
  assert.match(chooser, /finalize-login/)
  assert.match(chooser, /hostChanged/)
  assert.match(chooser, /expectMatchedPublicLanding|Dashboard does not match One Dashboard/)
  assert.match(chooser, /id="card"/)
  assert.equal(chooser.includes('id="ime"'), false)
  assert.equal(chooser.includes('id="paste-btn"'), false)
  assert.equal(chooser.includes('id="paste-username"'), false)
  assert.equal(desktop.includes('id="backspace"'), false)
  assert.equal(desktop.includes('id="enter"'), false)
  assert.equal(desktop.includes(">Delete<"), false)
  assert.equal(desktop.includes(">Enter<"), false)
  assert.match(desktop, /id="save"/)
  assert.equal(desktop.includes("keybox"), false)
  const desktopOrder = ["screen", "ime", "bullets", "save"]
    .map((id) => desktop.indexOf(`id="${id}"`))
  assert.deepEqual(desktopOrder, [...desktopOrder].sort((a, b) => a - b))
  assert.ok(desktopOrder.every((index) => index > 0))
  assert.match(phone, /id="backspace"/)
  assert.match(phone, />Enter</)
  assert.match(desktop, /clamp\(28rem, 72vh, 56rem\)/)
  assert.match(desktop, /min-height: 100vh/)
  assert.match(desktop, /Auspex desktop login/)
  assert.equal(desktop.includes("phone keyboard"), false)
  assert.match(phone, /phone keyboard/)
  assert.match(phone, /Chrome on this phone is the dogfood browser/)
  assert.match(phone, /id="otpMode"/)
  assert.equal(desktop.includes('id="otpMode"'), false)
  assert.match(chooser, /Chrome on phone is the dogfood browser/)
  assert.equal(desktop.includes('id="solari-key"'), false)
  assert.equal(desktop.includes("Save Solari key"), false)
  assert.equal(desktop.includes("auspex.solariKey"), false)
  assert.equal(phone.includes("auspex.solariKey"), false)
  assert.equal(chooser.includes("auspex.solariKey"), false)
  assert.equal(desktop.includes("127.0.0.1:17321"), false)
  assert.equal(desktop.includes("auspex-operator-key"), false)
  for (const [label, html] of [
    ["door", chooser],
    ["phone", phone],
    ["desktop", desktop],
  ] as const) {
    assert.match(html, /Content-Security-Policy/, `${label} CSP`)
    assert.match(html, /frame-ancestors 'none'/, `${label} frame-ancestors`)
  }
  assert.match(phone, /connect-src 'self' wss:\/\/api\.getsolari\.com/)
  assert.match(desktop, /connect-src 'self' wss:\/\/api\.getsolari\.com/)
  assert.equal(desktop.includes("127.0.0.1:17321"), false)
  assert.equal(chooser.includes("wss://api.getsolari.com"), false)
  assert.match(phone, /Seed\/handoff door for typing/)
  assert.match(phone, /not a live-session takeover/)
  assert.match(USAGE, /30 minutes/)
  assert.match(USAGE, /stream-expired/)
  assert.match(USAGE, /editor-save-hung/)
  assert.match(USAGE, /profile-busy/)
  assert.match(USAGE, /not included in the agent message/)
  assert.match(USAGE, /chooser|door\.html/)
  assert.match(OPERATOR_PURGE_QUESTION, /next Auspex command/)
  assert.match(OPERATOR_PURGE_QUESTION, /not that wipe/)
  assert.equal(OPERATOR_PURGE_QUESTION.includes("stay in the local page fields only"), false)
  assert.equal(readDoor("phone.html").includes('id="phoneProfiles"'), false)
  assert.match(USAGE, /testing is done/)
  assert.match(USAGE, /purged/)
  assert.match(PROFILES_DESCRIPTION, /testing is done/)
  assert.match(PROFILES_DESCRIPTION, /30 minutes/)
  assert.match(PROFILES_DESCRIPTION, /not included in the agent message/)
  assert.equal(USAGE.includes(PASSWORD), false)
  assert.equal(USAGE.includes(USERNAME), false)
  assert.equal(PROFILES_DESCRIPTION.includes(SOLARI_KEY), false)
  const watch = readDoor("index.html")
  assert.match(watch, /Phone door/)
  assert.match(watch, /Desktop door/)
  assert.match(watch, /not the Mousepad sandbox demo/)
  assert.match(watch, /keyless Pages/)
  assert.match(watch, /SOLARI_API_KEY or \.auspex\/operator-key/)
  assert.match(phone, /Console Solari Save does not capture Microsoft\/SPA sessionStorage/)
  assert.match(desktop, /Console Solari Save does not capture Microsoft\/SPA sessionStorage/)
  assert.match(phone, /status stream-expired/)
  assert.match(desktop, /status stream-expired/)
  assert.match(chooser, /status stream-expired/)
  assert.match(phone, /handshake-no-frames/)
  assert.match(desktop, /handshake-no-frames/)
  assert.match(phone, /securityfailure/)
  assert.match(desktop, /securityfailure/)
  assert.equal(phone.includes("If the window is still blank, wait a few seconds or remint"), false)
  assert.equal(desktop.includes("If the window is still blank, wait a few seconds or remint"), false)
  assert.match(watch, /door\.html/)
  assert.match(watch, /no Paste button/)
  assert.match(watch, /ironadamant\.com does not see/)
  assert.match(watch, /type the login again/)
  assert.match(watch, /do not host those credentials or session secrets/)
  for (const file of ["README.md", "examples/auspex-ts/README.md", "AGENTS.md", "examples/auspex-ts/AGENTS.md"]) {
    const text = readFileSync(path.join(repo, file), "utf8")
    assert.match(text, /Show as bullets is off by default/, file)
    assert.match(text, /password manager can paste into the text field/, file)
  }
  assert.match(OPERATOR_PURGE_QUESTION, /clears on Enter, Save, or lock/)
  assert.match(OPERATOR_PURGE_QUESTION, /type the login again/)
  assert.match(OPERATOR_PURGE_QUESTION, /do not host those credentials or session secrets/)
  assert.equal(OPERATOR_PURGE_QUESTION.includes("clears on paste"), false)
  const handoffNext = formatHandoffNext({ hasPhoneIme: true, hasDesktopPage: true, profileName: "app-example" })
  for (const [label, text] of [
    ["openOnPhone", HANDOFF_OPEN_ON_PHONE],
    ["openOnDesktop", HANDOFF_OPEN_ON_DESKTOP_PAGE],
    ["handoff next", handoffNext],
  ] as const) {
    assert.match(text, /type the login again/, label)
    assert.match(text, /do not host those credentials or session secrets/, label)
    assert.equal(text.includes(PASSWORD), false, label)
  }
  assert.equal(handoffNext.includes("Open editor"), false)
  for (const file of ["AGENTS.md", "examples/auspex-ts/AGENTS.md", ".cursor/rules/auspex.mdc"]) {
    const text = readFileSync(path.join(repo, file), "utf8")
    assert.match(text, /ironadamant\.com does not see/, file)
    assert.match(text, /no Paste button/, file)
    assert.match(text, /before typing anything/, file)
    assert.match(text, /type the login again/, file)
    assert.match(text, /do not host those credentials or session secrets/, file)
    assert.equal(text.includes("click the remote login field, then paste"), false, file)
  }
})

test("agent tool schemas have no username, password, or Solari key field", () => {
  const schemas = [
    auspexCheckInputObject,
    auspexLoginInputObject,
    auspexAwaitLoginInputSchema,
    auspexFinalizeLoginInputSchema,
    auspexProfilesInputSchema,
    auspexProfileStatusInputSchema,
    auspexDesktopInputSchema,
    auspexReapInputSchema,
    auspexTraceInputSchema,
  ]
  for (const schema of schemas) {
    for (const [key, field] of Object.entries(schema.shape)) {
      assert.equal(/^(username|password|solariKey|apiKey)$/i.test(key), false, key)
      const described = "description" in field && typeof field.description === "string" ? field.description : ""
      assert.equal(/accept a password|pass (the |a )?password|username to type/i.test(described), false, key)
    }
  }
  assert.ok(auspexProfilesInputSchema.shape.purge)
  assert.ok(auspexProfilesInputSchema.shape.humanAgree)
  assert.equal("password" in auspexProfilesInputSchema.shape, false)
  assert.equal("username" in auspexProfilesInputSchema.shape, false)
})

type DoorEl = {
  textContent: string
  value: string
  href: string
  hidden: boolean
  className: string
  disabled: boolean
  type: string
  checked: boolean
  autocomplete: string
  firstChild: DoorEl | null
  classList: { add: (name: string) => void; remove: (name: string) => void }
  listeners: Array<{ type: string; fn: (ev?: { key?: string; preventDefault?: () => void }) => void }>
  addEventListener: (type: string, fn: (ev?: { key?: string; preventDefault?: () => void }) => void) => void
  focus: () => void
  blur: () => void
  setAttribute: (name: string, value?: string) => void
  removeAttribute: (name?: string) => void
  setSelectionRange: () => void
  querySelector: () => null
  appendChild: (child: DoorEl) => DoorEl
  removeChild: (child: DoorEl) => DoorEl
  style: Record<string, string>
}

function loadDoor(
  html: string,
  hash: string,
  hooks?: {
    intervals?: Map<number, () => void>
    timeouts?: Map<number, () => void>
    cleared?: number[]
    clients?: Array<{ fire: (type: string) => void }>
    keys?: number[]
    hidden?: boolean
  },
) {
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1] ?? "")
  const byId = new Map<string, DoorEl>()
  const stored = new Map<string, string>()
  function makeEl(init?: { hidden?: boolean; type?: string; checked?: boolean }): DoorEl {
    const children: DoorEl[] = []
    const el: DoorEl = {
      textContent: "",
      value: "",
      href: "",
      hidden: init?.hidden ?? false,
      className: "",
      disabled: false,
      type: init?.type ?? "",
      checked: init?.checked ?? false,
      autocomplete: "",
      firstChild: null,
      style: {},
      listeners: [],
      classList: {
        add(name: string) {
          el.className = `${el.className} ${name}`.trim()
        },
        remove(name: string) {
          el.className = el.className
            .split(/\s+/)
            .filter((part) => part && part !== name)
            .join(" ")
        },
      },
      addEventListener(type, fn) {
        el.listeners.push({ type, fn })
      },
      focus() {},
      blur() {},
      setAttribute(name, value) {
        if (name === "hidden") el.hidden = value !== "false"
        if (name === "type") el.type = String(value ?? "")
        if (name === "autocomplete") el.autocomplete = String(value ?? "")
      },
      removeAttribute(name) {
        if (name === "hidden") el.hidden = false
        if (name === "href") el.href = ""
      },
      setSelectionRange() {},
      querySelector: () => null,
      appendChild(child: DoorEl) {
        children.push(child)
        el.firstChild = children[0] ?? null
        el.textContent = `${el.textContent}\n${child.textContent}`.trim()
        return child
      },
      removeChild(child: DoorEl) {
        const index = children.indexOf(child)
        if (index >= 0) children.splice(index, 1)
        el.firstChild = children[0] ?? null
        return child
      },
    }
    return el
  }
  for (const id of ids) {
    const tag = html.match(new RegExp(`<[^>]*\\sid="${id}"[^>]*>`))?.[0] ?? ""
    const type = /type="([^"]+)"/.exec(tag)?.[1] ?? ""
    byId.set(id, makeEl({
      hidden: /\shidden(?:\s|>|=)/.test(tag),
      type,
      checked: /\schecked(?:\s|>|=)/.test(tag),
    }))
  }
  const docListeners: Array<{ type: string; fn: () => void }> = []
  const document = {
    hidden: hooks?.hidden ?? false,
    visibilityState: hooks?.hidden ? "hidden" : "visible",
    getElementById: (id: string) => byId.get(id) ?? makeEl(),
    createElement: () => makeEl(),
    body: makeEl(),
    execCommand: () => false,
    addEventListener: (type: string, fn: () => void) => {
      docListeners.push({ type, fn })
    },
  }
  const exp = Math.floor(Date.now() / 1000) + 600
  const location = { hash: hash || `#v=door-token&exp=${exp}&n=supabase-com` }
  let intervalId = 0
  let timeoutId = 0
  const timeouts = hooks?.timeouts ?? new Map<number, () => void>()
  const context: Record<string, unknown> = {
    document,
    location,
    URLSearchParams,
    setInterval: (fn: () => void) => {
      intervalId += 1
      hooks?.intervals?.set(intervalId, fn)
      return intervalId
    },
    clearInterval: (id: number) => {
      hooks?.cleared?.push(id)
      hooks?.intervals?.delete(id)
    },
    setTimeout: (fn: () => void) => {
      timeoutId += 1
      timeouts.set(timeoutId, fn)
      return timeoutId
    },
    clearTimeout: (id: number) => {
      timeouts.delete(id)
    },
    atob: (value: string) => Buffer.from(value, "base64").toString("binary"),
    navigator: { clipboard: { writeText: async () => {}, readText: async () => "" } },
    localStorage: {
      setItem: (key: string, value: string) => {
        stored.set(key, value)
      },
      getItem: (key: string) => stored.get(key) ?? null,
      removeItem: (key: string) => {
        stored.delete(key)
      },
    },
    console,
  }
  if (hooks?.clients || hooks?.keys) {
    context.NoVNCRFB = function StubRemote() {
      const listeners: Array<{ type: string; fn: () => void }> = []
      hooks?.clients?.push({
        fire(type: string) {
          for (const row of listeners) if (row.type === type) row.fn()
        },
      })
      return {
        scaleViewport: false,
        resizeSession: false,
        background: "",
        sendKey(keysym: number) {
          hooks?.keys?.push(keysym)
        },
        addEventListener(type: string, fn: () => void) {
          listeners.push({ type, fn })
        },
        disconnect() {},
      }
    }
  }
  context.window = context
  context.addEventListener = () => {}
  const streamJs = readFileSync(path.join(repo, "docs", "door-stream.js"), "utf8")
  vm.runInNewContext(streamJs, context, { filename: "door-stream.js" })
  const scripts = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (match) => match[1] ?? "",
  )
  for (const code of scripts) {
    vm.runInNewContext(code, context, { filename: "door.html" })
  }
  function flushTimeouts() {
    const pending = [...timeouts.values()]
    timeouts.clear()
    for (const fn of pending) fn()
  }
  function fireVisibility(hidden: boolean) {
    document.hidden = hidden
    document.visibilityState = hidden ? "hidden" : "visible"
    for (const row of docListeners) if (row.type === "visibilitychange") row.fn()
  }
  return { byId, stored, location, document, flushTimeouts, fireVisibility }
}

function click(el: DoorEl | undefined) {
  emit(el, "click")
}

function emit(
  el: DoorEl | undefined,
  type: string,
  ev?: { key?: string; preventDefault?: () => void },
) {
  assert.ok(el, "missing control")
  const handler = el.listeners.find((row) => row.type === type)
  assert.ok(handler, `missing ${type} handler`)
  handler.fn(ev ?? { preventDefault() {} })
}

test("a served docs tree returns the chooser and desktop pages", async () => {
  const pages: Record<string, string> = {
    "/door.html": readDoor("door.html"),
    "/desktop.html": readDoor("desktop.html"),
    "/phone.html": readDoor("phone.html"),
  }
  const server = createServer((req, res) => {
    const name = (req.url ?? "/").split("?")[0] ?? ""
    const body = pages[name]
    if (!body) {
      res.writeHead(404)
      res.end("missing")
      return
    }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(body)
  })
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve())
  })
  const addr = server.address()
  if (!addr || typeof addr === "string") throw new Error("docs server has no port")
  try {
    const desktop = await fetch(`http://127.0.0.1:${addr.port}/desktop.html`)
    const chooser = await fetch(`http://127.0.0.1:${addr.port}/door.html`)
    assert.equal(desktop.status, 200)
    assert.equal(chooser.status, 200)
    assert.match(await desktop.text(), /data-solari-remote="vnc"/)
    assert.match(await chooser.text(), /id="phone"/)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test("door scripts run in a browser-like page and keep secrets off the chat paste line", () => {
  for (const name of ["phone.html", "desktop.html"] as const) {
    const loaded = loadDoor(readDoor(name), "")
    const ime = loaded.byId.get("ime")
    const chat = loaded.byId.get("paste")
    assert.ok(ime && chat)
    ime.value = PASSWORD
    click(loaded.byId.get("save"))
    assert.equal(chat.value.includes(PASSWORD), false)
    assert.equal(ime.value, "")
    ime.value = USERNAME
    emit(ime, "keydown", { key: "Enter", preventDefault() {} })
    assert.equal(ime.value, "")
    assert.equal(chat.value.includes(PASSWORD), false)
    assert.equal(chat.value.includes(USERNAME), false)
    assert.equal(chat.value.includes(SOLARI_KEY), false)
    assert.equal(loaded.byId.get("copyScratch")?.value.includes(PASSWORD), false)
    assert.equal(loaded.stored.size, 0)
    if (name === "phone.html") {
      ime.value = USERNAME
      click(loaded.byId.get("enter"))
      assert.equal(ime.value, "")
      assert.equal(chat.value.includes(USERNAME), false)
    }
    ime.value = PASSWORD
    click(loaded.byId.get("save"))
    assert.match(chat.value, /I tapped Save/)
    assert.match(chat.value, /supabase-com/)
    if (name === "desktop.html") {
      assert.match(chat.value, /Auspex desktop page/)
      assert.equal(chat.value.includes("Auspex phone page"), false)
    } else {
      assert.match(chat.value, /Auspex phone page/)
      assert.equal(chat.value.includes("Auspex desktop page"), false)
    }
    assert.equal(chat.value.includes(PASSWORD), false)
    assert.equal(chat.value.includes(USERNAME), false)
    if (name === "desktop.html") {
      const minted = loadDoor(
        readDoor(name),
        `#v=door-token&exp=${Math.floor(Date.now() / 1000) + 600}&n=auspex-desktop&u=${encodeURIComponent("https://consistencyhub.io")}`,
      )
      const mintedChat = minted.byId.get("paste")
      const mintedIme = minted.byId.get("ime")
      assert.ok(mintedChat && mintedIme)
      mintedIme.value = PASSWORD
      click(minted.byId.get("save"))
      assert.match(mintedChat.value, /auspex-desktop/)
      assert.match(mintedChat.value, /Auspex desktop page/)
      assert.match(mintedChat.value, /Site URL: https:\/\/consistencyhub\.io/)
      assert.equal(mintedChat.value.includes(USERNAME), false)
      assert.equal(mintedChat.value.includes(PASSWORD), false)
      assert.equal(minted.byId.get("solari-key"), undefined)
      assert.equal(minted.byId.get("keybox"), undefined)
    }
    const intervals = new Map<number, () => void>()
    const timeouts = new Map<number, () => void>()
    const clients: Array<{ fire: (type: string) => void }> = []
    const live = loadDoor(
      readDoor(name),
      `#v=door-token&exp=${Math.floor(Date.now() / 1000) + 600}&n=auspex-desktop`,
      { intervals, timeouts, clients },
    )
    live.byId.get("ime")!.value = PASSWORD
    assert.match(live.byId.get("ttl")?.textContent ?? "", /Link active/)
    assert.ok(clients[0])
    clients[0].fire("disconnect")
    live.flushTimeouts()
    const status = live.byId.get("status")?.textContent ?? ""
    assert.match(status, /Reconnecting with the same VNC token/)
    assert.equal(status.includes("new login link is required"), false)
    assert.equal(live.byId.get("ime")?.disabled, false)
    assert.equal(live.byId.get("ime")?.value, PASSWORD)
    assert.ok(clients.length >= 2, `${name} reconnect opens a new RFB`)

    const pauseClients: Array<{ fire: (type: string) => void }> = []
    const hidden = loadDoor(
      readDoor(name),
      `#v=door-token&exp=${Math.floor(Date.now() / 1000) + 600}&n=auspex-desktop`,
      { clients: pauseClients, hidden: true },
    )
    hidden.byId.get("ime")!.value = PASSWORD
    assert.ok(pauseClients[0])
    pauseClients[0].fire("disconnect")
    hidden.flushTimeouts()
    assert.match(hidden.byId.get("status")?.textContent ?? "", /Paused/)
    assert.equal(hidden.byId.get("ime")?.disabled, false)
    assert.equal(hidden.byId.get("ime")?.value, PASSWORD)
    hidden.fireVisibility(false)
    assert.match(hidden.byId.get("status")?.textContent ?? "", /Reconnecting/)
    assert.equal((hidden.byId.get("status")?.textContent ?? "").includes("new login link is required"), false)
  }
})

test("door remints after exhausted reconnects and on a truly expired stream", () => {
  for (const name of ["phone.html", "desktop.html"] as const) {
    const clients: Array<{ fire: (type: string) => void }> = []
    const live = loadDoor(
      readDoor(name),
      `#v=door-token&exp=${Math.floor(Date.now() / 1000) + 600}&n=app-example`,
      { clients },
    )
    for (let i = 0; i < 4; i++) {
      const client = clients[clients.length - 1]
      assert.ok(client, `${name} missing RFB client ${i}`)
      client.fire("disconnect")
      live.flushTimeouts()
    }
    const status = live.byId.get("status")?.textContent ?? ""
    assert.match(status, /new login link is required/)
    assert.match(status, /stream-expired/)
    assert.equal(live.byId.get("ime")?.disabled, true)
    assert.equal(live.byId.get("ime")?.value, "")
  }
})

test("chooser door forwards the same hash to phone and desktop", () => {
  const hash = `#v=door-token&exp=${Math.floor(Date.now() / 1000) + 600}&n=app-example`
  const loaded = loadDoor(readDoor("door.html"), hash)
  const phone = loaded.byId.get("phone")
  const desktop = loaded.byId.get("desktop")
  assert.ok(phone && desktop)
  assert.equal(phone.href, `./phone.html${hash}`)
  assert.equal(desktop.href, `./desktop.html${hash}`)
  const dead = loadDoor(readDoor("door.html"), "#")
  assert.equal(dead.byId.get("phone")?.href, "")
  assert.match(dead.byId.get("ttl")?.textContent ?? "", /needs a live link|expired|unknown/)
})

function extractStripSecret(html: string, profileName = "app-example") {
  const match = html.match(/function stripSecret\([^)]*\) \{[\s\S]*?\n      \}/)
  assert.ok(match, "door must define stripSecret")
  const fn = new Function(`var profileName = ${JSON.stringify(profileName)}; ${match[0]}; return stripSecret`) as () => (
    line: string,
    secret: string,
    protectedSpans?: string[],
  ) => string
  return fn()
}

test("Save strips any non-empty typed secret without mangling Site URL or template", () => {
  const exp = Math.floor(Date.now() / 1000) + 600
  for (const name of ["phone.html", "desktop.html"] as const) {
    const html = readDoor(name)
    assert.equal(html.includes("secret.length < 3"), false, `${name} no length floor`)
    assert.match(html, /if \(!secret \|\| secret === profileName\) return line/, `${name} stripSecret guard`)
    assert.match(
      html,
      /stripSecret\(template \+ siteClause, typed, \[template, siteClause\]\)/,
      `${name} protects template + Site URL clause`,
    )
    assert.equal(html.includes("return line.split(secret).join(\"\")"), false, `${name} no naive whole-line scrub`)

    const stripSecret = extractStripSecret(html)

    // (a) secret that is a host substring does not mangle URL / template
    const hostSub = "I tapped Save. Site URL: https://q.test."
    assert.equal(
      stripSecret(hostSub, "q", ["I tapped Save.", " Site URL: https://q.test."]),
      hostSub,
      `${name} host-substring secret leaves Site URL + template intact`,
    )

    // (b) short secrets still strip from non-structural payload
    assert.equal(stripSecret("leak: q", "q"), "leak: ")
    assert.equal(stripSecret("xabx", "ab"), "xx")
    assert.equal(
      stripSecret("leak: q Site URL: https://q.test.", "q", [" Site URL: https://q.test."]),
      "leak:  Site URL: https://q.test.",
    )

    // (c) empty secret is a noop
    assert.equal(stripSecret(hostSub, ""), hostSub)
    assert.equal(stripSecret("I tapped Save.", ""), "I tapped Save.")

    const empty = loadDoor(html, `#v=door-token&exp=${exp}&n=app-example&u=${encodeURIComponent("https://q.test")}`)
    const emptyIme = empty.byId.get("ime")
    const emptyChat = empty.byId.get("paste")
    assert.ok(emptyIme && emptyChat)
    emptyIme.value = ""
    click(empty.byId.get("save"))
    assert.match(emptyChat.value, /I tapped Save/)
    assert.match(emptyChat.value, /--profile app-example/)
    assert.match(emptyChat.value, /Site URL: https:\/\/q\.test/)
    assert.equal(emptyIme.value, "")

    const one = loadDoor(
      html,
      `#v=door-token&exp=${exp}&n=app-example&u=${encodeURIComponent("https://q.test")}`,
    )
    const oneIme = one.byId.get("ime")
    const oneChat = one.byId.get("paste")
    assert.ok(oneIme && oneChat)
    oneIme.value = "q"
    click(one.byId.get("save"))
    assert.match(oneChat.value, /Site URL: https:\/\/q\.test/)
    assert.equal(oneChat.value.includes("https://.test"), false, `${name} length-1 host substring does not mangle URL`)
    assert.match(oneChat.value, /I tapped Save/)
    assert.match(oneChat.value, /await-login/)
    assert.equal(oneIme.value, "")

    const two = loadDoor(
      html,
      `#v=door-token&exp=${exp}&n=app-example&u=${encodeURIComponent("https://ab.test")}`,
    )
    const twoIme = two.byId.get("ime")
    const twoChat = two.byId.get("paste")
    assert.ok(twoIme && twoChat)
    twoIme.value = "ab"
    click(two.byId.get("save"))
    assert.match(twoChat.value, /Site URL: https:\/\/ab\.test/)
    assert.equal(twoChat.value.includes("https://.test"), false, `${name} length-2 host substring does not mangle URL`)
    assert.match(twoChat.value, /I tapped Save/)
    assert.equal(twoIme.value, "")

    const leak = loadDoor(
      html,
      `#v=door-token&exp=${exp}&n=app-example&u=${encodeURIComponent("https://q.test")}`,
    )
    const leakIme = leak.byId.get("ime")
    const leakChat = leak.byId.get("paste")
    assert.ok(leakIme && leakChat)
    leakIme.value = "zz"
    click(leak.byId.get("save"))
    assert.equal(leakChat.value.includes("zz"), false, `${name} short secret still stripped from Save payload`)
    assert.match(leakChat.value, /Site URL: https:\/\/q\.test/)
    assert.match(leakChat.value, /I tapped Save/)
    assert.equal(leakIme.value, "")

    const named = loadDoor(html, `#v=door-token&exp=${exp}&n=ab`)
    const namedIme = named.byId.get("ime")
    const namedChat = named.byId.get("paste")
    assert.ok(namedIme && namedChat)
    namedIme.value = "ab"
    click(named.byId.get("save"))
    assert.match(namedChat.value, /--profile ab/, `${name} profileName is not stripped`)
    assert.match(namedChat.value, /profile ab/)
    assert.match(namedChat.value, /I tapped Save/)
    assert.equal(namedIme.value, "")

    const marker = "@@AUSPEX_KEEP_0@@"
    assert.equal(
      stripSecret(`keep ${marker} Site URL: https://x.test.`, marker, [" Site URL: https://x.test."]),
      "keep  Site URL: https://x.test.",
      `${name} keep-marker secret does not eat the Site URL protect span`,
    )
  }
})

test("Enter clears the IME after sending the key, and bullets mode still sends real characters", () => {
  const XK_RETURN = 0xff0d
  const XK_BACKSPACE = 0xff08
  for (const name of ["phone.html", "desktop.html"] as const) {
    const keys: number[] = []
    const loaded = loadDoor(readDoor(name), "", { keys })
    const ime = loaded.byId.get("ime")
    const bullets = loaded.byId.get("bullets")
    const chat = loaded.byId.get("paste")
    assert.ok(ime && bullets && chat)
    assert.equal(bullets.checked, false)
    assert.equal(ime.type, "text")
    const hashBefore = loaded.location.hash
    ime.value = "ab"
    emit(ime, "input")
    assert.deepEqual(keys, ["a".charCodeAt(0), "b".charCodeAt(0)])
    emit(ime, "keydown", { key: "Enter", preventDefault() {} })
    assert.equal(ime.value, "")
    assert.deepEqual(keys, ["a".charCodeAt(0), "b".charCodeAt(0), XK_RETURN])
    assert.equal(keys.includes(XK_BACKSPACE), false)
    ime.value = "Z"
    emit(ime, "input")
    assert.deepEqual(keys, ["a".charCodeAt(0), "b".charCodeAt(0), XK_RETURN, "Z".charCodeAt(0)])
    bullets.checked = true
    emit(bullets, "change")
    assert.equal(ime.type, "password")
    assert.equal(ime.autocomplete, "current-password")
    assert.deepEqual(keys, ["a".charCodeAt(0), "b".charCodeAt(0), XK_RETURN, "Z".charCodeAt(0)])
    emit(ime, "keydown", { key: "Enter", preventDefault() {} })
    ime.value = PASSWORD
    emit(ime, "input")
    const passwordCodes = [...PASSWORD].map((ch) => ch.charCodeAt(0))
    assert.deepEqual(keys.slice(-passwordCodes.length), passwordCodes)
    assert.equal(keys.includes(0x2022), false)
    click(loaded.byId.get("save"))
    assert.equal(ime.value, "")
    assert.equal(chat.value.includes(PASSWORD), false)
    assert.equal(loaded.byId.get("copyScratch")?.value.includes(PASSWORD), false)
    assert.equal(loaded.location.hash, hashBefore)
    assert.equal(loaded.location.hash.includes(PASSWORD), false)
    assert.equal(loaded.stored.size, 0)
    bullets.checked = false
    emit(bullets, "change")
    assert.equal(ime.type, "text")
    assert.equal(ime.autocomplete, "current-password")
    if (name === "phone.html") {
      const otp = loaded.byId.get("otpMode")
      assert.ok(otp)
      otp.checked = true
      emit(otp, "change")
      assert.equal(bullets.checked, false)
      assert.equal(ime.type, "text")
      assert.equal(ime.autocomplete, "one-time-code")
    }
    const user = loaded.byId.get("imeUser")
    assert.ok(user)
    user.value = USERNAME
    click(loaded.byId.get("save"))
    assert.equal(chat.value.includes(USERNAME), false)
    assert.equal(user.value, "")
  }
})
