import assert from "node:assert/strict"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { SolariError } from "@solarisdk/browser"
import { parseArgv } from "../src/cli.ts"
import {
  JOB_INPUT_ERROR,
  parseJobFlags,
  readJobRecord,
  readJobStatus,
  runJob,
  writeJobRecord,
  type JobDeps,
} from "../src/job.ts"
import { postJobWake, scrubJobValue } from "../src/job-wake.ts"
import type { AwaitLoginResult } from "../src/profile-persist.ts"
import type { LoginResult } from "../src/profiles.ts"
import type { CheckResult } from "../src/check.ts"
import type { AgentReceipt } from "../src/agent-receipt.ts"

const demo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "demo")

function loginOk(over: Partial<LoginResult> = {}): LoginResult {
  return {
    profileId: "p1",
    name: "app-example",
    consoleUrl: "https://console.getsolari.com/profiles",
    next: "Open handoff.url",
    sinceVersion: 3,
    nextCall: { tool: "auspex_await_login", profile: "app-example", saveEditor: true },
    handoff: {
      url: "https://ironadamant.com/auspex/door.html#v=not.a.jwt",
      mobileUrl: "https://ironadamant.com/auspex/phone.html#v=not.a.jwt",
      desktopUrl: "https://ironadamant.com/auspex/desktop.html#v=not.a.jwt",
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

test("first job mints and returns waiting nextCall to resume", async () => {
  const dir = await tmpJobs()
  const wakes: string[] = []
  const result = await runJob(
    { url: "https://app.example", expect: "Workspace ready" },
    deps({
      jobsDir: dir,
      wake: async (payload) => {
        const event = (payload as { event?: string }).event
        if (event) wakes.push(event)
        return { ok: true, event: event as "awaiting-save" }
      },
    }),
  )
  assert.equal(result.ok, false)
  assert.equal(result.phase, "await")
  assert.equal(result.status, "waiting")
  assert.equal(result.reason, "awaiting-save")
  assert.equal(result.profile, "app-example")
  assert.equal(result.nextCall?.tool, "auspex_job")
  assert.equal(result.nextCall?.jobId, result.jobId)
  assert.equal(result.handoff?.url, "https://ironadamant.com/auspex/door.html#v=not.a.jwt")
  assert.equal(result.handoff?.mobileUrl, "https://ironadamant.com/auspex/phone.html#v=not.a.jwt")
  assert.deepEqual(wakes, ["awaiting-save"])
  const stored = await readJobRecord(result.jobId, dir)
  assert.equal(stored.phase, "await")
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

test("wait:true composes mint through check in one call", async () => {
  const dir = await tmpJobs()
  const result = await runJob(
    { url: "https://app.example", expect: "Workspace ready", wait: true, verifyWithProfile: true },
    deps({
      jobsDir: dir,
      check: async () => ({
        receipt: receiptOf({
          verify: {
            ok: true,
            claimOk: false,
            claimOkProfile: true,
            errors: [],
            claimErrors: [],
            runDir: ".auspex/runs/x",
          },
        }),
        verified: true,
      }),
    }),
  )
  assert.equal(result.ok, true)
  assert.equal(result.phase, "completed")
  assert.equal(result.claimOkProfile, true)
})

test("stream-expired returns remint nextCall and does not continue", async () => {
  const dir = await tmpJobs()
  const minted = await runJob(
    { url: "https://app.example", expect: "Workspace ready" },
    deps({ jobsDir: dir }),
  )
  const expired = await runJob(
    { jobId: minted.jobId },
    deps({
      jobsDir: dir,
      awaitLogin: async () =>
        awaitResult({
          status: "stream-expired",
          cookies: 0,
          origins: 0,
          next: "status stream-expired: remint auspex_login",
          nextCall: { tool: "auspex_login", profile: "app-example" },
        }),
    }),
  )
  assert.equal(expired.ok, false)
  assert.equal(expired.status, "stream-expired")
  assert.equal(expired.reason, "stream-expired")
  assert.equal(expired.nextCall?.tool, "auspex_login")
  assert.equal(expired.nextCall?.profile, "app-example")
  const again = await runJob({ jobId: minted.jobId }, deps({ jobsDir: dir }))
  assert.equal(again.status, "stream-expired")
  assert.equal(again.phase, "failed")
})

test("idp-only app-visible omits nextCall; sign-in-wall remints", async () => {
  const dir = await tmpJobs()
  const minted = await runJob(
    { url: "https://app.example", expect: "Workspace ready" },
    deps({ jobsDir: dir }),
  )
  const visible = await runJob(
    { jobId: minted.jobId },
    deps({
      jobsDir: dir,
      awaitLogin: async () =>
        awaitResult({
          status: "idp-only-save",
          idpOnlyKind: "app-visible",
          next: "dashboard on screen is not a saved login",
          nextCall: { tool: "auspex_login", profile: "app-example" },
        }),
    }),
  )
  assert.equal(visible.ok, false)
  assert.equal(visible.status, "idp-only-save")
  assert.equal(visible.idpOnlyKind, "app-visible")
  assert.equal(visible.nextCall, undefined)
  const wallDir = await tmpJobs()
  const wallMint = await runJob(
    { url: "https://app.example", expect: "Workspace ready" },
    deps({ jobsDir: wallDir }),
  )
  const wall = await runJob(
    { jobId: wallMint.jobId },
    deps({
      jobsDir: wallDir,
      awaitLogin: async () =>
        awaitResult({
          status: "idp-only-save",
          idpOnlyKind: "sign-in-wall",
          next: "Finish Microsoft or Google",
          nextCall: { tool: "auspex_login", profile: "app-example" },
        }),
    }),
  )
  assert.equal(wall.idpOnlyKind, "sign-in-wall")
  assert.equal(wall.nextCall?.tool, "auspex_login")
})

test("hostChanged fail-closed keeps remint nextCall", async () => {
  const dir = await tmpJobs()
  const minted = await runJob(
    { url: "https://myapp.example", expect: "Workspace ready" },
    deps({
      jobsDir: dir,
      login: async () => loginOk({ name: "myapp-example" }),
    }),
  )
  const changed = await runJob(
    { jobId: minted.jobId },
    deps({
      jobsDir: dir,
      awaitLogin: async () =>
        awaitResult({
          status: "host-changed",
          hostChanged: true,
          profileHostMatch: false,
          suggestedProfile: "app-socialaize-com",
          suggestedUrl: "https://app.socialaize.com",
          next: "Live host changed",
          nextCall: { tool: "auspex_login", profile: "app-socialaize-com", url: "https://app.socialaize.com" },
        }),
    }),
  )
  assert.equal(changed.ok, false)
  assert.equal(changed.reason, "hostChanged")
  assert.equal(changed.hostChanged, true)
  assert.equal(changed.nextCall?.tool, "auspex_login")
  assert.equal(changed.nextCall?.profile, "app-socialaize-com")
  assert.equal(changed.nextCall?.url, "https://app.socialaize.com")
  assert.equal(changed.claimOkProfile, undefined)
})

test("expectMatchedPublicLanding fails closed on finalize", async () => {
  const dir = await tmpJobs()
  const minted = await runJob(
    { url: "https://app.example", expect: "Workspace ready", wait: true },
    deps({
      jobsDir: dir,
      finalize: async () =>
        checkResult({
          ok: false,
          reason: "expectMatchedPublicLanding",
          matched: false,
          nextCall: { tool: "auspex_finalize_login", profile: "app-example" },
        }),
    }),
  )
  assert.equal(minted.ok, false)
  assert.equal(minted.status, "expectMatchedPublicLanding")
  assert.equal(minted.nextCall?.tool, "auspex_finalize_login")
})

test("429 reaps ledger and nextCall resumes the job", async () => {
  const dir = await tmpJobs()
  let reaped = 0
  const result = await runJob(
    { url: "https://app.example", expect: "Workspace ready" },
    deps({
      jobsDir: dir,
      login: async () => {
        throw new SolariError("full", 429, undefined, "ConcurrencyLimitExceeded")
      },
      reap: async () => {
        reaped += 1
        return { ok: true, dryRun: false, browsers: [], vms: [], released: ["s1"], killed: [], errors: [] }
      },
    }),
  )
  assert.equal(result.ok, false)
  assert.equal(result.status, "concurrency-limited")
  assert.equal(result.reaped, true)
  assert.equal(reaped, 1)
  assert.equal(result.nextCall?.tool, "auspex_job")
  assert.equal(result.nextCall?.jobId, result.jobId)
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
      handoff: "https://ironadamant.com/auspex/door.html#v=super.secret.jwt",
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

test("scrubJobValue drops secret keys and redacts emails", () => {
  const scrubbed = scrubJobValue({
    password: "hunter2",
    token: "slr_live_abcdefghij",
    sessionId: "sess-1",
    excerpt: "secret page",
    next: "email user@example.com",
    nextCall: { tool: "auspex_job", jobId: "job-1", profile: "app-example" },
  })
  assert.equal("password" in scrubbed, false)
  assert.equal("token" in scrubbed, false)
  assert.equal("sessionId" in scrubbed, false)
  assert.equal("excerpt" in scrubbed, false)
  assert.equal(String(scrubbed.next).includes("user@example.com"), false)
  assert.equal(scrubbed.nextCall.tool, "auspex_job")
})

test("job-status reads the file and waitMs returns after a phase change", async () => {
  const dir = await tmpJobs()
  const minted = await runJob(
    { url: "https://app.example", expect: "Workspace ready" },
    deps({ jobsDir: dir }),
  )
  const immediate = await readJobStatus({ jobId: minted.jobId }, { jobsDir: dir })
  assert.equal(immediate.phase, "await")
  assert.equal(immediate.status, "waiting")
  const missing = await readJobStatus({ jobId: "job-missing-aaaaaaaa" }, { jobsDir: dir })
  assert.equal(missing.ok, false)
  assert.equal(missing.reason, "job-not-found")

  const seen = await readJobStatus(
    { jobId: minted.jobId, waitMs: 2_000 },
    {
      jobsDir: dir,
      sleep: async () => {
        const rec = await readJobRecord(minted.jobId, dir)
        if (rec.phase === "await") {
          await writeJobRecord(
            {
              ...rec,
              phase: "finalize",
              status: "running",
              reason: "await-completed",
              updatedAt: new Date().toISOString(),
            },
            dir,
          )
        }
      },
    },
  )
  assert.equal(seen.phase, "finalize")
})

test("skipFinalize jumps to check; ok is not claimOkProfile", async () => {
  const dir = await tmpJobs()
  const minted = await runJob(
    { url: "https://app.example", expect: "Workspace ready", skipFinalize: true },
    deps({ jobsDir: dir }),
  )
  let finalized = 0
  const done = await runJob(
    { jobId: minted.jobId },
    deps({
      jobsDir: dir,
      finalize: async () => {
        finalized += 1
        return checkResult()
      },
      check: async () => ({ receipt: receiptOf({ ok: true, reason: "matched" }), verified: false }),
    }),
  )
  assert.equal(finalized, 0)
  assert.equal(done.ok, true)
  assert.equal(done.claimOkProfile, undefined)
})

test("demo job-failed-receipt.json is a redacted fail-closed nextCall", async () => {
  const raw = JSON.parse(await readFile(path.join(demo, "job-failed-receipt.json"), "utf8")) as {
    ok: boolean
    reason: string
    nextCall?: { tool?: string; profile?: string }
    schemaVersion: number
  }
  assert.equal(raw.schemaVersion, 1)
  assert.equal(raw.ok, false)
  assert.equal(raw.reason, "stream-expired")
  assert.equal(raw.nextCall?.tool, "auspex_login")
  const dumped = JSON.stringify(raw)
  assert.equal(dumped.includes("slr_"), false)
  assert.equal(dumped.includes("password"), false)
  assert.equal(dumped.includes("sessionId"), false)
})
