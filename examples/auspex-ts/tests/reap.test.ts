import assert from "node:assert/strict"
import test from "node:test"
import { reapLeftovers } from "../src/reap.ts"

test("reapLeftovers accountWide kills holding VMs on the key", async () => {
  const killed: string[] = []
  const result = await reapLeftovers(
    { accountWide: true },
    {
      listVms: async () => [
        { id: "sbx-run", kind: "sandbox", state: "running" },
        { id: "desk-1", kind: "desktop", state: "paused" },
        { id: "gone", kind: "sandbox", state: "gone" },
      ],
      deleteVm: async (id) => {
        killed.push(id)
      },
      releaseBrowser: async () => undefined,
      ledger: async () => ({ browser: ["b1"], sandbox: [], desktop: [] }),
    },
  )
  assert.equal(result.ok, true)
  assert.equal(result.accountWide, true)
  assert.deepEqual(killed.sort(), ["desk-1", "sbx-run"])
})

test("reap leaves another running command's sessions open and releases leftovers", async () => {
  const { isInUse, IN_USE_MAX_MS } = await import("../src/session-ledger.ts")
  type LiveLedger = import("../src/session-ledger.ts").LiveLedger
  const now = 1_000_000_000
  const alive = new Set([111])
  const ledger: LiveLedger = {
    browser: ["busy", "crashed", "stale", "legacy"],
    sandbox: ["sbx-busy"],
    desktop: [],
    owners: {
      busy: { pid: 111, at: now - 60_000 },
      crashed: { pid: 222, at: now - 60_000 },
      stale: { pid: 111, at: now - IN_USE_MAX_MS - 1 },
      "sbx-busy": { pid: 111, at: now - 1_000 },
    },
  }
  const inUse = (l: LiveLedger, id: string) => isInUse(l, id, now, (pid) => alive.has(pid))
  const released: string[] = []
  const killed: string[] = []
  const deps = {
    listVms: async () => [],
    deleteVm: async (id: string) => {
      killed.push(id)
    },
    releaseBrowser: async (id: string) => {
      released.push(id)
    },
    ledger: async () => ledger,
    inUse,
  }
  const result = await reapLeftovers({}, deps)
  // Alive and recent: in use. Dead owner, too old (a leak in a long-running server), or no owner: leftover.
  assert.deepEqual(released.sort(), ["crashed", "legacy", "stale"])
  assert.deepEqual(killed, [])
  assert.deepEqual(result.inUse?.sort(), ["busy", "sbx-busy"])
  assert.match(result.note ?? "", /Left open: 2/)
  // Naming an id releases it even while in use.
  released.length = 0
  await reapLeftovers({ sessionId: "busy" }, deps)
  assert.ok(released.includes("busy"))
})

test("ledger records the owner on remember and drops it on forget", async () => {
  const { mkdtempSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const path = await import("node:path")
  const { forgetLive, isInUse, readLiveLedger, rememberLive } = await import("../src/session-ledger.ts")
  const file = path.join(mkdtempSync(path.join(tmpdir(), "auspex-owner-")), "live.json")
  await rememberLive("browser", "s1", file)
  const ledger = await readLiveLedger(file)
  assert.equal(ledger.owners?.s1?.pid, process.pid)
  assert.equal(isInUse(ledger, "s1"), true)
  await forgetLive("browser", "s1", file)
  assert.equal((await readLiveLedger(file)).owners, undefined)
})
