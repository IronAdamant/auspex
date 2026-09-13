import { readFileSync } from "node:fs"
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { packageRoot } from "./check.ts"

export const ASSERT_RECEIPT_PY_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "assert_receipt.py")
export const RECEIPT_ASSERT_PY = readFileSync(ASSERT_RECEIPT_PY_PATH, "utf8")
export const RUNS_DIR = path.join(packageRoot, ".auspex", "runs")

export function assertRunDirUnderRuns(runDir: string, runsDir = RUNS_DIR): string {
  const dir = path.resolve(runDir)
  const root = path.resolve(runsDir)
  if (dir !== root && !dir.startsWith(root + path.sep)) {
    throw new Error("runDir must be under .auspex/runs")
  }
  return dir
}

export async function findLatestRun(runsDir = RUNS_DIR): Promise<string> {
  let names: string[]
  try {
    names = await readdir(runsDir)
  } catch {
    throw new Error(`no Auspex runs in ${runsDir}. Run check first.`)
  }
  const dirs = []
  for (const name of names.sort().reverse()) {
    const dir = path.join(runsDir, name)
    const st = await stat(dir).catch(() => undefined)
    if (!st?.isDirectory()) continue
    dirs.push(dir)
  }
  for (const dir of dirs) {
    try {
      await stat(path.join(dir, "manifest.json"))
      await stat(path.join(dir, "screenshot.png"))
      return dir
    } catch {
      continue
    }
  }
  throw new Error(`no complete run (manifest.json + screenshot.png) in ${runsDir}`)
}

export async function loadRunFiles(runDir: string): Promise<{ manifest: string; png: Buffer }> {
  const manifest = await readFile(path.join(runDir, "manifest.json"), "utf8")
  const png = await readFile(path.join(runDir, "screenshot.png"))
  return { manifest, png }
}
