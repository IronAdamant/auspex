import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { applyOperatorKeyFile, loadDotEnv } from "../src/solari.ts"
import { writeOperatorKey } from "../src/operator-session.ts"

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

test("loadDotEnv accepts export prefix and a UTF-8 BOM", () => {
  const prev = process.env.SOLARI_API_KEY
  delete process.env.SOLARI_API_KEY
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-env-"))
  const file = path.join(dir, ".env")
  writeFileSync(file, "\uFEFFexport SOLARI_API_KEY=slr_live_bom_export\n")
  try {
    loadDotEnv(file)
    assert.equal(process.env.SOLARI_API_KEY, "slr_live_bom_export")
  } finally {
    if (prev === undefined) delete process.env.SOLARI_API_KEY
    else process.env.SOLARI_API_KEY = prev
  }
})

test("applyOperatorKeyFile loads gitignored operator-key only when the env is empty", () => {
  const prev = process.env.SOLARI_API_KEY
  const root = mkdtempSync(path.join(tmpdir(), "auspex-opkey-"))
  const file = writeOperatorKey(root, "slr_live_operator_file_key")
  try {
    process.env.SOLARI_API_KEY = "slr_live_env_wins"
    applyOperatorKeyFile(file)
    assert.equal(process.env.SOLARI_API_KEY, "slr_live_env_wins")
    delete process.env.SOLARI_API_KEY
    applyOperatorKeyFile(file)
    assert.equal(process.env.SOLARI_API_KEY, "slr_live_operator_file_key")
  } finally {
    if (prev === undefined) delete process.env.SOLARI_API_KEY
    else process.env.SOLARI_API_KEY = prev
  }
})
