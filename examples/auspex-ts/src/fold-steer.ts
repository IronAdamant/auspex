/** editorSave 200 + fold no-cdp is a finalize path. stream-expired is not the lead. */

import type { EditorFoldResult } from "./editor-fold.ts"
import { finalizeLoginNextCall, type NextCall } from "./next-call.ts"

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

/**
 * True when the operator story is finalize-login, even if the VNC JWT is past.
 * Empty seeds stay on remint. A successful fold is not this path.
 */
export function shouldSteerToFinalize(opts: {
  editorSave?: EditorSaveSnap
  editorFold?: EditorFoldResult
  cookies?: number
  origins?: number
  hostChanged?: boolean
}): boolean {
  if (opts.hostChanged) return false
  if (!seedHasCookies(opts)) return false
  if (opts.editorFold?.ok) return false
  if (opts.editorSave?.ok) return foldCannotRefresh(opts.editorFold)
  if (opts.editorSave && !opts.editorSave.ok) return foldCannotRefresh(opts.editorFold)
  return false
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
      ? " The VNC JWT may already be past. That is not a remint. Cookies are already in the profile."
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
