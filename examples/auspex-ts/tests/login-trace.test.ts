import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  loginTraceSeedExtras,
  readLoginTrace,
  recordLoginTrace,
  summarizeLoginTrace,
  } from "../src/login-trace.ts"
import { SESSION_STORAGE_PREFIX } from "../src/profile-storage.ts"

test("loginTraceSeedExtras reports stale folded expiresInSec and omits values", () => {
  const past = String(Date.now() - 60_000)
  const extras = loginTraceSeedExtras(
    {
      cookies: [{ name: "ESTSAUTH", value: "SECRET", domain: "login.microsoftonline.com" }],
      origins: [
        {
          origin: "https://consistencyhub.io",
          localStorage: [
            { name: `${SESSION_STORAGE_PREFIX}accessToken`, value: "tok" },
            { name: `${SESSION_STORAGE_PREFIX}expiresOn`, value: past },
          ],
        },
      ],
    },
    "https://consistencyhub.io",
  )
  assert.equal(extras.idpCookies, true)
  assert.ok((extras.foldedExpiresInSec ?? 0) < 0)
  assert.equal(JSON.stringify(extras).includes("SECRET"), false)
  assert.equal(JSON.stringify(extras).includes("tok"), false)
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

test("summarizeLoginTrace says mint ready and names mint-stop why", () => {
  const ready = summarizeLoginTrace([
    {
      ts: "t",
      event: "login",
      profile: "consistencyhub",
      phoneDoor: "ime",
      remintIndex: 1,
      episodeId: "ep-1",
      mintStage: "ready",
      urlPresent: true,
      vncMintOk: true,
    },
  ])
  assert.match(ready, /Mint ready/)
  assert.match(ready, /phone\.html/)
  const readyDesktop = summarizeLoginTrace([
    {
      ts: "t",
      event: "login",
      profile: "consistencyhub",
      phoneDoor: "ime",
      computerDoor: "desktop-page",
      remintIndex: 1,
      episodeId: "ep-desk",
      mintStage: "ready",
      urlPresent: true,
      vncMintOk: true,
    },
  ])
  assert.match(readyDesktop, /Mint ready/)
  assert.match(readyDesktop, /phone\.html/)
  assert.equal(/desktop\.html/.test(readyDesktop), false)
  assert.equal(/door\.html/.test(readyDesktop), false)
  assert.equal(/Open editor/.test(readyDesktop), false)
  assert.equal(/Computer Open editor is the door/.test(readyDesktop), false)
  const noKey = summarizeLoginTrace([
    { ts: "t", event: "login", profile: "x", mintStage: "key-check", solariCode: "MissingApiKey", remintIndex: 1 },
  ])
  assert.match(noKey, /key-check/)
  assert.match(noKey, /SOLARI_API_KEY/)
  const start401 = summarizeLoginTrace([
    { ts: "t", event: "login", profile: "x", editorStartStatus: 401, mintStage: "editor-start", remintIndex: 1 },
  ])
  assert.match(start401, /editor-start HTTP 401/)
  const start409 = summarizeLoginTrace([
    { ts: "t", event: "login", profile: "x", editorStartStatus: 409, mintStage: "editor-start", remintIndex: 2 },
  ])
  assert.match(start409, /editor-start HTTP 409/)
  assert.match(start409, /Do not finalize-login/)
  assert.match(start409, /Stop the editor/)
  assert.equal(/purge the profile after the human agrees, then remint/.test(start409), false)
  const reused409 = summarizeLoginTrace([
    {
      ts: "t",
      event: "login",
      profile: "x",
      editorStartStatus: 409,
      mintStage: "ready",
      vncMintOk: true,
      phoneDoor: "ime",
      computerDoor: "desktop-page",
      remintIndex: 1,
    },
  ])
  assert.match(reused409, /Mint ready/)
  assert.equal(/Mint stopped at editor-start HTTP 409/.test(reused409), false)
  const cluster = summarizeLoginTrace([
    {
      ts: "t",
      event: "login",
      profile: "x",
      mintStage: "ready",
      urlPresent: true,
      vncMintOk: true,
      hostKind: "cluster-internal",
      remintIndex: 1,
    },
  ])
  assert.match(cluster, /cluster-internal/)
  assert.match(cluster, /Report to Solari/)
  const tok = summarizeLoginTrace([
    {
      ts: "t",
      event: "login",
      profile: "x",
      mintStage: "editor-token",
      vncMintOk: false,
      editorStartStatus: 200,
      tokenTries: 20,
      remintIndex: 1,
    },
  ])
  assert.match(tok, /editor-token/)
  assert.match(tok, /20s/)
})

test("summarizeLoginTrace does not say Mint ready when VNC/token mint failed", () => {
  const emptyToken = summarizeLoginTrace([
    {
      ts: "t",
      event: "login",
      profile: "x",
      mintStage: "editor-token",
      vncMintOk: false,
      editorStartStatus: 0,
      tokenTries: 0,
      phoneDoor: "none",
      remintIndex: 1,
      episodeId: "ep-empty",
    },
  ])
  assert.equal(/Mint ready/.test(emptyToken), false)
  assert.match(emptyToken, /editor-token/)
  assert.match(emptyToken, /empty handoff token/)
  assert.match(emptyToken, /Phone door not ready/)
  const legacyReadyLabel = summarizeLoginTrace([
    {
      ts: "t",
      event: "login",
      profile: "x",
      mintStage: "ready",
      vncMintOk: false,
      urlPresent: true,
      phoneDoor: "none",
      remintIndex: 1,
    },
  ])
  assert.equal(/Mint ready/.test(legacyReadyLabel), false)
  assert.match(legacyReadyLabel, /VNC did not/)
})

test("summarizeLoginTrace advises reap on 429 and remint on 503", () => {
  const s429 = summarizeLoginTrace([
    { ts: "t", event: "login", profile: "consistencyhub", solariStatus: 429, solariCode: "ConcurrencyLimitExceeded" },
  ])
  assert.match(s429, /429/)
  assert.match(s429, /auspex_reap/)
  const s503 = summarizeLoginTrace([
    { ts: "t", event: "login", profile: "consistencyhub", solariStatus: 503, solariCode: "SolariInfraTransient" },
  ])
  assert.match(s503, /503/)
  assert.match(s503, /remint/)
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
