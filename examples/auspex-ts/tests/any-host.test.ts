import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { parseArgv, USAGE } from "../src/cli.ts"
import { exitFromOk, SCHEMA_VERSION, stampSchema } from "../src/cli-json.ts"
import {
  AUSPEX_CONTRACT,
  contractCliCommands,
  contractJsonFields,
  contractToolNames,
} from "../src/contract.ts"
import {
  auspexAwaitLoginInputSchema,
  auspexCheckInputObject,
  auspexDesktopInputSchema,
  auspexFinalizeLoginInputSchema,
  auspexLoginInputObject,
  auspexProfileStatusInputSchema,
  auspexProfilesInputSchema,
  auspexReapInputSchema,
  auspexTraceInputSchema,
} from "../src/tool-schema.ts"

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repo = path.resolve(pkg, "../..")

function runCli(args: string[]) {
  return spawnSync("npx", ["tsx", "src/cli.ts", ...args], {
    cwd: pkg,
    encoding: "utf8",
    env: process.env,
  })
}

test("CLI and MCP share one contract: tools, commands, and JSON fields", () => {
  assert.deepEqual(contractCliCommands(), [
    "check",
    "login",
    "await-login",
    "finalize-login",
    "profiles",
    "profile-status",
    "verify",
    "desktop",
    "reap",
    "trace",
  ])
  assert.deepEqual(contractToolNames(), [
    "auspex_check",
    "auspex_login",
    "auspex_await_login",
    "auspex_finalize_login",
    "auspex_profiles",
    "auspex_profile_status",
    "auspex_verify",
    "auspex_desktop",
    "auspex_reap",
    "auspex_trace",
  ])
  const shapes: Record<string, Record<string, unknown>> = {
    check: auspexCheckInputObject.shape,
    login: auspexLoginInputObject.shape,
    "await-login": auspexAwaitLoginInputSchema.shape,
    "finalize-login": auspexFinalizeLoginInputSchema.shape,
    profiles: auspexProfilesInputSchema.shape,
    "profile-status": auspexProfileStatusInputSchema.shape,
    desktop: auspexDesktopInputSchema.shape,
    reap: auspexReapInputSchema.shape,
    trace: auspexTraceInputSchema.shape,
  }
  for (const [cmd, shape] of Object.entries(shapes)) {
    const fields = contractJsonFields(cmd)
    for (const key of Object.keys(shape)) {
      assert.ok(fields.includes(key), `${cmd} MCP field ${key} missing from CLI contract`)
    }
  }
  for (const row of AUSPEX_CONTRACT) {
    for (const field of row.fields) {
      if (field.kind === "positional") continue
      assert.match(USAGE, new RegExp(field.flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    }
  }
})

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

test("parseArgv mcp is the stdio door; --help stays human text", () => {
  const mcp = parseArgv(["mcp"])
  assert.equal(mcp.status, "ok")
  if (mcp.status === "ok") assert.equal(mcp.command.cmd, "mcp")
  const help = runCli(["--help"])
  assert.equal(help.status, 0)
  assert.match(help.stdout, /npx auspex/)
  assert.match(help.stdout, /schemaVersion/)
  assert.match(help.stdout, /SOLARI_API_KEY/)
  assert.match(USAGE, /\bmcp\b/)
})

test("repo root bins exist so agents spawn without hunting examples/", () => {
  assert.equal(existsSync(path.join(repo, "bin", "auspex.mjs")), true)
  assert.equal(existsSync(path.join(repo, "bin", "auspex-mcp.mjs")), true)
  const rootPkg = JSON.parse(readFileSync(path.join(repo, "package.json"), "utf8")) as {
    bin?: Record<string, string>
  }
  assert.equal(rootPkg.bin?.auspex, "bin/auspex.mjs")
  assert.equal(rootPkg.bin?.["auspex-mcp"], "bin/auspex-mcp.mjs")
  const help = spawnSync(process.execPath, [path.join(repo, "bin", "auspex.mjs"), "--help"], {
    encoding: "utf8",
    env: process.env,
    cwd: repo,
  })
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /check/)
  assert.match(help.stdout, /npx auspex/)
})
