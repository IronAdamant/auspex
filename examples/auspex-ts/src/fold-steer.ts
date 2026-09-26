/** editorSave 200 + fold no-cdp is a finalize path. stream-expired is not the lead. */

import type { EditorFoldResult } from "./editor-fold.ts"
import { cookieHostsAreIdpOnly } from "./login-trace.ts"
import { finalizeLoginNextCall, remintLoginNextCall, type NextCall } from "./next-call.ts"
import { hostIs } from "./sso.ts"

export function hasAppOriginCookies(opts: {
  cookieHosts?: string[]
  siteHost?: string
  appOriginCookieCount?: number
}): boolean {
  if (typeof opts.appOriginCookieCount === "number") return opts.appOriginCookieCount > 0
  const site = opts.siteHost?.trim().toLowerCase().replace(/^\./, "")
  if (!site) return false
  return (opts.cookieHosts ?? []).some((host) => {
    const h = host.trim().toLowerCase().replace(/^\./, "")
    return h.length > 0 && (hostIs(h, site) || hostIs(site, h))
  })
}

export const DEAD_FOLD_VERIFY_BAN =
  "Do not run check --verify-with-profile against this editor fold — claimOkProfile will not pass on a dead fold. " +
  "That verify path is removed. After finalize-login writes the profile store, --verify-with-profile boots a fresh Solari session from that store (no editor JWT, no fold CDP)."

export const FOLD_CANNOT_REFRESH = new Set(["no-cdp", "capture-empty", "connect-failed"])

export type EditorSaveSnap = { ok: boolean; status: number; error?: string }

export function foldCannotRefresh(fold?: EditorFoldResult): boolean {
  if (!fold) return true
  if (fold.ok) return false
  return FOLD_CANNOT_REFRESH.has(fold.reason)
}

export function seedHasCookies(seed: { cookies?: number; origins?: number }): boolean {
  return (seed.cookies ?? 0) > 0 || (seed.origins ?? 0) > 0
}

export function siteHostFromUrl(url?: string): string | undefined {
  const raw = url?.trim()
  if (!raw) return undefined
  try {
    return new URL(raw).hostname.toLowerCase()
  } catch {
    return undefined
  }
}

/**
 * Site host is absent when no cookie host is that host, a subdomain, or a parent domain.
 * Parent-domain cookies (example.com for app.example.com) count as the app.
 */
export function cookieJarOmitsSite(hosts: string[], siteHost?: string): boolean {
  const site = siteHost?.trim().toLowerCase().replace(/^\./, "")
  if (!site) return false
  return !hasAppOriginCookies({ cookieHosts: hosts, siteHost: site })
}

function sessionStorageUnusable(opts: { sessionStorage?: number; sessionStorageStale?: boolean }): boolean {
  if (opts.sessionStorageStale === true) return true
  return opts.sessionStorage === undefined || opts.sessionStorage === 0
}

/**
 * IdP-only Save: the minted site is missing from the jar, and sessionStorage is empty,
 * uncounted, or stale. Either every cookie host is a Microsoft/Google sign-in host
 * (including google.com and www.google.com apex cookies), or cookies are present and
 * liveHost is already the app. App-origin cookies or allowlisted localStorage
 * auth key names are a Solari cookie Save, not this refuse.
 */
export function isIdpOnlySave(opts: {
  cookieHosts?: string[]
  siteHost?: string
  sessionStorage?: number
  sessionStorageStale?: boolean
  liveHost?: string
  cookies?: number
  origins?: number
  appOriginCookieCount?: number
  /** Allowlisted localStorage auth key names on the app origin. Names only. */
  localStorageAuthKeyNames?: string[]
}): boolean {
  if ((opts.localStorageAuthKeyNames ?? []).length > 0) return false
  if (hasAppOriginCookies(opts)) return false
  const hosts = opts.cookieHosts ?? []
  if (!cookieJarOmitsSite(hosts, opts.siteHost)) return false
  if (!sessionStorageUnusable(opts)) return false
  if (cookieHostsAreIdpOnly(hosts)) return true
  const hasCookies = (opts.cookies ?? 0) > 0 || (opts.origins ?? 0) > 0 || hosts.length > 0
  if (!hasCookies) return false
  return idpOnlyKind({ liveHost: opts.liveHost, siteHost: opts.siteHost }) === "app-visible"
}

/**
 * A poll that already drained the JWT on a jar that omits the app host must stay
 * stream-expired or timeout. Finalize steer must not rewrite that result.
 */
export function foldLeadBlockedByDrain(opts: {
  status?: string
  cookieHosts?: string[]
  siteHost?: string
}): boolean {
  if (opts.status !== "stream-expired" && opts.status !== "timeout") return false
  const hosts = opts.cookieHosts ?? []
  if (hosts.length === 0) return false
  return cookieJarOmitsSite(hosts, opts.siteHost)
}

