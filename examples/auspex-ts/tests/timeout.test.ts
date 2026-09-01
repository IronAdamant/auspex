import assert from "node:assert/strict"
import test from "node:test"
import { ReadyRelease, raceWithTimeout } from "../src/timeout.ts"

test("raceWithTimeout clears the timer when work finishes first", async () => {
  const rejections: unknown[] = []
  const onrej = (reason: unknown) => {
    rejections.push(reason)
  }
  process.on("unhandledRejection", onrej)
  try {
    const value = await raceWithTimeout(async () => "ok", 80, "timed out")
    assert.equal(value, "ok")
    await new Promise((r) => setTimeout(r, 100))
    assert.equal(rejections.length, 0)
  } finally {
    process.off("unhandledRejection", onrej)
  }
})

test("raceWithTimeout rejects when the timer wins and exposes cancelled", async () => {
  const rejections: unknown[] = []
  const onrej = (reason: unknown) => {
    rejections.push(reason)
  }
  process.on("unhandledRejection", onrej)
  let sawCancel = false
  try {
    await assert.rejects(
      () =>
        raceWithTimeout(
          async (isCancelled) => {
            await new Promise((r) => setTimeout(r, 80))
            sawCancel = isCancelled()
            throw new Error("work continued after timeout")
          },
          20,
          "timed out",
        ),
      /timed out/,
    )
    await new Promise((r) => setTimeout(r, 100))
    assert.equal(sawCancel, true)
    assert.equal(rejections.length, 0)
  } finally {
    process.off("unhandledRejection", onrej)
  }
})

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
