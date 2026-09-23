import assert from "node:assert/strict"
import { Writable } from "node:stream"
import test from "node:test"
import {
  collectProcessSignal,
  expectOnProcessSignal,
  runDesktopReview,
  waitForProcess,
  type DesktopHandle,
} from "../src/desktop.ts"
import { REVIEW_DONE, REVIEW_START } from "../src/tui.ts"
import { encodePng } from "../src/png-fit.ts"

function capture(): { stream: Writable; text: () => string } {
  let buf = ""
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += String(chunk)
      cb()
    },
  })
  return { stream, text: () => buf }
}

function fakePng(): Uint8Array {
  return encodePng(2, 2, Buffer.alloc(2 * 2 * 3, 40), 3)
}

function baseHandle(extra: Partial<DesktopHandle> = {}): DesktopHandle {
  return {
    sessionId: "desk-1",
    connect: async () => undefined,
    health: async () => ({ ready: true }),
    screenshot: async () => fakePng(),
    kill: async () => undefined,
    openApp: async () => undefined,
    processList: async () => [{ pid: 9, name: "mousepad", cmd: "mousepad" }],
    ...extra,
  }
}

test("runDesktopReview writes terminal overview, screenshots, and kills", async () => {
  const { stream, text } = capture()
  let killed = false
  let connected = false
  const handle = baseHandle({
    connect: async () => {
      connected = true
    },
    kill: async () => {
      killed = true
    },
  })
  const result = await runDesktopReview({
    create: async () => handle,
    sleep: async () => undefined,
    status: stream,
  })
  assert.equal(connected, true)
  assert.equal(killed, true)
  assert.equal(result.ok, true)
  assert.equal(result.processOk, true)
  assert.equal(result.clicked, undefined)
  assert.equal(result.click, undefined)
  assert.equal(result.desktopId, "desk-1")
  assert.equal(result.ready, true)
  assert.match(result.screenshotPath, /\.auspex\/runs\/.+\/screenshot\.png/)
  assert.match(result.overview, /auspex_desktop/)
  assert.match(result.log, /:: booting/)
  assert.match(result.log, /:: task/)
  assert.match(result.log, /:: screenshot/)
  assert.match(result.log, /ok=true/)
  assert.match(result.log, /processOk=true/)
  assert.match(result.log, /path=\.auspex\/runs\//)
  const log = text()
  assert.match(log, new RegExp(REVIEW_START))
  assert.match(log, /:: booting/)
  assert.match(log, /:: screenshot/)
  assert.match(log, /:: killing/)
  assert.match(log, new RegExp(REVIEW_DONE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.ok(log.indexOf(":: booting") < log.indexOf(":: screenshot"))
  assert.equal(log.includes("\x1b["), false)
})

test("default demo opens mousepad and does not claim a hardcoded click", async () => {
  const { stream } = capture()
  const clicks: { x: number; y: number }[] = []
  const opened: string[] = []
  const result = await runDesktopReview({
    create: async () =>
      baseHandle({
        openApp: async (name) => {
          opened.push(name)
        },
        click: async (x, y) => {
          clicks.push({ x, y })
        },
      }),
    sleep: async () => undefined,
    status: stream,
  })
  assert.deepEqual(opened, ["mousepad"])
  assert.equal(clicks.length, 0)
  assert.equal(result.clicked, undefined)
  assert.equal(result.click, undefined)
  assert.equal(result.processOk, true)
  assert.equal(result.ok, true)
})

test("explicit click is attempted but clicked is not claimed without verification", async () => {
  const { stream } = capture()
  const clicks: { x: number; y: number }[] = []
  const result = await runDesktopReview({
    create: async () =>
      baseHandle({
        click: async (x, y) => {
          clicks.push({ x, y })
        },
      }),
    sleep: async () => undefined,
    status: stream,
    task: { click: { x: 10, y: 20 } },
  })
  assert.deepEqual(clicks, [{ x: 10, y: 20 }])
  assert.deepEqual(result.click, { x: 10, y: 20, verified: false })
  assert.equal(result.clicked, undefined)
})

test("process present with a missing window list entry is not ok", async () => {
  const { stream } = capture()
  const result = await runDesktopReview({
    create: async () =>
      baseHandle({
        processList: async () => [{ pid: 9, name: "mousepad", cmd: "mousepad" }],
        windowList: async () => ["xfce4-panel", "Desktop"],
      }),
    sleep: async () => undefined,
    status: stream,
    task: { open: "mousepad", expect: "mousepad" },
  })
  assert.equal(result.processOk, true)
  assert.equal(result.windowOk, false)
  assert.equal(result.matched, true)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => /window/i.test(e)))
})

test("process missing is not ok", async () => {
  const { stream } = capture()
  const result = await runDesktopReview({
    create: async () =>
      baseHandle({
        processList: async () => [{ pid: 1, name: "xfce4-session" }],
        exec: async () => ({ stdout: "xfce4-session", exitCode: 0 }),
      }),
    sleep: async () => undefined,
    status: stream,
    task: { open: "mousepad", expect: "mousepad" },
    windowMs: 5,
  })
  assert.equal(result.processOk, false)
  assert.equal(result.matched, false)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => /process/i.test(e)))
})

