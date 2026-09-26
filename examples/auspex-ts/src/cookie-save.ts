/**
 * Cookie + localStorage Solari Save contract.
 * Counts and allowlisted key names only. Never token values.
 * solariSaveReady is not claimOkProfile.
 */

import type { StorageState } from "@solarisdk/browser"
import {
  hasAppOriginCookies,
  idpOnlyKind,
  isIdpOnlySave,
  siteHostFromUrl,
  type IdpOnlyKind,
} from "./fold-steer.ts"
import { checkVerifyNextCall, type NextCall } from "./next-call.ts"
import { SESSION_STORAGE_PREFIX } from "./profile-storage.ts"
import { isPublicMarketingUrl } from "./saved-checks.ts"
import { hostIs } from "./sso.ts"

/** Exact localStorage key names. Apps may add more with --auth-keys. */
export const DEFAULT_LOCAL_STORAGE_AUTH_KEYS = [
  "accessToken",
  "access_token",
  "idToken",
  "id_token",
  "refreshToken",
  "refresh_token",
] as const

export const COOKIE_SAVE_CONTRACT = {
  id: "auspex.cookie-save/1",
  phase: "pre-save",
  solariEditorSavePersists: ["cookies", "localStorage"],
  sessionStorageOnEditorSave: "not-captured",
  reusableShape:
    "app-origin first-party cookies, or allowlisted localStorage auth key names on the app origin",
  refuseShape: "idp-hosts-alone",
  solariSaveReadyMeaning:
    "The jar matches a Solari cookie or localStorage Save. It is not claimOkProfile and not ok.",
  reuseGate: "claimOkProfile",
  defaultLocalStorageAuthKeyNames: DEFAULT_LOCAL_STORAGE_AUTH_KEYS,
} as const

export type SeedShape =
  | "empty"
  | "idp-only"
  | "cookie-strong"
  | "local-storage-auth"
  | "session-strong"
  | "weak-seed"
  | "unknown"

export type SeedReadiness = {
  phase: "post-save"
  shape: SeedShape
  /** Jar matches what Solari editor Save can carry. Not claimOkProfile. */
  solariSaveReady: boolean
  appOriginCookies: boolean
  appOriginCookieCount: number
  localStorageCount: number
  /** Allowlisted names present on the app origin. Never values. */
  localStorageAuthKeyNames: string[]
  sessionStorageCount?: number
  /** Counted sessionStorage is 0. Expected on editor Save. */
  sessionStorageMiss: boolean
  sessionStorageStale?: boolean
  idpOnly: boolean
  idpOnlyKind?: IdpOnlyKind
  weakSeed: boolean
}

export type SeedReadinessInput = {
  name?: string
  profile?: string
  url?: string
  siteHost?: string
  cookies?: number
  origins?: number
  sessionStorage?: number
  sessionStorageStale?: boolean
  cookieHosts?: string[]
  liveHost?: string
  appOriginCookieCount?: number
  localStorageCount?: number
  localStorageAuthKeyNames?: string[]
}

const AUTH_KEY_NAME = /^[A-Za-z0-9._:-]{1,80}$/

export function isSafeAuthKeyName(name: string): boolean {
  if (!AUTH_KEY_NAME.test(name)) return false
  if (/eyJ[\w-]+\.[\w-]+/.test(name)) return false
  if (/slr_[a-z]+_/i.test(name)) return false
  return true
}

/** Comma-separated CLI names. Throws when a token looks like a value. */
export function parseAuthKeyNames(raw: string): string[] {
  const names = raw.split(",").map((part) => part.trim()).filter(Boolean)
  if (names.length === 0) throw new Error("--auth-keys needs at least one key name")
  for (const name of names) {
    if (!isSafeAuthKeyName(name)) {
      throw new Error("auth key names are names only, not token values")
    }
  }
  return names
}

export function mergeAuthKeyNames(extra?: string[]): string[] {
  const names = new Set<string>(DEFAULT_LOCAL_STORAGE_AUTH_KEYS)
  for (const raw of extra ?? []) {
    const name = raw.trim()
    if (!name) continue
    if (!isSafeAuthKeyName(name)) throw new Error("auth key names are names only, not token values")
    names.add(name)
  }
  return [...names]
}

export function localStorageAuthKeyNames(
  state: StorageState | null | undefined,
  origin: string,
  allowlist: readonly string[] = DEFAULT_LOCAL_STORAGE_AUTH_KEYS,
): string[] {
  const allowed = new Set(allowlist)
  const rec = (state?.origins ?? []).find((row) => row?.origin === origin)
  const found: string[] = []
  for (const item of rec?.localStorage ?? []) {
    const name = item?.name
    if (!name || name.startsWith(SESSION_STORAGE_PREFIX)) continue
    if (!allowed.has(name) || found.includes(name)) continue
    found.push(name)
  }
  return found
}

