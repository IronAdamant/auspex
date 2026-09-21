import type { Solari, StorageState } from "@solarisdk/browser"
import {
  captureEditorFoldState,
  persistCapturedEditorFold,
  type CaptureEditorFoldOpts,
  type EditorFoldResult,
} from "./editor-fold.ts"
import { ProfileBusyError, withProfileLock } from "./profile-lock.ts"
import { createClient } from "./solari.ts"
import { isFoldedExpiresOnStale, originHasLandedBytes, originStoreCounts } from "./profile-storage.ts"
import { isPublicMarketingUrl, savedCheckForProfile } from "./saved-checks.ts"
import { hostIs } from "./sso.ts"

export const EMPTY_PROFILE_SEED_ERROR =
  "profile has 0 cookies and 0 origins (empty Save). A version bump with no storage is not a login. Re-login, Save, then retry."

export const EMPTY_PROFILE_SAVE_ERROR =
  "refusing to save an empty storage state over a Solari profile (would wipe cookies)"

export const EMPTY_ORIGIN_SAVE_ERROR =
  "refusing to save: no cookies, localStorage, or sessionStorage landed for the page origin"

export const PROFILE_EDITOR_OPEN_ERROR =
  "profile editor is open; close it, then --save-profile with the live session"

export const HANDOFF_POLL_MS = 2_000
/** Cold login-handoff URLs live 30 minutes (Solari changelog 2026-09-03). */
export const AWAIT_LOGIN_DEFAULT_MS = 1_800_000
export const AWAIT_LOGIN_MIN_MS = 5_000
export const AWAIT_LOGIN_MAX_MS = 1_800_000

export function clampAwaitLoginTimeoutMs(timeoutMs?: number): number {
  return Math.min(Math.max(timeoutMs ?? AWAIT_LOGIN_DEFAULT_MS, AWAIT_LOGIN_MIN_MS), AWAIT_LOGIN_MAX_MS)
}

