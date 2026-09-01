import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { loadDotEnv } from "../src/solari.ts"

test("loadDotEnv reads SOLARI_API_KEY from a local env file when process env is empty", () => {
  const prev = process.env.SOLARI_API_KEY
  delete process.env.SOLARI_API_KEY
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-env-"))
  const file = path.join(dir, ".env")
  writeFileSync(file, 'SOLARI_API_KEY="slr_live_dotenv_test_value"\n')
  try {
    loadDotEnv(file)
    assert.equal(process.env.SOLARI_API_KEY, "slr_live_dotenv_test_value")
  } finally {
    if (prev === undefined) delete process.env.SOLARI_API_KEY
    else process.env.SOLARI_API_KEY = prev
  }
})
