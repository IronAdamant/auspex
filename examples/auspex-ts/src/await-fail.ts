/** Fail-closed await-login statuses. Extra keys only; check schema v1 reasons stay frozen. */

import { OPS_GUIDE } from "./door-await-contract.ts"
import { awaitSaveEditorNextCall, remintLoginNextCall, type NextCall } from "./next-call.ts"
import { boundPromise } from "./timeout.ts"

export const STREAM_EXPIRED_STATUS = "stream-expired"
export const EDITOR_SAVE_HUNG_STATUS = "editor-save-hung"
export const PROFILE_BUSY_AWAIT_STATUS = "profile-busy"

/** Bound around Solari editor/save so await does not hang under a parallel finalize. */
export const EDITOR_SAVE_BOUND_MS = 30_000
/** Bound around editor CDP fold capture (connect already has a 15s timeout). */
export const EDITOR_FOLD_BOUND_MS = 30_000
/** After VNC/stream expiry, poll Save once or twice — do not sit the full 30 minutes. */
export const STREAM_EXPIRED_WAIT_MS = 8_000

/** Completed editor/save HTTP statuses. A dead VNC JWT is a separate signal. */
export function isEditorSaveInfraStatus(status: number | undefined): boolean {
  return status === 502 || status === 503 || status === 504
}

const WAITING_NEXT = /Keep the handoff open|Still waiting for non-empty Save|No non-empty Save yet/

/** Drop a "still waiting for Save" sentence after the POST has already finished. */
export function dropWaitingLead(next: string): string {
  const trimmed = next.trim()
  if (!trimmed || WAITING_NEXT.test(trimmed)) return ""
  return trimmed
}

/**
 * Next-copy lead after a completed editor/save failure.
 * Names the HTTP status. A Solari 5xx stays a Solari 5xx.
 */
export function completedEditorSaveFailureLead(
  saved: { status: number; error?: string },
  emptyJar: boolean,
): string {
  const detail = saved.error ? `: ${saved.error}` : ""
  const stand = isEditorSaveInfraStatus(saved.status)
    ? `Solari ${saved.status} stands. This is not loggedOut or needsHuman. `
    : ""
  const jar = emptyJar ? "The jar is empty. " : ""
  return (
    `editorSave failed (${saved.status}${detail}). POST finished. ${stand}${jar}` +
    `Not a 30-minute wait. Do not finalize-login on this seed. `
  )
}

/**
 * Jar-poll budget after editor/save.
 * A completed non-2xx (including 502/503/504) uses the short cap and must not be labeled stream-expired by itself.
 * editorSave.ok keeps the plan timeout (full poll while the JWT is alive).
 * 409 not-savable exhaustion arrives as streamExpired and keeps this same short cap.
 */
export function profileSaveWaitTimeoutMs(opts: {
  timeoutMs?: number
  streamExpired: boolean
  editorHung: boolean
  editorSaveInfra5xx: boolean
  /** Completed 4xx/5xx. Same short cap as a Solari 5xx. Does not mark the stream expired. */
  editorSaveCompletedFailure?: boolean
  preflight: "proceed" | "low" | "past"
  streamWaitTimeoutMs?: number
}): number | undefined {
  if (
    opts.streamExpired ||
    opts.editorHung ||
    opts.editorSaveInfra5xx ||
    opts.editorSaveCompletedFailure
  ) {
    return Math.min(opts.timeoutMs ?? STREAM_EXPIRED_WAIT_MS, STREAM_EXPIRED_WAIT_MS)
  }
  if (opts.preflight === "low") return opts.streamWaitTimeoutMs ?? STREAM_EXPIRED_WAIT_MS
  return opts.streamWaitTimeoutMs
}

function streamExpiredNotLine(editorSaveStatus?: number): string {
  if (isEditorSaveInfraStatus(editorSaveStatus)) {
    return (
      `editorSave returned Solari ${editorSaveStatus}. That status stands. ` +
      `This is not loggedOut or needsHuman. Do not poll await-login for 30 minutes. `
    )
  }
  return `This is not loggedOut, needsHuman, or a Solari 502. Do not poll await-login for 30 minutes. `
}

export function streamExpiredGuide(
  profile: string,
  opts?: { editorSaveStatus?: number },
): { text: string; nextCall: NextCall } {
  const name = profile.trim() || "<name>"
  return {
    text:
      `status stream-expired: the VNC/phone stream is past and this profile has no cookies to finalize. ` +
      `Solari editor JWTs last about 5 minutes. Auspex cannot extend them (POST /editor/token has no TTL). ` +
      streamExpiredNotLine(opts?.editorSaveStatus) +
      `Remint now: npx auspex login --profile ${name} (MCP: auspex_login). ` +
      `Ask the human to open the new handoff.url. Email or SMS codes that outlive the JWT need a Solari-side longer token or reconnect. ${OPS_GUIDE}`,
    nextCall: remintLoginNextCall(name === "<name>" ? "" : name),
  }
}

export function editorSaveHungGuide(profile: string): { text: string; nextCall: NextCall } {
  const name = profile.trim() || "<name>"
  return {
    text:
      `status editor-save-hung: editorSave or editorFold timed out. Fail-closed. ` +
      `Do not run finalize-login in parallel (ProfileBusy race). ` +
      `Retry npx auspex await-login --profile ${name} --save-editor once. ` +
      `Remint auspex_login if it hangs again or returns stream-expired.`,
    nextCall: awaitSaveEditorNextCall(name === "<name>" ? "" : name),
  }
}

export function profileBusyAwaitGuide(profile: string): { text: string; nextCall: NextCall } {
  const name = profile.trim() || "<name>"
  return {
    text:
      `status profile-busy: another Auspex save holds the profile lock (often finalize-login). ` +
      `Do not start a second finalize-login. Retry npx auspex await-login --profile ${name} --save-editor ` +
      `after that save ends.`,
    nextCall: awaitSaveEditorNextCall(name === "<name>" ? "" : name),
  }
}

export function isBoundTimeoutMessage(error: string): boolean {
  return /timed out after/i.test(error)
}

export function isProfileBusyMessage(error: string | undefined): boolean {
  if (!error) return false
  return /ProfileBusy|is locked by another Auspex process/i.test(error)
}

export async function boundEditorWork<T>(
  work: () => Promise<T>,
  ms: number,
  message: string,
): Promise<{ ok: true; value: T } | { ok: false; hung: true; error: string }> {
  try {
    return { ok: true, value: await boundPromise(work(), ms, message) }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    if (isBoundTimeoutMessage(error)) return { ok: false, hung: true, error }
    throw err
  }
}
