import assert from "node:assert/strict"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { PassThrough } from "node:stream"
import test from "node:test"
import { parseArgv, USAGE } from "../src/cli.ts"
import { CONNECT_NEEDS_TTY, connectOutcome, parseConnectFlags, runConnect } from "../src/connect.ts"
import type { JobReceipt } from "../src/job-store.ts"
import type { JobRunOptions } from "../src/job-cli.ts"
import { runJob } from "../src/job.ts"
import type { LoginResult } from "../src/profiles.ts"

const DOOR = "https://ironadamant.com/auspex/phone.html#v=not.a.jwt"

function job(over: Partial<JobReceipt> = {}): JobReceipt {
  return {
    schemaVersion: 1,
    jobId: "job-test-1",
    phase: "completed",
    status: "completed",
    ok: true,
    reason: "matched",
    profile: "app-example",
    url: "https://app.example/dash",
    expect: "Workspace ready",
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
    claimOkProfile: true,
    ...over,
  }
}

function tty() {
  const stdin = Object.assign(new PassThrough(), { isTTY: true })
  let text = ""
  const stdout = Object.assign(new PassThrough(), { isTTY: true, columns: 40 })
  stdout.on("data", (chunk) => {
    text += String(chunk)
  })
  return { stdin, stdout, text: () => text }
}

test("parseConnectFlags takes a positional or --url, expect, profile", () => {
  const a = parseConnectFlags(["https://app.example", "--expect", "Workspace ready"])
  assert.ok(a.ok)
  assert.equal(a.opts.url, "https://app.example")
  assert.equal(a.opts.expect, "Workspace ready")
  const b = parseConnectFlags(["--url", "https://app.example", "--profile", "mine"])
  assert.ok(b.ok)
  assert.equal(b.opts.profile, "mine")
  assert.equal(b.opts.expect, undefined)
  assert.equal(parseConnectFlags([]).ok, false)
  assert.equal(parseConnectFlags(["ftp://x"]).ok, false)
  assert.equal(parseConnectFlags(["https://app.example", "extra"]).ok, false)
})

test("parseArgv routes connect and USAGE names it", () => {
  const parsed = parseArgv(["connect", "https://app.example"])
  assert.equal(parsed.status, "ok")
  assert.equal(parsed.status === "ok" && parsed.command.cmd, "connect")
  assert.match(USAGE, /npx auspex connect <https>/)
  assert.match(USAGE, /agents use job/)
})

