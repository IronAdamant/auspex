import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { readFileSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { SolariError } from "@solarisdk/browser"
import { toAgentReceipt } from "../src/agent-receipt.ts"
import { needsHumanGuide, type CheckResult } from "../src/check.ts"
import { failureReceipt } from "../src/cli-json.ts"
import { packToolFailure } from "../src/content.ts"
import { appendLoginTrace, readLoginTrace, recordPostHandoffTrace } from "../src/login-trace.ts"
import {
  AWAIT_LOGIN_DESCRIPTION,
  CHECK_DESCRIPTION,
  DESKTOP_DESCRIPTION,
  FINALIZE_LOGIN_DESCRIPTION,
  LOGIN_DESCRIPTION,
  PROFILE_STATUS_DESCRIPTION,
  PROFILES_DESCRIPTION,
  REAP_DESCRIPTION,
  TRACE_DESCRIPTION,
  VERIFY_DESCRIPTION,
  JOB_DESCRIPTION,
  JOB_STATUS_DESCRIPTION,
} from "../src/tool-copy.ts"
import { attachHandoffQr, loginInstructions, phoneHandoffUrl } from "../src/profiles.ts"
import { overlaySaveEditorGuidance, waitForProfileSave } from "../src/profile-persist.ts"
import { profileStatus } from "../src/profile-status.ts"
import { NEXT_CALL_TOOLS } from "../src/next-call.ts"
import { RECEIPT_V1_REQUIRED_KEYS } from "../src/receipt-schema.ts"

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function sampleCheck(over: Partial<CheckResult> = {}): CheckResult {
  return {
    ok: false,
    reason: "needsHuman",
    url: "https://app.example/dashboard",
    expect: "Dashboard",
    screenshotPath: ".auspex/runs/stamp/screenshot.png",
    title: "Sign in",
    finalUrl: "https://login.microsoftonline.com/",
    matched: false,
    excerpt: "Enter password",
    sessionId: "sess-should-not-enter-next-call",
    networkIdle: true,
    needsHuman: true,
    ...over,
  }
}

function firstSentence(text: string): string {
  const match = text.match(/^.*?[.!](?:\s|$)/)
  return match?.[0]?.trim() ?? text
}

test("needsHuman receipt points nextCall at login with the profile from the prose", () => {
  const guide = needsHumanGuide("app-example")
  const receipt = toAgentReceipt(
    sampleCheck({
      next: `${guide.text} password hunter2secret token slr_live_abcdefghij`,
      nextCall: guide.nextCall,
    }),
  )
  assert.deepEqual([...RECEIPT_V1_REQUIRED_KEYS], [
    "schemaVersion",
    "ok",
    "reason",
    "url",
    "expect",
    "screenshotPath",
  ])
  assert.ok(NEXT_CALL_TOOLS.includes("auspex_job"))
  assert.ok(NEXT_CALL_TOOLS.includes("auspex_login"))
  assert.equal(receipt.schemaVersion, 1)
  for (const key of RECEIPT_V1_REQUIRED_KEYS) assert.equal(typeof receipt[key] !== "undefined", true)
  assert.equal(receipt.nextCall?.tool, "auspex_login")
  assert.equal(receipt.nextCall?.profile, "app-example")
  assert.match(receipt.next ?? "", /auspex_login --profile app-example/)
  const dumped = JSON.stringify(receipt.nextCall)
  assert.equal(dumped.includes("hunter2secret"), false)
  assert.equal(dumped.includes("slr_live_"), false)
  assert.equal(dumped.includes("sess-should-not-enter-next-call"), false)
  assert.equal(dumped.includes("password"), false)
  assert.equal(dumped.includes("cookie"), false)
})

test("CLI failureReceipt and MCP packToolFailure share the 429 nextCall", async () => {
  const err = new SolariError("full", 429, undefined, "ConcurrencyLimitExceeded")
  const cli = failureReceipt(err)
  const packed = await packToolFailure(err)
  const jsonText = packed.content.find((part) => part.type === "text" && part.text.includes('"code"'))
  assert.ok(jsonText && jsonText.type === "text")
  const mcp = JSON.parse(jsonText.text) as {
    code?: string
    status?: number
    recovery?: string
    nextCall?: { tool?: string }
    schemaVersion?: number
  }
  assert.equal(cli.code, mcp.code)
  assert.equal(cli.status, mcp.status)
  assert.equal(cli.recovery, mcp.recovery)
  assert.equal(cli.nextCall?.tool, "auspex_reap", `failureReceipt nextCall missing: ${JSON.stringify(cli)}`)
  assert.equal(mcp.nextCall?.tool, "auspex_reap")
  assert.equal(cli.schemaVersion, 1)
  assert.equal(mcp.schemaVersion, 1)
  assert.match(cli.recovery ?? "", /auspex_reap/)
  assert.equal(JSON.stringify(cli.nextCall).includes("password"), false)
})

test("successful login mint points nextCall at await-login with saveEditor", () => {
  const mobile = phoneHandoffUrl("vnc.jwt.not-a-field", "https://console.getsolari.com/handoff/abc")
  const result = loginInstructions(
    { id: "prof_1", name: "app-example" },
    "https://app.example/home",
    { url: "https://console.getsolari.com/handoff/abc", handoffId: "h1", expiresAt: "soon", version: 3 },
    undefined,
    mobile,
  )
  assert.equal(result.nextCall?.tool, "auspex_await_login")
  assert.equal(result.nextCall?.profile, "app-example")
  assert.equal(result.nextCall?.saveEditor, true)
  assert.match(result.next, /auspex_await_login --profile app-example/)
  assert.match(result.next, /saveEditor/)
  const dumped = JSON.stringify(result.nextCall)
  assert.equal(dumped.includes("vnc.jwt"), false)
  assert.equal(dumped.includes("password"), false)
  assert.equal(dumped.includes("cookie"), false)
})

test("completed save that still needs a fold points nextCall at finalize-login", async () => {
  const completed = await waitForProfileSave("consistencyhub", {
    sinceVersion: 14,
    timeoutMs: 5_000,
    deps: {
      now: (() => {
        let t = 0
        return () => {
          t += 1_000
          return t
        }
      })(),
      sleep: async () => undefined,
      list: async () => [{ id: "p1", name: "consistencyhub", version: 15 }],
      inspect: async () => ({ cookies: 4, origins: 1, sessionStorage: 0 }),
    },
  })
  assert.equal(completed.status, "completed")
  assert.equal(completed.nextCall?.tool, "auspex_finalize_login")
  assert.equal(completed.nextCall?.profile, "consistencyhub")
  assert.match(completed.next, /finalize-login --profile consistencyhub/)
  assert.equal(JSON.stringify(completed.nextCall).includes("sessionId"), false)
})

test("noVNC mint without a QR still points nextCall at await-login with saveEditor", () => {
  const solari = "https://console.getsolari.com/handoff/abc"
  const minted = loginInstructions(
    { id: "prof_1", name: "app-example" },
    "https://app.example/home",
    { url: solari, handoffId: "h1", expiresAt: "soon", version: 3 },
    undefined,
    solari,
  )
  const result = attachHandoffQr(minted, "", "https://app.example/home")
  assert.equal(result.handoff?.qrPath, undefined)
  assert.equal(result.next.includes("handoff.mobileUrl"), false)
  assert.match(result.next, /auspex_await_login --profile app-example/)
  assert.match(result.next, /saveEditor/)
  assert.equal(result.nextCall?.tool, "auspex_await_login")
  assert.equal(result.nextCall?.profile, "app-example")
  assert.equal(result.nextCall?.saveEditor, true)
})

test("await-login timeout nextCall retries auspex_await_login", async () => {
  const timed = await waitForProfileSave("app-example", {
    sinceVersion: 5,
    timeoutMs: 1_000,
    deps: {
      now: (() => {
        let t = 0
        return () => {
          t += 10_000
          return t
        }
      })(),
      sleep: async () => undefined,
      list: async () => [{ id: "p1", name: "app-example", version: 5 }],
      inspect: async () => ({ cookies: 0, origins: 0 }),
    },
  })
  assert.equal(timed.status, "timeout")
  assert.match(timed.next, /retry auspex_await_login/)
  assert.equal(timed.nextCall?.tool, "auspex_await_login")
  assert.equal(timed.nextCall?.saveEditor, undefined)
})

function clock() {
  let t = 0
  return () => {
    t += 1_000
    return t
  }
}

test("save-editor overlay does not replace a leading retry, remint, or empty save", async () => {
  const timeout = await waitForProfileSave("app-example", {
    sinceVersion: 5,
    timeoutMs: 1_000,
    deps: {
      now: (() => {
        let t = 0
        return () => {
          t += 10_000
          return t
        }
      })(),
      sleep: async () => undefined,
      list: async () => [{ id: "p1", name: "app-example", version: 5 }],
      inspect: async () => ({ cookies: 0, origins: 0 }),
    },
  })
  const timeoutGuided = overlaySaveEditorGuidance({
    next: timeout.next,
    nextCall: timeout.nextCall,
    profile: timeout.name,
    editorSave: { ok: false, status: 401, error: "unauthorized" },
  })
  assert.match(timeoutGuided.text, /not proof this login saved/)
  assert.equal(/Finalize-login NOW/.test(timeoutGuided.text), false)
  assert.equal(timeoutGuided.nextCall?.tool, "auspex_await_login")
  assert.equal(timeoutGuided.nextCall?.saveEditor, undefined)

  const stale = await waitForProfileSave("consistencyhub", {
    sinceVersion: 37,
    timeoutMs: 5_000,
    deps: {
      now: clock(),
      sleep: async () => undefined,
      list: async () => [{ id: "p1", name: "consistencyhub", version: 38 }],
      inspect: async () => ({ cookies: 74, origins: 5, sessionStorage: 2, sessionStorageStale: true }),
    },
  })
  const staleGuided = overlaySaveEditorGuidance({
    next: stale.next,
    nextCall: stale.nextCall,
    profile: stale.name,
    editorFold: { ok: false, reason: "no-cdp" },
  })
  assert.ok(staleGuided.text.indexOf("Remint now:") < staleGuided.text.indexOf("Finalize-login NOW"))
  assert.equal(staleGuided.nextCall?.tool, "auspex_login")
  assert.equal(staleGuided.nextCall?.profile, "consistencyhub")

  const empty = await waitForProfileSave("app-example", {
    sinceVersion: 2,
    timeoutMs: 5_000,
    deps: {
      now: clock(),
      sleep: async () => undefined,
      list: async () => [{ id: "p1", name: "app-example", version: 3 }],
      inspect: async () => ({ cookies: 0, origins: 0 }),
    },
  })
  const emptyGuided = overlaySaveEditorGuidance({
    next: empty.next,
    nextCall: empty.nextCall,
    profile: empty.name,
    editorSave: { ok: false, status: 401 },
  })
  assert.equal(empty.status, "empty-save")
  assert.match(emptyGuided.text, /stored no cookies/)
  assert.equal(emptyGuided.nextCall, undefined)

  const countedZero = await waitForProfileSave("consistencyhub", {
    sinceVersion: 14,
    timeoutMs: 5_000,
    deps: {
      now: clock(),
      sleep: async () => undefined,
      list: async () => [{ id: "p1", name: "consistencyhub", version: 15 }],
      inspect: async () => ({ cookies: 4, origins: 1, sessionStorage: 0 }),
    },
  })
  const countedGuided = overlaySaveEditorGuidance({
    next: countedZero.next,
    nextCall: countedZero.nextCall,
    profile: countedZero.name,
    editorFold: { ok: false, reason: "no-cdp" },
  })
  assert.ok(countedGuided.text.indexOf("Finalize-login NOW") < countedGuided.text.indexOf("Remint auspex_login if"))
  assert.equal(countedGuided.nextCall?.tool, "auspex_finalize_login")
  assert.equal(countedGuided.nextCall?.profile, "consistencyhub")
})

test("profileStatus stamps nextCall beside skipReason", async () => {
  const saved = {
    name: "consistencyhub",
    url: "https://consistencyhub.io",
    expect: "Document Editor",
    profile: "consistencyhub",
  }
  const empty = await profileStatus(
    { profile: "consistencyhub" },
    {
      listProfiles: async () => [],
      savedForProfile: () => saved,
      runCheck: async () => {
        throw new Error("should not live-check")
      },
    },
  )
  assert.equal(empty.reason, "emptySave")
  assert.match(empty.skipReason ?? "", /auspex login --profile consistencyhub/)
  assert.equal(empty.nextCall?.tool, "auspex_login")
  assert.equal(empty.nextCall?.profile, "consistencyhub")

  const stale = await profileStatus(
    { profile: "consistencyhub", url: "https://consistencyhub.io" },
    {
      listProfiles: async () => [{ id: "p1", name: "consistencyhub", populated: true }],
      savedForProfile: () => saved,
      inspectSeed: async () => ({ cookies: 4, origins: 1, sessionStorage: 2, sessionStorageStale: true }),
      runCheck: async () => {
        throw new Error("should not live-check")
      },
    },
  )
  assert.equal(stale.reason, "weakSeed")
  assert.match(stale.skipReason ?? "", /Remint now:/)
  assert.equal(stale.nextCall?.tool, "auspex_login")
  assert.equal(stale.nextCall?.profile, "consistencyhub")

  const fold = await profileStatus(
    { profile: "consistencyhub", url: "https://consistencyhub.io" },
    {
      listProfiles: async () => [{ id: "p1", name: "consistencyhub", populated: true }],
      savedForProfile: () => saved,
      inspectSeed: async () => ({ cookies: 4, origins: 1, sessionStorage: 0 }),
      runCheck: async () => {
        throw new Error("should not live-check")
      },
    },
  )
  assert.equal(fold.reason, "weakSeed")
  assert.match(fold.skipReason ?? "", /Finalize-login NOW/)
  assert.equal(fold.nextCall?.tool, "auspex_finalize_login")
  assert.equal(fold.nextCall?.profile, "consistencyhub")
})

test("login with no handoff url points nextCall at auspex_login", () => {
  const missed = loginInstructions({ id: "prof_1", name: "app-example" })
  assert.match(missed.next, /Remint with auspex_login/)
  assert.match(missed.next, /--profile app-example/)
  assert.equal(missed.nextCall?.tool, "auspex_login")
  assert.equal(missed.nextCall?.profile, "app-example")
})

test("stale folded save leads with remint, so nextCall is login not finalize", async () => {
  const completed = await waitForProfileSave("consistencyhub", {
    sinceVersion: 37,
    timeoutMs: 5_000,
    deps: {
      now: (() => {
        let t = 0
        return () => {
          t += 1_000
          return t
        }
      })(),
      sleep: async () => undefined,
      list: async () => [{ id: "p1", name: "consistencyhub", version: 38 }],
      inspect: async () => ({ cookies: 74, origins: 5, sessionStorage: 2, sessionStorageStale: true }),
    },
  })
  assert.match(completed.next, /Remint now:\s*npx auspex login --profile consistencyhub/)
  assert.equal(/Finalize-login NOW/.test(completed.next), false)
  assert.equal(completed.nextCall?.tool, "auspex_login")
  assert.equal(completed.nextCall?.profile, "consistencyhub")
})

test("transient 503 recovery may mention reap but nextCall is not reap", async () => {
  const err = new SolariError("down", 503, undefined, "ServiceUnavailable")
  const cli = failureReceipt(err)
  const packed = await packToolFailure(err)
  const jsonText = packed.content.find((part) => part.type === "text" && part.text.includes('"code"'))
  assert.ok(jsonText && jsonText.type === "text")
  const json = JSON.parse(jsonText.text) as { code?: string; recovery?: string; nextCall?: { tool?: string } }
  assert.equal(cli.code, "SolariInfraTransient")
  assert.equal(json.code, cli.code)
  assert.equal(json.recovery, cli.recovery)
  assert.match(cli.recovery ?? "", /auspex_reap/)
  assert.equal(cli.nextCall, undefined)
  assert.equal(json.nextCall, undefined)
})

test("MCP tool descriptions lead with the mistake that breaks the call", () => {
  const src = readFileSync(path.join(pkg, "src", "mcp-tools.ts"), "utf8")
  const leads: Array<[string, string, RegExp]> = [
    ["auspex_check", CHECK_DESCRIPTION, /^Passing anonymous verify\b.*poisons ok\.$/],
    ["auspex_login", LOGIN_DESCRIPTION, /^Typing a password, or opening Solari noVNC on a phone,/],
    ["auspex_await_login", AWAIT_LOGIN_DESCRIPTION, /^Treating an empty Save\b.*is a lie/],
    ["auspex_finalize_login", FINALIZE_LOGIN_DESCRIPTION, /^Calling finalize-login without url and expect/],
    ["auspex_profiles", PROFILES_DESCRIPTION, /^Treating a populated profile in this list as logged-in is a lie/],
    ["auspex_profile_status", PROFILE_STATUS_DESCRIPTION, /^Treating weakSeed as loggedIn/],
    ["auspex_desktop", DESKTOP_DESCRIPTION, /^Passing a password or OTP-like string to type is refused/],
    ["auspex_verify", VERIFY_DESCRIPTION, /^Calling auspex_verify after a default auspex_check/],
    ["auspex_reap", REAP_DESCRIPTION, /^Passing accountWide to clear one 429/],
    ["auspex_trace", TRACE_DESCRIPTION, /^Treating auspex_trace as a log of check rows, tokens, or session ids is a lie\.$/],
    ["auspex_job", JOB_DESCRIPTION, /^Treating ok as claimOkProfile, or polling await-login for 30 minutes, is a lie\.$/],
    ["auspex_job_status", JOB_STATUS_DESCRIPTION, /^Blind 30-minute polls of await-login waste the slot\.$/],
  ]
  const bindings: Record<string, string> = {
    auspex_check: "CHECK_DESCRIPTION",
    auspex_login: "LOGIN_DESCRIPTION",
    auspex_await_login: "AWAIT_LOGIN_DESCRIPTION",
    auspex_finalize_login: "FINALIZE_LOGIN_DESCRIPTION",
    auspex_profiles: "PROFILES_DESCRIPTION",
    auspex_profile_status: "PROFILE_STATUS_DESCRIPTION",
    auspex_desktop: "DESKTOP_DESCRIPTION",
    auspex_verify: "VERIFY_DESCRIPTION",
    auspex_reap: "REAP_DESCRIPTION",
    auspex_trace: "TRACE_DESCRIPTION",
    auspex_job: "JOB_DESCRIPTION",
    auspex_job_status: "JOB_STATUS_DESCRIPTION",
  }
  for (const [tool, description, lead] of leads) {
    assert.match(firstSentence(description), lead, tool)
    assert.match(src, new RegExp(`description:\\s*${bindings[tool]}`), `${tool} must register its exported description`)
  }
})

test("ready handoff gains one redacted post-handoff row and no check row", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "auspex-post-handoff-"))
  const file = path.join(dir, "login.jsonl")
  try {
    await appendLoginTrace(
      {
        event: "login",
        profile: "app-example",
        episodeId: "ep-ready",
        mintStage: "ready",
        vncMintOk: true,
        phoneDoor: "ime",
      },
      file,
    )
    const wrote = await recordPostHandoffTrace({
      profile: "app-example",
      status: "empty-save",
      foldReason: "empty-save",
      file,
      password: "hunter2secret",
      token: "slr_live_abcdefghij",
      cookie: "sid=sekritcookie",
      sessionId: "sess-should-drop",
      excerpt: "private page text",
      event: "check",
    })
    assert.equal(wrote, true)
    const again = await recordPostHandoffTrace({
      profile: "app-example",
      status: "no-cdp",
      foldReason: "no-cdp",
      file,
    })
    assert.equal(again, false)
    const raw = await readFile(file, "utf8")
    const postLine = raw.split("\n").map((line) => line.trim()).filter(Boolean).at(-1) ?? ""
    const postRow = JSON.parse(postLine) as Record<string, unknown>
    for (const key of ["password", "token", "cookie", "excerpt", "sessionId"]) {
      assert.equal(key in postRow, false, `post-handoff row must not contain ${key}`)
    }
    assert.equal(raw.includes("hunter2secret"), false)
    assert.equal(raw.includes("slr_live_"), false)
    assert.equal(raw.includes("sekritcookie"), false)
    assert.equal(raw.includes("sess-should-drop"), false)
    assert.equal(raw.includes("private page text"), false)
    assert.equal(raw.includes('"event":"check"'), false)
    const read = await readLoginTrace({ file, all: true })
    assert.equal(read.events.length, 2)
    const extra = read.events[1]
    assert.equal(extra?.event, "post-handoff")
    assert.equal(extra?.status, "empty-save")
    assert.equal(extra?.foldReason, "empty-save")
    assert.equal(read.events.some((event) => String(event.event) === "check"), false)
    assert.match(read.traceSummary ?? "", /Post-handoff status empty-save/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