test("wait vs expect use the same process haystack (processList miss, ps hit)", async () => {
  const desktop: DesktopHandle = baseHandle({
    processList: async () => [{ pid: 1, name: "xfce4-session" }],
    exec: async (cmd, opts) => {
      const joined = `${cmd} ${(opts?.args ?? []).join(" ")}`
      if (joined.includes("ps ")) return { stdout: "/usr/bin/mousepad", exitCode: 0 }
      return { stdout: "", exitCode: 1 }
    },
  })
  const waited = await waitForProcess(desktop, "mousepad", async () => undefined, 5)
  const signal = await collectProcessSignal(desktop)
  assert.deepEqual(waited.signal.via, ["processList", "ps"])
  assert.deepEqual(signal.via, ["processList", "ps"])
  assert.equal(waited.processOk, true)
  assert.equal(expectOnProcessSignal(signal, "mousepad"), true)
  assert.equal(waited.processOk, expectOnProcessSignal(signal, "mousepad"))

  const { stream } = capture()
  const result = await runDesktopReview({
    create: async () => desktop,
    sleep: async () => undefined,
    status: stream,
    task: { open: "mousepad", expect: "mousepad" },
  })
  assert.equal(result.processOk, true)
  assert.equal(result.matched, true)
  assert.equal(result.ok, true)
})

test("wait vs expect agree when processList hits and ps misses", async () => {
  const desktop: DesktopHandle = baseHandle({
    processList: async () => [{ pid: 9, name: "mousepad", cmd: "mousepad" }],
    exec: async () => ({ stdout: "xfce4-session", exitCode: 0 }),
  })
  const waited = await waitForProcess(desktop, "mousepad", async () => undefined, 5)
  const signal = await collectProcessSignal(desktop)
  assert.equal(waited.processOk, true)
  assert.equal(expectOnProcessSignal(signal, "mousepad"), true)
})

test("runDesktopReview matches expect from the unified process signal and exposes streamUrl", async () => {
  const { stream } = capture()
  const result = await runDesktopReview({
    create: async () =>
      baseHandle({
        sessionId: "desk-vnc",
        streamUrl: "wss://api.getsolari.com/stream/desk-vnc",
      }),
    sleep: async () => undefined,
    status: stream,
    task: { open: "mousepad", expect: "mousepad" },
  })
  assert.equal(result.ok, true)
  assert.equal(result.matched, true)
  assert.equal(result.processOk, true)
  assert.equal(result.windowOk, undefined)
  assert.equal(result.streamUrl, "wss://api.getsolari.com/stream/desk-vnc")
})

test("runDesktopReview is not ok when X11 never becomes ready", async () => {
  const { stream } = capture()
  const result = await runDesktopReview({
    create: async () =>
      baseHandle({
        sessionId: "desk-unready",
        health: async () => ({ ready: false }),
      }),
    sleep: async () => undefined,
    status: stream,
    task: { click: { x: 1, y: 1 } },
    healthMs: 5,
  })
  assert.equal(result.ok, false)
  assert.equal(result.ready, false)
  assert.ok(result.errors.some((e) => /not ready/i.test(e)))
})

test("runDesktopReview is not ok:true when kill fails after a screenshot", async () => {
  const { stream } = capture()
  const result = await runDesktopReview({
    create: async () =>
      baseHandle({
        sessionId: "desk-2",
        kill: async () => {
          throw new Error("kill boom")
        },
      }),
    sleep: async () => undefined,
    status: stream,
  })
  assert.equal(result.ok, false)
  assert.match(result.errors.join(" "), /kill boom/)
  assert.equal(result.desktopId, "desk-2")
})

test("runDesktopReview kills when screenshot throws", async () => {
  const { stream, text } = capture()
  let killed = false
  await assert.rejects(
    () =>
      runDesktopReview({
        create: async () =>
          baseHandle({
            sessionId: "desk-3",
            screenshot: async () => {
              throw new Error("shot failed")
            },
            kill: async () => {
              killed = true
            },
          }),
        sleep: async () => undefined,
        status: stream,
      }),
    /shot failed/,
  )
  assert.equal(killed, true)
  assert.match(text(), new RegExp(REVIEW_DONE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})

test("runDesktopReview overall bound kills a hung create", async () => {
  const { stream } = capture()
  let killed = false
  await assert.rejects(
    () =>
      runDesktopReview({
        overallMs: 40,
        create: async () => {
          await new Promise((r) => setTimeout(r, 200))
          return baseHandle({
            sessionId: "desk-late",
            kill: async () => {
              killed = true
            },
          })
        },
        sleep: async () => undefined,
        status: stream,
      }),
    /timed out/,
  )
  await new Promise((r) => setTimeout(r, 250))
  assert.equal(killed, true)
})
