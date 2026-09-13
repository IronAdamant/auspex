import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { forgetLive, readLiveLedger, rememberLive } from "../src/session-ledger.ts"

test("rememberLive and forgetLive persist ids per kind", async () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "auspex-ledger-")), "live.json")
  await rememberLive("browser", "sess-1", file)
  await rememberLive("browser", "sess-1", file)
  await rememberLive("sandbox", "sbx-1", file)
  const once = await readLiveLedger(file)
  assert.deepEqual(once.browser, ["sess-1"])
  assert.deepEqual(once.sandbox, ["sbx-1"])
  await forgetLive("browser", "sess-1", file)
  const after = await readLiveLedger(file)
  assert.deepEqual(after.browser, [])
  assert.deepEqual(after.sandbox, ["sbx-1"])
})
