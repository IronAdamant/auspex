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
    imeAutocomplete: (bulletsOn: boolean, otpOn?: boolean) => string
    imeInputType: (bulletsOn: boolean) => string
    DOOR_QUALITY_LEVEL: number
    DOOR_COMPRESSION_LEVEL: number
    framebufferPoint: (local: number, rendered: number, bitmap: number) => number
    planImeSteps: (prev: string, next: string) => Array<{ keysym: number; code: string; remote: string }>
    applyDoorView: (rfb: Record<string, unknown>) => { mapped: boolean; resizeGated: boolean }
    streamUpdateMode: (rfb: Record<string, unknown> | null) => string
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

test("the door names whether Solari pushes frames or noVNC asks for each one", () => {
  const Door = loadDoorStream()
  assert.equal(Door.streamUpdateMode({ _enabledContinuousUpdates: true }), "push")
  assert.equal(Door.streamUpdateMode({ _enabledContinuousUpdates: false }), "request")
  assert.equal(Door.streamUpdateMode(null), "request")

  // The bundled noVNC asks for continuous updates and enables them when the server answers.
  const novnc = readFileSync(path.join(repo, "docs", "novnc-rfb.js"), "utf8")
  assert.match(novnc, /t\.push\(\$\.encodings\.pseudoEncodingContinuousUpdates\)/)
  assert.match(novnc, /_enabledContinuousUpdates=!0/)

  const page = readFileSync(path.join(repo, "docs", "door-page.js"), "utf8")
  assert.match(page, /streamUpdateMode\(rfb\)/)
  assert.match(page, /data-stream-updates/)
  assert.match(page, /Frames: server push\./)
  assert.match(page, /Frames: on request\./)
})
