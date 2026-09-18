import type { Solari, StorageState } from "@solarisdk/browser"
import { ProfileBusyError, withProfileLock } from "./profile-lock.ts"
import { createClient } from "./solari.ts"
import { originHasLandedBytes, originStoreCounts } from "./profile-storage.ts"

export const EMPTY_PROFILE_SEED_ERROR =
  "profile has 0 cookies and 0 origins (empty Save). A version bump with no storage is not a login. Re-login, Save, then retry."

export const EMPTY_PROFILE_SAVE_ERROR =
  "refusing to save an empty storage state over a Solari profile (would wipe cookies)"

export const EMPTY_ORIGIN_SAVE_ERROR =
  "refusing to save: no cookies, localStorage, or sessionStorage landed for the page origin"

export const PROFILE_EDITOR_OPEN_ERROR =
  "profile editor is open; close it, then --save-profile with the live session"

export const HANDOFF_POLL_MS = 2_000
export const AWAIT_LOGIN_DEFAULT_MS = 300_000

export type ProfileSeed = {
  cookies: number
  origins: number
  sessionStorage?: number
}

export type ProfileSaveResult = {
  ok: boolean
  version?: number
  sizeBytes?: number
  cookies: number
  origins: number
  via?: "profiles.save"
  error?: string
}

export type AwaitLoginStatus = "completed" | "timeout" | "empty-save"

export type AwaitLoginResult = {
  status: AwaitLoginStatus
  profileId: string
  name: string
  version: number
  cookies: number
  origins: number
  sessionStorage?: number
  next: string
}

