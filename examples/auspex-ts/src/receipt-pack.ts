import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { packageRoot } from "./paths.ts"
import { listCompleteRunDirs, RUNS_DIR } from "./receipt.ts"
import { receiptUrlKey } from "./receipt-diff.ts"

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
