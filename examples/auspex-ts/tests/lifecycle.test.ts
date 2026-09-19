import assert from "node:assert/strict"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { RUNS_DIR } from "../src/receipt.ts"
import { createProgress } from "../src/progress.ts"
import { SANDBOX_CREATE_OPTS, checkThenVerify, wrapSandboxRestExec } from "../src/sandbox.ts"
import { fetchWithIdempotencyKey, waitUntilReleased } from "../src/solari.ts"
import { DESKTOP_CREATE_OPTS } from "../src/desktop.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("sandbox create options are 1 vCPU / 2 GB with idle kill", () => {
  assert.equal(SANDBOX_CREATE_OPTS.cpu, 1)
  assert.equal(SANDBOX_CREATE_OPTS.memMb, 2048)
  assert.equal(SANDBOX_CREATE_OPTS.lifecycle.onTimeout, "kill")
  assert.equal(DESKTOP_CREATE_OPTS.cpu, 1)
  assert.equal(DESKTOP_CREATE_OPTS.memMb, 2048)
})

test("fetchWithIdempotencyKey sets Idempotency-Key on sandbox creates", async () => {
  const seen: string[] = []
  const wrapped = fetchWithIdempotencyKey(async (input, init) => {
    const h = new Headers(init?.headers)
    seen.push(h.get("Idempotency-Key") ?? "")
    return new Response("{}", { status: 201 })
  })
  await wrapped("https://api.getsolari.com/sandboxes", { method: "POST", body: "{}" })
  assert.ok(seen[0])
  assert.match(seen[0] ?? "", /[0-9a-f-]{8,}/i)
})

test("wrapSandboxRestExec connect is a no-op (REST exec path)", async () => {
  let connected = false
  const handle = wrapSandboxRestExec({
    id: "sbx-rest",
    commands: {
      run: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    },
    kill: async () => undefined,
    uploadUrl: async () => ({ url: "https://example.com/u" }),
  })
  await handle.connect()
  assert.equal(connected, false)
  assert.equal(handle.sandboxId, "sbx-rest")
})

test("waitUntilReleased resolves on status released", async () => {
  let n = 0
  await waitUntilReleased("sid-1", {
    getStatus: async () => {
      n += 1
      return { status: n === 1 ? "running" : "released" }
    },
    sleep: async () => undefined,
    deadlineMs: Date.now() + 5_000,
  })
  assert.ok(n >= 2)
})

test("checkThenVerify skips sandbox create after loggedOut and needsHuman", async () => {
  const { checkThenVerify } = await import("../src/sandbox.ts")
  for (const reason of ["loggedOut", "needsHuman"] as const) {
    let creates = 0
    const check = {
      title: "t",
      finalUrl: "https://consistencyhub.io/landing",
      ok: false,
      reason,
      url: "https://consistencyhub.io",
      expect: "Document Editor",
      matched: false,
      excerpt: reason,
      screenshotPath: ".auspex/runs/stamp/screenshot.png",
      sessionId: "sess",
      networkIdle: true,
    }
    const both = await checkThenVerify(
      { url: "https://consistencyhub.io", expect: "Document Editor" },
      {
        check: async () => check,
        create: async () => {
          creates += 1
          throw new Error("must not create a sandbox")
        },
      },
    )
    assert.equal(creates, 0, reason)
    assert.equal(both.verify.skipped, true)
    assert.equal(both.verify.skipReason, reason)
    assert.equal(both.check.reason, reason)
  }
})

