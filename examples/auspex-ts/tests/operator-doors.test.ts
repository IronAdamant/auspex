import assert from "node:assert/strict"
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import vm from "node:vm"
import { USAGE } from "../src/cli.ts"
import { PROFILES_DESCRIPTION } from "../src/mcp-tools.ts"
import { OPERATOR_PURGE_QUESTION } from "../src/operator-session.ts"
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
  assert.match(html, /id="paste-btn"/, `${label} Paste button`)
  assert.match(html, /id="imeHint"/, `${label} typing hint`)
  assert.match(html, /click the remote login field/, `${label} hint copy`)
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
  assert.equal(chooser.includes('id="ime"'), false)
  assert.equal(chooser.includes('id="paste-username"'), false)
  assert.equal(desktop.includes('id="backspace"'), false)
  assert.equal(desktop.includes('id="enter"'), false)
  assert.equal(desktop.includes(">Delete<"), false)
  assert.equal(desktop.includes(">Enter<"), false)
  assert.match(desktop, /id="save"/)
  assert.match(desktop, /#keybox\[hidden\] \{ display: none; \}/)
  const desktopOrder = ["screen", "ime", "paste-btn", "save"]
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
  assert.match(desktop, /id="solari-key"/)
  assert.match(desktop, /Save Solari key/)
  assert.match(desktop, /localStorage\.setItem\("auspex\.solariKey"/)
  assert.match(desktop, /http:\/\/127\.0\.0\.1:17321\/auspex-operator-key/)
  assert.match(desktop, /not that wipe|not the 30-minute profile wipe/)
  assert.match(phone, /Seed\/handoff door for typing/)
  assert.match(phone, /not a live-session takeover/)
  assert.match(USAGE, /30 minutes/)
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
  assert.equal(USAGE.includes(OPERATOR_PURGE_QUESTION), true)
  assert.equal(USAGE.includes(PASSWORD), false)
  assert.equal(USAGE.includes(USERNAME), false)
  assert.equal(PROFILES_DESCRIPTION.includes(SOLARI_KEY), false)
  const watch = readDoor("index.html")
  assert.match(watch, /Phone door/)
  assert.match(watch, /Desktop door/)
  assert.match(watch, /door\.html/)
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
  hidden?: boolean
  className: string
  disabled: boolean
  classList: { add: (name: string) => void; remove: (name: string) => void }
  listeners: Array<{ type: string; fn: (ev?: { key?: string; preventDefault?: () => void }) => void }>
  addEventListener: (type: string, fn: (ev?: { preventDefault?: () => void }) => void) => void
  focus: () => void
  blur: () => void
  setAttribute: () => void
  removeAttribute: (name?: string) => void
  setSelectionRange: () => void
  querySelector: () => null
  appendChild: (child: DoorEl) => DoorEl
  style: Record<string, string>
}

function loadDoor(
  html: string,
  hash: string,
  hooks?: {
    intervals?: Map<number, () => void>
    cleared?: number[]
    clients?: Array<{ fire: (type: string) => void }>
  },
) {
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1] ?? "")
  const byId = new Map<string, DoorEl>()
  const stored = new Map<string, string>()
  function makeEl(): DoorEl {
    const el: DoorEl = {
      textContent: "",
      value: "",
      href: "",
      className: "",
      disabled: false,
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
      setAttribute() {},
      removeAttribute() {},
      setSelectionRange() {},
      querySelector: () => null,
      appendChild(child: DoorEl) {
        el.textContent = `${el.textContent}\n${child.textContent}`.trim()
        return child
      },
    }
    return el
  }
  for (const id of ids) byId.set(id, makeEl())
  const document = {
    getElementById: (id: string) => byId.get(id) ?? makeEl(),
    createElement: () => makeEl(),
    body: makeEl(),
    execCommand: () => false,
  }
  const exp = Math.floor(Date.now() / 1000) + 600
  const location = { hash: hash || `#v=door-token&exp=${exp}&n=supabase-com` }
  let intervalId = 0
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
    setTimeout: () => 1,
    clearTimeout: () => {},
    atob: (value: string) => Buffer.from(value, "base64").toString("binary"),
    navigator: { clipboard: { writeText: async () => {}, readText: async () => "" } },
    localStorage: {
      setItem: (key: string, value: string) => {
        stored.set(key, value)
      },
      getItem: (key: string) => stored.get(key) ?? null,
    },
    console,
  }
  if (hooks?.clients) {
    context.NoVNCRFB = function StubRemote() {
      const listeners: Array<{ type: string; fn: () => void }> = []
      hooks.clients?.push({
        fire(type: string) {
          for (const row of listeners) if (row.type === type) row.fn()
        },
      })
      return {
        scaleViewport: false,
        resizeSession: false,
        background: "",
        sendKey() {},
        addEventListener(type: string, fn: () => void) {
          listeners.push({ type, fn })
        },
      }
    }
  }
  context.window = context
  const scripts = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (match) => match[1] ?? "",
  )
  for (const code of scripts) {
    vm.runInNewContext(code, context, { filename: "door.html" })
  }
  return { byId, stored }
}

function click(el: DoorEl | undefined) {
  assert.ok(el, "missing control")
  const handler = el.listeners.find((row) => row.type === "click")
  assert.ok(handler, "missing click handler")
  handler.fn({ preventDefault() {} })
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
    click(loaded.byId.get("paste-btn"))
    assert.equal(ime.value, "")
    assert.equal(chat.value.includes(PASSWORD), false)
    assert.equal(chat.value.includes(USERNAME), false)
    assert.equal(chat.value.includes(SOLARI_KEY), false)
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
      const exp = Math.floor(Date.now() / 1000) + 600
      const withKey = loadDoor(readDoor(name), `#v=door-token&exp=${exp}&n=auspex-desktop&k=1`)
      assert.equal(withKey.byId.get("keybox")?.hidden, true)
      const key = loaded.byId.get("solari-key")
      assert.ok(key)
      key.value = SOLARI_KEY
      click(loaded.byId.get("save-solari-key"))
      assert.equal(key.value, "")
      assert.equal(loaded.stored.get("auspex.solariKey"), SOLARI_KEY)
      assert.equal(chat.value.includes(SOLARI_KEY), false)
      assert.equal((loaded.byId.get("status")?.textContent ?? "").includes(SOLARI_KEY), false)
      const intervals = new Map<number, () => void>()
      const cleared: number[] = []
      const clients: Array<{ fire: (type: string) => void }> = []
      const live = loadDoor(
        readDoor(name),
        `#v=door-token&exp=${Math.floor(Date.now() / 1000) + 600}&n=auspex-desktop`,
        { intervals, cleared, clients },
      )
      assert.match(live.byId.get("ttl")?.textContent ?? "", /Link active/)
      const ticking = [...intervals.entries()]
      assert.ok(clients[0])
      clients[0].fire("disconnect")
      const status = live.byId.get("status")?.textContent ?? ""
      const ttl = live.byId.get("ttl")?.textContent ?? ""
      assert.match(status, /remote Chrome closed/)
      assert.match(status, /new login link is required/)
      assert.equal(ttl.includes("Link active"), false)
      assert.ok(cleared.length > 0)
      for (const [, fn] of ticking) fn()
      assert.equal((live.byId.get("ttl")?.textContent ?? "").includes("Link active"), false)
    }
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
})
