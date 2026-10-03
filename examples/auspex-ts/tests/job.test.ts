import assert from "node:assert/strict"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { SolariError } from "@solarisdk/browser"
import { parseArgv } from "../src/cli.ts"
import {
  JOB_INPUT_ERROR,
  parseJobFlags,
  runJob,
  type JobDeps,
} from "../src/job.ts"
import { postJobWake } from "../src/job-wake.ts"
import type { AwaitLoginResult } from "../src/profile-persist.ts"
import type { LoginResult } from "../src/profiles.ts"
import type { CheckResult } from "../src/check.ts"
import type { AgentReceipt } from "../src/agent-receipt.ts"

function loginOk(over: Partial<LoginResult> = {}): LoginResult {
  return {
    profileId: "p1",
    name: "app-example",
    consoleUrl: "https://console.getsolari.com/profiles",
    next: "Open handoff.url",
    sinceVersion: 3,
    nextCall: { tool: "auspex_await_login", profile: "app-example", saveEditor: true },
    handoff: {
      url: "https://ironadamant.com/auspex/phone.html#v=not.a.jwt",
      mobileUrl: "https://ironadamant.com/auspex/phone.html#v=not.a.jwt",
    },
    ...over,
  }
}

function awaitResult(over: Partial<AwaitLoginResult> = {}): AwaitLoginResult {
  return {
    status: "completed",
    profileId: "p1",
    name: "app-example",
    version: 4,
    cookies: 4,
    origins: 1,
    sessionStorage: 2,
    next: "Run finalize-login",
    nextCall: { tool: "auspex_finalize_login", profile: "app-example" },
    ...over,
  }
}

function checkResult(over: Partial<CheckResult> = {}): CheckResult {
  return {
    ok: true,
    reason: "matched",
    url: "https://app.example",
    expect: "Workspace ready",
    screenshotPath: ".auspex/runs/x/screenshot.png",
    title: "App",
    finalUrl: "https://app.example/app",
    matched: true,
    excerpt: "Workspace ready",
    sessionId: "sess-must-not-leak",
    networkIdle: true,
    ...over,
  }
}

function receiptOf(over: Partial<AgentReceipt> = {}): AgentReceipt {
  return {
    schemaVersion: 1,
    ok: true,
    reason: "matched",
    url: "https://app.example",
    expect: "Workspace ready",
    screenshotPath: ".auspex/runs/x/screenshot.png",
    matched: true,
    ...over,
  }
}

async function tmpJobs() {
  return mkdtemp(path.join(tmpdir(), "auspex-jobs-"))
}

function deps(over: Partial<JobDeps> & { jobsDir: string }): JobDeps {
  return {
    login: async () => loginOk(),
    awaitLogin: async () => awaitResult(),
    finalize: async () => checkResult(),
    check: async () => ({ receipt: receiptOf(), verified: false }),
    reap: async () => ({
      ok: true,
      dryRun: false,
      browsers: [],
      vms: [],
      released: ["sess-1"],
      killed: [],
      errors: [],
    }),
    wake: async () => ({ ok: true, skipped: true }),
    ...over,
  }
}

test("parseJobFlags and parseArgv require jobId, name, or url+expect", () => {
  const empty = parseJobFlags([])
  assert.equal(empty.ok, false)
  if (!empty.ok) assert.equal(empty.message, JOB_INPUT_ERROR)
  const parsed = parseArgv([
    "job",
    "--url",
    "https://app.example",
    "--expect",
    "Workspace ready",
    "--verify-with-profile",
    "--wake-webhook",
    "https://hooks.example/wake",
  ])
  assert.equal(parsed.status, "ok")
  if (parsed.status === "ok" && parsed.command.cmd === "job") {
    assert.equal(parsed.command.opts.url, "https://app.example")
    assert.equal(parsed.command.opts.expect, "Workspace ready")
    assert.equal(parsed.command.opts.verifyWithProfile, true)
    assert.equal(parsed.command.opts.wakeWebhookUrl, "https://hooks.example/wake")
  }
  const status = parseArgv(["job-status", "--job-id", "job-abc-12345678", "--wait-ms", "500"])
  assert.equal(status.status, "ok")
  if (status.status === "ok" && status.command.cmd === "job-status") {
    assert.equal(status.command.jobId, "job-abc-12345678")
    assert.equal(status.command.waitMs, 500)
  }
})

