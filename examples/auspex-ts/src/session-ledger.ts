import { randomBytes } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { stateDir } from "./paths.ts"

export type LiveKind = "browser" | "sandbox" | "desktop"

export type LiveLedger = {
  browser: string[]
  sandbox: string[]
  desktop: string[]
}

export const LIVE_LEDGER_PATH = path.join(stateDir, "live.json")

function empty(): LiveLedger {
  return { browser: [], sandbox: [], desktop: [] }
}

export async function readLiveLedger(file = LIVE_LEDGER_PATH): Promise<LiveLedger> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<LiveLedger>
    return {
      browser: Array.isArray(parsed.browser) ? parsed.browser.filter(Boolean) : [],
      sandbox: Array.isArray(parsed.sandbox) ? parsed.sandbox.filter(Boolean) : [],
      desktop: Array.isArray(parsed.desktop) ? parsed.desktop.filter(Boolean) : [],
    }
  } catch {
    return empty()
  }
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
    await writeLiveLedger(ledger, file)
  })
}

export async function forgetLive(kind: LiveKind, id: string, file = LIVE_LEDGER_PATH): Promise<void> {
  if (!id) return
  await serialized(async () => {
    const ledger = await readLiveLedger(file)
    ledger[kind] = ledger[kind].filter((x) => x !== id)
    await writeLiveLedger(ledger, file)
  })
}
