import assert from "node:assert/strict"
import { Writable } from "node:stream"
import test from "node:test"
import { REVIEW_DONE, REVIEW_START } from "../src/banner.ts"
import { runDesktopReview, type DesktopHandle } from "../src/desktop.ts"
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

test("runDesktopReview writes terminal overview, screenshots, and kills", async () => {
  const { stream, text } = capture()
  let killed = false
  let connected = false
  const handle: DesktopHandle = {
    sessionId: "desk-1",
    connect: async () => {
      connected = true
    },
    health: async () => ({ ready: true }),
    screenshot: async () => fakePng(),
    kill: async () => {
      killed = true
    },
    click: async () => undefined,
  }
  const result = await runDesktopReview({
    create: async () => handle,
    sleep: async () => undefined,
    status: stream,
  })
  assert.equal(connected, true)
  assert.equal(killed, true)
  assert.equal(result.ok, true)
  assert.equal(result.desktopId, "desk-1")
  assert.equal(result.ready, true)
  assert.match(result.screenshotPath, /\.auspex\/runs\/.+\/screenshot\.png/)
  assert.match(result.overview, /auspex_desktop/)
  assert.match(result.log, /:: booting/)
  assert.match(result.log, /:: task/)
  assert.match(result.log, /:: screenshot/)
  assert.match(result.log, /ok=true/)
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

test("runDesktopReview performs a mousepad interior click, not screen center", async () => {
  const { stream } = capture()
  const clicks: { x: number; y: number }[] = []
  const opened: string[] = []
  await runDesktopReview({
    create: async () => ({
      sessionId: "desk-click",
      connect: async () => undefined,
      health: async () => ({ ready: true }),
      screenshot: async () => fakePng(),
      kill: async () => undefined,
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
  assert.equal(clicks.length, 1)
  assert.equal(clicks[0]?.x, 320)
  assert.equal(clicks[0]?.y, 300)
})

test("runDesktopReview honors an explicit click and skips a silent center click", async () => {
  const { stream } = capture()
  const clicks: { x: number; y: number }[] = []
  await runDesktopReview({
    create: async () => ({
      sessionId: "desk-explicit",
      connect: async () => undefined,
      health: async () => ({ ready: true }),
      screenshot: async () => fakePng(),
      kill: async () => undefined,
      click: async (x, y) => {
        clicks.push({ x, y })
      },
    }),
    sleep: async () => undefined,
    status: stream,
    task: { click: { x: 10, y: 20 } },
  })
  assert.deepEqual(clicks, [{ x: 10, y: 20 }])
})

test("runDesktopReview is not ok when expect misses, even if kill succeeds", async () => {
  const { stream } = capture()
  const result = await runDesktopReview({
    create: async () => ({
      sessionId: "desk-expect",
      connect: async () => undefined,
      health: async () => ({ ready: true }),
      screenshot: async () => fakePng(),
      kill: async () => undefined,
      click: async () => undefined,
      processList: async () => [{ pid: 1, name: "xfce4-session" }],
    }),
    sleep: async () => undefined,
    status: stream,
    task: { open: "mousepad", expect: "mousepad" },
  })
  assert.equal(result.ok, false)
  assert.equal(result.matched, false)
  assert.ok(result.errors.some((e) => /expect/i.test(e)))
})

test("runDesktopReview matches expect from process list and exposes streamUrl", async () => {
  const { stream } = capture()
  const result = await runDesktopReview({
    create: async () => ({
      sessionId: "desk-vnc",
      streamUrl: "wss://api.getsolari.com/stream/desk-vnc",
      connect: async () => undefined,
      health: async () => ({ ready: true }),
      screenshot: async () => fakePng(),
      kill: async () => undefined,
      openApp: async () => undefined,
      click: async () => undefined,
      processList: async () => [{ pid: 9, name: "mousepad", cmd: "mousepad" }],
    }),
    sleep: async () => undefined,
    status: stream,
    task: { open: "mousepad", expect: "mousepad" },
  })
  assert.equal(result.ok, true)
  assert.equal(result.matched, true)
  assert.equal(result.windowReady, true)
  assert.equal(result.streamUrl, "wss://api.getsolari.com/stream/desk-vnc")
})

test("runDesktopReview is not ok when X11 never becomes ready", async () => {
  const { stream } = capture()
  const result = await runDesktopReview({
    create: async () => ({
      sessionId: "desk-unready",
      connect: async () => undefined,
      health: async () => ({ ready: false }),
      screenshot: async () => fakePng(),
      kill: async () => undefined,
      click: async () => undefined,
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
    create: async () => ({
      sessionId: "desk-2",
      connect: async () => undefined,
      health: async () => ({ ready: true }),
      screenshot: async () => fakePng(),
      kill: async () => {
        throw new Error("kill boom")
      },
      click: async () => undefined,
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
        create: async () => ({
          sessionId: "desk-3",
          connect: async () => undefined,
          health: async () => ({ ready: true }),
          screenshot: async () => {
            throw new Error("shot failed")
          },
          kill: async () => {
            killed = true
          },
          click: async () => undefined,
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
          return {
            sessionId: "desk-late",
            connect: async () => undefined,
            health: async () => ({ ready: true }),
            screenshot: async () => fakePng(),
            kill: async () => {
              killed = true
            },
            click: async () => undefined,
          }
        },
        sleep: async () => undefined,
        status: stream,
      }),
    /timed out/,
  )
  await new Promise((r) => setTimeout(r, 250))
  assert.equal(killed, true)
})
