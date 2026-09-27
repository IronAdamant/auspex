import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import vm from "node:vm"
import {
  DOOR_STREAM_MAX_RECONNECT,
  DOOR_STREAM_RECONNECT_GRACE_MS,
  doorStreamDisconnectAction,
  imeAutocomplete,
  imeInputType,
} from "../src/handoff-doors.ts"
import { cookieHostIsIdp } from "../src/login-trace.ts"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

function loadDoorStream() {
  const code = readFileSync(path.join(repo, "docs", "door-stream.js"), "utf8")
  const context: Record<string, unknown> = {}
  context.window = context
  vm.runInNewContext(code, context, { filename: "door-stream.js" })
  return context.AuspexDoorStream as {
    MAX_RECONNECT: number
    RECONNECT_GRACE_MS: number
    doorStreamDisconnectAction: (
      expired: boolean,
      hidden: boolean,
      attempts?: number,
      maxAttempts?: number,
    ) => string
    pageHostIsIdp: (host: string) => boolean
    idpWallVisible: (text: string, session?: { leftIdp?: boolean; expired?: boolean; streamExpired?: boolean }) => boolean
    createIdpWallSession: () => { leftIdp: boolean; expired: boolean }
    noteIdpSurface: (session: { leftIdp?: boolean; expired?: boolean }, text: string) => boolean
    expireIdpWall: (session: { leftIdp?: boolean; expired?: boolean; streamExpired?: boolean }) => boolean
    IDP_WALL_TEXT: string
    imeAutocomplete: (bulletsOn: boolean, otpOn?: boolean) => string
    imeInputType: (bulletsOn: boolean) => string
    DOOR_QUALITY_LEVEL: number
    DOOR_COMPRESSION_LEVEL: number
    framebufferPoint: (local: number, rendered: number, bitmap: number) => number
    planImeSteps: (prev: string, next: string) => Array<{ keysym: number; code: string; remote: string }>
    applyDoorView: (rfb: Record<string, unknown>) => { mapped: boolean; resizeGated: boolean }
    createImeCoalescer: (opts: {
      send: (keysym: number, code: string) => boolean
      schedule: (fn: () => void, ms: number) => number
      cancel: (id: number) => void
    }) => {
      note: (next: string) => void
      flushCommit: (done?: () => void) => void
      erase: () => void
      cancel: () => void
    }
  }
}

test("docs/door-stream.js matches the TypeScript door helpers", () => {
  const Door = loadDoorStream()
  assert.equal(Door.MAX_RECONNECT, DOOR_STREAM_MAX_RECONNECT)
  assert.equal(Door.RECONNECT_GRACE_MS, DOOR_STREAM_RECONNECT_GRACE_MS)
  assert.equal(Door.doorStreamDisconnectAction(true, true, 0), "remint")
  assert.equal(Door.doorStreamDisconnectAction(false, true, 0), "pause")
  assert.equal(Door.doorStreamDisconnectAction(false, false, 0), "reconnect")
  assert.equal(Door.doorStreamDisconnectAction(false, false, 3), "reconnect")
  assert.equal(
    doorStreamDisconnectAction({ streamExpired: false, pageHidden: true, reconnectAttempts: 1 }),
    "pause",
  )
  assert.equal(Door.imeAutocomplete(false, false), imeAutocomplete({ bulletsOn: false }))
  assert.equal(Door.imeAutocomplete(false, true), imeAutocomplete({ bulletsOn: false, otpOn: true }))
  assert.equal(Door.imeInputType(true), imeInputType(true))
  assert.equal(JSON.stringify(Door).includes("off"), false)
  assert.equal("bindPreviewZoom" in Door, false)
  assert.match(Door.IDP_WALL_TEXT, /Finish sign-in, reach the app, then Save/)
  assert.equal(Door.IDP_WALL_TEXT.includes("logged in"), false)
})

