/** Signal a running await to POST editor/save. Does not kill that process. */

import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { packageRoot } from "./paths.ts"
import { requireProfileName } from "./profile-slug.ts"

export type SaveWaiter = { pid: number; profile: string }

export function saveDrainDir(root = packageRoot): string {
  return path.join(root, ".auspex", "save-drain")
}

function waiterPath(profile: string, root?: string): string {
  return path.join(saveDrainDir(root), `${requireProfileName(profile)}.waiter.json`)
}

function signalPath(profile: string, root?: string): string {
  return path.join(saveDrainDir(root), `${requireProfileName(profile)}.signal.json`)
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Live waiter, including this process. A dead pid is not a waiter. */
export async function readSaveWaiter(profile: string, root?: string): Promise<SaveWaiter | undefined> {
  try {
    const raw = JSON.parse(await readFile(waiterPath(profile, root), "utf8")) as { pid?: unknown; profile?: unknown }
    const pid = typeof raw.pid === "number" ? raw.pid : 0
    if (!pidAlive(pid)) return undefined
    const name = typeof raw.profile === "string" && raw.profile.trim() ? raw.profile.trim() : requireProfileName(profile)
    return { pid, profile: name }
  } catch {
    return undefined
  }
}

export function waiterIsOtherProcess(waiter: SaveWaiter | undefined): boolean {
  return Boolean(waiter && waiter.pid !== process.pid)
}

async function writeWaiterFile(file: string, profile: string): Promise<void> {
  const fh = await open(file, "wx")
  try {
    await fh.writeFile(JSON.stringify({ pid: process.pid, profile }))
  } finally {
    await fh.close()
  }
}

/**
 * Claim the waiter slot for this process. Another live pid returns ok false.
 * A dead pid file is removed once and the claim is retried.
 */
export async function registerSaveWaiter(
  profile: string,
  root?: string,
): Promise<{ ok: true; release: () => Promise<void> } | { ok: false }> {
  const name = requireProfileName(profile)
  const file = waiterPath(name, root)
  await mkdir(path.dirname(file), { recursive: true })
  const existing = await readSaveWaiter(name, root)
  if (waiterIsOtherProcess(existing)) return { ok: false }
  if (existing && existing.pid === process.pid) {
    return { ok: true, release: async () => unlink(file).catch(() => undefined) }
  }
  try {
    await writeWaiterFile(file, name)
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : ""
    if (code !== "EEXIST") throw err
    const again = await readSaveWaiter(name, root)
    if (waiterIsOtherProcess(again)) return { ok: false }
    if (again && again.pid === process.pid) {
      return { ok: true, release: async () => unlink(file).catch(() => undefined) }
    }
    await unlink(file).catch(() => undefined)
    await writeWaiterFile(file, name)
  }
  return { ok: true, release: async () => unlink(file).catch(() => undefined) }
}

/** Tell the waiter to POST editor/save. Overwrites a previous signal. Does not signal the waiter pid. */
export async function signalSaveDrain(profile: string, root?: string, source = "paste"): Promise<void> {
  const file = signalPath(profile, root)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ at: new Date().toISOString(), source }), "utf8")
}

/** True once, then the signal file is gone. */
export async function consumeSaveDrain(profile: string, root?: string): Promise<boolean> {
  const file = signalPath(profile, root)
  try {
    await readFile(file, "utf8")
  } catch {
    return false
  }
  await unlink(file).catch(() => undefined)
  return true
}

export function saveSignaledNext(profile: string): string {
  const name = profile.trim() || "<name>"
  return (
    `status save-signaled: told the running await-login for ${name} to POST Solari editor/save now. ` +
    `Do not kill that process. Do not run await-login again. Do not remint. ` +
    `Clipboard Save is not the jar. The running await prints the receipt. ` +
    `A failed save does not claim cookies.`
  )
}
