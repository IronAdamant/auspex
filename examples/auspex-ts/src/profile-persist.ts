import type { Solari, StorageState } from "@solarisdk/browser"
import { BROWSER_API_BASE, createClient, requireApiKey } from "./solari.ts"

export const EMPTY_PROFILE_SEED_ERROR =
  "profile has 0 cookies and 0 origins (empty Save). A version bump with no storage is not a login. Re-login, Save, then retry."

export const EMPTY_PROFILE_SAVE_ERROR =
  "refusing to save an empty storage state over a Solari profile (would wipe cookies)"

export const HANDOFF_POLL_MS = 2_000
export const AWAIT_LOGIN_DEFAULT_MS = 300_000

export type ProfileSeed = {
  cookies: number
  origins: number
}

export type PersistHttp = {
  post: (path: string, body: unknown) => Promise<Record<string, unknown>>
}

export type ProfileSaveResult = {
  ok: boolean
  version?: number
  sizeBytes?: number
  cookies: number
  origins: number
  via?: "save-profile" | "profiles.save"
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
  next: string
}

export type AwaitLoginDeps = {
  list: () => Promise<Array<{ id: string; name: string; version?: number }>>
  inspect: (profileId: string) => Promise<ProfileSeed>
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

function seedFromSaveBody(json: Record<string, unknown>, fallback: ProfileSeed): ProfileSeed {
  const cookies =
    asFiniteNumber(json.cookies) ?? asFiniteNumber(json.cookieCount) ?? fallback.cookies
  const origins = asFiniteNumber(json.origins) ?? asFiniteNumber(json.originCount) ?? fallback.origins
  return { cookies, origins }
}

function saveProfileFallbackAllowed(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /\b404\b|\b501\b|not found/i.test(msg)
}

export async function persistLiveProfile(opts: {
  solari: Solari
  profileId: string
  sessionId: string
  state: StorageState
  http?: PersistHttp
}): Promise<ProfileSaveResult> {
  return persistProfileState({
    profileId: opts.profileId,
    sessionId: opts.sessionId,
    state: opts.state,
    http: opts.http ?? (await defaultSaveProfileHttp()),
    save: (id, state) => opts.solari.profiles.save(id, state),
  })
}

export async function persistProfileState(opts: {
  profileId: string
  sessionId: string
  state: StorageState
  http: PersistHttp
  save: (id: string, state: StorageState) => Promise<{ version: number; sizeBytes: number }>
}): Promise<ProfileSaveResult> {
  const seed = seedFromStorageState(opts.state)
  if (isEmptySeed(seed)) {
    return { ok: false, cookies: 0, origins: 0, error: EMPTY_PROFILE_SAVE_ERROR }
  }
  try {
    const json = await opts.http.post(
      `/sessions/${encodeURIComponent(opts.sessionId)}/save-profile`,
      { profileId: opts.profileId },
    )
    const saved = seedFromSaveBody(json, seed)
    if (isEmptySeed(saved)) {
      return { ok: false, ...saved, via: "save-profile", error: EMPTY_PROFILE_SAVE_ERROR }
    }
    return {
      ok: true,
      version: asFiniteNumber(json.version),
      sizeBytes: asFiniteNumber(json.sizeBytes),
      cookies: saved.cookies,
      origins: saved.origins,
      via: "save-profile",
    }
  } catch (err) {
    if (!saveProfileFallbackAllowed(err)) throw err
    const written = await opts.save(opts.profileId, opts.state)
    return {
      ok: true,
      version: written.version,
      sizeBytes: written.sizeBytes,
      cookies: seed.cookies,
      origins: seed.origins,
      via: "profiles.save",
    }
  }
}

export async function inspectProfileSeed(solari: Solari, profileId: string): Promise<ProfileSeed> {
  const session = await solari.sessions.create({ profileId })
  try {
    return seedFromStorageState(session.storageState)
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
    return `Saved v${version} with ${seed.cookies} cookies and ${seed.origins} origins. Run auspex check with --profile ${profile.name}`
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
  while (now() < deadline) {
    const rows = await opts.deps.list()
    profile = rows.find((p) => p.name.trim() === want)
    if (!profile) throw new Error(`profile ${want} no longer exists`)
    version = profile.version ?? since
    if (version > since) {
      seed = await opts.deps.inspect(profile.id)
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
    next: awaitNext(status, profile, version, seed),
  }
}

export async function defaultSaveProfileHttp(): Promise<PersistHttp> {
  const key = requireApiKey()
  return {
    post: async (path, body) => {
      const res = await fetch(`${BROWSER_API_BASE}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body ?? {}),
      })
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        const err = typeof json.error === "string" ? json.error : `save-profile ${res.status}`
        throw new Error(err)
      }
      return json
    },
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