test("door IdP host list matches cookieHostIsIdp and hides only off the wall", () => {
  const Door = loadDoorStream()
  const hosts = [
    "live.com",
    "login.live.com",
    "login.microsoft.com",
    "login.microsoftonline.com",
    "accounts.google.com",
    "onedrive.live.com",
    "consistencyhub.io",
  ]
  for (const host of hosts) {
    assert.equal(Door.pageHostIsIdp(host), cookieHostIsIdp(host), host)
  }
  assert.equal(cookieHostIsIdp("google.com"), true)
  assert.equal(cookieHostIsIdp("www.google.com"), true)
  assert.equal(Door.pageHostIsIdp("google.com"), false)
  assert.equal(Door.pageHostIsIdp("www.google.com"), false)
  assert.equal(Door.idpWallVisible(""), true)
  assert.equal(Door.idpWallVisible("https://login.microsoftonline.com/common"), true)
  assert.equal(Door.idpWallVisible("https://accounts.google.com/o/oauth2/v2/auth"), true)
  assert.equal(Door.idpWallVisible("https://onedrive.live.com/"), false)
  assert.equal(Door.idpWallVisible("https://consistencyhub.io/app"), false)
  assert.equal(Door.idpWallVisible("", { expired: true }), false)
  assert.equal(Door.idpWallVisible("https://login.microsoftonline.com/common", { streamExpired: true }), false)
  assert.equal(Door.idpWallVisible("https://accounts.google.com/o/oauth2/v2/auth", { expired: true }), false)
  const session = Door.createIdpWallSession()
  assert.equal(Door.noteIdpSurface(session, ""), true)
  assert.equal(Door.noteIdpSurface(session, "https://consistencyhub.io/app"), false)
  assert.equal(session.leftIdp, true)
  assert.equal(Door.noteIdpSurface(session, ""), false)
  assert.equal(Door.idpWallVisible("", session), false)
  assert.equal(Door.noteIdpSurface(session, "https://login.microsoftonline.com/common"), true)
  assert.equal(Door.expireIdpWall(session), false)
  assert.equal(session.expired, true)
  assert.equal(Door.noteIdpSurface(session, "https://login.microsoftonline.com/common"), false)
  assert.equal(Door.idpWallVisible("https://consistencyhub.io/app", session), false)
  const page = readFileSync(path.join(repo, "docs", "door-page.js"), "utf8")
  const phone = `${readFileSync(path.join(repo, "docs", "phone.html"), "utf8")}\n${page}`
  assert.match(phone, /id="idpWall"/)
  assert.match(phone, /Finish sign-in, reach the app, then Save/)
  assert.match(phone, /noteRemoteSurface/)
  assert.match(phone, /if \(fromHash\) return fromHash/)
  assert.match(phone, /expireIdpWall/)
  assert.match(phone, /noteIdpSurface/)
  assert.match(phone, /applyIdpWall\(false\)/)
})

test("framebufferPoint uses the rendered canvas, not a stale scale", () => {
  const Door = loadDoorStream()
  assert.equal(Door.framebufferPoint(0, 100, 200), 0)
  assert.equal(Door.framebufferPoint(50, 100, 200), 100)
  assert.equal(Door.framebufferPoint(99, 100, 200), 198)
  assert.equal(Door.framebufferPoint(100, 100, 200), 199)
  assert.equal(Door.framebufferPoint(-4, 100, 200), 0)
  assert.equal(Door.framebufferPoint(10, 0, 200), 0)
  assert.equal(Door.framebufferPoint(10, 100, 0), 0)
})

