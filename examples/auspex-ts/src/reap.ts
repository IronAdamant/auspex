import { SolariClient } from "@solarisdk/sdk"
import { packLastReceipts, type PackedReceipt } from "./receipt-pack.ts"
import { BROWSER_API_BASE, fetchWithIdempotencyKey, requireApiKey } from "./solari.ts"
import { forgetLive, readLiveLedger, type LiveLedger } from "./session-ledger.ts"

const HOLDING = new Set(["starting", "running", "paused"])

export type VmRow = { id: string; kind: string; state: string }

export type ReapResult = {
  ok: boolean
  dryRun: boolean
  browsers: string[]
  vms: VmRow[]
  released: string[]
  killed: string[]
  errors: string[]
  packed?: PackedReceipt[]
  packDir?: string
}

export type ReapOpts = {
  dryRun?: boolean
  sessionId?: string
  vmId?: string
  packReceipts?: boolean
}

export type ReapDeps = {
  listVms: () => Promise<VmRow[]>
  deleteVm: (id: string) => Promise<void>
  releaseBrowser: (id: string) => Promise<void>
  ledger?: () => Promise<LiveLedger>
  packReceipts?: () => Promise<{ packDir: string; packed: PackedReceipt[] }>
}

export async function defaultReapDeps(): Promise<ReapDeps> {
  const key = requireApiKey()
  const headers = { Authorization: `Bearer ${key}` }
  const pt = new SolariClient({ apiKey: key, fetch: fetchWithIdempotencyKey() })
  return {
    listVms: async () => {
      const rows: VmRow[] = []
      for (const state of ["starting", "running", "paused"] as const) {
        const page = await pt.sandboxes.list({ state, limit: 100 })
        for (const s of page.sandboxes) {
          rows.push({ id: s.sandboxId, kind: s.kind, state: s.state })
        }
      }
      return rows
    },
    deleteVm: (id) => pt.sandboxes.kill(id),
    releaseBrowser: async (id) => {
      const res = await fetch(`${BROWSER_API_BASE}/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      })
      if (res.status === 404) throw new Error(`browser session refused (404 InvalidSessionId): ${id}`)
      if (!res.ok && res.status !== 204) throw new Error(`browser release ${res.status}`)
    },
    ledger: () => readLiveLedger(),
  }
}

export async function reapLeftovers(opts: ReapOpts = {}, deps?: ReapDeps): Promise<ReapResult> {
  const d = deps ?? (await defaultReapDeps())
  const dryRun = opts.dryRun === true
  const errors: string[] = []
  const released: string[] = []
  const killed: string[] = []
  const ledger = d.ledger ? await d.ledger() : { browser: [], sandbox: [], desktop: [] }
  const browsers = [...new Set([...(opts.sessionId ? [opts.sessionId] : []), ...ledger.browser])]
  let vms = await d.listVms()
  if (opts.vmId) {
    const extra = vms.find((v) => v.id === opts.vmId)
    if (!extra) vms = [...vms, { id: opts.vmId, kind: "sandbox", state: "running" }]
  }
  vms = vms.filter((v) => HOLDING.has(v.state) || v.id === opts.vmId)
  if (!dryRun) {
    for (const id of browsers) {
      try {
        await d.releaseBrowser(id)
        released.push(id)
        await forgetLive("browser", id).catch(() => undefined)
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }
    for (const vm of vms) {
      try {
        await d.deleteVm(vm.id)
        killed.push(vm.id)
        const kind = vm.kind === "desktop" ? "desktop" : "sandbox"
        await forgetLive(kind, vm.id).catch(() => undefined)
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }
  }
  const result: ReapResult = {
    ok: errors.length === 0,
    dryRun,
    browsers,
    vms,
    released,
    killed,
    errors,
  }
  if (opts.packReceipts) {
    try {
      const pack = await (d.packReceipts ?? packLastReceipts)()
      result.packed = pack.packed
      result.packDir = pack.packDir
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(msg)
      result.ok = false
    }
  }
  return result
}
