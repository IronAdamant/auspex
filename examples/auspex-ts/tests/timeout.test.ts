import assert from "node:assert/strict"
import test from "node:test"
import {
  abortableSleep,
  linkAbortSignal,
  ReadyRelease,
  raceWithTimeout,
} from "../src/timeout.ts"

test("ReadyRelease closes a late-assigned session after the timer wins", async () => {
  const closer = new ReadyRelease()
  let closed = false
  await assert.rejects(async () => {
    try {
      await raceWithTimeout(
        async (isCancelled) => {
          await new Promise((r) => setTimeout(r, 60))
          closer.set(async () => {
            closed = true
          })
          if (isCancelled()) return
        },
        15,
        "timed out",
      )
    } finally {
      await closer.release(500)
    }
  }, /timed out/)
  assert.equal(closed, true)
})

test("ReadyRelease.release does not hang forever if never armed", async () => {
  const closer = new ReadyRelease()
  const started = Date.now()
  await closer.release(40)
  assert.ok(Date.now() - started < 1000)
})

test("abortableSleep resolves without a signal and rejects when aborted", async () => {
  const started = Date.now()
  await abortableSleep(20)
  assert.ok(Date.now() - started < 1000)
  const ac = new AbortController()
  setTimeout(() => ac.abort(), 15)
  await assert.rejects(() => abortableSleep(200, ac.signal), /aborted/)
  ac.abort()
  await assert.rejects(() => abortableSleep(200, ac.signal), /aborted/)
})

test("linkAbortSignal follows the parent and can abort independently", async () => {
  const parent = new AbortController()
  const linked = linkAbortSignal(parent.signal)
  assert.equal(linked.signal.aborted, false)
  linked.abort()
  assert.equal(linked.signal.aborted, true)
  linked.dispose()
  const parent2 = new AbortController()
  const child = linkAbortSignal(parent2.signal)
  parent2.abort()
  assert.equal(child.signal.aborted, true)
  child.dispose()
})

