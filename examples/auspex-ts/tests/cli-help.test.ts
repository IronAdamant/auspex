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
