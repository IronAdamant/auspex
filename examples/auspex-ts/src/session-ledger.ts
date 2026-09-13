import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

export type LiveKind = "browser" | "sandbox" | "desktop"

export type LiveLedger = {
  browser: string[]
  sandbox: string[]
  desktop: string[]
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const LIVE_LEDGER_PATH = path.join(packageRoot, ".auspex", "live.json")

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

async function writeLiveLedger(ledger: LiveLedger, file = LIVE_LEDGER_PATH): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(ledger, null, 2)}\n`)
}

export async function rememberLive(kind: LiveKind, id: string, file = LIVE_LEDGER_PATH): Promise<void> {
  if (!id) return
  const ledger = await readLiveLedger(file)
  if (!ledger[kind].includes(id)) ledger[kind].push(id)
  await writeLiveLedger(ledger, file)
}

export async function forgetLive(kind: LiveKind, id: string, file = LIVE_LEDGER_PATH): Promise<void> {
  if (!id) return
  const ledger = await readLiveLedger(file)
  ledger[kind] = ledger[kind].filter((x) => x !== id)
  await writeLiveLedger(ledger, file)
}