test("applyDoorView fits once, maps the live canvas, and lightens the stream", () => {
  const Door = loadDoorStream()
  const box = { width: 0, height: 0 }
  const requests: number[][] = []
  const canvas = {
    width: 1280,
    height: 800,
    style: {} as Record<string, string>,
    getBoundingClientRect() {
      return { width: 390, height: 243.75, left: 8, top: 12 }
    },
  }
  const rfb: Record<string, unknown> = {
    _resizeSession: false,
    _supportsSetDesktopSize: false,
    _viewOnly: false,
    _screen: {
      style: {} as Record<string, string>,
      getBoundingClientRect() {
        return { width: box.width, height: box.height }
      },
    },
    _canvas: canvas,
    _display: {
      _target: canvas,
      absX(x: number) {
        return Math.round(x / (390 / 1280))
      },
      absY(y: number) {
        return Math.round(y / (243.75 / 800))
      },
    },
    scaleViewport: false,
    qualityLevel: 6,
    compressionLevel: 2,
    _requestRemoteResize() {
      const self = this as {
        _resizeSession: boolean
        _supportsSetDesktopSize: boolean
        _viewOnly: boolean
        _screen: { getBoundingClientRect: () => { width: number; height: number } }
      }
      if (!self._resizeSession || !self._supportsSetDesktopSize || self._viewOnly) return
      const size = self._screen.getBoundingClientRect()
      requests.push([Math.floor(size.width), Math.floor(size.height)])
    },
  }
  Object.defineProperty(rfb, "resizeSession", {
    get() {
      return (this as { _resizeSession: boolean })._resizeSession
    },
    set(value: boolean) {
      ;(this as { _resizeSession: boolean })._resizeSession = value
      ;(this as { _requestRemoteResize: () => void })._requestRemoteResize()
    },
  })
  const view = Door.applyDoorView(rfb)
  assert.equal(view.resizeGated, true)
  assert.equal(view.mapped, true)
  assert.equal(rfb.scaleViewport, true)
  assert.equal(rfb.qualityLevel, Door.DOOR_QUALITY_LEVEL)
  assert.equal(rfb.compressionLevel, Door.DOOR_COMPRESSION_LEVEL)
  assert.equal(Door.DOOR_QUALITY_LEVEL, 4)
  assert.equal(Door.DOOR_COMPRESSION_LEVEL, 6)
  assert.equal((rfb._screen as { style: { overflow: string; touchAction: string } }).style.overflow, "hidden")
  assert.equal((rfb._screen as { style: { touchAction: string } }).style.touchAction, "manipulation")
  assert.equal(canvas.style.touchAction, "manipulation")
  assert.equal(rfb.resizeSession, true)
  assert.equal(requests.length, 0)
  ;(rfb as { _supportsSetDesktopSize: boolean })._supportsSetDesktopSize = true
  ;(rfb as { _requestRemoteResize: () => void })._requestRemoteResize()
  assert.equal(requests.length, 0, "a 0×0 stage is not a resize")
  assert.equal(rfb.resizeSession, true)
  box.width = 390
  box.height = 520
  ;(rfb as { _requestRemoteResize: () => void })._requestRemoteResize()
  assert.deepEqual(requests, [[390, 520]])
  assert.equal(rfb.resizeSession, false)
  ;(rfb as { _requestRemoteResize: () => void })._requestRemoteResize()
  assert.deepEqual(requests, [[390, 520]])
  const display = rfb._display as { absX: (x: number) => number; absY: (y: number) => number }
  const shown = canvas.getBoundingClientRect()
  shown.width = 780
  shown.height = 487.5
  canvas.getBoundingClientRect = () => shown
  assert.equal(display.absX(390), Math.floor((390 * canvas.width) / 780))
  assert.equal(display.absY(100), Math.floor((100 * canvas.height) / 487.5))
  assert.notEqual(display.absX(390), 1280)
})

