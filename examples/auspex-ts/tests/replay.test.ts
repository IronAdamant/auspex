import assert from "node:assert/strict"
import test from "node:test"
import { SolariError } from "@solarisdk/browser"
import { downloadReplayWhenReady } from "../src/solari.ts"

test("downloadReplayWhenReady retries 404 then succeeds within the deadline", async () => {
  let n = 0
  const body = new Uint8Array([1, 2, 3])
  const out = await downloadReplayWhenReady(
    async () => {
      n += 1
      if (n === 1) throw new SolariError("missing", 404)
      return body
    },
    "sid",
    { sleep: async () => undefined, deadlineMs: Date.now() + 10_000 },
  )
  assert.equal(n, 2)
  assert.deepEqual(out, body)
})

test("downloadReplayWhenReady throws non-404 errors without retrying", async () => {
  let n = 0
  await assert.rejects(
    () =>
      downloadReplayWhenReady(
        async () => {
          n += 1
          throw new SolariError("gateway", 500)
        },
        "sid",
        { sleep: async () => undefined, deadlineMs: Date.now() + 10_000 },
      ),
    /gateway/,
  )
  assert.equal(n, 1)
})