test("resume after Save runs await→finalize→check", async () => {
  const dir = await tmpJobs()
  const minted = await runJob(
    { url: "https://app.example", expect: "Workspace ready" },
    deps({ jobsDir: dir }),
  )
  const finished = await runJob(
    { jobId: minted.jobId },
    deps({ jobsDir: dir }),
  )
  assert.equal(finished.ok, true)
  assert.equal(finished.phase, "completed")
  assert.equal(finished.status, "completed")
  assert.equal(finished.reason, "matched")
  assert.equal(finished.claimOkProfile, undefined)
  assert.equal(JSON.stringify(finished).includes("sess-must-not-leak"), false)
})

test("a failed job never points nextCall back at its own jobId", async () => {
  const dir = await tmpJobs()
  const failed = await runJob(
    { url: "https://app.example", expect: "Workspace ready", wait: true },
    deps({
      jobsDir: dir,
      awaitLogin: async () => {
        throw new Error("editor exploded")
      },
    }),
  )
  assert.equal(failed.phase, "failed")
  assert.equal(failed.nextCall?.tool, "auspex_job")
  assert.equal(failed.nextCall?.jobId, undefined)
  assert.equal(failed.nextCall?.url, "https://app.example")
  assert.equal(failed.nextCall?.expect, "Workspace ready")
  assert.match(failed.next ?? "", /Start a new job/)
  // Resuming really does return the same failure, so the old nextCall was a dead end.
  const resumed = await runJob({ jobId: failed.jobId }, deps({ jobsDir: dir }))
  assert.equal(resumed.phase, "failed")
})

test("a job that fails on the key or the plan has no nextCall: a new job fails the same way", async () => {
  const { AuspexError } = await import("../src/errors.ts")
  const dir = await tmpJobs()
  const failures = [
    new AuspexError("SOLARI_API_KEY is not set.", { issue: { code: "MissingApiKey", retryable: false } }),
    new SolariError("Solari POST /sessions failed: 402", 402, undefined, "FeatureRequiresPlan"),
  ]
  for (const err of failures) {
    const failed = await runJob(
      { url: "https://app.example", expect: "Workspace ready" },
      deps({
        jobsDir: dir,
        login: async () => {
          throw err
        },
      }),
    )
    assert.equal(failed.phase, "failed")
    assert.equal(failed.nextCall, undefined, err.message)
    assert.match(failed.next ?? "", /Stop and tell the human/)
  }
})

test("a check that throws after Save retries only the check", async () => {
  const dir = await tmpJobs()
  const failed = await runJob(
    { url: "https://app.example", expect: "Workspace ready", wait: true, verifyWithProfile: true },
    deps({
      jobsDir: dir,
      check: async () => {
        throw new Error("Target page, context or browser has been closed")
      },
    }),
  )
  assert.equal(failed.phase, "failed")
  assert.equal(failed.nextCall?.tool, "auspex_check")
  assert.equal(failed.nextCall?.verifyWithProfile, true)
  assert.equal(failed.nextCall?.url, "https://app.example")
  assert.match(failed.next ?? "", /retry only the check/)
})

test("webhook without URL is skipped; invalid URL fails closed", async () => {
  const skipped = await postJobWake({ schemaVersion: 1, event: "completed" }, { env: {} })
  assert.equal(skipped.ok, true)
  assert.equal(skipped.skipped, true)
  const dir = await tmpJobs()
  const bad = await runJob(
    { url: "https://app.example", expect: "Workspace ready", wakeWebhookUrl: "not-a-url" },
    deps({ jobsDir: dir }),
  )
  assert.equal(bad.ok, false)
  assert.match(bad.reason, /wakeWebhookUrl/)
})

test("webhook POST is scrubbed and uses mock fetch", async () => {
  const bodies: string[] = []
  const result = await postJobWake(
    {
      schemaVersion: 1,
      event: "stream-expired",
      jobId: "job-1",
      next: "password hunter2secret token slr_live_abcdefghij user a@b.co",
      handoff: "https://ironadamant.com/auspex/phone.html#v=super.secret.jwt",
      sessionId: "sess-drop",
      excerpt: "private",
      nextCall: { tool: "auspex_login", profile: "app-example" },
    },
    {
      url: "https://hooks.example/wake",
      fetch: (async (_url, init) => {
        bodies.push(String(init?.body ?? ""))
        return new Response(null, { status: 204 })
      }) as typeof fetch,
    },
  )
  assert.equal(result.ok, true)
  assert.equal(result.event, "stream-expired")
  assert.equal(bodies.length, 1)
  const body = bodies[0] ?? ""
  assert.equal(body.includes("slr_live_"), false)
  assert.equal(body.includes("a@b.co"), false)
  assert.equal(body.includes("super.secret.jwt"), false)
  assert.equal(body.includes("sess-drop"), false)
  assert.equal(body.includes("private"), false)
  assert.match(body, /#redacted/)
  assert.match(body, /auspex_login/)
})

