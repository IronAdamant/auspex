/** One owner for editor/save. A second waiter is sibling-saved, not stream-expired. */

import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { packageRoot } from "./paths.ts"
import { requireProfileName } from "./profile-slug.ts"

export const SIBLING_SAVED_STATUS = "sibling-saved"

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

export type SaveOwnerPhase = "posting" | "saved" | "failed"

export type SaveOwner = {
  pid: number
  profile: string
  phase: SaveOwnerPhase
  status?: number
}

function ownerPath(profile: string, root?: string): string {
  return path.join(saveDrainDir(root), `${requireProfileName(profile)}.owner.json`)
}

function saveLockPath(profile: string, root?: string): string {
  return path.join(saveDrainDir(root), `${requireProfileName(profile)}.save.lock`)
}

async function readLockPid(file: string): Promise<number> {
  try {
    const pid = Number((await readFile(file, "utf8")).split("\n")[0]?.trim() ?? "")
    return Number.isInteger(pid) && pid > 0 ? pid : 0
  } catch {
    return 0
  }
}

export async function readSaveOwner(profile: string, root?: string): Promise<SaveOwner | undefined> {
  try {
    const raw = JSON.parse(await readFile(ownerPath(profile, root), "utf8")) as {
      pid?: unknown
      profile?: unknown
      phase?: unknown
      status?: unknown
    }
    const pid = typeof raw.pid === "number" ? raw.pid : 0
    const phase = raw.phase
    if (!Number.isInteger(pid) || pid <= 0) return undefined
    if (phase !== "posting" && phase !== "saved" && phase !== "failed") return undefined
    const name = typeof raw.profile === "string" && raw.profile.trim() ? raw.profile.trim() : requireProfileName(profile)
    const status = typeof raw.status === "number" && Number.isFinite(raw.status) ? raw.status : undefined
    return { pid, profile: name, phase, ...(status !== undefined ? { status } : {}) }
  } catch {
    return undefined
  }
}

/**
 * True when another path already posted editor/save or still holds that POST.
 * A failed attempt does not count. A dead pid that already wrote `posting` or `saved` still counts:
 * this process must not POST again and must not call the JWT dead.
 */
export async function siblingOwnsSave(profile: string, root?: string): Promise<boolean> {
  const owner = await readSaveOwner(profile, root)
  if (owner?.phase === "saved") return true
  if (owner?.phase === "posting" && owner.pid !== process.pid) return true
  const lockPid = await readLockPid(saveLockPath(profile, root))
  return lockPid !== process.pid && pidAlive(lockPid)
}

async function writeOwner(file: string, profile: string, phase: SaveOwnerPhase, status?: number): Promise<void> {
  const body = {
    pid: process.pid,
    profile,
    phase,
    at: new Date().toISOString(),
    ...(status !== undefined ? { status } : {}),
  }
  await writeFile(file, JSON.stringify(body), "utf8")
}

async function acquireSaveLock(file: string): Promise<boolean> {
  await mkdir(path.dirname(file), { recursive: true })
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fh = await open(file, "wx")
      try {
        await fh.writeFile(`${process.pid}\n`)
      } finally {
        await fh.close()
      }
      return true
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : ""
      if (code !== "EEXIST") throw err
      const pid = await readLockPid(file)
      if (pidAlive(pid)) return false
      await unlink(file).catch(() => undefined)
    }
  }
  return false
}

async function releaseSaveLock(file: string): Promise<void> {
  if ((await readLockPid(file)) !== process.pid) return
  await unlink(file).catch(() => undefined)
}

export type SaveOwnerClaim =
  | { ok: true; finish: (phase: "saved" | "failed", status?: number) => Promise<void>; release: () => Promise<void> }
  | { ok: false; sibling: true }

/** Exclusive editor/save claim. The loser does not POST. Outcome stays after release. */
export async function claimSaveOwner(profile: string, root?: string): Promise<SaveOwnerClaim> {
  const name = requireProfileName(profile)
  if (await siblingOwnsSave(name, root)) return { ok: false, sibling: true }
  const lock = saveLockPath(name, root)
  const file = ownerPath(name, root)
  if (!(await acquireSaveLock(lock))) return { ok: false, sibling: true }
  const owner = await readSaveOwner(name, root)
  if (owner && (owner.phase === "saved" || owner.phase === "posting")) {
    await releaseSaveLock(lock)
    return { ok: false, sibling: true }
  }
  await writeOwner(file, name, "posting")
  let released = false
  return {
    ok: true,
    finish: async (phase, status) => {
      await writeOwner(file, name, phase, status)
    },
    release: async () => {
      if (released) return
      released = true
      await releaseSaveLock(lock)
    },
  }
}

/** New login handoff. A live Save lock is left alone. */
export async function clearSaveOwner(profile: string, root?: string): Promise<void> {
  const name = requireProfileName(profile)
  const lock = saveLockPath(name, root)
  if (pidAlive(await readLockPid(lock))) return
  await unlink(ownerPath(name, root)).catch(() => undefined)
  await unlink(lock).catch(() => undefined)
}

export function siblingSavedNext(profile: string): string {
  const name = profile.trim() || "<name>"
  return (
    `status sibling-saved: another Auspex path already owns editor/save for ${name} (posted or in flight). ` +
    `This process did not POST editor/save and did not read the jar. Do not call this stream-expired. ` +
    `The VNC JWT was not the failure. Auspex cannot extend it (POST /editor/token has no TTL). ` +
    `Do not remint. Do not kill the other path. Do not POST again. ` +
    `Read that path's receipt. A failed save does not claim cookies. This path does not claim cookies either.`
  )
}

/** Host advise must not replace this stop with a remint nextCall. */
export function presentSiblingSaved<T extends { status?: string; next?: string; nextCall?: unknown }>(
  stamped: T,
  raw: { status?: string; next?: string },
): T {
  if (raw.status !== SIBLING_SAVED_STATUS) return stamped
  const copy = { ...stamped, status: SIBLING_SAVED_STATUS, next: raw.next ?? stamped.next }
  delete copy.nextCall
  return copy
}
