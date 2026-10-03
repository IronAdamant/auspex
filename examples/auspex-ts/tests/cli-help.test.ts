import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { parseArgv } from "../src/cli.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("parseArgv --verify-with-profile enables verifyAfter for consistencyhub", () => {
  const withProfile = parseArgv(["check", "--name", "consistencyhub", "--verify-with-profile"])
  assert.equal(withProfile.status, "ok")
  if (withProfile.status === "ok" && withProfile.command.cmd === "check") {
    assert.equal(withProfile.command.opts.profile, "consistencyhub")
    assert.equal(withProfile.command.opts.verifyWithProfile, true)
    assert.equal(withProfile.command.verifyAfter, true, "--verify-with-profile should enable verifyAfter")
  }
  const explicitVerify = parseArgv(["check", "--name", "consistencyhub", "--verify"])
  assert.equal(explicitVerify.status, "ok")
  if (explicitVerify.status === "ok" && explicitVerify.command.cmd === "check") {
    assert.equal(explicitVerify.command.verifyAfter, true, "--verify should enable verifyAfter")
  }
  const explicitNoVerify = parseArgv(["check", "--name", "consistencyhub", "--no-verify"])
  assert.equal(explicitNoVerify.status, "ok")
  if (explicitNoVerify.status === "ok" && explicitNoVerify.command.cmd === "check") {
    assert.equal(explicitNoVerify.command.verifyAfter, false, "--no-verify should disable verifyAfter")
  }
})

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
