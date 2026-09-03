import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { CHECK_THEN_VERIFY_WORST_MS } from "../src/sandbox.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function toolTimeoutMs(toml: string, server: string): number {
  const re = new RegExp(`\\[mcp_servers\\.${server}\\][\\s\\S]*?tool_timeout_sec\\s*=\\s*(\\d+)`)
  const m = toml.match(re)
  assert.ok(m, `missing tool_timeout_sec for ${server}`)
  return Number(m[1]) * 1000
}

test("check+verify worst-case budget fits Auspex MCP host timeout; Solari stays 300s", () => {
  const toml = readFileSync(path.join(root, "grok.mcp.example.toml"), "utf8")
  const auspex = toolTimeoutMs(toml, "auspex")
  const solari = toolTimeoutMs(toml, "solari")
  assert.equal(solari, 300_000)
  assert.ok(
    CHECK_THEN_VERIFY_WORST_MS <= auspex,
    `CHECK_THEN_VERIFY_WORST_MS ${CHECK_THEN_VERIFY_WORST_MS} exceeds Auspex tool_timeout_sec ${auspex}`,
  )
})