export type ProfileSeed = {
  cookies: number
  origins: number
  sessionStorage?: number
  /** Folded `__auspex_ss__:expiresOn` is past or within ~5m. Count alone is not fresh. */
  sessionStorageStale?: boolean
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

export type AwaitLoginStatus = "completed" | "timeout" | "empty-save" | "waiting"

export type AwaitLoginResult = {
  status: AwaitLoginStatus
  profileId: string
  name: string
  version: number
  cookies: number
  origins: number
  sessionStorage?: number
  sessionStorageStale?: boolean
  next: string
  editorSave?: { ok: boolean; status: number; error?: string }
  /** Present after --save-editor. ok only when live editor CDP fold persisted. */
  editorFold?: EditorFoldResult
}

export type AwaitLoginDeps = {
  list: () => Promise<Array<{ id: string; name: string; version?: number }>>
  inspect: (profileId: string, origin?: string) => Promise<ProfileSeed>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export function seedFromStorageState(state: StorageState | null | undefined, origin?: string): ProfileSeed {
  const seed: ProfileSeed = {
    cookies: (state?.cookies ?? []).filter((c) => Boolean(c?.name)).length,
    origins: (state?.origins ?? []).filter((o) => Boolean(o?.origin)).length,
  }
  if (origin && state) {
    seed.sessionStorage = originStoreCounts(state, origin).sessionStorage
    if (isFoldedExpiresOnStale(state, origin)) seed.sessionStorageStale = true
  }
  return seed
}

export function isEmptySeed(seed: ProfileSeed): boolean {
  return seed.cookies === 0 && seed.origins === 0
}

/** ConsistencyHub by saved name, profile name, or host. Not a kebab/slug heuristic. */
export function isConsistencyHubTarget(opts: { name?: string; profile?: string; url?: string }): boolean {
  const name = (opts.name ?? "").trim().toLowerCase()
  const profile = (opts.profile ?? "").trim().toLowerCase()
  if (name === "consistencyhub" || profile === "consistencyhub") return true
  const raw = opts.url?.trim()
  if (!raw) return false
  try {
    return hostIs(new URL(raw).hostname, "consistencyhub.io")
  } catch {
    return false
  }
}

/**
 * weakSeed when cookies/origins exist and sessionStorage is counted 0,
 * or folded `__auspex_ss__:expiresOn` is past / within ~5m (leftover count is not fresh).
 * Public marketing saved checks (ironadamant, checkpoint) stay loggedOut.
 * Unknown sessionStorage (no origin, and not stale) is not weakSeed.
 */
export function isWeakSeed(opts: {
  name?: string
  profile?: string
  url?: string
  cookies?: number
  origins?: number
  sessionStorage?: number
  sessionStorageStale?: boolean
}): boolean {
  const missingSs = opts.sessionStorage === 0
  const staleSs = opts.sessionStorageStale === true
  if (!missingSs && !staleSs) return false
  const hasStore = (opts.cookies ?? 0) > 0 || (opts.origins ?? 0) > 0
  if (!hasStore) return false
  if (isConsistencyHubTarget(opts)) return true
  const raw = opts.url?.trim()
  if (raw && isPublicMarketingUrl(raw)) return false
  const name = (opts.name ?? "").trim().toLowerCase()
  const profile = (opts.profile ?? "").trim().toLowerCase()
  if (
    name === "ironadamant" ||
    name === "checkpoint" ||
    profile === "ironadamant" ||
    profile === "checkpoint"
  ) {
    return false
  }
  return true
}

export function emptyProfileSeedError(name: string): string {
  const n = name.trim()
  return `profile ${n} ${EMPTY_PROFILE_SEED_ERROR}`
}

/** Agent next/skipReason after Save when sessionStorage is still missing or the live probe is loggedOut with cookies. */
export function finalizeLoginGuidance(profile: string): string {
  const name = profile.trim() || "<name>"
  const saved = savedCheckForProfile(name)
  const flags = saved ? `--profile ${name}` : `--profile ${name} --url <url> --expect <string>`
  const extra = saved ? "" : " --url and --expect are required unless the profile matches a saved check."
  return `Run npx auspex finalize-login ${flags} (MCP: auspex_finalize_login).${extra} Console Save and --save-editor do not refresh folded sessionStorage. SPAs that keep tokens in sessionStorage still need finalize-login while the token is valid. Never --record a logged-in session.`
}

export const DEAD_FOLD_VWP_BAN =
  "Do not run check --verify-with-profile on this seed — claimOkProfile will not pass on a dead fold."

/** After --verify-with-profile, this field is the reuse signal. ok is not. */
export const CLAIM_OK_PROFILE_REUSE_GATE =
  "Reuse gate is claimOkProfile, not ok. ok=true is not enough to treat the profile as reusable."

export const SAVE_NOT_FOLD_NOW =
  "Save is not fold: --save-editor did not refresh folded sessionStorage. Finalize-login NOW while the token is live. " +
  DEAD_FOLD_VWP_BAN +
  " Remint auspex_login if finalize-login returns needsHuman."

export function remintLoginGuidance(profile: string): string {
  const name = profile.trim() || "<name>"
  return `Remint now: npx auspex login --profile ${name} (MCP: auspex_login; phone handoff.mobileUrl).`
}

/** Receipt next when verify-with-profile ran (claimOkProfile is present). Does not invent the boolean. */
export function claimOkProfileReuseNext(
  verify?: { claimOkProfile?: boolean },
  existing?: string,
): string | undefined {
  if (verify?.claimOkProfile === undefined) return existing
  const gate =
    verify.claimOkProfile === true
      ? `${CLAIM_OK_PROFILE_REUSE_GATE} claimOkProfile=true — profile reuse is evidenced by this field.`
      : `${CLAIM_OK_PROFILE_REUSE_GATE} claimOkProfile=false — do not reuse this seed. Remint or finalize-login while the token is live. ${DEAD_FOLD_VWP_BAN}`
  return existing ? `${existing} ${gate}` : gate
}

export function saveEditorMissedFold(opts: {
  editorSave?: { ok: boolean; status: number; error?: string }
  editorFold?: EditorFoldResult
}): boolean {
  if (opts.editorSave && !opts.editorSave.ok) return true
  if (opts.editorFold && !opts.editorFold.ok) return true
  if (opts.editorSave?.ok === true && !opts.editorFold) return true
  return false
}

/** Louder await-login next when --save-editor failed to refresh folded sessionStorage. */
export function overlaySaveEditorNext(opts: {
  next: string
  profile: string
  editorSave?: { ok: boolean; status: number; error?: string }
  editorFold?: EditorFoldResult
}): string {
  if (!saveEditorMissedFold(opts)) return opts.next
  const why = !opts.editorSave
    ? "editorFold did not refresh folded sessionStorage."
    : !opts.editorSave.ok
      ? `editorSave failed (${opts.editorSave.status}${opts.editorSave.error ? `: ${opts.editorSave.error}` : ""}).`
      : opts.editorFold
        ? `editorFold.${opts.editorFold.reason} did not refresh folded sessionStorage.`
        : "editorFold missing after editorSave; leftover sessionStorage is not a fresh capture."
  const stripped = opts.next.replace(/\s*Run auspex check with --profile \S+\.?/g, "").trim()
  const prefix = stripped || opts.next
  if (prefix.includes("Finalize-login NOW") && prefix.includes("claimOkProfile will not pass")) {
    return `${prefix} ${why} ${SAVE_NOT_FOLD_NOW}`
  }
  return `${prefix} ${why} ${SAVE_NOT_FOLD_NOW} ${finalizeLoginGuidance(opts.profile)}`
}

/** Agent skipReason / await-login Warning when the seed is missing or stale sessionStorage. */
export function weakSeedWarning(
  profile: string,
  seed?: { sessionStorage?: number; sessionStorageStale?: boolean },
): string {
  if (seed?.sessionStorageStale) {
    return (
      `profile ${profile} has stale folded sessionStorage expiresOn (past or within 5m; leftover count is not a fresh capture). ` +
      `--save-editor does not refresh folded sessionStorage. ${DEAD_FOLD_VWP_BAN} ${remintLoginGuidance(profile)} ` +
      `finalize-login now only if the live editor tab is still on the app dashboard with a valid session. ` +
      `Remint auspex_login if finalize-login returns needsHuman. ${finalizeLoginGuidance(profile)}`
    )
  }
  return (
    `profile ${profile} has cookies/origins but no counted sessionStorage. Finalize-login NOW while the token is live. ` +
    `${DEAD_FOLD_VWP_BAN} Remint auspex_login if finalize-login returns needsHuman. ${finalizeLoginGuidance(profile)}`
  )
}

/** Agent next/skipReason when the profile is missing or empty. Do not finalize-login. */
export function emptyProfileGuidance(profile: string): string {
  const name = profile.trim() || "<name>"
  return `profile ${name} is empty or missing. Run npx auspex login --profile ${name} then npx auspex await-login --profile ${name} --save-editor. Do not finalize-login on an empty profile. Agent never types a password.`
}

/** login --wait / wait:true is the composed phone path: same as await-login --save-editor. */
export function loginWaitAwaitOpts(opts: { sinceVersion?: number; url?: string } = {}): {
  sinceVersion?: number
  url?: string
  saveEditor: true
} {
  return {
    ...(opts.sinceVersion !== undefined ? { sinceVersion: opts.sinceVersion } : {}),
    ...(opts.url !== undefined ? { url: opts.url } : {}),
    saveEditor: true,
  }
}

/** Origin for await-login inspect. Never invent a count without an origin. Public marketing URLs are not forwarded. */
export function inspectOriginForAwait(opts: { name: string; url?: string }): string | undefined {
  const raw = opts.url?.trim() || savedCheckForProfile(opts.name)?.url
  if (!raw) return undefined
  if (isPublicMarketingUrl(raw)) return undefined
  try {
    return new URL(raw).origin
  } catch {
    return undefined
  }
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
    return seedFromStorageState(session.storageState ?? undefined, origin)
  } finally {
    await solari.sessions.releaseAndWait(session.id).catch(() => undefined)
  }
}

/** Production await-login adapter: must forward origin so sessionStorage can be counted. */
export function bindInspectProfileSeed(
  inspect: (solari: Solari, profileId: string, origin?: string) => Promise<ProfileSeed>,
  solari: Solari,
): AwaitLoginDeps["inspect"] {
  return (id, origin) => inspect(solari, id, origin)
}

function awaitNext(
  status: AwaitLoginStatus,
  profile: { id: string; name: string },
  version: number,
  seed: ProfileSeed,
): string {
  if (status === "completed") {
    const weak = isWeakSeed({
      profile: profile.name,
      cookies: seed.cookies,
      origins: seed.origins,
      sessionStorage: seed.sessionStorage,
      sessionStorageStale: seed.sessionStorageStale,
    })
    if (weak) {
      return `Saved v${version} with ${seed.cookies} cookies and ${seed.origins} origins. Warning: ${weakSeedWarning(profile.name, seed)}`
    }
    const counted = seed.sessionStorage !== undefined
    const originNote = counted
      ? ""
      : " Inspect did not count sessionStorage (no origin forwarded). Unknown sessionStorage is not weakSeed."
    return `Saved v${version} with ${seed.cookies} cookies and ${seed.origins} origins.${originNote} ${finalizeLoginGuidance(profile.name)} ${CLAIM_OK_PROFILE_REUSE_GATE} Then check --verify-with-profile and read claimOkProfile — do not treat leftover cookies as reusable. Do not skip finalize-login.`
  }
  if (status === "empty-save") {
    return `Save bumped the profile to v${version} but stored no cookies or origins. Do not reuse --profile ${profile.name} until a non-empty Save.`
  }
  if (status === "waiting") {
    return `Still waiting for non-empty Save for ${profile.name}. Keep the handoff open, Save, then the wait continues.`
  }
  return `No non-empty Save yet for ${profile.name}. Keep the handoff open, Save, then retry auspex_await_login.`
}

export async function waitForProfileSave(
  name: string,
  opts: {
    sinceVersion?: number
    timeoutMs?: number
    url?: string
    deps: AwaitLoginDeps
  },
): Promise<AwaitLoginResult> {
  const want = name.trim()
  if (!want) throw new Error("profile name must be non-empty")
  const timeoutMs = clampAwaitLoginTimeoutMs(opts.timeoutMs)
  const sleepFn = opts.deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const now = opts.deps.now ?? Date.now
  const deadline = now() + timeoutMs
  let profile = (await opts.deps.list()).find((p) => p.name.trim() === want)
  if (!profile) throw new Error(`Solari profile not found: ${want}. Run login --profile ${want} first.`)
  const since = opts.sinceVersion ?? profile.version ?? 0
  let version = profile.version ?? since
  let seed: ProfileSeed = { cookies: 0, origins: 0 }
  let status: AwaitLoginStatus = "waiting"
  const inspectOrigin = inspectOriginForAwait({ name: want, url: opts.url })

  while (now() < deadline) {
    const rows = await opts.deps.list()
    profile = rows.find((p) => p.name.trim() === want)
    if (!profile) throw new Error(`profile ${want} no longer exists`)
    version = profile.version ?? since
    if (version > since) {
      seed = await opts.deps.inspect(profile.id, inspectOrigin)
      status = isEmptySeed(seed) ? "empty-save" : "completed"
      break
    }
    const remain = deadline - now()
    if (remain <= 0) {
      status = "timeout"
      break
    }
    await sleepFn(Math.min(HANDOFF_POLL_MS, remain))
  }
  
  if (status === "waiting") {
    status = "timeout"
  }
  
  return {
    status,
    profileId: profile.id,
    name: profile.name,
    version,
    cookies: seed.cookies,
    origins: seed.origins,
    sessionStorage: seed.sessionStorage,
    sessionStorageStale: seed.sessionStorageStale,
    next: awaitNext(status, profile, version, seed),
  }
}

export async function liveAwaitLogin(
  name: string,
  opts: {
    sinceVersion?: number
    timeoutMs?: number
    saveEditor?: boolean
    url?: string
    foldCapture?: CaptureEditorFoldOpts
  } = {},
): Promise<AwaitLoginResult> {
  const solari = createClient()
  try {
    let editorSave: AwaitLoginResult["editorSave"]
    let editorFold: EditorFoldResult | undefined
    if (opts.saveEditor) {
      const { loadEditorSave, saveProfileEditor } = await import("./profiles.ts")
      const handle = await loadEditorSave(name)
      if (!handle) {
        editorSave = { ok: false, status: 0, error: "no stored editor save handle; remint auspex_login" }
      } else {
        const saved = await saveProfileEditor(handle)
        editorSave = { ok: saved.ok, status: saved.status, error: saved.error }
        if (saved.ok) {
          const captured = await captureEditorFoldState({
            saveJson: saved.json,
            ...opts.foldCapture,
          })
          editorFold = await persistCapturedEditorFold({
            handle,
            captured,
            persist: (state) =>
              persistLiveProfile({
                solari,
                profileId: handle.profileId,
                state,
                lockName: handle.name,
              }),
          })
        }
      }
    }
    const waited = await waitForProfileSave(name, {
      sinceVersion: opts.sinceVersion,
      timeoutMs: opts.timeoutMs,
      url: opts.url,
      deps: {
        list: async () =>
          (await solari.profiles.list()).map((p) => ({
            id: p.id,
            name: p.name,
            version: asFiniteNumber((p as { version?: unknown }).version),
          })),
        inspect: bindInspectProfileSeed(inspectProfileSeed, solari),
      },
    })
    if (editorSave || editorFold) {
      const withEditor = { ...waited, ...(editorSave ? { editorSave } : {}), ...(editorFold ? { editorFold } : {}) }
      return {
        ...withEditor,
        next: overlaySaveEditorNext({
          next: waited.next,
          profile: waited.name,
          editorSave,
          editorFold,
        }),
      }
    }
    return waited
  } finally {
    await solari.close().catch(() => undefined)
  }
}
