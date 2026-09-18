import assert from "node:assert/strict"
import test from "node:test"
import { parseArgv } from "../src/cli.ts"

test("--verify-with-profile sets verifyAfter and verifyWithProfile", () => {
  const parsed = parseArgv([
    "check",
    "--name",
    "consistencyhub",
    "--verify-with-profile",
  ])
  assert.equal(parsed.status, "ok")
  if (parsed.status !== "ok") return
  assert.equal(parsed.command.cmd, "check")
  if (parsed.command.cmd !== "check") return
  assert.equal(parsed.command.verifyAfter, true)
  assert.equal(parsed.command.verifyWithProfile, true)
})

test("--verify-with-profile cannot be used with --no-verify", () => {
  const parsed = parseArgv([
    "check",
    "--name",
    "consistencyhub",
    "--verify-with-profile",
    "--no-verify",
  ])
  assert.equal(parsed.status, "error")
  if (parsed.status === "error") {
    assert.match(parsed.message, /cannot use --no-verify with --verify-with-profile/)
  }
})

test("--verify-with-profile works with explicit url/expect/profile", () => {
  const parsed = parseArgv([
    "check",
    "https://example.com",
    "--expect",
    "Hello",
    "--profile",
    "test-profile",
    "--verify-with-profile",
  ])
  assert.equal(parsed.status, "ok")
  if (parsed.status !== "ok") return
  assert.equal(parsed.command.cmd, "check")
  if (parsed.command.cmd !== "check") return
  assert.equal(parsed.command.verifyAfter, true)
  assert.equal(parsed.command.verifyWithProfile, true)
  assert.equal(parsed.command.opts.profile, "test-profile")
})

test("--verify flag alone sets verifyAfter but not verifyWithProfile", () => {
  const parsed = parseArgv([
    "check",
    "--name",
    "ironadamant",
    "--verify",
  ])
  assert.equal(parsed.status, "ok")
  if (parsed.status !== "ok") return
  assert.equal(parsed.command.cmd, "check")
  if (parsed.command.cmd !== "check") return
  assert.equal(parsed.command.verifyAfter, true)
  assert.equal(parsed.command.verifyWithProfile, undefined)
})

test("default verify behavior without flags", () => {
  const parsed = parseArgv([
    "check",
    "--name",
    "checkpoint",
  ])
  assert.equal(parsed.status, "ok")
  if (parsed.status !== "ok") return
  assert.equal(parsed.command.cmd, "check")
  if (parsed.command.cmd !== "check") return
  // verifyAfter should be true by default (no --no-verify)
  assert.equal(parsed.command.verifyAfter, true)
  assert.equal(parsed.command.verifyWithProfile, undefined)
})