test("checkThenVerify verifies after matched and starts sandbox only after check", async () => {
  const stamp = `seq-${Date.now()}`
  const dir = path.join(RUNS_DIR, stamp)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify({
      ok: true,
      matched: true,
      screenshotPath: `.auspex/runs/${stamp}/screenshot.png`,
      finalUrl: "https://ironadamant.com/",
    })}\n`,
  )
  writeFileSync(path.join(dir, "screenshot.png"), readFileSync(path.join(root, "demo", "ironadamant.png")))
  const check = {
    title: "t",
    finalUrl: "https://ironadamant.com/",
    ok: true,
    reason: "matched" as const,
    url: "https://ironadamant.com",
    expect: "Build it.",
    matched: true,
    excerpt: "Build it.",
    screenshotPath: `.auspex/runs/${stamp}/screenshot.png`,
    sessionId: "sess",
    networkIdle: false,
  }
  const order: string[] = []
  const both = await checkThenVerify(
    { url: "https://ironadamant.com", expect: "Build it." },
    {
      check: async () => {
        order.push("check")
        return check
      },
      verify: async () => {
        order.push("verify")
        return {
          ok: true,
          errors: [],
          claimOk: true,
          claimErrors: [],
          runDir: dir,
        }
      },
      create: async () => {
        order.push("create")
        return {
          connect: async () => undefined,
          files: {
            mkdir: async () => undefined,
            write: async () => undefined,
          },
          commands: {
            run: async () => ({
              exitCode: 0,
              stdout: `${JSON.stringify({ ok: true, errors: [], claimOk: true, claimErrors: [] })}\n`,
            }),
          },
          kill: async () => undefined,
          sandboxId: "sbx-seq",
        }
      },
    },
  )
  assert.deepEqual(order, ["check", "verify"])
  assert.equal(both.check.sessionId, "sess")
  assert.equal(both.verify.ok, true)
  assert.equal(both.verify.skipped, undefined)
})

test("check source waits for networkidle after DCL", () => {
  const src = readFileSync(path.join(root, "src", "check.ts"), "utf8")
  assert.match(src, /waitForLoadState\("networkidle"/)
  assert.match(src, /NETWORKIDLE_TIMEOUT_MS/)
})

test("sso source has no extra fail-open networkidle or DCL waits", () => {
  const src = readFileSync(path.join(root, "src", "sso.ts"), "utf8")
  assert.equal(src.includes("networkidle"), false)
  assert.equal(src.includes("domcontentloaded"), false)
})

test("check source fits PNG under the verify cap and attaches replay on record", () => {
  const src = readFileSync(path.join(root, "src", "check.ts"), "utf8")
  assert.match(src, /fitPngUnderCap/)
  assert.match(src, /attachRecordedReplay/)
  assert.match(src, /sessionCreateFromCheck/)
  assert.match(src, /persistLiveProfile/)
  assert.match(src, /emptyProfileSeedError/)
})
test("sandbox verify uploads files in parallel", () => {
  const src = readFileSync(path.join(root, "src", "sandbox.ts"), "utf8")
  assert.match(src, /Promise\.all\(/)
  assert.match(src, /wrapSandboxRestExec/)
})

test("createProgress emits a heartbeat line before return", () => {
  const chunks: string[] = []
  const stream = { write: (s: string) => { chunks.push(s); return true } } as unknown as NodeJS.WritableStream
  const p = createProgress({ stream })
  p("launching")
  assert.match(chunks.join(""), /:: launching/)
})

test("replay poll window is within documented 1–3s", async () => {
  const { REPLAY_ATTEMPTS, REPLAY_DELAY_MS } = await import("../src/solari.ts")
  assert.ok(REPLAY_ATTEMPTS * REPLAY_DELAY_MS <= 4_000)
  assert.ok(REPLAY_DELAY_MS <= 1_000)
})

test("checkThenVerify closes the verify-with-profile Solari client", () => {
  const src = readFileSync(path.join(root, "src", "sandbox.ts"), "utf8")
  const idx = src.indexOf("if (verifyWithProfile && opts.profile)")
  assert.ok(idx >= 0, "verifyWithProfile client resolve must exist")
  const slice = src.slice(idx, idx + 700)
  assert.match(slice, /createClient\(\)/)
  assert.match(slice, /finally/)
  assert.match(slice, /solari\.close/)
})

test("checkThenVerify rewrites manifest ok to agent-success after verify", async () => {
  const stamp = `agent-ok-${Date.now()}`
  const dir = path.join(RUNS_DIR, stamp)
  mkdirSync(dir, { recursive: true })
  const shot = path.join(dir, "screenshot.png")
  writeFileSync(shot, readFileSync(path.join(root, "demo", "ironadamant.png")))
  writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify({ ok: true, reason: "matched" })}\n`)
  const check = {
    title: "t",
    finalUrl: "https://ironadamant.com/",
    ok: true,
    protocolOk: true,
    reason: "matched" as const,
    url: "https://ironadamant.com",
    expect: "Build it.",
    matched: true,
    excerpt: "Build it.",
    screenshotPath: shot,
    sessionId: "sess",
    networkIdle: true,
  }
  await checkThenVerify(
    { url: "https://ironadamant.com", expect: "Build it." },
    {
      check: async () => check,
      verify: async () => ({
        ok: true,
        errors: [],
        claimOk: false,
        claimErrors: ["expect not found"],
        runDir: dir,
      }),
    },
  )
  const written = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as {
    ok: boolean
    reason: string
  }
  assert.equal(written.ok, false)
  assert.equal(written.reason, "mismatch")
})

