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

test("USAGE documents check, login, and profiles", () => {
  assert.match(USAGE, /check/)
  assert.match(USAGE, /login/)
  assert.match(USAGE, /profiles/)
  assert.match(USAGE, /verify/)
  assert.match(USAGE, /--verify/)
  assert.match(USAGE, /desktop/)
  assert.match(USAGE, /handoff/)
  assert.match(USAGE, /--verify/)
  assert.match(USAGE, /not retryable/)
  assert.match(USAGE, /solari_kill|solari_browser_close/)
  assert.equal(USAGE.includes("kill leftover sessions in the console"), false)
})

test("parseArgv --help and check --help request help", () => {
  const a = parseArgv(["--help"])
  assert.equal(a.status, "ok")
  if (a.status === "ok") assert.equal(a.command.cmd, "help")
  const b = parseArgv(["check", "--help"])
  assert.equal(b.status, "ok")
  if (b.status === "ok") assert.equal(b.command.cmd, "help")
})

test("parseArgv check --sso", () => {
  const parsed = parseArgv([
    "check",
    "https://consistencyhub.io/login",
    "--expect",
    "Dashboard",
    "--profile",
    "consistencyhub",
    "--sso",
  ])
  assert.equal(parsed.status, "ok")
  if (parsed.status === "ok" && parsed.command.cmd === "check") {
    assert.equal(parsed.command.opts.sso, true)
    assert.equal(parsed.command.opts.profile, "consistencyhub")
  }
})

test("parseArgv rejects empty --expect", () => {
  const parsed = parseArgv(["check", "https://ironadamant.com", "--expect", ""])
  assert.equal(parsed.status, "error")
  if (parsed.status === "error") assert.match(parsed.message, /--expect/)
})

test("parseArgv rejects whitespace-only --expect", () => {
  const parsed = parseArgv(["check", "https://ironadamant.com", "--expect", "   "])
  assert.equal(parsed.status, "error")
  if (parsed.status === "error") assert.match(parsed.message, /--expect/)
})

test("parseArgv rejects non-http(s) URLs", () => {
  const parsed = parseArgv(["check", "file:///etc/passwd", "--expect", "x"])
  assert.equal(parsed.status, "error")
  if (parsed.status === "error") assert.match(parsed.message, /http or https/)
})

test("parseArgv rejects userinfo URLs", () => {
  const parsed = parseArgv(["check", "https://user:pass@example.com/", "--expect", "x"])
  assert.equal(parsed.status, "error")
  if (parsed.status === "error") assert.match(parsed.message, /http or https/)
})

test("parseArgv does not assign an https token as --profile", () => {
  const parsed = parseArgv([
    "check",
    "--profile",
    "https://example.com",
    "--expect",
    "x",
    "https://ironadamant.com",
  ])
  assert.equal(parsed.status, "error")
  if (parsed.status === "error") assert.match(parsed.message, /profile|URL/i)
})

test("parseArgv --stealth=true is not a boolean flag", () => {
  const parsed = parseArgv([
    "check",
    "https://ironadamant.com",
    "--expect",
    "Build it.",
    "--stealth=true",
  ])
  assert.equal(parsed.status, "error")
  if (parsed.status === "error") assert.match(parsed.message, /unexpected/)
})

test("parseArgv login and profiles", () => {
  const login = parseArgv(["login", "--profile", "auspex-goal-test"])
  assert.equal(login.status, "ok")
  if (login.status === "ok") {
    assert.equal(login.command.cmd, "login")
    if (login.command.cmd === "login") assert.equal(login.command.profile, "auspex-goal-test")
  }
  const profiles = parseArgv(["profiles"])
  assert.equal(profiles.status, "ok")
  if (profiles.status === "ok") assert.equal(profiles.command.cmd, "profiles")
})

test("shipped CLI --help lists check, login, profiles", () => {
  const help = runCli(["--help"])
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /check/)
  assert.match(help.stdout, /login/)
  assert.match(help.stdout, /profiles/)
  assert.match(help.stdout, /verify/)
  assert.match(help.stdout, /--verify/)
  assert.match(help.stdout, /desktop/)
  assert.match(help.stdout, /solari_kill|solari_browser_close/)
  assert.equal(help.stdout.includes("kill leftover sessions in the console"), false)
})

test("shipped CLI check --help lists login and profiles", () => {
  const help = runCli(["check", "--help"])
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /check/)
  assert.match(help.stdout, /login/)
  assert.match(help.stdout, /profiles/)
})

