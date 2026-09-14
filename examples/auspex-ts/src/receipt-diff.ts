import { readFile } from "node:fs/promises"
import path from "node:path"
import { listCompleteRunDirs, RUNS_DIR } from "./receipt.ts"

export type ReceiptDiff = {
  previousRunDir?: string
  previousUrl?: string
  previousExcerpt?: string
  previousReason?: string
  urlChanged: boolean
  excerptChanged: boolean
  sameUrl: boolean
}

export function canonicalCheckUrl(url: string): string {
  const u = new URL(url)
  const host = u.hostname.toLowerCase()
  const pathName = (u.pathname.replace(/\/+$/, "") || "/") || "/"
  return `${u.protocol}//${host}${pathName}`
}

export function receiptUrlKey(manifest: { url?: unknown; finalUrl?: unknown }): string | undefined {
  const raw =
    typeof manifest.url === "string" && manifest.url
      ? manifest.url
      : typeof manifest.finalUrl === "string"
        ? manifest.finalUrl
        : undefined
  if (!raw) return undefined
  try {
    return canonicalCheckUrl(raw)
  } catch {
    return raw
  }
}

async function readManifest(dir: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await readFile(path.join(dir, "manifest.json"), "utf8")
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

export async function findPreviousReceiptForUrl(opts: {
  url: string
  runsDir?: string
  excludeDir?: string
}): Promise<{ dir: string; manifest: Record<string, unknown> } | undefined> {
  let want: string
  try {
    want = canonicalCheckUrl(opts.url)
  } catch {
    return undefined
  }
  const dirs = await listCompleteRunDirs(opts.runsDir ?? RUNS_DIR)
  const exclude = opts.excludeDir ? path.resolve(opts.excludeDir) : undefined
  for (const dir of dirs) {
    if (exclude && path.resolve(dir) === exclude) continue
    const manifest = await readManifest(dir)
    if (!manifest) continue
    const key = receiptUrlKey(manifest)
    if (key === want) return { dir, manifest }
  }
  return undefined
}

export async function diffAgainstLastReceipt(opts: {
  url: string
  excerpt: string
  finalUrl?: string
  runsDir?: string
  excludeDir?: string
}): Promise<ReceiptDiff> {
  const previous = await findPreviousReceiptForUrl(opts)
  if (!previous) {
    return { urlChanged: false, excerptChanged: false, sameUrl: false }
  }
  const previousUrl =
    typeof previous.manifest.finalUrl === "string"
      ? previous.manifest.finalUrl
      : typeof previous.manifest.url === "string"
        ? previous.manifest.url
        : undefined
  const previousExcerpt = typeof previous.manifest.excerpt === "string" ? previous.manifest.excerpt : undefined
  const previousReason = typeof previous.manifest.reason === "string" ? previous.manifest.reason : undefined
  const landed = opts.finalUrl || opts.url
  let urlChanged = false
  if (previousUrl && landed) {
    try {
      urlChanged = canonicalCheckUrl(previousUrl) !== canonicalCheckUrl(landed)
    } catch {
      urlChanged = previousUrl !== landed
    }
  }
  const excerptChanged = (previousExcerpt ?? "") !== (opts.excerpt ?? "")
  return {
    previousRunDir: previous.dir,
    previousUrl,
    previousExcerpt,
    previousReason,
    urlChanged,
    excerptChanged,
    sameUrl: true,
  }
}