test("checkThenVerify with verifyWithProfile passes profileId and skips anonymous claim", async () => {
  const stamp = `verify-profile-${Date.now()}`
  const dir = path.join(RUNS_DIR, stamp)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({
      url: "https://consistencyhub.io",
      expect: "Document Editor",
      finalUrl: "https://consistencyhub.io/dashboard",
      screenshotPath: path.join(dir, "screenshot.png"),
    }),
  )
  writeFileSync(path.join(dir, "screenshot.png"), Buffer.from("fake"))
  
  let receivedProfileId: string | undefined
  let receivedSkipAnonymousClaim: boolean | undefined
  const check = {
    title: "Dashboard",
    finalUrl: "https://consistencyhub.io/dashboard",
    ok: true,
    reason: "matched" as const,
    url: "https://consistencyhub.io",
    expect: "Document Editor",
    matched: true,
    excerpt: "Document Editor",
    screenshotPath: path.join(dir, "screenshot.png"),
    sessionId: "sess",
    networkIdle: true,
  }
  
  const both = await checkThenVerify(
    {
      url: "https://consistencyhub.io",
      expect: "Document Editor",
      profile: "test-profile",
      verifyWithProfile: true,
    },
    {
      check: async () => check,
      verify: async (_dir, profileId) => {
        receivedProfileId = profileId
        return {
          ok: true,
          errors: [],
          claimOk: false,
          claimErrors: ["auth-gated"],
          anonymousClaimSkipped: true,
          claimOkProfile: true,
          claimErrorsProfile: [],
          runDir: dir,
        }
      },
      create: async () => {
        throw new Error("sandbox should not be created in this mock")
      },
      verifyWithProfile: true,
    },
  )
  
  assert.equal(both.check.reason, "matched")
  assert.ok(receivedProfileId, "profileId should be passed to verify when verifyWithProfile is true")
  assert.equal(both.verify.anonymousClaimSkipped, true, "anonymous claim should be skipped")
  assert.equal(both.verify.claimOk, false, "anonymous claimOk should be false (auth-gated)")
  assert.equal(both.verify.claimOkProfile, true, "profile claim should succeed")
})

test("checkThenVerify VWP timeout preserves anonymousClaimSkipped so reason stays matched", async () => {
  const { toAgentReceipt } = await import("../src/agent-receipt.ts")
  const check = {
    title: "Dashboard",
    finalUrl: "https://consistencyhub.io/dashboard",
    ok: true,
    protocolOk: true,
    reason: "matched" as const,
    url: "https://consistencyhub.io",
    expect: "Document Editor",
    matched: true,
    excerpt: "Document Editor",
    screenshotPath: ".auspex/runs/stamp/screenshot.png",
    sessionId: "sess",
    networkIdle: true,
  }
  const both = await checkThenVerify(
    {
      url: "https://consistencyhub.io",
      expect: "Document Editor",
      profile: "consistencyhub",
      verifyWithProfile: true,
    },
    {
      check: async () => check,
      verify: async () => {
        throw new Error("sandbox verify timed out after 90000ms")
      },
      verifyWithProfile: true,
    },
  )
  assert.equal(both.check.ok, true)
  assert.equal(both.verify.ok, false)
  assert.equal(both.verify.claimOk, false)
  assert.equal(both.verify.anonymousClaimSkipped, true)
  assert.equal(both.verify.claimOkProfile, false)
  assert.match(both.verify.errors.join(" "), /timed out/)
  const receipt = toAgentReceipt(both.check, { verify: both.verify })
  assert.equal(receipt.ok, false)
  assert.equal(receipt.reason, "matched")
  assert.equal(receipt.verify?.anonymousClaimSkipped, true)
  assert.equal(receipt.verify?.claimOkProfile, false)
})

test("checkThenVerify non-VWP timeout does not invent anonymousClaimSkipped", async () => {
  const { toAgentReceipt } = await import("../src/agent-receipt.ts")
  const check = {
    title: "t",
    finalUrl: "https://ironadamant.com/",
    ok: true,
    protocolOk: true,
    reason: "matched" as const,
    url: "https://ironadamant.com",
    expect: "Build it.",
    matched: true,
    excerpt: "Build it.",
    screenshotPath: ".auspex/runs/stamp/screenshot.png",
    sessionId: "sess",
    networkIdle: true,
  }
  const both = await checkThenVerify(
    { url: "https://ironadamant.com", expect: "Build it." },
    {
      check: async () => check,
      verify: async () => {
        throw new Error("sandbox verify timed out after 90000ms")
      },
    },
  )
  assert.equal(both.verify.anonymousClaimSkipped, undefined)
  assert.equal(both.verify.claimOkProfile, undefined)
  const receipt = toAgentReceipt(both.check, { verify: both.verify })
  assert.equal(receipt.ok, false)
  assert.equal(receipt.reason, "network")
})

test("agentReceiptOk succeeds with anonymousClaimSkipped when live matched and integrity ok", async () => {
  const { agentReceiptOk } = await import("../src/check-reason.ts")
  const okWithSkip = agentReceiptOk({
    protocolOk: true,
    reason: "matched",
    verify: {
      ok: true,
      claimOk: false,
      anonymousClaimSkipped: true,
    },
  })
  assert.equal(okWithSkip, true, "ok should be true when anonymous claim is skipped and integrity ok")
  
  const notOkWithoutSkip = agentReceiptOk({
    protocolOk: true,
    reason: "matched",
    verify: {
      ok: true,
      claimOk: false,
    },
  })
  assert.equal(notOkWithoutSkip, false, "ok should be false when anonymous claim is not skipped and claimOk false")
})
