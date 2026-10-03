import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { parseArgv } from "../src/cli.ts"
import {
  appendLoginTrace,
  cookieHostsFromState,
  foldedExpiresInSecFromState,
  idpCookiesFromHosts,
  loginTraceSeedExtras,
  readLoginTrace,
  recordLoginTrace,
  sanitizeLoginTraceEvent,
  summarizeLoginTrace,
  traceUrlParts,
  type LoginTraceEvent,
} from "../src/login-trace.ts"
import { SESSION_STORAGE_PREFIX } from "../src/profile-storage.ts"

test("appendLoginTrace then readLoginTrace round-trips redacted events", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "auspex-trace-"))
  const file = path.join(dir, "login.jsonl")
  try {
    await appendLoginTrace(
      {
        event: "login",
        profile: "consistencyhub",
        phoneDoor: "novnc-fallback",
        computerDoor: "console-editor",
      },
      file,
    )
    await appendLoginTrace(
      {
        event: "login",
        profile: "consistencyhub",
        mintStage: "editor-start",
        editorStartStatus: 401,
        vncMintOk: false,
      },
      file,
    )
    const raw = await readFile(file, "utf8")
    assert.equal(raw.includes("401"), true)
    assert.equal(raw.toLowerCase().includes("password"), false)
    const all = await readLoginTrace({ file, limit: 10 })
    assert.equal(all.events.length, 2)
    assert.equal(all.events[0]?.phoneDoor, "novnc-fallback")
    assert.equal(all.events[1]?.editorStartStatus, 401)
    const filtered = await readLoginTrace({ file, profile: "other", limit: 10 })
    assert.equal(filtered.events.length, 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("recordLoginTrace groups remints into episodes and summarizes for agents", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "auspex-trace-"))
  const file = path.join(dir, "login.jsonl")
  const activeFile = path.join(dir, "active.json")
  try {
    const first = await recordLoginTrace(
      {
        event: "login",
        profile: "consistencyhub",
        phoneDoor: "novnc-fallback",
        computerDoor: "console-editor",
        vncMintOk: false,
        mintStage: "editor-token",
      },
      { file, activeFile },
    )
    assert.equal(first.remintCount, 1)
    assert.ok(first.episodeId)
    const second = await recordLoginTrace(
      { event: "login", profile: "consistencyhub", phoneDoor: "ime", vncMintOk: true, mintStage: "ready" },
      { file, activeFile },
    )
    assert.equal(second.remintCount, 2)
    assert.notEqual(second.episodeId, first.episodeId)
    const last = await readLoginTrace({ file, profile: "consistencyhub" })
    assert.equal(last.episodeId, second.episodeId)
    assert.equal(last.events.every((e) => e.episodeId === second.episodeId), true)
    assert.equal(last.events.every((e) => e.event === "login"), true)
    const history = await readLoginTrace({ file, all: true, limit: 20 })
    assert.ok(history.events.length >= 2)
    const summary = summarizeLoginTrace(
      history.events.filter((e) => e.episodeId === first.episodeId),
    )
    assert.match(summary, /remint 1/)
    assert.equal(/Mint ready/.test(summary), false)
    assert.equal(/password\s*=/i.test(summary), false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("trace names its file without the home folder (relative in a clone, ~/ otherwise)", async () => {
  // Live, tldraw: auspex trace printed tracePath as /Users/<name>/…/.auspex/trace/login.jsonl.
  // A path that does not exist: reading a missing trace writes nothing.
  const { toStatePath } = await import("../src/paths.ts")
  const file = path.join(os.homedir(), ".auspex-trace-test-not-created", "login.jsonl")
  const read = await readLoginTrace({ file })
  assert.equal(read.tracePath, toStatePath(file))
  assert.equal(read.tracePath, "~/.auspex-trace-test-not-created/login.jsonl")
  assert.equal(read.events.length, 0)
})
