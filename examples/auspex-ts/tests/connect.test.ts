import assert from "node:assert/strict"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { PassThrough } from "node:stream"
import test from "node:test"
import { parseArgv, USAGE } from "../src/cli.ts"
import { CONNECT_NEEDS_EXPECT, connectOutcome, parseConnectFlags, runConnect, runConnectSave } from "../src/connect.ts"
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

test("parseConnectFlags --save takes one profile and nothing else", () => {
  const s = parseConnectFlags(["--save", "app-lorari-com"])
  assert.ok(s.ok && s.mode === "save")
  assert.equal(s.profile, "app-lorari-com")
  assert.equal(parseConnectFlags(["--save"]).ok, false)
  assert.equal(parseConnectFlags(["--save", "x", "https://app.example"]).ok, false)
})

test("parseArgv routes connect and USAGE names both forms", () => {
  const parsed = parseArgv(["connect", "https://app.example"])
  assert.equal(parsed.status, "ok")
  assert.equal(parsed.status === "ok" && parsed.command.cmd, "connect")
  assert.match(USAGE, /npx auspex connect <https>/)
  assert.match(USAGE, /npx auspex connect --save <profile>/)
})

test("without a terminal connect needs --expect and never reads stdin", async () => {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  let ran = false
  const result = await runConnect({ url: "https://app.example" }, { stdin, stdout }, {
    runJob: async () => {
      ran = true
      return job()
    },
  })
  assert.equal(result.error, CONNECT_NEEDS_EXPECT)
  assert.equal(ran, false)
})

test("agent path: no terminal, door printed, connect --save ends the wait", async () => {
  const stdin = new PassThrough()
  let text = ""
  const stdout = new PassThrough()
  stdout.on("data", (chunk) => {
    text += String(chunk)
  })
  let signaled = false
  const result = await runConnect({ url: "https://app.example/dash", expect: "Workspace ready" }, { stdin, stdout }, {
    qr: async () => "QR",
    runJob: async (opts) => {
      opts.onMinted?.({ profile: "app-example", handoff: { url: DOOR, mobileUrl: DOOR } })
      // Stands in for the real waiter: connect --save flips this from another process.
      setTimeout(() => void runConnectSave("app-example", {
        isWaiting: async () => true,
        signalSave: async () => {
          signaled = true
        },
      }), 10)
      while (!signaled) await new Promise((r) => setTimeout(r, 5))
      return job()
    },
  })
  assert.equal(result.ok, true)
  assert.match(text, /phone\.html/)
  assert.match(text, /connect --save app-example/)
  assert.equal(/press enter/i.test(text), false, "agent mode must not tell anyone to press Enter")
  assert.match(text, /✓ Logged in/)
})