test("connect refuses without a terminal so an agent cannot hang on Enter", async () => {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  let ran = false
  const result = await runConnect({ url: "https://app.example", expect: "X" }, { stdin, stdout }, {
    runJob: async () => {
      ran = true
      return job()
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.error, CONNECT_NEEDS_TTY)
  assert.equal(ran, false)
})

test("connect shows the door, Enter signals Save, and success needs claimOkProfile", async () => {
  const io = tty()
  const signaled: string[] = []
  let seen: JobRunOptions | undefined
  const result = await runConnect(
    { url: "https://app.example/dash", expect: "Workspace ready" },
    { stdin: io.stdin, stdout: io.stdout, now: () => Date.parse("2026-09-29T10:00:00Z") },
    {
      qr: async () => "QR",
      signalSave: async (profile) => {
        signaled.push(profile)
      },
      runJob: async (opts) => {
        seen = opts
        opts.onMinted?.({
          profile: "app-example",
          handoff: { url: DOOR, mobileUrl: DOOR, streamExpiresAt: "2026-09-29T10:05:00Z" },
        })
        setTimeout(() => io.stdin.write("\n"), 10)
        while (signaled.length === 0) await new Promise((r) => setTimeout(r, 5))
        opts.onProgress?.("job:check")
        return job()
      },
    },
  )
  assert.equal(seen?.wait, true)
  assert.equal(seen?.verifyWithProfile, true)
  assert.deepEqual(signaled, ["app-example"])
  assert.equal(result.ok, true)
  const text = io.text()
  assert.match(text, /phone\.html/)
  assert.match(text, /5 min 0 s/)
  assert.match(text, /press Enter here/)
  assert.match(text, /Checking with a fresh browser/)
  assert.match(text, /✓ Logged in to app\.example/)
  assert.match(text, /check --profile app-example/)
})

test("connect asks for the logged-in words when --expect is missing", async () => {
  const io = tty()
  let expect: string | undefined
  setTimeout(() => io.stdin.write("\nMy workspace\n"), 10)
  await runConnect({ url: "https://app.example" }, { stdin: io.stdin, stdout: io.stdout }, {
    runJob: async (opts) => {
      expect = opts.expect
      return job({ phase: "failed", status: "timeout", ok: false })
    },
  })
  assert.equal(expect, "My workspace")
  assert.match(io.text(), /What words only appear once you're logged in/)
})

test("connectOutcome: ok only with claimOkProfile, and fail-closed rows stay honest", () => {
  assert.equal(connectOutcome(job()).ok, true)
  const unconfirmed = connectOutcome(job({ claimOkProfile: false }))
  assert.equal(unconfirmed.ok, false)
  assert.match(unconfirmed.detail.join(" "), /Do not reuse/)
  const noVwp = connectOutcome(job({ claimOkProfile: undefined }))
  assert.equal(noVwp.ok, false)

  const appVisible = connectOutcome(
    job({ phase: "failed", status: "idp-only-save", ok: false, idpOnlyKind: "app-visible", claimOkProfile: undefined }),
  )
  assert.equal(appVisible.ok, false)
  assert.match(appVisible.headline, /only your Microsoft or Google sign-in was saved/)
  assert.equal(/Run the same command again/.test(appVisible.detail.join(" ")), false, "app-visible must not tell the human to remint")

  const wall = connectOutcome(job({ phase: "failed", status: "idp-only-save", ok: false, idpOnlyKind: "sign-in-wall" }))
  assert.match(wall.detail.join(" "), /Run the same command again/)

  assert.match(connectOutcome(job({ phase: "failed", status: "stream-expired", ok: false })).headline, /five-minute/)
  assert.match(connectOutcome(job({ phase: "failed", status: "needsHuman", ok: false })).headline, /never types/)
  const moved = connectOutcome(
    job({ phase: "failed", status: "host-changed", ok: false, suggestedUrl: "https://other.example" }),
  )
  assert.match(moved.detail.join(" "), /connect https:\/\/other\.example/)
  for (const status of ["empty-save", "expectMatchedPublicLanding", "loggedOut", "mismatch", "concurrency-limited", "network"] as const) {
    assert.equal(connectOutcome(job({ phase: "failed", status, ok: false })).ok, false, status)
  }
})

test("runJob calls onMinted with the door before the await", async () => {
  const jobsDir = await mkdtemp(path.join(tmpdir(), "auspex-connect-"))
  const order: string[] = []
  const login = async (): Promise<LoginResult> => ({
    profileId: "p1",
    name: "app-example",
    consoleUrl: "https://console.getsolari.com/profiles",
    next: "Open handoff.url",
    sinceVersion: 3,
    handoff: { url: DOOR, mobileUrl: DOOR },
  })
  const result = await runJob(
    {
      url: "https://app.example",
      expect: "Workspace ready",
      wait: true,
      onMinted: ({ handoff }) => order.push(`minted ${handoff.url}`),
    },
    {
      jobsDir,
      login,
      awaitLogin: async () => {
        order.push("await")
        return { status: "timeout", profileId: "p1", name: "app-example", version: 3, cookies: 0, origins: 0, next: "" }
      },
      wake: async () => ({ ok: true, skipped: true }),
    },
  )
  assert.deepEqual(order, [`minted ${DOOR}`, "await"])
  assert.equal(result.status, "timeout")
  assert.equal(JSON.stringify(result).includes("onMinted"), false)
})