function marketingTarget(opts: { name?: string; profile?: string; url?: string }): boolean {
  const name = (opts.name ?? "").trim().toLowerCase()
  const profile = (opts.profile ?? "").trim().toLowerCase()
  if (name === "ironadamant" || name === "checkpoint" || profile === "ironadamant" || profile === "checkpoint") {
    return true
  }
  const raw = opts.url?.trim()
  return Boolean(raw && isPublicMarketingUrl(raw))
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
 * or folded expiresOn is stale, and the jar is not a Solari cookie or localStorage Save.
 * Public marketing saved checks stay loggedOut. Unknown sessionStorage is not weakSeed.
 * App-origin cookies or allowlisted localStorage auth key names are not weakSeed.
 */
export function isWeakSeed(opts: SeedReadinessInput): boolean {
  const siteHost = opts.siteHost ?? siteHostFromUrl(opts.url)
  if (hasAppOriginCookies({ ...opts, siteHost })) return false
  if ((opts.localStorageAuthKeyNames ?? []).length > 0) return false
  const missingSs = opts.sessionStorage === 0
  const staleSs = opts.sessionStorageStale === true
  if (!missingSs && !staleSs) return false
  const hasStore = (opts.cookies ?? 0) > 0 || (opts.origins ?? 0) > 0
  if (!hasStore) return false
  if (isConsistencyHubTarget(opts)) return true
  if (marketingTarget(opts)) return false
  return true
}

export function classifySeedReadiness(opts: SeedReadinessInput): SeedReadiness {
  const siteHost = opts.siteHost ?? siteHostFromUrl(opts.url)
  const names = opts.localStorageAuthKeyNames ?? []
  const appOriginCookieCount =
    typeof opts.appOriginCookieCount === "number"
      ? opts.appOriginCookieCount
      : hasAppOriginCookies({ ...opts, siteHost })
        ? (opts.cookieHosts ?? []).filter((host) => {
            const site = siteHost ?? ""
            const h = host.trim().toLowerCase().replace(/^\./, "")
            return site.length > 0 && h.length > 0 && (hostIs(h, site) || hostIs(site, h))
          }).length
        : 0
  const appOriginCookies = appOriginCookieCount > 0
  const localStorageCount = opts.localStorageCount ?? 0
  const sessionStorageMiss = opts.sessionStorage === 0
  const idpOnly =
    !marketingTarget(opts) &&
    isIdpOnlySave({
      cookieHosts: opts.cookieHosts,
      siteHost,
      sessionStorage: opts.sessionStorage,
      sessionStorageStale: opts.sessionStorageStale,
      liveHost: opts.liveHost,
      cookies: opts.cookies,
      origins: opts.origins,
      localStorageAuthKeyNames: names,
    })
  const weakSeed = isWeakSeed({ ...opts, siteHost })
  const base = {
    phase: "post-save" as const,
    appOriginCookies,
    appOriginCookieCount,
    localStorageCount,
    localStorageAuthKeyNames: names,
    ...(opts.sessionStorage !== undefined ? { sessionStorageCount: opts.sessionStorage } : {}),
    sessionStorageMiss,
    ...(opts.sessionStorageStale ? { sessionStorageStale: true } : {}),
    idpOnly,
    weakSeed,
  }
  if ((opts.cookies ?? 0) === 0 && (opts.origins ?? 0) === 0 && !appOriginCookies && names.length === 0) {
    return { ...base, shape: "empty", solariSaveReady: false, idpOnly: false, weakSeed: false }
  }
  if (marketingTarget(opts)) {
    return { ...base, shape: "unknown", solariSaveReady: false, idpOnly: false, weakSeed: false }
  }
  if (appOriginCookies) {
    return { ...base, shape: "cookie-strong", solariSaveReady: true, weakSeed: false, idpOnly: false }
  }
  if (names.length > 0) {
    return { ...base, shape: "local-storage-auth", solariSaveReady: true, weakSeed: false, idpOnly: false }
  }
  if (idpOnly) {
    return {
      ...base,
      shape: "idp-only",
      solariSaveReady: false,
      weakSeed: false,
      idpOnlyKind: idpOnlyKind({ liveHost: opts.liveHost, siteHost }),
    }
  }
  if ((opts.sessionStorage ?? 0) > 0 && opts.sessionStorageStale !== true) {
    return { ...base, shape: "session-strong", solariSaveReady: false, weakSeed: false }
  }
  if (weakSeed) return { ...base, shape: "weak-seed", solariSaveReady: false }
  return { ...base, shape: "unknown", solariSaveReady: false }
}

export function cookieSaveGuide(opts: {
  profile: string
  readiness: SeedReadiness
  url?: string
  expect?: string
}): { text: string; nextCall: NextCall } {
  const name = opts.profile.trim() || "<name>"
  const evidence =
    opts.readiness.shape === "local-storage-auth"
      ? `Allowlisted localStorage auth key names on the app origin: ${opts.readiness.localStorageAuthKeyNames.join(", ")}.`
      : `App-origin cookie count: ${opts.readiness.appOriginCookieCount}.`
  const miss = opts.readiness.sessionStorageMiss
    ? "Counted sessionStorage is 0. That miss is expected on Solari editor Save."
    : "sessionStorage on this jar is informational."
  const text =
    `Solari Save for --profile ${name} is ${opts.readiness.shape}. ${evidence} ${miss} ` +
    `Editor Save stores cookies and localStorage only. Auspex does not invent sessionStorage. ` +
    `Run check --verify-with-profile and read claimOkProfile. ` +
    `solariSaveReady is not claimOkProfile. ok is not claimOk and not claimOkProfile. ` +
    `Do not finalize to invent sessionStorage. IdP hosts alone are not this shape. ` +
    `A first-party session cookie, or a short-lived access token written to an allowlisted localStorage key after OAuth, is app-side.`
  return {
    text,
    nextCall: checkVerifyNextCall(name === "<name>" ? "" : name, { url: opts.url, expect: opts.expect }),
  }
}