test("shipped CLI rejects empty and whitespace --expect", () => {
  const empty = runCli(["check", "https://ironadamant.com", "--expect", ""])
  assert.notEqual(empty.status, 0)
  assert.match(`${empty.stderr}${empty.stdout}`, /--expect/)
  const ws = runCli(["check", "https://ironadamant.com", "--expect", "   "])
  assert.notEqual(ws.status, 0)
  assert.match(`${ws.stderr}${ws.stdout}`, /--expect/)
})

test("shipped CLI rejects a non-https URL", () => {
  const bad = runCli(["check", "file:///tmp/x", "--expect", "Build it."])
  assert.notEqual(bad.status, 0)
  assert.match(`${bad.stderr}${bad.stdout}`, /http or https/)
})

test("shipped CLI rejects a userinfo URL", () => {
  const bad = runCli(["check", "https://user:pass@example.com/", "--expect", "x"])
  assert.notEqual(bad.status, 0)
  assert.match(`${bad.stderr}${bad.stdout}`, /http or https/)
})

test("shipped CLI does not take https as --profile", () => {
  const bad = runCli([
    "check",
    "--profile",
    "https://example.com",
    "--expect",
    "x",
    "https://ironadamant.com",
  ])
  assert.notEqual(bad.status, 0)
  assert.match(`${bad.stderr}${bad.stdout}`, /profile|URL|unexpected/i)
})

test("parseArgv rejects loopback check URLs", () => {
  for (const url of ["http://localhost:3000", "http://127.0.0.1/", "http://[::1]/"]) {
    const parsed = parseArgv(["check", url, "--expect", "x"])
    assert.equal(parsed.status, "error", url)
    if (parsed.status === "error") {
      assert.match(parsed.message, /loopback|cloud|agent machine/i)
    }
  }
})

test("parseArgv rejects --record with --profile unless override is set", () => {
  const blocked = parseArgv([
    "check",
    "https://ironadamant.com",
    "--expect",
    "Build it.",
    "--profile",
    "consistencyhub",
    "--record",
  ])
  assert.equal(blocked.status, "error")
  if (blocked.status === "error") assert.match(blocked.message, /allow-record-profile|record/i)
  const ok = parseArgv([
    "check",
    "https://ironadamant.com",
    "--expect",
    "Build it.",
    "--profile",
    "consistencyhub",
    "--record",
    "--allow-record-profile",
  ])
  assert.equal(ok.status, "ok")
  if (ok.status === "ok" && ok.command.cmd === "check") {
    assert.equal(ok.command.opts.allowRecordProfile, true)
    assert.equal(ok.command.opts.record, true)
    assert.equal(ok.command.opts.profile, "consistencyhub")
  }
})

test("parseArgv rejects whitespace-only --profile on check and login", () => {
  const check = parseArgv([
    "check",
    "https://ironadamant.com",
    "--expect",
    "Build it.",
    "--profile",
    "   ",
  ])
  assert.equal(check.status, "error")
  if (check.status === "error") assert.match(check.message, /profile name/i)
  const login = parseArgv(["login", "--profile", "   "])
  assert.equal(login.status, "error")
  if (login.status === "error") assert.match(login.message, /profile name/i)
})

test("shipped CLI rejects loopback check URLs without launching Solari", () => {
  const bad = runCli(["check", "http://localhost:3000", "--expect", "x"])
  assert.notEqual(bad.status, 0)
  assert.match(`${bad.stderr}${bad.stdout}`, /loopback|cloud Chrome|agent machine/i)
})

test("shipped CLI rejects --record with --profile", () => {
  const bad = runCli([
    "check",
    "https://ironadamant.com",
    "--expect",
    "Build it.",
    "--profile",
    "consistencyhub",
    "--record",
  ])
  assert.notEqual(bad.status, 0)
  assert.match(`${bad.stderr}${bad.stdout}`, /allow-record-profile|record/i)
})

test("shipped CLI rejects whitespace-only --profile", () => {
  const check = runCli(["check", "https://ironadamant.com", "--expect", "Build it.", "--profile", "   "])
  assert.notEqual(check.status, 0)
  assert.match(`${check.stderr}${check.stdout}`, /profile name/i)
  const login = runCli(["login", "--profile", "   "])
  assert.notEqual(login.status, 0)
  assert.match(`${login.stderr}${login.stdout}`, /profile name/i)
})

test("parseArgv desktop takes no extra args", () => {
  const a = parseArgv(["desktop"])
  assert.equal(a.status, "ok")
  if (a.status === "ok") assert.equal(a.command.cmd, "desktop")
  const b = parseArgv(["desktop", "extra"])
  assert.equal(b.status, "error")
})
