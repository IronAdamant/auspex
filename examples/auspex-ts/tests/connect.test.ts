import assert from "node:assert/strict"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { PassThrough } from "node:stream"
import test from "node:test"
import { connectOutcome, parseConnectFlags, runConnect } from "../src/connect.ts"
import type { JobReceipt } from "../src/job-store.ts"
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
  assert.ok(a.ok && a.mode === "run")
  assert.equal(a.opts.url, "https://app.example")
  assert.equal(a.opts.expect, "Workspace ready")
  const b = parseConnectFlags(["--url", "https://app.example", "--profile", "mine"])
  assert.ok(b.ok && b.mode === "run")
  assert.equal(b.opts.profile, "mine")
  assert.equal(b.opts.expect, undefined)
  assert.equal(parseConnectFlags([]).ok, false)
  assert.equal(parseConnectFlags(["ftp://x"]).ok, false)
  assert.equal(parseConnectFlags(["https://app.example", "extra"]).ok, false)
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

test("runJob: a bot wall never triggers the finalize fallback", async () => {
  const jobsDir = await mkdtemp(path.join(tmpdir(), "auspex-connect-bot-"))
  let finalized = 0
  const result = await runJob(
    { url: "https://www.canva.com/", expect: "Templates for you", wait: true, verifyWithProfile: true },
    {
      jobsDir,
      login: async () => ({
        profileId: "p1",
        name: "canva-com",
        consoleUrl: "https://console.getsolari.com/profiles",
        next: "",
        sinceVersion: 1,
        handoff: { url: DOOR, mobileUrl: DOOR },
      }),
      awaitLogin: async () => ({
        status: "completed",
        profileId: "p1",
        name: "canva-com",
        version: 2,
        cookies: 40,
        origins: 1,
        next: "",
        seedReadiness: {
          phase: "post-save",
          shape: "cookie-strong",
          solariSaveReady: true,
          appOriginCookies: true,
          appOriginCookieCount: 29,
          localStorageCount: 21,
          localStorageAuthKeyNames: [],
          sessionStorageCount: 0,
          sessionStorageMiss: true,
          idpOnly: false,
          weakSeed: false,
        },
      }),
      finalize: async () => {
        finalized += 1
        throw new Error("finalize must not run on a bot wall")
      },
      check: async () => ({
        receipt: {
          schemaVersion: 1,
          ok: false,
          reason: "loggedOut",
          url: "https://www.canva.com/",
          expect: "Templates for you",
          screenshotPath: "",
          botWall: true,
        },
        verified: true,
      }),
      wake: async () => ({ ok: true, skipped: true }),
    },
  )
  assert.equal(finalized, 0)
  assert.equal(result.botWall, true)
  assert.match(connectOutcome(result).headline, /bot check/)
})

test("a refused second browser is named for what it is, never 'your words were not on the page'", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "auspex-vwp-"))
  const cases = [
    { kind: "weakSeed", status: "weak-seed" },
    { kind: "emptySave", status: "empty-save" },
    { kind: "dead-fold", status: "idp-only-save" },
  ] as const
  for (const c of cases) {
    const done = await runJob(
      { url: "https://app.example/dash", expect: "Workspace ready", wait: true, verifyWithProfile: true },
      {
        jobsDir: dir,
        login: async () => ({
          profileId: "p1",
          name: "app-example",
          consoleUrl: "https://console.getsolari.com/profiles",
          next: "Open handoff.url",
          sinceVersion: 3,
          handoff: { url: DOOR, mobileUrl: DOOR },
        }) as LoginResult,
        awaitLogin: async () => ({
          status: "completed",
          profileId: "p1",
          name: "app-example",
          version: 4,
          cookies: 4,
          origins: 1,
          sessionStorage: 0,
          next: "Run finalize-login",
        }),
        finalize: async () =>
          ({ ok: true, reason: "matched", url: "https://app.example/dash", expect: "Workspace ready", screenshotPath: "x.png", title: "", finalUrl: "https://app.example/dash", matched: true, excerpt: "", sessionId: "s", networkIdle: true }) as never,
        check: async () => ({
          verified: true,
          receipt: {
            schemaVersion: 1,
            ok: false,
            reason: "matched",
            url: "https://app.example/dash",
            expect: "Workspace ready",
            screenshotPath: "x.png",
            matched: true,
            next: `verify-with-profile refused: ${c.kind}`,
            verify: { ok: false, claimOk: false, claimOkProfile: false, vwpRefused: c.kind },
          } as never,
        }),
        wake: async () => ({ ok: true, skipped: true }),
      },
    )
    assert.equal(done.status, c.status, c.kind)
    assert.equal(done.ok, false)
    const outcome = connectOutcome(done)
    assert.equal(outcome.ok, false)
    assert.doesNotMatch(outcome.headline, /was not on the page/, c.kind)
  }
})

test("an Enter typed before the link appears is not taken as Save", async () => {
  const io = tty()
  const signaled: number[] = []
  const start = Date.now()
  // The words, then a stray extra Enter, all before the door is shown.
  io.stdin.write("Workspace ready\n\n")
  await runConnect({ url: "https://app.example/dash" }, { stdin: io.stdin, stdout: io.stdout }, {
    qr: async () => "QR",
    signalSave: async () => {
      signaled.push(Date.now() - start)
    },
    runJob: async (opts) => {
      await new Promise((r) => setTimeout(r, 20))
      opts.onMinted?.({ profile: "app-example", handoff: { url: DOOR, mobileUrl: DOOR } })
      await new Promise((r) => setTimeout(r, 40))
      assert.deepEqual(signaled, [], "the stray Enter must not signal Save")
      io.stdin.write("\n")
      while (signaled.length === 0) await new Promise((r) => setTimeout(r, 5))
      return job()
    },
  })
  assert.equal(signaled.length, 1)
})