test("IME coalescer folds a burst, paces keys, and still commits on Enter and Clear", () => {
  const Door = loadDoorStream()
  const XK_BACKSPACE = 0xff08
  const XK_RETURN = 0xff0d
  function harness(send?: (keysym: number, code: string) => boolean) {
    const keys: number[] = []
    const timers: Array<{ id: number; fn: () => void }> = []
    let id = 0
    const coalescer = Door.createImeCoalescer({
      send: send ?? ((keysym: number) => {
        keys.push(keysym)
        return true
      }),
      schedule(fn: () => void) {
        id += 1
        timers.push({ id, fn })
        return id
      },
      cancel(timerId: number) {
        const index = timers.findIndex((row) => row.id === timerId)
        if (index >= 0) timers.splice(index, 1)
      },
    })
    return {
      keys,
      coalescer,
      timers,
      flushOne() {
        const row = timers.shift()
        if (!row) return false
        row.fn()
        return true
      },
      flushAll() {
        let n = 0
        while (timers.length && n < 200) {
          this.flushOne()
          n += 1
        }
        return n
      },
    }
  }

  const burst = harness()
  burst.coalescer.note("a")
  burst.coalescer.note("abc")
  burst.coalescer.note("ab")
  assert.equal(burst.keys.length, 0)
  assert.equal(burst.timers.length, 1)
  burst.flushOne()
  assert.deepEqual(burst.keys, ["a".charCodeAt(0)])
  burst.flushAll()
  assert.deepEqual(burst.keys, ["a".charCodeAt(0), "b".charCodeAt(0)])

  const superseded = harness()
  superseded.coalescer.note("abc")
  superseded.flushOne()
  superseded.coalescer.note("a")
  superseded.flushAll()
  assert.deepEqual(superseded.keys, ["a".charCodeAt(0)])

  const commit = harness()
  let entered = false
  commit.coalescer.note("ab")
  commit.coalescer.flushCommit(() => {
    entered = true
    commit.keys.push(XK_RETURN)
  })
  assert.equal(entered, true)
  assert.deepEqual(commit.keys, ["a".charCodeAt(0), "b".charCodeAt(0), XK_RETURN])
  commit.coalescer.note("Z")
  commit.flushAll()
  assert.deepEqual(commit.keys, ["a".charCodeAt(0), "b".charCodeAt(0), XK_RETURN, "Z".charCodeAt(0)])

  const dropped = harness()
  dropped.coalescer.note("secret")
  dropped.coalescer.erase()
  dropped.flushAll()
  assert.equal(dropped.keys.length, 0)

  const erased = harness()
  erased.coalescer.note("ab")
  erased.flushAll()
  erased.coalescer.erase()
  assert.deepEqual(erased.keys, ["a".charCodeAt(0), "b".charCodeAt(0), XK_BACKSPACE, XK_BACKSPACE])

  const cancelled = harness()
  cancelled.coalescer.note("secret")
  cancelled.coalescer.cancel()
  cancelled.flushAll()
  assert.equal(cancelled.keys.length, 0)

  let allow = false
  const held: number[] = []
  const retry = harness((keysym) => {
    if (!allow) return false
    held.push(keysym)
    return true
  })
  retry.coalescer.note("a")
  retry.flushOne()
  assert.equal(held.length, 0)
  assert.equal(retry.timers.length, 1)
  allow = true
  retry.flushOne()
  assert.deepEqual(held, ["a".charCodeAt(0)])

  const stuck = harness(() => false)
  stuck.coalescer.note("a")
  for (let i = 0; i < 50; i++) stuck.flushOne()
  assert.equal(stuck.timers.length, 0)
  assert.equal(stuck.keys.length, 0)

  assert.deepEqual(
    Array.from(Door.planImeSteps("abcd", "abXd"), (step) => step.keysym),
    [XK_BACKSPACE, XK_BACKSPACE, "X".charCodeAt(0), "d".charCodeAt(0)],
  )

  const page = readFileSync(path.join(repo, "docs", "door-page.js"), "utf8")
  const phone = readFileSync(path.join(repo, "docs", "phone.html"), "utf8")
  assert.match(page, /applyDoorView/)
  assert.match(page, /createImeCoalescer/)
  assert.match(page, /flushCommit/)
  assert.equal(page.includes("resizeSession = true"), false)
  assert.match(phone, /touch-action: manipulation/)
  assert.match(phone, /stays still while you tap/)
  assert.match(phone, /Tap a field in Solari's Chrome, then type here/)
})
