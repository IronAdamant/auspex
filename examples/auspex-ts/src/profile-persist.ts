import type { Solari, StorageState } from "@solarisdk/browser"
import {
  captureEditorFoldState,
  persistCapturedEditorFold,
  type CaptureEditorFoldOpts,
  type EditorFoldResult,
} from "./editor-fold.ts"
import { ProfileBusyError, withProfileLock } from "./profile-lock.ts"
import { forgetLive, rememberLive } from "./session-ledger.ts"
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
import {
  DEAD_FOLD_VERIFY_BAN,
  foldLeadBlockedByDrain,
  foldMissFinalizeGuide,
  idpOnlySaveGuide,
  isIdpOnlySave,
  shouldSteerToFinalize,
  siteHostFromUrl,
} from "./fold-steer.ts"

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
  /** sign-in-wall: human has not reached the app. app-visible: liveHost is the app and sessionStorage was not captured. */
  idpOnlyKind?: "sign-in-wall" | "app-visible"
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
  | "idp-only-save"
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
  liveHost?: string
  idpOnlyKind?: "sign-in-wall" | "app-visible"
  hostChanged?: boolean
  profileHostMatch?: boolean
  suggestedProfile?: string
  suggestedUrl?: string
  next: string
  nextCall?: NextCall
  editorSave?: { ok: boolean; status: number; error?: string }
  /** Present after --save-editor. ok only when live editor CDP fold persisted. */
  editorFold?: EditorFoldResult
  /** Door should call finalize-login now. Set only when url and expect are known. */
  chainFinalize?: boolean
  /** editorSave/fold could not refresh sessionStorage. Primary next is finalize, not remint. */
  foldMiss?: boolean
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

export const DEAD_FOLD_VWP_BAN = DEAD_FOLD_VERIFY_BAN

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