export type AwaitLoginDeps = {
  list: () => Promise<Array<{ id: string; name: string; version?: number }>>
  inspect: (profileId: string, origin?: string) => Promise<ProfileSeed>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export function seedFromStorageState(state: StorageState | null | undefined): ProfileSeed {
  return {
    cookies: (state?.cookies ?? []).filter((c) => Boolean(c?.name)).length,
    origins: (state?.origins ?? []).filter((o) => Boolean(o?.origin)).length,
  }
}

export function isEmptySeed(seed: ProfileSeed): boolean {
  return seed.cookies === 0 && seed.origins === 0
}

export function emptyProfileSeedError(name: string): string {
  const n = name.trim()
  return `profile ${n} ${EMPTY_PROFILE_SEED_ERROR}`
}

export function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

export async function persistLiveProfile(opts: {
  solari: Solari
  profileId: string
  state: StorageState
  sessionId?: string
  origin?: string
  lockName?: string
  lockDir?: string
}): Promise<ProfileSaveResult> {
  const seed = seedFromStorageState(opts.state)
  try {
    return await withProfileLock(
      opts.lockName ?? opts.profileId,
      () =>
        persistProfileState({
          profileId: opts.profileId,
          state: opts.state,
          origin: opts.origin,
          save: (id, state) => opts.solari.profiles.save(id, state),
        }),
      { lockDir: opts.lockDir },
    )
  } catch (err) {
    if (err instanceof ProfileBusyError) {
      return { ok: false, cookies: seed.cookies, origins: seed.origins, error: err.message }
    }
    throw err
  }
}

export async function persistProfileState(opts: {
  profileId: string
  state: StorageState
  save: (id: string, state: StorageState) => Promise<{ version: number; sizeBytes: number }>
  origin?: string
}): Promise<ProfileSaveResult> {
  const seed = seedFromStorageState(opts.state)
  if (isEmptySeed(seed)) {
    return { ok: false, cookies: 0, origins: 0, error: EMPTY_PROFILE_SAVE_ERROR }
  }
  if (opts.origin && !originHasLandedBytes(opts.state, opts.origin)) {
    return { ok: false, ...seed, error: EMPTY_ORIGIN_SAVE_ERROR }
  }
  try {
    const written = await opts.save(opts.profileId, opts.state)
    if (!written.sizeBytes) {
      return {
        ok: false,
        version: written.version,
        sizeBytes: written.sizeBytes,
        cookies: seed.cookies,
        origins: seed.origins,
        via: "profiles.save",
        error: EMPTY_PROFILE_SAVE_ERROR,
      }
    }
    return {
      ok: true,
      version: written.version,
      sizeBytes: written.sizeBytes,
      cookies: seed.cookies,
      origins: seed.origins,
      via: "profiles.save",
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/\b409\b|editor is open/i.test(msg)) {
      return { ok: false, ...seed, error: PROFILE_EDITOR_OPEN_ERROR }
    }
    throw err
  }
}

export async function inspectProfileSeed(
  solari: Solari,
  profileId: string,
  origin?: string,
): Promise<ProfileSeed> {
  const session = await solari.sessions.create({ profileId })
  try {
    const seed = seedFromStorageState(session.storageState)
    if (origin) {
      const counts = originHasLandedBytes(session.storageState, origin)
        ? originStoreCounts(session.storageState, origin)
        : undefined
      if (counts) {
        seed.sessionStorage = counts.sessionStorage
      }
    }
    return seed
  } finally {
    await solari.sessions.releaseAndWait(session.id).catch(() => undefined)
  }
}

function awaitNext(
  status: AwaitLoginStatus,
  profile: { id: string; name: string },
  version: number,
  seed: ProfileSeed,
): string {
  if (status === "completed") {
    let base = `Saved v${version} with ${seed.cookies} cookies and ${seed.origins} origins. Run auspex check with --profile ${profile.name}`
    const hasOrigins = seed.origins > 0 || seed.cookies > 0
    const hasNoSessionStorage = seed.sessionStorage !== undefined && seed.sessionStorage === 0
    if (hasOrigins && hasNoSessionStorage) {
      const profileLc = profile.name.trim().toLowerCase()
      const isConsistencyHub = profileLc === "consistencyhub"
      const looksLikeAppProfile = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(profileLc) && profileLc.length > 3
      if (isConsistencyHub || looksLikeAppProfile) {
        base += `. Warning: profile has cookies/origins but no sessionStorage${isConsistencyHub ? " for consistencyhub.io" : ""}. If this is an auth-gated SaaS, check may still loggedOut. Run check --profile ${profile.name} --sso --save-profile once after human IdP to capture sessionStorage.`
      }
    }
    return base
  }
  if (status === "empty-save") {
    return `Save bumped the profile to v${version} but stored no cookies or origins. Do not reuse --profile ${profile.name} until a non-empty Save.`
  }
  return `No non-empty Save yet for ${profile.name}. Keep the handoff open, Save, then retry auspex_await_login.`
}

export async function waitForProfileSave(
  name: string,
  opts: {
    sinceVersion?: number
    timeoutMs?: number
    deps: AwaitLoginDeps
  },
): Promise<AwaitLoginResult> {
  const want = name.trim()
  if (!want) throw new Error("profile name must be non-empty")
  const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? AWAIT_LOGIN_DEFAULT_MS, 5_000), 600_000)
  const sleepFn = opts.deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const now = opts.deps.now ?? Date.now
  const deadline = now() + timeoutMs
  let profile = (await opts.deps.list()).find((p) => p.name.trim() === want)
  if (!profile) throw new Error(`Solari profile not found: ${want}. Run login --profile ${want} first.`)
  const since = opts.sinceVersion ?? profile.version ?? 0
  let version = profile.version ?? since
  let seed: ProfileSeed = { cookies: 0, origins: 0 }
  let status: AwaitLoginStatus = "timeout"
  const isConsistencyHub = want.toLowerCase() === "consistencyhub"
  const chOrigin = isConsistencyHub ? "https://consistencyhub.io" : undefined
  
  while (now() < deadline) {
    const rows = await opts.deps.list()
    profile = rows.find((p) => p.name.trim() === want)
    if (!profile) throw new Error(`profile ${want} no longer exists`)
    version = profile.version ?? since
    if (version > since) {
      seed = await opts.deps.inspect(profile.id, chOrigin)
      status = isEmptySeed(seed) ? "empty-save" : "completed"
      break
    }
    const remain = deadline - now()
    if (remain <= 0) break
    await sleepFn(Math.min(HANDOFF_POLL_MS, remain))
  }
  return {
    status,
    profileId: profile.id,
    name: profile.name,
    version,
    cookies: seed.cookies,
    origins: seed.origins,
    sessionStorage: seed.sessionStorage,
    next: awaitNext(status, profile, version, seed),
  }
}

export async function liveAwaitLogin(
  name: string,
  opts: { sinceVersion?: number; timeoutMs?: number } = {},
): Promise<AwaitLoginResult> {
  const solari = createClient()
  try {
    return await waitForProfileSave(name, {
      sinceVersion: opts.sinceVersion,
      timeoutMs: opts.timeoutMs,
      deps: {
        list: async () =>
          (await solari.profiles.list()).map((p) => ({
            id: p.id,
            name: p.name,
            version: asFiniteNumber((p as { version?: unknown }).version),
          })),
        inspect: (id) => inspectProfileSeed(solari, id),
      },
    })
  } finally {
    await solari.close().catch(() => undefined)
  }
}
