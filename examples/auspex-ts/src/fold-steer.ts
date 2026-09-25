/** editorSave 200 + fold no-cdp is a finalize path. stream-expired is not the lead. */

import type { EditorFoldResult } from "./editor-fold.ts"
import { cookieHostsAreIdpOnly } from "./login-trace.ts"
import { finalizeLoginNextCall, remintLoginNextCall, type NextCall } from "./next-call.ts"
import { hostIs } from "./sso.ts"

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

/** Site host is absent when no cookie host is that host or a subdomain of it. */
export function cookieJarOmitsSite(hosts: string[], siteHost?: string): boolean {
  const site = siteHost?.trim().toLowerCase().replace(/^\./, "")
  if (!site) return false
  return !hosts.some((h) => hostIs(h, site))
}

/**
 * IdP wall Save: every cookie host is Microsoft/Google, the minted site is missing,
 * and sessionStorage is empty, uncounted, or stale. A jar that includes the site still finalizes.
 */
export function isIdpOnlySave(opts: {
  cookieHosts?: string[]
  siteHost?: string
  sessionStorage?: number
  sessionStorageStale?: boolean
}): boolean {
  const hosts = opts.cookieHosts ?? []
  if (!cookieHostsAreIdpOnly(hosts)) return false
  if (!cookieJarOmitsSite(hosts, opts.siteHost)) return false
  if (opts.sessionStorageStale === true) return true
  return opts.sessionStorage === undefined || opts.sessionStorage === 0
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
}): boolean {
  if (opts.hostChanged) return false
  if (isIdpOnlySave(opts)) return false
  if (!opts.editorSave?.ok) return false
  if (!seedHasCookies(opts)) return false
  if (opts.editorFold?.ok) return false
  return foldCannotRefresh(opts.editorFold)
}

export function idpOnlySaveGuide(profile: string): { text: string; nextCall: NextCall } {
  const name = profile.trim() || "<name>"
  const text =
    `Save stored only Microsoft or Google sign-in cookies for --profile ${name}. The app is not in this jar. ` +
    `Finish Microsoft or Google sign-in, land on the app UI, then tap Save. ` +
    `Remint now: npx auspex login --profile ${name} (MCP: auspex_login). Do not finalize-login on this seed.`
  return { text, nextCall: remintLoginNextCall(name === "<name>" ? "" : name) }
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
