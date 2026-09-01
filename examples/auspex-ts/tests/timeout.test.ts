import assert from "node:assert/strict"
import test from "node:test"
import { raceWithTimeout } from "../src/timeout.ts"

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
  let sawCancel = false
  await assert.rejects(
    () =>
      raceWithTimeout(
        async (isCancelled) => {
          await new Promise((r) => setTimeout(r, 80))
          sawCancel = isCancelled()
          return "late"
        },
        20,
        "timed out",
      ),
    /timed out/,
  )
  await new Promise((r) => setTimeout(r, 100))
  assert.equal(sawCancel, true)
})
