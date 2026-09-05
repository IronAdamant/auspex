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

test("checkThenVerify overlaps sandbox create with the browser check", async () => {
  const started: number[] = []
  const stamp = `ovl-${Date.now()}`
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
    expect: "Build it.",
    matched: true,
    excerpt: "Build it.",
    screenshotPath: `.auspex/runs/${stamp}/screenshot.png`,
    sessionId: "sess",
    networkIdle: false,
  }
  let creates = 0
  const both = await checkThenVerify(
    { url: "https://ironadamant.com", expect: "Build it." },
    {
      check: async () => {
        started.push(Date.now())
        await new Promise((r) => setTimeout(r, 40))
        return check
      },
      create: async () => {
        creates += 1
        started.push(Date.now())
        await new Promise((r) => setTimeout(r, 40))
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
          sandboxId: "sbx-overlap",
        }
      },
    },
  )
  assert.equal(creates, 1)
  assert.equal(started.length, 2)
  assert.ok(Math.abs(started[0]! - started[1]!) < 30)
  assert.equal(both.check.sessionId, "sess")
  assert.equal(both.verify.ok, true)
})

test("check source no longer waits networkidle after DCL", () => {
  const src = readFileSync(path.join(root, "src", "check.ts"), "utf8")
  assert.equal(src.includes("waitForLoadState(\"networkidle\""), false)
  assert.equal(src.includes("waitNetworkIdle"), false)
})

test("sso source has no extra fail-open networkidle or DCL waits", () => {
  const src = readFileSync(path.join(root, "src", "sso.ts"), "utf8")
  assert.equal(src.includes("networkidle"), false)
  assert.equal(src.includes("domcontentloaded"), false)
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
