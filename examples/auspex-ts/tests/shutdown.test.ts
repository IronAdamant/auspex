import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { releaseOwnSessions } from "../src/reap.ts"
import { releaseOwnSessionsOnSignal, type ShutdownSignal } from "../src/shutdown.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repo = path.resolve(root, "..", "..")

function harness(release: () => Promise<unknown>, boundMs?: number) {
  const handlers = new Map<ShutdownSignal, (s: ShutdownSignal) => void>()
  const exits: number[] = []
  let releases = 0
  const lines: string[] = []
  releaseOwnSessionsOnSignal({
    on: (signal, handler) => void handlers.set(signal, handler),
    release: () => {
      releases += 1
      return release()
    },
    exit: (code) => void exits.push(code),
    stderr: { write: (text) => lines.push(text) },
    boundMs,
  })
  return { fire: (s: ShutdownSignal) => handlers.get(s)!(s), exits, releases: () => releases, lines }
}

test("a stop signal releases this process's sessions once, then exits with the signal's code", async () => {
  let finish!: () => void
  const h = harness(() => new Promise<void>((r) => (finish = r)))
  h.fire("SIGINT")
  h.fire("SIGINT")
  h.fire("SIGTERM")
  assert.equal(h.releases(), 1, "a repeated or second signal must not start another release")
  assert.deepEqual(h.exits, [], "no exit before the release ends")
  assert.match(h.lines.join(""), /SIGINT: closing the Solari sessions/)
  finish()
  await new Promise((r) => setImmediate(r))
  assert.deepEqual(h.exits, [130])
})

test("a release that fails or hangs still exits", async () => {
  const failed = harness(() => Promise.reject(new Error("no key")))
  failed.fire("SIGTERM")
  await new Promise((r) => setImmediate(r))
  assert.deepEqual(failed.exits, [143])
  const hung = harness(() => new Promise(() => undefined), 20)
  hung.fire("SIGHUP")
  await new Promise((r) => setTimeout(r, 60))
  assert.deepEqual(hung.exits, [129])
})

test("releaseOwnSessions releases only this pid's rows, and needs no key when it owns none", async () => {
  const at = Date.now()
  const ledger = {
    browser: ["b-mine", "b-other", "b-old"],
    sandbox: ["s-mine"],
    desktop: [],
    owners: { "b-mine": { pid: 4242, at }, "b-other": { pid: 99, at }, "s-mine": { pid: 4242, at } },
  }
  const calls: string[] = []
  const deps = {
    ledger: async () => ledger,
    releaseBrowser: async (id: string) => void calls.push(`browser ${id}`),
    deleteVm: async (id: string) => void calls.push(`vm ${id}`),
  }
  const released = await releaseOwnSessions(4242, deps)
  assert.deepEqual(released.sort(), ["b-mine", "s-mine"])
  assert.deepEqual(calls.sort(), ["browser b-mine", "vm s-mine"])
  const none = await releaseOwnSessions(7, {
    ...deps,
    releaseBrowser: async () => assert.fail("nothing of pid 7 to release"),
  })
  assert.deepEqual(none, [])
})

test("SIGTERM to the bin/ launcher reaches the CLI, which exits 143 instead of running on", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "auspex-shutdown-"))
  await mkdir(path.join(home, "jobs"), { recursive: true })
  const now = new Date().toISOString()
  const job = { schemaVersion: 1, jobId: "job-sigterm-1", phase: "await", status: "waiting", ok: false, reason: "awaiting-save", profile: "app-example", createdAt: now, updatedAt: now }
  await writeFile(path.join(home, "jobs", "job-sigterm-1.json"), JSON.stringify(job))
  const child = spawn(process.execPath, [path.join(repo, "bin", "auspex.mjs"), "job-status", "--job-id", "job-sigterm-1", "--wait-ms", "20000"], {
    env: { ...process.env, AUSPEX_HOME: home, SOLARI_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let stderr = ""
  const waiting = new Promise<void>((resolve, reject) => {
    child.stderr.on("data", (d) => {
      stderr += String(d)
      if (/job-status: await\/waiting/.test(stderr)) resolve()
    })
    child.on("exit", () => reject(new Error(`exited before waiting: ${stderr}`)))
  })
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
    child.on("exit", (code, signal) => resolve({ code, signal })),
  )
  await waiting
  const sentAt = Date.now()
  child.kill("SIGTERM")
  const { code, signal } = await exited
  assert.equal(signal, null, "the launcher must not die of the signal itself")
  assert.equal(code, 143)
  assert.ok(Date.now() - sentAt < 10_000, "the CLI stops well before its 20 s wait ends")
  assert.match(stderr, /SIGTERM: closing the Solari sessions this command opened/)
})
