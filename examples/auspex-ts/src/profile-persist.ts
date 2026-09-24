import type { Solari, StorageState } from "@solarisdk/browser"
import {
  captureEditorFoldState,
  persistCapturedEditorFold,
  type CaptureEditorFoldOpts,
  type EditorFoldResult,
} from "./editor-fold.ts"
import { ProfileBusyError, withProfileLock } from "./profile-lock.ts"
import { createClient } from "./solari.ts"
import { loginTraceSeedExtras, recordPostHandoffTrace } from "./login-trace.ts"
import type { LiveHostChange } from "./live-host-change.ts"
import { awaitRetryNextCall, finalizeLoginNextCall, remintLoginNextCall, type NextCall } from "./next-call.ts"
import { isFoldedExpiresOnStale, originHasLandedBytes, originStoreCounts } from "./profile-storage.ts"
import { isPublicMarketingUrl, savedCheckForProfile } from "./saved-checks.ts"
import { hostIs } from "./sso.ts"
import {
  boundEditorWork,
  EDITOR_FOLD_BOUND_MS,
  EDITOR_SAVE_BOUND_MS,
  editorSaveHungGuide,
  isProfileBusyMessage,
  profileBusyAwaitGuide,
  STREAM_EXPIRED_WAIT_MS,
  streamExpiredGuide,
} from "./await-fail.ts"
import { isStreamExpired } from "./handoff-doors.ts"
import { awaitStreamPlan, streamIsPast, streamWatchDeadlineMs } from "./stream-deadline.ts"

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
  cookieHosts?: string[]
  foldedExpiresInSec?: number
  idpCookies?: boolean
  /** App host seen in storage (hostname only). */
  liveHost?: string
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

export type AwaitLoginStatus =
  | "completed"
  | "timeout"
  | "empty-save"
  | "waiting"
  | "host-changed"
  | "stream-expired"
  | "editor-save-hung"
  | "profile-busy"

