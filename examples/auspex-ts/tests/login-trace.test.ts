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

test("cookieHostsFromState lists unique hosts without values", () => {
  const hosts = cookieHostsFromState({
    cookies: [
      { name: "sid", value: "SECRET", domain: ".login.microsoftonline.com" },
      { name: "sid", value: "SECRET", domain: "login.microsoftonline.com" },
      { name: "app", value: "x", domain: "consistencyhub.io" },
    ],
    origins: [],
  })
  assert.deepEqual(hosts, ["consistencyhub.io", "login.microsoftonline.com"])
  assert.equal(idpCookiesFromHosts(hosts), true)
  assert.equal(idpCookiesFromHosts(["consistencyhub.io"]), false)
})

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

test("foldedExpiresInSecFromState is undefined without expiresOn", () => {
  assert.equal(foldedExpiresInSecFromState({ cookies: [], origins: [] }, "https://consistencyhub.io"), undefined)
})

test("traceUrlParts strips query (no PKCE)", () => {
  const parts = traceUrlParts(
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?code_challenge=SECRET&prompt=select_account",
  )
  assert.equal(parts.finalHost, "login.microsoftonline.com")
  assert.equal(parts.finalPath, "/common/oauth2/v2.0/authorize")
  assert.equal(JSON.stringify(parts).includes("SECRET"), false)
})

test("sanitizeLoginTraceEvent drops secret-shaped keys and JWTs", () => {
  const clean = sanitizeLoginTraceEvent({
    ts: "t",
    event: "login",
    profile: "consistencyhub",
    sessionId: "should-drop",
    excerpt: "nope",
    expiresAt: "2026-09-21T05:46:42.026Z",
  } as LoginTraceEvent)
  assert.equal("sessionId" in clean, false)
  assert.equal("excerpt" in clean, false)
  assert.equal(clean.profile, "consistencyhub")
})

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

test("parseArgv trace", () => {
  const parsed = parseArgv(["trace", "--profile", "consistencyhub", "--limit", "20"])
  assert.equal(parsed.status, "ok")
  if (parsed.status === "ok" && parsed.command.cmd === "trace") {
    assert.equal(parsed.command.profile, "consistencyhub")
    assert.equal(parsed.command.limit, 20)
  }
  const all = parseArgv(["trace", "--all"])
  assert.equal(all.status, "ok")
  if (all.status === "ok" && all.command.cmd === "trace") assert.equal(all.command.all, true)
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
  assert.match(readyDesktop, /desktop\.html/)
  assert.match(readyDesktop, /door\.html/)
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

test("summarizeLoginTrace says login mint does not send stealth", () => {
  const s402 = summarizeLoginTrace([
    { ts: "t", event: "login", profile: "app-example", solariStatus: 402, solariCode: "FeatureRequiresPlan" },
  ])
  assert.match(s402, /402/)
  assert.match(s402, /does not send stealth/)
  assert.match(s402, /POST \/sessions/)
  assert.equal(/does not need stealth/.test(s402), false)
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