/** Fold miss after a successful save keeps the incoming nextCall. A failed editorSave does not point nextCall at finalize. */
export function overlaySaveEditorGuidance(opts: {
  next: string
  nextCall?: NextCall
  profile: string
  editorSave?: { ok: boolean; status: number; error?: string }
  editorFold?: EditorFoldResult
}): { text: string; nextCall?: NextCall } {
  const failedSave = opts.editorSave && !opts.editorSave.ok
  const nextCall =
    failedSave && opts.nextCall?.tool === "auspex_finalize_login"
      ? remintLoginNextCall(opts.profile)
      : opts.nextCall
  return { text: overlaySaveEditorNext(opts), nextCall }
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
  if (opts.editorSave && !opts.editorSave.ok) {
    const remint = remintLoginGuidance(opts.profile)
    return (
      `${prefix} ${why} Cookies in the profile are not proof this login saved (a pre-login jar looks the same). ` +
      `${remint} Do not finalize-login on this seed. If a later finalize returns needsHuman, that remint stands. ${DEAD_FOLD_VWP_BAN}`
    )
  }
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
  await rememberLive("browser", session.id).catch(() => undefined)
  try {
    const state = session.storageState ?? undefined
    const seed = { ...seedFromStorageState(state, origin), ...loginTraceSeedExtras(state, origin) }
    const live = (await import("./live-host-change.ts")).selectLiveHost({ state })
    return live ? { ...seed, liveHost: live.host } : seed
  } finally {
    try {
      await solari.sessions.releaseAndWait(session.id)
      await forgetLive("browser", session.id).catch(() => undefined)
    } catch {
      // Keep the ledger id so auspex_reap can release a session that did not close.
    }
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
  siteHost?: string,
): { text: string; nextCall?: NextCall; idpOnlyKind?: "sign-in-wall" | "app-visible" } {
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
  if (status === "idp-only-save") return idpOnlySaveGuide(profile.name, { liveHost: seed.liveHost, siteHost })
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
    /** editorSave already wrote the jar. Read it now. Do not poll until the JWT dies when there is no pre-save version still to beat. */
    inspectExisting?: boolean
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
  const inspectOrigin = inspectOriginForAwait({ name: want, url: opts.url ?? opts.mintUrl })
  const siteHost = siteHostFromUrl(inspectOrigin)
  let inspectedExisting = false

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
    const bumped = version > since
    const readNow = bumped || (opts.inspectExisting === true && !inspectedExisting)
    if (opts.inspectExisting) inspectedExisting = true
    if (readNow) {
      seed = await opts.deps.inspect(profile.id, inspectOrigin)
      if (
        isIdpOnlySave({
          cookieHosts: seed.cookieHosts,
          siteHost,
          sessionStorage: seed.sessionStorage,
          sessionStorageStale: seed.sessionStorageStale,
          liveHost: seed.liveHost,
          cookies: seed.cookies,
          origins: seed.origins,
        })
      ) {
        status = "idp-only-save"
        break
      }
      const saveAlreadyInJar = opts.inspectExisting === true && !isEmptySeed(seed)
      const noBumpLeftToWaitFor = opts.sinceVersion === undefined
      if (bumped || saveAlreadyInJar || (opts.inspectExisting === true && noBumpLeftToWaitFor)) {
        status = isEmptySeed(seed) ? "empty-save" : "completed"
        break
      }
    }
    const remain = deadline - now()
    if (remain <= 0) {
      status = "timeout"
      break
    }
    await sleepFn(Math.min(HANDOFF_POLL_MS, remain))
  }
  
  if (status === "waiting") status = "timeout"
  if (status === "timeout" && streamIsPast(opts.streamExpiresAt, now())) {
    status = "stream-expired"
  }
  
  const hostPatch = await import("./live-host-change.ts").then((m) =>
    m.completedAwaitHostPatch({ status, profile: profile.name, mintUrl: opts.mintUrl ?? opts.url, pageUrl: opts.pageUrl, liveHost: seed.liveHost }),
  )
  const guided = awaitGuide(hostPatch ? "waiting" : status, profile, version, seed, siteHost)
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
    idpCookies: status === "idp-only-save" ? true : seed.idpCookies,
    liveHost: seed.liveHost,
    idpOnlyKind: status === "idp-only-save" ? guided.idpOnlyKind : undefined,
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
  if (result.status === "idp-only-save") {
    return { status: "idp-only-save", foldReason: result.editorFold?.reason ?? "idp-only-save" }
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
    expect?: string
    /** Default true: door may chain finalize when this returns status completed from a fold miss. */
    chainFinalize?: boolean
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
    if (streamPlan.preflight === "past") streamExpired = true
    // `low` keeps the capped waitTimeoutMs. Do not fall back to the 30-minute poll.
    if (opts.saveEditor) {
      if (streamPlan.preflight === "past") {
        editorSave = {
          ok: false,
          status: 401,
          error: "stream-expired: VNC/handoff expiry is past; remint auspex_login",
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
      sinceVersion: opts.sinceVersion ?? handle?.sinceVersion,
      timeoutMs:
        streamExpired || editorHung
          ? Math.min(opts.timeoutMs ?? STREAM_EXPIRED_WAIT_MS, STREAM_EXPIRED_WAIT_MS)
          : streamPlan.preflight === "low"
            ? (streamPlan.waitTimeoutMs ?? STREAM_EXPIRED_WAIT_MS)
            : streamPlan.waitTimeoutMs,
      url: opts.url,
      mintUrl,
      pageUrl,
      streamExpiresAt: streamPlan.watchStreamExpiresAt,
      inspectExisting: editorSave?.ok === true,
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
    if (waited.status === "stream-expired") streamExpired = true
    let steered = waited
    const host = await import("./live-host-change.ts")
    const adopt = host.sameProductAdopt({
      mintUrl,
      pageUrl: pageUrl ?? (steered.liveHost ? `https://${steered.liveHost}` : undefined),
      liveHost: steered.liveHost,
    })
    if (adopt) {
      await host.noteProfileCanonicalUrl(waited.name, adopt).catch(() => undefined)
      mintUrl = adopt.canonicalUrl
    }
    const patch = await host.rememberAwaitHostChange(
      waited.name,
      adopt ? { ...steered, hostChanged: false } : steered,
      adopt ? undefined : foldChange,
    )
    if (
      !patch &&
      opts.saveEditor &&
      streamExpired &&
      steered.cookies === 0 &&
      steered.origins === 0
    ) {
      const bounded = await boundEditorWork(
        () =>
          inspectProfileSeed(
            solari,
            waited.profileId,
            inspectOriginForAwait({ name: waited.name, url: opts.url ?? mintUrl }),
          ),
        EDITOR_SAVE_BOUND_MS,
        `inspectProfileSeed timed out after ${EDITOR_SAVE_BOUND_MS}ms`,
      )
      const seed = bounded.ok ? bounded.value : undefined
      if (seed && (seed.cookies > 0 || seed.origins > 0)) {
        const siteHost = siteHostFromUrl(opts.url ?? mintUrl ?? savedCheckForProfile(waited.name)?.url)
        const idpOnly = isIdpOnlySave({
          cookieHosts: seed.cookieHosts,
          siteHost,
          sessionStorage: seed.sessionStorage,
          sessionStorageStale: seed.sessionStorageStale,
          liveHost: seed.liveHost,
          cookies: seed.cookies,
          origins: seed.origins,
        })
        const guide = idpOnly
          ? idpOnlySaveGuide(waited.name, { liveHost: seed.liveHost, siteHost })
          : undefined
        steered = {
          ...waited,
          cookies: seed.cookies,
          origins: seed.origins,
          sessionStorage: seed.sessionStorage,
          sessionStorageStale: seed.sessionStorageStale,
          cookieHosts: seed.cookieHosts,
          liveHost: seed.liveHost ?? waited.liveHost,
          idpCookies: idpOnly ? true : seed.idpCookies,
          ...(idpOnly
            ? {
                status: "idp-only-save" as const,
                idpOnlyKind: guide?.idpOnlyKind,
                next: guide?.text,
                nextCall: guide?.nextCall,
              }
            : {}),
        }
      }
    }
    const steerSite = siteHostFromUrl(
      opts.url ?? mintUrl ?? savedCheckForProfile(steered.name)?.url,
    )
    const drainedNonApp = foldLeadBlockedByDrain({
      status: steered.status,
      cookieHosts: steered.cookieHosts,
      siteHost: steerSite,
    })
    const foldLead =
      !patch &&
      !drainedNonApp &&
      steered.status !== "idp-only-save" &&
      shouldSteerToFinalize({
        editorSave,
        editorFold,
        cookies: steered.cookies,
        origins: steered.origins,
        hostChanged: false,
        cookieHosts: steered.cookieHosts,
        siteHost: steerSite,
        sessionStorage: steered.sessionStorage,
        sessionStorageStale: steered.sessionStorageStale,
        liveHost: steered.liveHost,
      })
        ? {
            status: "completed" as const,
            ...foldMissFinalizeGuide({
              profile: steered.name,
              editorSave,
              editorFold,
              streamNoted: streamExpired,
              url: opts.url ?? mintUrl ?? savedCheckForProfile(steered.name)?.url,
              expect: opts.expect ?? savedCheckForProfile(steered.name)?.expect,
            }),
          }
        : undefined
    const failClosed =
      !patch &&
      !foldLead &&
      steered.status !== "completed" &&
      steered.status !== "host-changed" &&
      steered.status !== "idp-only-save"
        ? streamExpired
          ? { status: "stream-expired" as const, ...streamExpiredGuide(steered.name) }
          : editorHung
            ? { status: "editor-save-hung" as const, ...editorSaveHungGuide(steered.name) }
            : profileBusy
              ? { status: "profile-busy" as const, ...profileBusyAwaitGuide(steered.name) }
              : undefined
        : undefined
    let guided = patch
      ? { text: patch.next, nextCall: patch.nextCall }
      : foldLead
        ? { text: foldLead.text, nextCall: foldLead.nextCall }
        : failClosed
          ? { text: failClosed.text, nextCall: failClosed.nextCall }
          : steered.status === "idp-only-save"
            ? { text: steered.next, nextCall: steered.nextCall }
            : editorSave || editorFold
            ? overlaySaveEditorGuidance({
                next: steered.next,
                nextCall: steered.nextCall,
                profile: steered.name,
                editorSave,
                editorFold,
              })
            : { text: steered.next, nextCall: steered.nextCall }
    if (adopt && !patch) {
      guided = {
        ...guided,
        text: `Same product: profile canonical URL is now ${adopt.canonicalUrl} (was ${adopt.fromHost}). Continue finalize on that host. ${guided.text ?? ""}`.trim(),
      }
    }
    const chain =
      Boolean(foldLead) && opts.chainFinalize !== false && Boolean(foldLead?.nextCall.url && foldLead?.nextCall.expect)
    const result: AwaitLoginResult = {
      ...steered,
      ...(editorSave ? { editorSave } : {}),
      ...(editorFold ? { editorFold } : {}),
      ...(patch ?? {}),
      ...(foldLead ? { status: foldLead.status, foldMiss: true as const } : {}),
      ...(failClosed ? { status: failClosed.status } : {}),
      next: guided.text,
      nextCall: guided.nextCall,
      ...(chain ? { chainFinalize: true as const } : {}),
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