export type AwaitLoginResult = {
  status: AwaitLoginStatus
  profileId: string
  name: string
  version: number
  cookies: number
  origins: number
  sessionStorage?: number
  sessionStorageStale?: boolean
  cookieHosts?: string[]
  foldedExpiresInSec?: number
  idpCookies?: boolean
  hostChanged?: boolean
  profileHostMatch?: boolean
  suggestedProfile?: string
  suggestedUrl?: string
  next: string
  nextCall?: NextCall
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
  cookieHosts?: string[]
  foldedExpiresInSec?: number
  idpCookies?: boolean
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
export function finalizeLoginGuide(profile: string): { text: string; nextCall: NextCall } {
  const name = profile.trim() || "<name>"
  const saved = name === "<name>" ? undefined : savedCheckForProfile(name)
  const flags = saved ? `--profile ${name}` : `--profile ${name} --url <url> --expect <string>`
  const extra = saved ? "" : " --url and --expect are required unless the profile matches a saved check."
  const text = `Run npx auspex finalize-login ${flags} (MCP: auspex_finalize_login).${extra} Console Save and --save-editor do not refresh folded sessionStorage. SPAs that keep tokens in sessionStorage still need finalize-login while the token is valid. Never --record a logged-in session.`
  return { text, nextCall: finalizeLoginNextCall(name) }
}

export function finalizeLoginGuidance(profile: string): string {
  return finalizeLoginGuide(profile).text
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

export function remintLoginGuide(profile: string): { text: string; nextCall: NextCall } {
  const name = profile.trim() || "<name>"
  const text = `Remint now: npx auspex login --profile ${name} (MCP: auspex_login; phone handoff.mobileUrl).`
  return { text, nextCall: remintLoginNextCall(name) }
}

export function remintLoginGuidance(profile: string): string {
  return remintLoginGuide(profile).text
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

/** Append the fold miss. The incoming nextCall stays the lead; the footer does not retarget it. */
export function overlaySaveEditorGuidance(opts: {
  next: string
  nextCall?: NextCall
  profile: string
  editorSave?: { ok: boolean; status: number; error?: string }
  editorFold?: EditorFoldResult
}): { text: string; nextCall?: NextCall } {
  return { text: overlaySaveEditorNext(opts), nextCall: opts.nextCall }
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
export function weakSeedGuide(
  profile: string,
  seed?: { sessionStorage?: number; sessionStorageStale?: boolean },
): { text: string; nextCall: NextCall } {
  if (seed?.sessionStorageStale) {
    const remint = remintLoginGuide(profile)
    return {
      text:
        `profile ${profile} has stale folded sessionStorage expiresOn (past or within 5m; leftover count is not a fresh capture). ` +
        `--save-editor does not refresh folded sessionStorage. ${DEAD_FOLD_VWP_BAN} ${remint.text} ` +
        `finalize-login now only if the live editor tab is still on the app dashboard with a valid session. ` +
        `Remint auspex_login if finalize-login returns needsHuman. ${finalizeLoginGuidance(profile)}`,
      nextCall: remint.nextCall,
    }
  }
  return {
    text:
      `profile ${profile} has cookies/origins but no counted sessionStorage. Finalize-login NOW while the token is live. ` +
      `${DEAD_FOLD_VWP_BAN} Remint auspex_login if finalize-login returns needsHuman. ${finalizeLoginGuidance(profile)}`,
    nextCall: finalizeLoginGuide(profile).nextCall,
  }
}

export function weakSeedWarning(
  profile: string,
  seed?: { sessionStorage?: number; sessionStorageStale?: boolean },
): string {
  return weakSeedGuide(profile, seed).text
}

/** Agent next/skipReason when the profile is missing or empty. Do not finalize-login. */
export function emptyProfileGuide(profile: string): { text: string; nextCall: NextCall } {
  const name = profile.trim() || "<name>"
  const text = `profile ${name} is empty or missing. Run npx auspex login --profile ${name} then npx auspex await-login --profile ${name} --save-editor. Do not finalize-login on an empty profile. Agent never types a password.`
  return { text, nextCall: remintLoginNextCall(name) }
}

export function emptyProfileGuidance(profile: string): string {
  return emptyProfileGuide(profile).text
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
    const state = session.storageState ?? undefined
    const seed = { ...seedFromStorageState(state, origin), ...loginTraceSeedExtras(state, origin) }
    const live = (await import("./live-host-change.ts")).selectLiveHost({ state })
    return live ? { ...seed, liveHost: live.host } : seed
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

function awaitGuide(
  status: AwaitLoginStatus,
  profile: { id: string; name: string },
  version: number,
  seed: ProfileSeed,
): { text: string; nextCall?: NextCall } {
  if (status === "completed") {
    const weak = isWeakSeed({
      profile: profile.name,
      cookies: seed.cookies,
      origins: seed.origins,
      sessionStorage: seed.sessionStorage,
      sessionStorageStale: seed.sessionStorageStale,
    })
    if (weak) {
      const warn = weakSeedGuide(profile.name, seed)
      return {
        text: `Saved v${version} with ${seed.cookies} cookies and ${seed.origins} origins. Warning: ${warn.text}`,
        nextCall: warn.nextCall,
      }
    }
    const counted = seed.sessionStorage !== undefined
    const originNote = counted
      ? ""
      : " Inspect did not count sessionStorage (no origin forwarded). Unknown sessionStorage is not weakSeed."
    const fin = finalizeLoginGuide(profile.name)
    return {
      text: `Saved v${version} with ${seed.cookies} cookies and ${seed.origins} origins.${originNote} ${fin.text} ${CLAIM_OK_PROFILE_REUSE_GATE} Then check --verify-with-profile and read claimOkProfile — do not treat leftover cookies as reusable. Do not skip finalize-login.`,
      nextCall: fin.nextCall,
    }
  }
  if (status === "empty-save") {
    return {
      text: `Save bumped the profile to v${version} but stored no cookies or origins. Do not reuse --profile ${profile.name} until a non-empty Save.`,
    }
  }
  if (status === "waiting") {
    return {
      text: `Still waiting for non-empty Save for ${profile.name}. Keep the handoff open, Save, then the wait continues.`,
    }
  }
  if (status === "stream-expired") return streamExpiredGuide(profile.name)
  if (status === "editor-save-hung") return editorSaveHungGuide(profile.name)
  if (status === "profile-busy") return profileBusyAwaitGuide(profile.name)
  return {
    text: `No non-empty Save yet for ${profile.name}. Keep the handoff open, Save, then retry auspex_await_login.`,
    nextCall: awaitRetryNextCall(profile.name),
  }
}

export async function waitForProfileSave(
  name: string,
  opts: {
    sinceVersion?: number
    timeoutMs?: number
    url?: string
    mintUrl?: string
    pageUrl?: string
    /** VNC JWT stamp. When set, the poll stops at this time instead of the 30-minute default. */
    streamExpiresAt?: string
    deps: AwaitLoginDeps
  },
): Promise<AwaitLoginResult> {
  const want = name.trim()
  if (!want) throw new Error("profile name must be non-empty")
  const timeoutMs = clampAwaitLoginTimeoutMs(opts.timeoutMs)
  const sleepFn = opts.deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const now = opts.deps.now ?? Date.now
  const streamEnd = streamWatchDeadlineMs(opts.streamExpiresAt)
  const deadline = streamEnd !== undefined ? Math.min(now() + timeoutMs, streamEnd) : now() + timeoutMs
  let profile = (await opts.deps.list()).find((p) => p.name.trim() === want)
  if (!profile) throw new Error(`Solari profile not found: ${want}. Run login --profile ${want} first.`)
  const since = opts.sinceVersion ?? profile.version ?? 0
  let version = profile.version ?? since
  let seed: ProfileSeed = { cookies: 0, origins: 0 }
  let status: AwaitLoginStatus = "waiting"
  const inspectOrigin = inspectOriginForAwait({ name: want, url: opts.url })

  if (streamIsPast(opts.streamExpiresAt, now())) status = "stream-expired"

  while (status === "waiting" && now() < deadline) {
    if (streamIsPast(opts.streamExpiresAt, now())) {
      status = "stream-expired"
      break
    }
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
  
  if (status === "waiting") status = "timeout"
  if ((status === "waiting" || status === "timeout") && streamIsPast(opts.streamExpiresAt, now())) {
    status = "stream-expired"
  }
  
  const hostPatch = await import("./live-host-change.ts").then((m) =>
    m.completedAwaitHostPatch({ status, profile: profile.name, mintUrl: opts.mintUrl ?? opts.url, pageUrl: opts.pageUrl, liveHost: seed.liveHost }),
  )
  const guided = awaitGuide(hostPatch ? "waiting" : status, profile, version, seed)
  return {
    status: hostPatch?.status ?? status,
    profileId: profile.id,
    name: profile.name,
    version,
    cookies: seed.cookies,
    origins: seed.origins,
    sessionStorage: seed.sessionStorage,
    sessionStorageStale: seed.sessionStorageStale,
    cookieHosts: seed.cookieHosts,
    foldedExpiresInSec: seed.foldedExpiresInSec,
    idpCookies: seed.idpCookies,
    ...(hostPatch ?? {}),
    next: hostPatch?.next ?? guided.text,
    nextCall: hostPatch?.nextCall ?? guided.nextCall,
  }
}

function postHandoffOutcome(result: AwaitLoginResult): { status: string; foldReason: string } | undefined {
  if (result.hostChanged || result.status === "host-changed") {
    return { status: "host-changed", foldReason: "host-changed" }
  }
  if (result.status === "stream-expired") {
    return { status: "stream-expired", foldReason: "stream-expired" }
  }
  if (result.status === "editor-save-hung") {
    return { status: "editor-save-hung", foldReason: "editor-save-hung" }
  }
  if (result.status === "profile-busy") {
    return { status: "profile-busy", foldReason: "profile-busy" }
  }
  if (result.editorSave && result.editorSave.ok === false && result.editorSave.status === 401) {
    return { status: "editor-save-failed", foldReason: "401" }
  }
  if (result.editorFold?.reason === "no-cdp") {
    return { status: "no-cdp", foldReason: "no-cdp" }
  }
  if (result.status === "empty-save") {
    return { status: "empty-save", foldReason: "empty-save" }
  }
  return undefined
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
    let streamExpired = false
    let editorHung = false
    let profileBusy = false
    let mintUrl = opts.url?.trim() || undefined, pageUrl: string | undefined, foldChange: LiveHostChange | undefined
    const { loadEditorSave, saveProfileEditor } = await import("./profiles.ts")
    const handle = await loadEditorSave(name).catch(() => undefined)
    if (handle?.siteUrl) mintUrl = handle.siteUrl
    const streamPlan = awaitStreamPlan({
      saveEditor: opts.saveEditor,
      streamExpiresAt: handle?.streamExpiresAt,
      timeoutMs: opts.timeoutMs,
      nowMs: Date.now(),
      defaultTimeoutMs: AWAIT_LOGIN_DEFAULT_MS,
    })
    if (streamPlan.preflight !== "proceed") streamExpired = true
    if (opts.saveEditor) {
      if (streamPlan.preflight === "low" || streamPlan.preflight === "past") {
        editorSave = {
          ok: false,
          status: 401,
          error:
            streamPlan.preflight === "low"
              ? "stream-expired: VNC JWT has under 90s left; remint auspex_login"
              : "stream-expired: VNC/handoff expiry is past; remint auspex_login",
        }
      } else if (!handle) {
        editorSave = { ok: false, status: 0, error: "no stored editor save handle; remint auspex_login" }
      } else if (isStreamExpired({ expiresAt: handle.streamExpiresAt ?? handle.expiresAt })) {
        streamExpired = true
        editorSave = {
          ok: false,
          status: 401,
          error: "stream-expired: VNC/handoff expiry is past; remint auspex_login",
        }
      } else {
        const savedBound = await boundEditorWork(
          () => saveProfileEditor(handle),
          EDITOR_SAVE_BOUND_MS,
          `editorSave timed out after ${EDITOR_SAVE_BOUND_MS}ms`,
        )
        if (!savedBound.ok) {
          editorHung = true
          editorSave = { ok: false, status: 0, error: savedBound.error }
        } else {
          const saved = savedBound.value
          editorSave = { ok: saved.ok, status: saved.status, error: saved.error }
          if (saved.ok) {
            const capturedBound = await boundEditorWork(
              () =>
                captureEditorFoldState({
                  saveJson: saved.json,
                  ...opts.foldCapture,
                }),
              EDITOR_FOLD_BOUND_MS,
              `editorFold timed out after ${EDITOR_FOLD_BOUND_MS}ms`,
            )
            if (!capturedBound.ok) {
              editorHung = true
              editorFold = { ok: false, reason: "connect-failed", error: capturedBound.error }
            } else {
              const captured = capturedBound.value
              const host = await import("./live-host-change.ts")
              pageUrl = host.httpsPageUrlFromRecord(saved.json)
              foldChange = host.adviseLiveHostChange({ profile: name, mintUrl, pageUrl, state: captured.state })
              editorFold = foldChange
                ? { ok: false, reason: "persist-blocked", error: host.LIVE_HOST_CHANGED_SAVE_ERROR }
                : await persistCapturedEditorFold({
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
              if (isProfileBusyMessage(editorFold.error)) profileBusy = true
            }
          } else if (saved.status === 401 && isStreamExpired({ expiresAt: handle.streamExpiresAt ?? handle.expiresAt })) {
            streamExpired = true
          }
        }
      }
    }
    const waited = await waitForProfileSave(name, {
      sinceVersion: opts.sinceVersion,
      timeoutMs:
        streamExpired || editorHung
          ? Math.min(opts.timeoutMs ?? STREAM_EXPIRED_WAIT_MS, STREAM_EXPIRED_WAIT_MS)
          : streamPlan.waitTimeoutMs,
      url: opts.url,
      mintUrl,
      pageUrl,
      streamExpiresAt: streamPlan.watchStreamExpiresAt,
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
    const host = await import("./live-host-change.ts")
    const patch = await host.rememberAwaitHostChange(waited.name, waited, foldChange)
    if (waited.status === "stream-expired") streamExpired = true
    const failClosed =
      !patch && waited.status !== "completed" && waited.status !== "host-changed"
        ? streamExpired
          ? { status: "stream-expired" as const, ...streamExpiredGuide(waited.name) }
          : editorHung
            ? { status: "editor-save-hung" as const, ...editorSaveHungGuide(waited.name) }
            : profileBusy
              ? { status: "profile-busy" as const, ...profileBusyAwaitGuide(waited.name) }
              : undefined
        : undefined
    const guided = patch
      ? { text: patch.next, nextCall: patch.nextCall }
      : failClosed
        ? { text: failClosed.text, nextCall: failClosed.nextCall }
        : editorSave || editorFold
          ? overlaySaveEditorGuidance({
              next: waited.next,
              nextCall: waited.nextCall,
              profile: waited.name,
              editorSave,
              editorFold,
            })
          : { text: waited.next, nextCall: waited.nextCall }
    const result: AwaitLoginResult = {
      ...waited,
      ...(editorSave ? { editorSave } : {}),
      ...(editorFold ? { editorFold } : {}),
      ...(patch ?? {}),
      ...(failClosed ? { status: failClosed.status } : {}),
      next: guided.text,
      nextCall: guided.nextCall,
    }
    const outcome = postHandoffOutcome(result)
    if (outcome) {
      await recordPostHandoffTrace({ profile: result.name, ...outcome }).catch(() => undefined)
    }
    return result
  } finally {
    await solari.close().catch(() => undefined)
  }
}
