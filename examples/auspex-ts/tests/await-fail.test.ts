import assert from "node:assert/strict"
import test from "node:test"
import {
  profileSaveWaitTimeoutMs,
  STREAM_EXPIRED_WAIT_MS,
  streamExpiredGuide,
} from "../src/await-fail.ts"

test("completed editorSave 4xx uses the same short jar poll and is not a stream-expired label", () => {
  const full = 1_800_000
  const capped = profileSaveWaitTimeoutMs({
    timeoutMs: full,
    streamExpired: false,
    editorHung: false,
    editorSaveInfra5xx: false,
    editorSaveCompletedFailure: true,
    preflight: "proceed",
    streamWaitTimeoutMs: full,
  })
  assert.equal(capped, STREAM_EXPIRED_WAIT_MS)
  const bare = streamExpiredGuide("app-example")
  assert.match(bare.text, /or a Solari 502/)
  const named = streamExpiredGuide("app-example", { editorSaveStatus: 401 })
  assert.match(named.text, /or a Solari 502/)
  assert.equal(/editorSave returned Solari 401/.test(named.text), false)
})