/**
 * Finalize only after a successful editor save whose fold cannot refresh sessionStorage.
 * A failed editorSave plus leftover cookies is not this path (pre-login jars look the same).
 * An IdP-only jar is not a finished login.
 */
export function shouldSteerToFinalize(opts: {
  editorSave?: EditorSaveSnap
  editorFold?: EditorFoldResult
  cookies?: number
  origins?: number
  hostChanged?: boolean
  cookieHosts?: string[]
  siteHost?: string
  sessionStorage?: number
  sessionStorageStale?: boolean
  liveHost?: string
  appOriginCookieCount?: number
  localStorageAuthKeyNames?: string[]
  /** Cookie or localStorage Save. Do not finalize to invent sessionStorage. */
  solariSaveReady?: boolean
}): boolean {
  if (opts.hostChanged) return false
  if (opts.solariSaveReady) return false
  if (hasAppOriginCookies(opts) || (opts.localStorageAuthKeyNames ?? []).length > 0) return false
  if (isIdpOnlySave(opts)) return false
  if (!opts.editorSave?.ok) return false
  if (!seedHasCookies(opts)) return false
  if (opts.editorFold?.ok) return false
  return foldCannotRefresh(opts.editorFold)
}

export type IdpOnlyKind = "sign-in-wall" | "app-visible"

/** liveHost is the minted app. The picture can show the dashboard while the jar is still IdP cookies. */
export function idpOnlyKind(opts: { liveHost?: string; siteHost?: string }): IdpOnlyKind {
  const live = opts.liveHost?.trim().toLowerCase().replace(/^\./, "")
  const site = opts.siteHost?.trim().toLowerCase().replace(/^\./, "")
  if (live && site && hostIs(live, site)) return "app-visible"
  return "sign-in-wall"
}

export function idpOnlySaveGuide(
  profile: string,
  opts: { liveHost?: string; siteHost?: string } = {},
): { text: string; nextCall?: NextCall; idpOnlyKind: IdpOnlyKind } {
  const name = profile.trim() || "<name>"
  const kind = idpOnlyKind(opts)
  if (kind === "app-visible") {
    const host = opts.liveHost?.trim() || opts.siteHost?.trim() || "the app"
    const text =
      `Save stored only Microsoft or Google sign-in cookies for --profile ${name}. ` +
      `liveHost is already ${host}, so the remote page is the app, not the sign-in wall. ` +
      `That screen is not a saved login. Solari handoff Save persists cookies and localStorage only ` +
      `(editorFold no-cdp); MSAL sessionStorage in that tab was not captured. ` +
      `Do not finalize-login on this seed: a new session has no app session and returns needsHuman. ` +
      `Do not remint to finish Microsoft. Another Save on this editor cannot read that tab.`
    return { text, idpOnlyKind: kind }
  }
  const text =
    `Save stored only Microsoft or Google sign-in cookies for --profile ${name}. The app is not in this jar. ` +
    `Finish Microsoft or Google sign-in, land on the app UI, then tap Save. ` +
    `Remint now: npx auspex login --profile ${name} (MCP: auspex_login). Do not finalize-login on this seed.`
  return { text, nextCall: remintLoginNextCall(name === "<name>" ? "" : name), idpOnlyKind: kind }
}

export function foldMissFinalizeGuide(opts: {
  profile: string
  editorSave?: EditorSaveSnap
  editorFold?: EditorFoldResult
  streamNoted?: boolean
  url?: string
  expect?: string
}): { text: string; nextCall: NextCall } {
  const name = opts.profile.trim() || "<name>"
  const targets = {
    ...(opts.url?.trim() ? { url: opts.url.trim() } : {}),
    ...(opts.expect?.trim() ? { expect: opts.expect.trim() } : {}),
  }
  const why = !opts.editorSave
    ? "editorFold did not refresh folded sessionStorage."
    : opts.editorSave.ok
      ? `editorSave ${opts.editorSave.status} succeeded. editorFold.${opts.editorFold?.reason ?? "missing"} did not refresh folded sessionStorage.`
      : `editorSave failed (${opts.editorSave.status}${opts.editorSave.error ? `: ${opts.editorSave.error}` : ""}). Fold cannot refresh sessionStorage.`
  const stream =
    opts.streamNoted
      ? " The VNC JWT may already be past. editorSave succeeded and the profile has cookies. That is not a remint. Cookies alone are not proof of login."
      : ""
  const expectNote = targets.expect
    ? ""
    : " Pass --url and --expect for the URL the logged-in app itself lands on."
  const text =
    `Finalize-login NOW for --profile ${name}. ${why}${stream} ` +
    `${DEAD_FOLD_VERIFY_BAN}${expectNote} ` +
    `Remint auspex_login only if finalize-login returns needsHuman.`
  return { text, nextCall: finalizeLoginNextCall(name === "<name>" ? "" : name, targets) }
}
