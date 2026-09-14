import { randomBytes } from "node:crypto"
import { open, mkdir, readFile, rename, stat, unlink } from "node:fs/promises"
import type { FileHandle } from "node:fs/promises"
import path from "node:path"
import { packageRoot } from "./paths.ts"
import { requireProfileName } from "./profiles.ts"

export const PROFILE_BUSY_CODE = "ProfileBusy"

export class ProfileBusyError extends Error {
  readonly code = PROFILE_BUSY_CODE
  readonly profile: string

  constructor(profile: string) {
    super(
      `profile ${profile} is locked by another Auspex process (refusing to save over it). Do not retry in a loop.`,
    )
    this.name = "ProfileBusyError"
    this.profile = profile
  }
}

export function defaultLockDir(): string {
  return path.join(packageRoot, ".auspex", "locks")
}

export function lockFileName(profile: string): string {
  const safe = requireProfileName(profile).replace(/[^A-Za-z0-9._-]+/g, "_")
  return `${safe}.lock`
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

async function stealIfDead(lockPath: string): Promise<boolean> {
  try {
    const st1 = await stat(lockPath)
    const raw = await readFile(lockPath, "utf8")
    const pid = Number((raw.split("\n")[0] ?? "").trim())
    if (pidAlive(pid)) return false
    const st2 = await stat(lockPath)
    if (st1.ino !== st2.ino || st1.mtimeMs !== st2.mtimeMs || st1.size !== st2.size) {
      return false
    }
    const trash = `${lockPath}.${process.pid}.${randomBytes(6).toString("hex")}`
    await rename(lockPath, trash)
    await unlink(trash).catch(() => undefined)
    return true
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : ""
    if (code === "ENOENT") return true
    return false
  }
}

export type ProfileLockOpts = {
  lockDir?: string
}

/**
 * Exclusive lock for one named profile so two agents cannot wipe the same seed.
 * Fail closed on contention (no wait loop). A lock whose PID is dead is stolen.
 */
export async function withProfileLock<T>(
  profile: string,
  work: () => Promise<T>,
  opts: ProfileLockOpts = {},
): Promise<T> {
  const name = requireProfileName(profile)
  const dir = opts.lockDir ?? defaultLockDir()
  await mkdir(dir, { recursive: true })
  const lockPath = path.join(dir, lockFileName(name))
  let fh: FileHandle | undefined
  try {
    fh = await open(lockPath, "wx")
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : ""
    if (code !== "EEXIST") throw err
    if (await stealIfDead(lockPath)) {
      try {
        fh = await open(lockPath, "wx")
      } catch (retryErr) {
        const retryCode =
          retryErr && typeof retryErr === "object" && "code" in retryErr
            ? String((retryErr as { code?: unknown }).code)
            : ""
        if (retryCode === "EEXIST") throw new ProfileBusyError(name)
        throw retryErr
      }
    } else {
      throw new ProfileBusyError(name)
    }
  }
  try {
    await fh.writeFile(`${process.pid}\n${Date.now()}\n`)
    return await work()
  } finally {
    await fh.close().catch(() => undefined)
    await unlink(lockPath).catch(() => undefined)
  }
}

/** True when a live process holds the lock file. Used by tests. */
export async function profileLockHeld(lockPath: string): Promise<boolean> {
  try {
    await stat(lockPath)
    return true
  } catch {
    return false
  }
}
