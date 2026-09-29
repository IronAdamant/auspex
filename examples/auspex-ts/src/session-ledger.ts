import { randomBytes } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { stateDir } from "./paths.ts"

export type LiveKind = "browser" | "sandbox" | "desktop"

/** Which process opened a session, and when. Ids without an owner (older ledgers) count as leftovers. */
export type LiveOwner = { pid: number; at: number }

export type LiveLedger = {
  browser: string[]
  sandbox: string[]
  desktop: string[]
  /** Keyed by session or VM id. Optional, so a ledger from an older release still reads. */
  owners?: Record<string, LiveOwner>
}

export const LIVE_LEDGER_PATH = path.join(stateDir, "live.json")

/**
 * Longest a real Auspex session stays open: a finalize check with SSO is 5 minutes. Past this, a
 * session is a leftover even when its process is alive (a long-running MCP server that leaked it).
 */
export const IN_USE_MAX_MS = 10 * 60 * 1000

function empty(): LiveLedger {
  return { browser: [], sandbox: [], desktop: [] }
}

function readOwners(raw: unknown): Record<string, LiveOwner> {
  const out: Record<string, LiveOwner> = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out
  for (const [id, row] of Object.entries(raw as Record<string, unknown>)) {
    const r = row as { pid?: unknown; at?: unknown } | null
    if (r && Number.isInteger(r.pid) && typeof r.at === "number" && Number.isFinite(r.at)) {
      out[id] = { pid: r.pid as number, at: r.at }
    }
  }
  return out
}

export async function readLiveLedger(file = LIVE_LEDGER_PATH): Promise<LiveLedger> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<LiveLedger>
    const owners = readOwners(parsed.owners)
    return {
      browser: Array.isArray(parsed.browser) ? parsed.browser.filter(Boolean) : [],
      sandbox: Array.isArray(parsed.sandbox) ? parsed.sandbox.filter(Boolean) : [],
      desktop: Array.isArray(parsed.desktop) ? parsed.desktop.filter(Boolean) : [],
      ...(Object.keys(owners).length ? { owners } : {}),
    }
  } catch {
    return empty()
  }
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM: the process exists but belongs to another user. Still alive.
    return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "EPERM")
  }
}

/**
 * A session another running Auspex command is still using: its process is alive and it was opened
 * less than IN_USE_MAX_MS ago. reap leaves these alone. Everything else is a leftover.
 */
export function isInUse(
  ledger: LiveLedger,
  id: string,
  nowMs: number = Date.now(),
  alive: (pid: number) => boolean = pidAlive,
): boolean {
  const owner = ledger.owners?.[id]
  if (!owner) return false
  return nowMs - owner.at < IN_USE_MAX_MS && alive(owner.pid)
}

/** Temp file then rename: a reader never sees half a ledger (which it would read as empty and then overwrite). */
async function writeLiveLedger(ledger: LiveLedger, file = LIVE_LEDGER_PATH): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${randomBytes(3).toString("hex")}.tmp`
  await writeFile(tmp, `${JSON.stringify(ledger, null, 2)}\n`)
  await rename(tmp, file)
}

// One read-modify-write at a time in this process. Parallel tool calls otherwise interleave and
// drop an id, and reap can no longer find that browser.
let queue: Promise<unknown> = Promise.resolve()
function serialized<T>(step: () => Promise<T>): Promise<T> {
  const run = queue.then(step, step)
  queue = run.catch(() => undefined)
  return run
}

export async function rememberLive(kind: LiveKind, id: string, file = LIVE_LEDGER_PATH): Promise<void> {
  if (!id) return
  await serialized(async () => {
    const ledger = await readLiveLedger(file)
    if (!ledger[kind].includes(id)) ledger[kind].push(id)
    ledger.owners = { ...(ledger.owners ?? {}), [id]: { pid: process.pid, at: Date.now() } }
    await writeLiveLedger(ledger, file)
  })
}

export async function forgetLive(kind: LiveKind, id: string, file = LIVE_LEDGER_PATH): Promise<void> {
  if (!id) return
  await serialized(async () => {
    const ledger = await readLiveLedger(file)
    ledger[kind] = ledger[kind].filter((x) => x !== id)
    if (ledger.owners?.[id]) {
      const { [id]: _gone, ...rest } = ledger.owners
      ledger.owners = rest
    }
    if (ledger.owners && Object.keys(ledger.owners).length === 0) delete ledger.owners
    await writeLiveLedger(ledger, file)
  })
}
