import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { solariKeyReady } from "../src/solari-mcp-gate.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const entry = path.join(root, "src", "solari-mcp-entry.ts")

test("solariKeyReady is false without a key and true with env or dotenv", () => {
  assert.equal(solariKeyReady({} as NodeJS.ProcessEnv, path.join(tmpdir(), "no-such-auspex.env")), false)
  assert.equal(solariKeyReady({ SOLARI_API_KEY: "   " }, path.join(tmpdir(), "no-such-auspex.env")), false)
  assert.equal(solariKeyReady({ SOLARI_API_KEY: "slr_live_x" }), true)
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-gate-"))
  const file = path.join(dir, ".env")
  writeFileSync(file, "SOLARI_API_KEY=slr_live_fromfile\n")
  assert.equal(solariKeyReady({} as NodeJS.ProcessEnv, file), true)
})

test("solari-mcp entry exits 1 when no key so Grok will not list solari_* tools", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-gate-"))
  const emptyEnv = path.join(dir, ".env")
  writeFileSync(emptyEnv, "# no key\n")
  const { SOLARI_API_KEY: _drop, ...rest } = process.env
  const out = spawnSync(
    process.execPath,
    ["--import", "tsx", entry],
    {
      encoding: "utf8",
      env: { ...rest, AUSPEX_DOTENV_PATH: emptyEnv },
      cwd: root,
      timeout: 8000,
    },
  )
  assert.notEqual(out.status, 0)
  assert.match(`${out.stderr}${out.stdout}`, /no SOLARI_API_KEY/)
})
