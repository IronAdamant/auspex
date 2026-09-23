import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { SolariClient } from "@solarisdk/sdk"
import { packageRoot } from "./paths.ts"
import { listCompleteRunDirs, RUNS_DIR } from "./receipt.ts"
import { receiptUrlKey } from "./receipt-diff.ts"
import { BROWSER_API_BASE, fetchWithIdempotencyKey, requireApiKey } from "./solari.ts"
import { forgetLive, readLiveLedger, type LiveLedger } from "./session-ledger.ts"

export type PackedReceipt = {
  url: string
  expect?: string
  reason?: string
  screenshotPath: string
  manifestPath: string
  runDir: string
}

function relToPackage(abs: string): string {
  return path.relative(packageRoot, abs).replaceAll("\\", "/")
}

export function packDirRoot(): string {
  return path.join(packageRoot, ".auspex", "pack")
}

/** Copy last complete receipt per URL for an agent to attach to a PR. */
export async function packLastReceipts(opts?: {
  destDir?: string
  runsDir?: string
}): Promise<{ packDir: string; packed: PackedReceipt[] }> {
  const runsDir = opts?.runsDir ?? RUNS_DIR
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const packDir = opts?.destDir ?? path.join(packDirRoot(), stamp)
  await mkdir(packDir, { recursive: true })
  const dirs = await listCompleteRunDirs(runsDir)
  const chosen: string[] = []
  const seenUrl = new Set<string>()
  for (const dir of dirs) {
    const raw = await readFile(path.join(dir, "manifest.json"), "utf8").catch(() => "")
    let manifest: Record<string, unknown> = {}
    try {
      manifest = JSON.parse(raw) as Record<string, unknown>
    } catch {
      manifest = {}
    }
    const key = receiptUrlKey(manifest)
    if (!key) continue
    if (seenUrl.has(key)) continue
    seenUrl.add(key)
    chosen.push(dir)
  }
  const packed: PackedReceipt[] = []
  for (const dir of chosen) {
    const dest = path.join(packDir, path.basename(dir))
    await mkdir(dest, { recursive: true })
    const manifestAbs = path.join(dest, "manifest.json")
    const shotAbs = path.join(dest, "screenshot.png")
    await copyFile(path.join(dir, "manifest.json"), manifestAbs)
    await copyFile(path.join(dir, "screenshot.png"), shotAbs)
    const raw = await readFile(manifestAbs, "utf8")
    let manifest: Record<string, unknown> = {}
    try {
      manifest = JSON.parse(raw) as Record<string, unknown>
    } catch {
      manifest = {}
    }
    packed.push({
      url:
        (typeof manifest.url === "string" && manifest.url) ||
        (typeof manifest.finalUrl === "string" && manifest.finalUrl) ||
        "",
      expect: typeof manifest.expect === "string" ? manifest.expect : undefined,
      reason: typeof manifest.reason === "string" ? manifest.reason : undefined,
      screenshotPath: relToPackage(shotAbs),
      manifestPath: relToPackage(manifestAbs),
      runDir: relToPackage(dest),
    })
  }
  await writeFile(path.join(packDir, "index.json"), `${JSON.stringify({ packed }, null, 2)}\n`)
  return { packDir: relToPackage(packDir), packed }
}

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
  accountWide?: boolean
}

export type ReapOpts = {
  dryRun?: boolean
  sessionId?: string
  vmId?: string
  packReceipts?: boolean
  accountWide?: boolean
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

function ledgerVms(ledger: LiveLedger, extraVmId?: string): VmRow[] {
  const rows: VmRow[] = [
    ...ledger.sandbox.map((id) => ({ id, kind: "sandbox", state: "running" })),
    ...ledger.desktop.map((id) => ({ id, kind: "desktop", state: "running" })),
  ]
  if (extraVmId && !rows.some((v) => v.id === extraVmId)) {
    rows.push({ id: extraVmId, kind: "sandbox", state: "running" })
  }
  return rows
}

export async function reapLeftovers(opts: ReapOpts = {}, deps?: ReapDeps): Promise<ReapResult> {
  const d = deps ?? (await defaultReapDeps())
  const dryRun = opts.dryRun === true
  const accountWide = opts.accountWide === true
  const errors: string[] = []
  const released: string[] = []
  const killed: string[] = []
  const ledger = d.ledger ? await d.ledger() : { browser: [], sandbox: [], desktop: [] }
  const browsers = [...new Set([...(opts.sessionId ? [opts.sessionId] : []), ...ledger.browser])]
  let vms: VmRow[]
  if (accountWide) {
    vms = await d.listVms()
    if (opts.vmId) {
      const extra = vms.find((v) => v.id === opts.vmId)
      if (!extra) vms = [...vms, { id: opts.vmId, kind: "sandbox", state: "running" }]
    }
    vms = vms.filter((v) => HOLDING.has(v.state) || v.id === opts.vmId)
  } else {
    vms = ledgerVms(ledger, opts.vmId)
  }
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
    accountWide,
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
