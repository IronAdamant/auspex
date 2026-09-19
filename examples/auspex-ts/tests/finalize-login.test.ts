import assert from "node:assert/strict"
import test from "node:test"
import { resolveFinalizeLoginTarget } from "../src/check.ts"
import { parseArgv } from "../src/cli.ts"

test("resolveFinalizeLoginTarget requires url and expect for unknown profiles", () => {
  assert.throws(
    () => resolveFinalizeLoginTarget({ profile: "myapp" }),
    /finalize-login requires --url and --expect unless --profile matches a saved check/,
  )
})

test("resolveFinalizeLoginTarget uses saved check for consistencyhub", () => {
  const target = resolveFinalizeLoginTarget({ profile: "consistencyhub" })
  assert.equal(target.url, "https://consistencyhub.io")
  assert.equal(target.expect, "Document Editor")
})

test("resolveFinalizeLoginTarget passes through generic url and expect", () => {
  const target = resolveFinalizeLoginTarget({
    profile: "myapp",
    url: "https://app.example.com",
    expect: "Dashboard",
  })
  assert.equal(target.url, "https://app.example.com")
  assert.equal(target.expect, "Dashboard")
  assert.notEqual(target.expect, "Document Editor")
})

test("parseArgv finalize-login accepts unknown profile without url at parse time", () => {
  const parsed = parseArgv(["finalize-login", "--profile", "myapp"])
  assert.equal(parsed.status, "ok")
  if (parsed.status === "ok" && parsed.command.cmd === "finalize-login") {
    assert.equal(parsed.command.profile, "myapp")
    assert.equal(parsed.command.url, undefined)
    assert.equal(parsed.command.expect, undefined)
  }
})

test("parseArgv finalize-login parses --url and --expect", () => {
  const parsed = parseArgv([
    "finalize-login",
    "--profile",
    "myapp",
    "--url",
    "https://app.example.com",
    "--expect",
    "Dashboard",
  ])
  assert.equal(parsed.status, "ok")
  if (parsed.status === "ok" && parsed.command.cmd === "finalize-login") {
    assert.equal(parsed.command.profile, "myapp")
    assert.equal(parsed.command.url, "https://app.example.com")
    assert.equal(parsed.command.expect, "Dashboard")
  }
})
