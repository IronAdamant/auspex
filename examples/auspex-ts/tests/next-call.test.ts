import assert from "node:assert/strict"
import test from "node:test"
import { SolariError } from "@solarisdk/browser"
import { failureReceipt } from "../src/cli-json.ts"
import { packToolFailure } from "../src/content.ts"
import { waitForProfileSave } from "../src/profile-persist.ts"
import { profileStatus } from "../src/profile-status.ts"

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

test("profileStatus: a bot check is botWall with no nextCall, never loggedOut or finalize", async () => {
  const status = await profileStatus(
    { profile: "app-example", url: "https://app.example/dash", expect: "Workspace ready" },
    {
      listProfiles: async () => [{ id: "p1", name: "app-example", populated: true }],
      savedForProfile: () => undefined,
      inspectSeed: async () => ({ cookies: 4, origins: 1, sessionStorage: 2 }),
      runCheck: async () =>
        ({
          ok: false,
          reason: "mismatch",
          url: "https://app.example/dash",
          expect: "Workspace ready",
          screenshotPath: ".auspex/runs/x/screenshot.png",
          title: "Just a moment...",
          finalUrl: "https://app.example/dash",
          matched: false,
          excerpt: "",
          sessionId: "s",
          networkIdle: true,
          botWall: true,
        }) as import("../src/check.ts").CheckResult,
    },
  )
  assert.equal(status.reason, "botWall")
  assert.equal(status.botWall, true)
  assert.equal(status.ok, false)
  assert.equal(status.nextCall, undefined)
  assert.match(status.skipReason ?? "", /Do not remint or finalize/)
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

