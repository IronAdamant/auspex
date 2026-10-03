import assert from "node:assert/strict"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { RUNS_DIR } from "../src/receipt.ts"
import { createProgress } from "../src/progress.ts"
import { checkThenVerify } from "../src/sandbox.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

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

test("createProgress emits a heartbeat line before return", () => {
  const chunks: string[] = []
  const stream = { write: (s: string) => { chunks.push(s); return true } } as unknown as NodeJS.WritableStream
  const p = createProgress({ stream })
  p("launching")
  assert.match(chunks.join(""), /:: launching/)
})

test("MCP progress uses the client's progressToken with a rising count", async () => {
  const sent: Array<{ method: string; params: Record<string, unknown> }> = []
  const stream = { write: () => true } as unknown as NodeJS.WritableStream
  const p = createProgress({
    stream,
    extra: { _meta: { progressToken: 7 }, sendNotification: async (n) => void sent.push(n) },
  })
  p("launching")
  p("goto")
  await new Promise((r) => setImmediate(r))
  assert.deepEqual(
    sent.map((n) => [n.method, n.params.progressToken, n.params.progress, n.params.message]),
    [
      ["notifications/progress", 7, 1, "launching"],
      ["notifications/progress", 7, 2, "goto"],
    ],
  )
})

test("MCP progress sends nothing when the client did not ask for it", async () => {
  let sent = 0
  const stream = { write: () => true } as unknown as NodeJS.WritableStream
  const p = createProgress({ stream, extra: { sendNotification: async () => void (sent += 1) } })
  p("launching")
  await new Promise((r) => setImmediate(r))
  assert.equal(sent, 0)
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

