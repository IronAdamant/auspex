import assert from "node:assert/strict"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { SolariError, type Solari } from "@solarisdk/browser"
import { attachRecordedReplay } from "../src/solari.ts"

test("attachRecordedReplay writes sidecar ndjson and returns true", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-replay-"))
  const solari = {
    sessions: {
      getReplayUrl: async () => ({
        url: "https://example.com/replay",
        expiresInSeconds: 60,
        contentEncoding: "identity",
      }),
      downloadReplay: async () => new Uint8Array([1, 2, 3, 10]),
    },
  } as unknown as Solari
  const ready = await attachRecordedReplay(solari, "sid-1", dir, { deadlineMs: Date.now() + 2_000, sleep: async () => undefined })
  assert.equal(ready, true)
  assert.deepEqual(readFileSync(path.join(dir, "replay.ndjson")), Buffer.from([1, 2, 3, 10]))
})

test("attachRecordedReplay is false when replay never becomes ready", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-replay-"))
  const solari = {
    sessions: {
      getReplayUrl: async () => {
        throw new SolariError("missing", 404)
      },
      downloadReplay: async () => new Uint8Array([9]),
    },
  } as unknown as Solari
  const ready = await attachRecordedReplay(solari, "sid-404", dir, {
    deadlineMs: Date.now() + 20,
    sleep: async () => undefined,
  })
  assert.equal(ready, false)
})