test("connect --save says so when nothing is waiting", async () => {
  let signaled = false
  const none = await runConnectSave("app-example", {
    isWaiting: async () => false,
    signalSave: async () => {
      signaled = true
    },
  })
  assert.equal(none.ok, false)
  assert.match(none.message, /No connect is waiting/)
  assert.equal(signaled, false)
  const live = await runConnectSave("app-example", { isWaiting: async () => true, signalSave: async () => undefined })
  assert.equal(live.ok, true)
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

  const solari502 = connectOutcome(
    job({
      phase: "await",
      status: "timeout",
      ok: false,
      editorSave: { ok: false, status: 502, error: "Failed to export storageState" },
    }),
  )
  assert.equal(solari502.ok, false)
  assert.match(solari502.headline, /Solari could not save the login \(HTTP 502: Failed to export storageState\)/)
  assert.equal(/No Save arrived/.test(solari502.headline), false, "a finished Solari 502 is not a missing Save")
  assert.match(connectOutcome(job({ phase: "await", status: "timeout", ok: false })).headline, /No Save arrived/)
  const notSavable = connectOutcome(
    job({
      phase: "failed",
      status: "stream-expired",
      ok: false,
      editorSave: { ok: false, status: 409, error: "The editor isn't in a savable state." },
    }),
  )
  assert.match(notSavable.headline, /HTTP 409: The editor isn't in a savable state/)
  assert.equal(/five-minute/.test(notSavable.headline), false, "a Solari 409 is not the clock")
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

test("runJob keeps a failed Solari editor/save status so connect can name it", async () => {
  const jobsDir = await mkdtemp(path.join(tmpdir(), "auspex-connect-502-"))
  const result = await runJob(
    { url: "https://app.example", expect: "Workspace ready", wait: true },
    {
      jobsDir,
      login: async () => ({
        profileId: "p1",
        name: "app-example",
        consoleUrl: "https://console.getsolari.com/profiles",
        next: "Open handoff.url",
        sinceVersion: 1,
        handoff: { url: DOOR, mobileUrl: DOOR },
      }),
      awaitLogin: async () => ({
        status: "timeout",
        profileId: "p1",
        name: "app-example",
        version: 1,
        cookies: 0,
        origins: 0,
        next: "editorSave failed (502: Failed to export storageState). POST finished.",
        editorSave: { ok: false, status: 502, error: "Failed to export storageState" },
      }),
      wake: async () => ({ ok: true, skipped: true }),
    },
  )
  assert.equal(result.status, "timeout")
  assert.deepEqual(result.editorSave, { ok: false, status: 502, error: "Failed to export storageState" })
  assert.match(connectOutcome(result).headline, /Solari could not save the login \(HTTP 502/)
})

test("isBotChallengePage names Cloudflare checks and leaves real pages alone", async () => {
  const { isBotChallengePage } = await import("../src/text.ts")
  assert.equal(isBotChallengePage("Just a moment...", "We’ll have you designing again soon"), true)
  assert.equal(isBotChallengePage("Attention Required! | Cloudflare", ""), true)
  assert.equal(isBotChallengePage("", "Verify you are human by completing the action below."), true)
  assert.equal(isBotChallengePage("Home - Canva", "What will you design today? Templates for you"), false)
  assert.equal(isBotChallengePage("Just a moment of calm | Blog", "An article"), false)
  assert.equal(isBotChallengePage("Sign in", "Enter your password"), false)
})

test("connectOutcome: a bot wall is named, not blamed on the sign-in", () => {
  const out = connectOutcome(job({ phase: "failed", status: "mismatch", ok: false, botWall: true, url: "https://www.canva.com/" }))
  assert.equal(out.ok, false)
  assert.match(out.headline, /bot check/)
  assert.equal(/logged-out|Make sure the app is fully loaded/.test(out.headline + out.detail.join(" ")), false)
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

test("connect stops at once when Solari gives no phone door, instead of handing out the fallback page", async () => {
  const { NO_PHONE_DOOR } = await import("../src/connect.ts")
  const jobsDir = await mkdtemp(path.join(tmpdir(), "auspex-connect-nodoor-"))
  let awaited = false
  let text = ""
  const stdout = new PassThrough()
  stdout.on("data", (chunk) => {
    text += String(chunk)
  })
  const result = await runConnect(
    { url: "https://www.canva.com/", expect: "Templates for you" },
    { stdin: new PassThrough(), stdout },
    {
      runJob: (opts) =>
        runJob(opts, {
          jobsDir,
          login: async () => ({
            profileId: "p1",
            name: "canva-com",
            consoleUrl: "https://console.getsolari.com/profiles",
            next: "",
            sinceVersion: 1,
            handoff: { url: "https://console.getsolari.com/handoff/abc" },
          }),
          awaitLogin: async () => {
            awaited = true
            return { status: "timeout", profileId: "p1", name: "canva-com", version: 1, cookies: 0, origins: 0, next: "" }
          },
          wake: async () => ({ ok: true, skipped: true }),
        }),
    },
  )
  assert.equal(result.ok, false)
  assert.equal(awaited, false, "must not wait on Solari's fallback page")
  assert.equal(text.includes("console.getsolari.com/handoff"), false, "must not hand out the fallback page")
  assert.match(text, new RegExp(NO_PHONE_DOOR.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})

test("connectOutcome: a Solari browser crash after a good save offers the one check retry, not a text wall", () => {
  const out = connectOutcome(
    job({
      phase: "failed",
      status: "failed",
      ok: false,
      claimOkProfile: undefined,
      profile: "canva-com",
      url: "https://www.canva.com/",
      expect: "Templates for you",
      reason:
        "page.title: page.evaluate: Target page, context or browser has been closed; session close failed: Solari SDK exhausted retries and stripped the HTTP status (cookbook #56).",
      next: "x".repeat(900),
      seedReadiness: {
        phase: "post-save",
        shape: "cookie-strong",
        solariSaveReady: true,
        appOriginCookies: true,
        appOriginCookieCount: 30,
        localStorageCount: 0,
        localStorageAuthKeyNames: [],
        sessionStorageCount: 0,
        sessionStorageMiss: true,
        idpOnly: false,
        weakSeed: false,
      },
    }),
  )
  assert.equal(out.ok, false)
  assert.match(out.headline, /Solari's browser closed during the check/)
  assert.match(out.detail.join(" "), /check --profile canva-com .*--verify-with-profile/)
  assert.equal(out.detail.join(" ").includes("xxxx"), false, "must not dump the long next")
  const other = connectOutcome(job({ phase: "failed", status: "failed", ok: false, reason: "y".repeat(500), next: "z".repeat(900) }))
  assert.ok(other.headline.length < 230)
  assert.equal(other.detail.join(" ").includes("zzzz"), false)
})

test("tildePath hides the account folder in printed paths", async () => {
  const { tildePath } = await import("../src/connect.ts")
  assert.equal(tildePath("/Users/alice/.auspex/jobs/job-1.json", "/Users/alice"), "~/.auspex/jobs/job-1.json")
  assert.equal(tildePath("/Users/alice", "/Users/alice/"), "~")
  assert.equal(tildePath("/Users/alicewonder/x.json", "/Users/alice"), "/Users/alicewonder/x.json", "only a whole folder match")
  assert.equal(tildePath("/tmp/job.json", "/Users/alice"), "/tmp/job.json")
  assert.equal(tildePath("/x/y", "/"), "/x/y")
})
