/** Fail-closed await-login statuses. Extra keys only; check schema v1 reasons stay frozen. */

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

export function streamExpiredGuide(profile: string): { text: string; nextCall: NextCall } {
  const name = profile.trim() || "<name>"
  return {
    text:
      `status stream-expired: the VNC/phone stream is past and this profile has no cookies to finalize. ` +
      `Solari editor JWTs last about 5 minutes. Auspex cannot extend them (POST /editor/token has no TTL). ` +
      `This is not loggedOut, needsHuman, or a Solari 502. Do not poll await-login for 30 minutes. ` +
      `Remint now: npx auspex login --profile ${name} (MCP: auspex_login). ` +
      `Ask the human to open the new handoff.url. Email or SMS codes that outlive the JWT need a Solari-side longer token or reconnect.`,
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
