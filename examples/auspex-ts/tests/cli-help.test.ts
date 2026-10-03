import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { parseArgv, USAGE } from "../src/cli.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function runCli(args: string[]) {
  return spawnSync("npx", ["tsx", "src/cli.ts", ...args], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  })
}

test("option values may start with a dash; a following flag is still not a value", async () => {
  const { parseArgv } = await import("../src/cli.ts")
  const ok = parseArgv(["check", "https://example.com", "--expect", "-20% off"])
  assert.equal(ok.status, "ok")
  if (ok.status === "ok" && ok.command.cmd === "check") assert.equal(ok.command.opts.expect, "-20% off")
  const missing = parseArgv(["check", "https://example.com", "--expect", "--no-verify"])
  assert.equal(missing.status, "error")
})

test("job and connect read a dash-leading value the same way check does", async () => {
  const { parseArgv } = await import("../src/cli.ts")
  const job = parseArgv(["job", "--url", "https://app.example", "--expect", "-20% off"])
  assert.equal(job.status, "ok")
  if (job.status === "ok" && job.command.cmd === "job") assert.equal(job.command.opts.expect, "-20% off")
  const connect = parseArgv(["connect", "https://app.example", "--expect", "-20% off"])
  assert.equal(connect.status, "ok")
  if (connect.status === "ok" && connect.command.cmd === "connect" && connect.command.connect.mode === "run") {
    assert.equal(connect.command.connect.opts.expect, "-20% off")
  }
  // A flag in the value's place is still not a value, in every command.
  assert.equal(parseArgv(["job", "--url", "https://app.example", "--expect", "-v"]).status, "error")
  assert.equal(parseArgv(["connect", "https://app.example", "--expect", "-v"]).status, "error")
})

test("every command's --help prints help, wherever it sits", async () => {
  const { parseArgv } = await import("../src/cli.ts")
  for (const cmd of ["check", "login", "await-login", "finalize-login", "profiles", "profile-status", "solari-health", "reap", "desktop", "trace", "verify", "job", "job-status", "connect", "sweep", "mcp"]) {
    assert.deepEqual(parseArgv([cmd, "--help"]), { status: "ok", command: { cmd: "help" } }, cmd)
    assert.deepEqual(parseArgv([cmd, "--bogus", "-h"]), { status: "ok", command: { cmd: "help" } }, cmd)
  }
})

test("sweep parses --plan and --notify and refuses a non-http notify", async () => {
  const { parseArgv } = await import("../src/cli.ts")
  assert.deepEqual(parseArgv(["sweep", "--plan", "plan.json"]), { status: "ok", command: { cmd: "sweep", planPath: "plan.json", notify: undefined } })
  assert.equal(parseArgv(["sweep"]).status, "error")
  assert.equal(parseArgv(["sweep", "--plan", "p.json", "--notify", "file:///x"]).status, "error")
})

test("check takes its URL positionally or as --url, like login, job and connect", async () => {
  const { parseArgv } = await import("../src/cli.ts")
  for (const argv of [
    ["check", "https://app.example", "--expect", "Hi", "--profile", "app"],
    ["check", "--profile", "app", "--url", "https://app.example", "--expect", "Hi", "--verify-with-profile"],
  ]) {
    const parsed = parseArgv(argv)
    assert.equal(parsed.status, "ok", argv.join(" "))
    if (parsed.status === "ok" && parsed.command.cmd === "check") assert.equal(parsed.command.opts.url, "https://app.example")
  }
  assert.equal(parseArgv(["check", "https://a.example", "--url", "https://b.example", "--expect", "Hi"]).status, "error")
})

test("the commands connect prints for next time and for a retry parse", async () => {
  const { parseArgv } = await import("../src/cli.ts")
  const { connectOutcome } = await import("../src/connect.ts")
  const base = { schemaVersion: 1 as const, jobId: "job-1", profile: "tldraw-com", url: "https://www.tldraw.com", expect: 'My "big" workspace', createdAt: "", updatedAt: "" }
  const lines = [
    ...connectOutcome({ ...base, phase: "completed", status: "completed", ok: true, reason: "matched", claimOkProfile: true }).detail,
    ...connectOutcome({ ...base, phase: "failed", status: "failed", ok: false, reason: "exhausted retries", seedReadiness: { solariSaveReady: true } as never }).detail,
  ]
  const commands = lines.map((l) => l.replace(/^Next time: /, "")).filter((l) => /^npx auspex(-solari)? check /.test(l))
  assert.equal(commands.length, 2)
  for (const command of commands) {
    const args = [...command.replace(/^npx auspex(-solari)? /, "").matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)].map((m) => (m[1] ?? m[2]!).replace(/\\(.)/g, "$1"))
    const parsed = parseArgv(args)
    assert.equal(parsed.status, "ok", `${command} -> ${parsed.status === "error" ? parsed.message : ""}`)
    if (parsed.status === "ok" && parsed.command.cmd === "check") {
      assert.equal(parsed.command.opts.expect, 'My "big" workspace')
      assert.equal(parsed.command.opts.verifyWithProfile, true)
    }
  }
})

test("every auspex command in the docs' code blocks parses", async () => {
  const { readFileSync } = await import("node:fs")
  const { parseArgv } = await import("../src/cli.ts")
  const repo = path.resolve(root, "..", "..")
  const files = ["AGENTS.md", "AGENT-CARD.md", "README.md", "RECEIPTS.md", "docs/HOSTS.md", "docs/REVIEWER-5MIN.md", "docs/ops-runbook.md", "docs/index.html", ".cursor/rules/auspex.mdc", "examples/auspex-ts/README.md", "examples/auspex-ts/DEMO.md"]
  let checked = 0
  for (const file of files) {
    const text = readFileSync(path.join(repo, file), "utf8").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    const blocks = [...text.matchAll(/```[a-z]*\n([\s\S]*?)```|<pre[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => m[1] ?? m[2] ?? "")
    for (const block of blocks) {
      for (const raw of block.replace(/\\\n\s*/g, " ").split("\n")) {
        const m = /^\s*npx (?:auspex(?:-solari)?|tsx src\/cli\.ts) (.*)$/.exec(raw.replace(/\s+#.*$/, ""))
        if (!m || /[<…]|\.\.\./.test(m[1]!)) continue
        const args = [...m[1]!.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g)].map((x) => x[1] ?? x[2] ?? x[3]!)
        const parsed = parseArgv(args)
        assert.equal(parsed.status, "ok", `${file}: ${raw.trim()} -> ${parsed.status === "error" ? parsed.message : ""}`)
        checked += 1
      }
    }
  }
  assert.ok(checked >= 40, `only ${checked} doc commands found`)
})
