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
        }),
        sleep: async () => undefined,
        status: stream,
      }),
    /shot failed/,
  )
  assert.equal(killed, true)
  assert.match(text(), new RegExp(REVIEW_DONE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})
