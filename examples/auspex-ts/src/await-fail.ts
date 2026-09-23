/** Fail-closed await-login statuses. Extra keys only; check schema v1 reasons stay frozen. */

import type { NextCall } from "./next-call.ts"
import { boundPromise } from "./timeout.ts"

export const STREAM_EXPIRED_STATUS = "stream-expired"
export const EDITOR_SAVE_HUNG_STATUS = "editor-save-hung"
export const PROFILE_BUSY_AWAIT_STATUS = "profile-busy"

export const AWAIT_FAIL_CLOSED_STATUSES = [
  STREAM_EXPIRED_STATUS,
  EDITOR_SAVE_HUNG_STATUS,
  PROFILE_BUSY_AWAIT_STATUS,
] as const

export type AwaitFailClosedStatus = (typeof AWAIT_FAIL_CLOSED_STATUSES)[number]

/** Bound around Solari editor/save so await does not hang under a parallel finalize. */
export const EDITOR_SAVE_BOUND_MS = 30_000
/** Bound around editor CDP fold capture (connect already has a 15s timeout). */
export const EDITOR_FOLD_BOUND_MS = 30_000
/** After VNC/stream expiry, poll Save once or twice — do not sit the full 30 minutes. */
export const STREAM_EXPIRED_WAIT_MS = 8_000

export function remintLoginNextCall(profile: string): NextCall {
  const nextCall: NextCall = { tool: "auspex_login" }
  const name = profile.trim()
  if (name) nextCall.profile = name
  return nextCall
}

export function streamExpiredGuide(profile: string): { text: string; nextCall: NextCall } {
  const name = profile.trim() || "<name>"
  return {
    text:
      `status stream-expired: the VNC/phone stream (JWT ~5 min, or stored streamExpiresAt) is past. ` +
      `This is not loggedOut, needsHuman, or a Solari 502. Do not poll await-login for 30 minutes. ` +
      `Remint now: npx auspex login --profile ${name} (MCP: auspex_login). ` +
      `Ask the human to open the new handoff.url.`,
    nextCall: remintLoginNextCall(name === "<name>" ? "" : name),
  }
}

export function editorSaveHungGuide(profile: string): { text: string; nextCall: NextCall } {
  const name = profile.trim() || "<name>"
  const nextCall: NextCall = { tool: "auspex_await_login", saveEditor: true }
  if (name !== "<name>") nextCall.profile = name
  return {
    text:
      `status editor-save-hung: editorSave or editorFold timed out. Fail-closed. ` +
      `Do not run finalize-login in parallel (ProfileBusy race). ` +
      `Retry npx auspex await-login --profile ${name} --save-editor once. ` +
      `Remint auspex_login if it hangs again or returns stream-expired.`,
    nextCall,
  }
}

export function profileBusyAwaitGuide(profile: string): { text: string; nextCall: NextCall } {
  const name = profile.trim() || "<name>"
  const nextCall: NextCall = { tool: "auspex_await_login", saveEditor: true }
  if (name !== "<name>") nextCall.profile = name
  return {
    text:
      `status profile-busy: another Auspex save holds the profile lock (often finalize-login). ` +
      `Do not start a second finalize-login. Retry npx auspex await-login --profile ${name} --save-editor ` +
      `after that save ends.`,
    nextCall,
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
