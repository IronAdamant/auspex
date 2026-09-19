import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export async function ensureRunDir(): Promise<string> {
  const auspexDir = path.join(packageRoot, ".auspex")
  const runsDir = path.join(auspexDir, "runs")
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5)
  const runDir = path.join(runsDir, stamp)
  await mkdir(runDir, { recursive: true })
  return runDir
}
