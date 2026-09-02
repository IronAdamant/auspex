import assert from "node:assert/strict"
import test from "node:test"
import {
  boundPromise,
  CHROMIUM_CONNECT_TIMEOUT_MS,
  closeThenRelease,
  ReadyRelease,
  raceWithTimeout,
} from "../src/timeout.ts"

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

test("launchBrowser passes timeout>0 to connect and releases on connect throw", async () => {
  const { launchBrowser } = await import("../src/solari.ts")
  let connectOpts: { timeout: number } | undefined
  let released = false
  const fake = {} as import("@solarisdk/browser").Solari
  await assert.rejects(
    () =>
      launchBrowser(fake, { stealth: true }, undefined, {
        create: async () => ({ id: "s1", wsEndpoint: "ws://example" }),
        connect: async (_ws, opts) => {
          connectOpts = opts
          throw new Error("ws failed")
        },
        wrap: () => ({ close: async () => undefined }),
        releaseAndWait: async () => {
          released = true
        },
        closeTimeoutMs: 40,
      }),
    /ws failed/,
  )
  assert.ok(connectOpts)
  assert.ok(connectOpts.timeout > 0)
  assert.equal(connectOpts.timeout, CHROMIUM_CONNECT_TIMEOUT_MS)
  assert.equal(released, true)
})

test("launchBrowser releases if aborted before connect", async () => {
  const { launchBrowser } = await import("../src/solari.ts")
  let connected = false
  let released = false
  const ac = new AbortController()
  ac.abort()
  const fake = {} as import("@solarisdk/browser").Solari
  await assert.rejects(
    () =>
      launchBrowser(fake, {}, ac.signal, {
        create: async () => ({ id: "s1", wsEndpoint: "ws://example" }),
        connect: async () => {
          connected = true
          return {}
        },
        wrap: () => ({ close: async () => undefined }),
        releaseAndWait: async () => {
          released = true
        },
        closeTimeoutMs: 40,
      }),
    /aborted/,
  )
  assert.equal(connected, false)
  assert.equal(released, true)
})

test("launchBrowser abort after connect still releases if close hangs", async () => {
  const { launchBrowser } = await import("../src/solari.ts")
  let released = false
  let connectTimeout = 0
  const ac = new AbortController()
  const fake = {} as import("@solarisdk/browser").Solari
  await assert.rejects(
    () =>
      launchBrowser(fake, {}, ac.signal, {
        create: async () => ({ id: "s1", wsEndpoint: "ws://example" }),
        connect: async (_ws, opts) => {
          connectTimeout = opts.timeout
          ac.abort()
          return {}
        },
        wrap: () => ({ close: () => new Promise(() => {}) }),
        releaseAndWait: async () => {
          released = true
        },
        closeTimeoutMs: 40,
      }),
    /aborted/,
  )
  assert.ok(connectTimeout > 0)
  assert.equal(released, true)
})

test("boundPromise rejects a hanging Chromium-style connect", async () => {
  const hang = new Promise<never>(() => {})
  const started = Date.now()
  await assert.rejects(
    () => boundPromise(hang, 40, "waiting for Chromium timed out after 40ms"),
    /waiting for Chromium timed out after 40ms/,
  )
  assert.ok(Date.now() - started < 1000)
})

test("ReadyRelease.release does not hang forever if never armed", async () => {
  const closer = new ReadyRelease()
  const started = Date.now()
  await closer.release(40)
  assert.ok(Date.now() - started < 1000)
})

test("closeThenRelease still calls release if close times out", async () => {
  let released = false
  const hang = () => new Promise<void>(() => {})
  await assert.rejects(
    () =>
      closeThenRelease(
        hang,
        async () => {
          released = true
        },
        40,
      ),
    /timed out/,
  )
  assert.equal(released, true)
})
