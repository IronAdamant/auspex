import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { exitFromOk, SCHEMA_VERSION, stampSchema } from "../src/cli-json.ts"

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function runCli(args: string[]) {
  return spawnSync("npx", ["tsx", "src/cli.ts", ...args], {
    cwd: pkg,
    encoding: "utf8",
    env: process.env,
  })
}

test("stampSchema prefixes schemaVersion without dropping ok/reason/url/expect/screenshotPath", () => {
  const stamped = stampSchema({
    ok: true,
    reason: "matched",
    url: "https://ironadamant.com",
    expect: "One office job.",
    screenshotPath: "shot.png",
    schemaVersion: 99,
  })
  assert.equal(stamped.schemaVersion, SCHEMA_VERSION)
  assert.equal(stamped.ok, true)
  assert.equal(stamped.reason, "matched")
  assert.equal(stamped.url, "https://ironadamant.com")
  assert.equal(stamped.expect, "One office job.")
  assert.equal(stamped.screenshotPath, "shot.png")
  assert.equal(exitFromOk(true), 0)
  assert.equal(exitFromOk(false), 1)
})

test("CLI usage errors print one JSON object on stdout and exit non-zero", () => {
  const bad = runCli(["check", "file:///tmp/x", "--expect", "x"])
  assert.notEqual(bad.status, 0)
  const obj = JSON.parse(bad.stdout) as { ok?: boolean; schemaVersion?: number; error?: string }
  assert.equal(obj.ok, false)
  assert.equal(obj.schemaVersion, SCHEMA_VERSION)
  assert.match(obj.error ?? "", /http or https/)
  assert.equal(bad.stdout.trim().startsWith("{"), true)
})

