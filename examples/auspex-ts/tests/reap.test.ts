import assert from "node:assert/strict"
import test from "node:test"
import { reapLeftovers } from "../src/reap.ts"

test("reapLeftovers dry-run lists without deleting", async () => {
  let deleted = 0
  let released = 0
  const result = await reapLeftovers(
    { dryRun: true, sessionId: "sess-extra" },
    {
      listVms: async () => [{ id: "sbx-1", kind: "sandbox", state: "running" }],
      deleteVm: async () => {
        deleted += 1
      },
      releaseBrowser: async () => {
        released += 1
      },
      ledger: async () => ({ browser: ["sess-ledger"], sandbox: [], desktop: [] }),
    },
  )
  assert.equal(result.ok, true)
  assert.equal(result.dryRun, true)
  assert.ok(result.browsers.includes("sess-extra"))
  assert.ok(result.browsers.includes("sess-ledger"))
  assert.equal(result.vms.length, 1)
  assert.equal(deleted, 0)
  assert.equal(released, 0)
})

test("reapLeftovers releases browsers and kills holding VMs", async () => {
  const released: string[] = []
  const killed: string[] = []
  const result = await reapLeftovers(
    {},
    {
      listVms: async () => [
        { id: "sbx-run", kind: "sandbox", state: "running" },
        { id: "desk-1", kind: "desktop", state: "paused" },
        { id: "gone", kind: "sandbox", state: "gone" },
      ],
      deleteVm: async (id) => {
        killed.push(id)
      },
      releaseBrowser: async (id) => {
        released.push(id)
      },
      ledger: async () => ({ browser: ["b1"], sandbox: [], desktop: [] }),
    },
  )
  assert.equal(result.ok, true)
  assert.deepEqual(released, ["b1"])
  assert.deepEqual(killed.sort(), ["desk-1", "sbx-run"])
})

test("reapLeftovers records per-id failures without throwing", async () => {
  const result = await reapLeftovers(
    { sessionId: "sess-bad" },
    {
      listVms: async () => [{ id: "sbx-bad", kind: "sandbox", state: "running" }],
      deleteVm: async () => {
        throw new Error("vm boom")
      },
      releaseBrowser: async () => {
        throw new Error("browser boom")
      },
      ledger: async () => ({ browser: [], sandbox: [], desktop: [] }),
    },
  )
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => /browser boom/))
  assert.ok(result.errors.some((e) => /vm boom/))
})

test("reapLeftovers packReceipts attaches last receipts without extra deletes", async () => {
  let deleted = 0
  const result = await reapLeftovers(
    { dryRun: true, packReceipts: true },
    {
      listVms: async () => [],
      deleteVm: async () => {
        deleted += 1
      },
      releaseBrowser: async () => undefined,
      ledger: async () => ({ browser: [], sandbox: [], desktop: [] }),
      packReceipts: async () => ({
        packDir: ".auspex/pack/stamp",
        packed: [
          {
            url: "https://ironadamant.com",
            expect: "One office job.",
            reason: "matched",
            screenshotPath: ".auspex/pack/stamp/run/screenshot.png",
            manifestPath: ".auspex/pack/stamp/run/manifest.json",
            runDir: ".auspex/pack/stamp/run",
          },
        ],
      }),
    },
  )
  assert.equal(result.ok, true)
  assert.equal(deleted, 0)
  assert.equal(result.packDir, ".auspex/pack/stamp")
  assert.equal(result.packed?.[0]?.url, "https://ironadamant.com")
})
