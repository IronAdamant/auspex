/**
 * One Solari editor/save, and one live /editor/token check when the editor is not savable or
 * Solari answered 502/503/504. The token call does not lengthen the JWT and the token is not returned.
 */

import { isEditorSaveInfraStatus } from "./await-fail.ts"

/** Pause before the one more save after a Solari 502/503/504 (the Blame table's retry-once rule). */
export const EDITOR_SAVE_INFRA_RETRY_DELAY_MS = 5_000

export type EditorSaveSnap = {
  ok: boolean
  status: number
  error?: string
  json?: Record<string, unknown>
  /** Bound around the POST timed out. Not a savable-state retry. */
  hung?: boolean
}

export type EditorSaveOutcome = EditorSaveSnap & {
  /** 409 not-savable, and the one live token check did not end in a successful save. */
  notSavableExhausted?: boolean
  /** True when /editor/token returned a token and a second save was attempted. */
  tokenReuse?: boolean
  /** Solari HTTP status of that one /editor/token check (0 when it threw). */
  tokenStatus?: number
  /** The first editor/save got this Solari 502/503/504; the editor was still live, so it saved once more. */
  retriedAfter?: number
}

/** A boolean, or the token probe with Solari's status. */
export type EditorLiveProbe = boolean | { live: boolean; status: number }

/** Await receipt slice. Counts no cookies. Omits the Solari JSON body. */
export type EditorSaveReceipt = {
  ok: boolean
  status: number
  error?: string
  notSavableExhausted?: boolean
  tokenReuse?: boolean
  tokenStatus?: number
  retriedAfter?: number
}

export function editorSaveForReceipt(saved: EditorSaveOutcome): EditorSaveReceipt {
  const receipt: EditorSaveReceipt = {
    ok: saved.ok,
    status: saved.status,
    ...(saved.error !== undefined ? { error: saved.error } : {}),
  }
  if (saved.notSavableExhausted === true) receipt.notSavableExhausted = true
  if (typeof saved.tokenReuse === "boolean") receipt.tokenReuse = saved.tokenReuse
  if (typeof saved.tokenStatus === "number") receipt.tokenStatus = saved.tokenStatus
  if (typeof saved.retriedAfter === "number") receipt.retriedAfter = saved.retriedAfter
  return receipt
}

/**
 * Solari's live 409 body is "The editor isn't in a savable state."
 * Uncontracted copy ("is not" / "not in a savable state") is the same conflict.
 * Word boundaries keep "cannot…" and "isn't ready" off this path.
 */
const NOT_SAVABLE_STATE = /(?:\bisn['\u2019\u2018]t|\bnot)\s+in\s+a\s+savable\s+state\b/i

export function isNotSavableConflict(status: number, error?: string): boolean {
  return status === 409 && NOT_SAVABLE_STATE.test(error ?? "")
}

/**
 * stderr line after a completed non-200 editor/save.
 * The 409 not-savable path keeps its own lines. A hung POST (status 0) is not this line.
 */
export function editorSaveHttpProgress(saved: EditorSaveSnap): string | undefined {
  if (saved.ok || saved.hung || saved.status < 400) return undefined
  if (isNotSavableConflict(saved.status, saved.error)) return undefined
  const detail = saved.error ? ` ${saved.error}` : ""
  const stand =
    saved.status === 502 || saved.status === 503 || saved.status === 504 ? " Solari status stands." : ""
  return `await: editor/save ${saved.status}${detail}. POST finished.${stand} Short jar poll. Not a 30-minute wait.`
}

async function probeEditorLive(
  editorStillLive: () => Promise<EditorLiveProbe>,
): Promise<{ live: boolean; tokenStatus?: number }> {
  try {
    const probe = await editorStillLive()
    return typeof probe === "boolean" ? { live: probe } : { live: probe.live, tokenStatus: probe.status }
  } catch {
    return { live: false, tokenStatus: 0 }
  }
}

/**
 * POST editor/save. On that 409, or on a Solari 502/503/504, ask /editor/token once.
 * A token means the editor still exists: save one more time. Otherwise stop.
 * A failed save stays not ok. This function does not read cookies.
 * The token call does not lengthen the JWT and the token is not returned.
 */
export async function saveEditorWithNotSavableReuse(opts: {
  save: () => Promise<EditorSaveSnap>
  editorStillLive: () => Promise<EditorLiveProbe>
  onProgress?: (phase: string) => void
  /** Test seam for the pause before a 5xx retry. */
  sleep?: (ms: number) => Promise<void>
}): Promise<EditorSaveOutcome> {
  const first = await opts.save()
  if (!first.hung && isEditorSaveInfraStatus(first.status)) return retryAfterInfraError(first, opts)
  if (first.hung || !isNotSavableConflict(first.status, first.error)) {
    const progress = editorSaveHttpProgress(first)
    if (progress) opts.onProgress?.(progress)
    return first
  }
  opts.onProgress?.("await: editor/save 409 not in a savable state. One live editor/token check.")
  const { live, tokenStatus } = await probeEditorLive(opts.editorStillLive)
  const token = tokenStatus !== undefined ? { tokenStatus } : {}
  if (!live) {
    const seen = tokenStatus !== undefined ? ` (editor/token ${tokenStatus})` : ""
    opts.onProgress?.(`await: editor token is gone${seen}. stream-expired. Not claiming cookies.`)
    return { ...first, ok: false, notSavableExhausted: true, tokenReuse: false, ...token }
  }
  opts.onProgress?.("await: editor still live. POST editor/save once more.")
  const second = await opts.save()
  if (second.hung) return { ...second, ok: false, tokenReuse: true, ...token }
  if (!second.ok) {
    opts.onProgress?.("await: editor/save failed after the token check. stream-expired. Not claiming cookies.")
    return { ...second, ok: false, notSavableExhausted: true, tokenReuse: true, ...token }
  }
  return { ...second, tokenReuse: true, ...token }
}

/**
 * A Solari 502/503/504 on editor/save is usually brief (live, tldraw: "Failed to export
 * storageState" with two minutes of door left; the same save worked the next morning). Before the
 * human is sent back to sign in again, wait a moment and, if the editor is still live, save once
 * more. Otherwise, or if that save fails too, the Solari status stands exactly as before.
 */
async function retryAfterInfraError(
  first: EditorSaveSnap,
  opts: {
    save: () => Promise<EditorSaveSnap>
    editorStillLive: () => Promise<EditorLiveProbe>
    onProgress?: (phase: string) => void
    sleep?: (ms: number) => Promise<void>
  },
): Promise<EditorSaveOutcome> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const detail = first.error ? ` ${first.error}` : ""
  opts.onProgress?.(
    `await: editor/save ${first.status}${detail}. Solari infra error. ` +
      `One live editor/token check in ${EDITOR_SAVE_INFRA_RETRY_DELAY_MS / 1000} s, then one more save.`,
  )
  await sleep(EDITOR_SAVE_INFRA_RETRY_DELAY_MS)
  const { live, tokenStatus } = await probeEditorLive(opts.editorStillLive)
  const token = tokenStatus !== undefined ? { tokenStatus } : {}
  if (!live) {
    const seen = tokenStatus !== undefined ? ` (editor/token ${tokenStatus})` : ""
    opts.onProgress?.(`await: editor token is gone${seen}. No retry.`)
    const progress = editorSaveHttpProgress(first)
    if (progress) opts.onProgress?.(progress)
    return { ...first, ok: false, tokenReuse: false, ...token }
  }
  opts.onProgress?.("await: editor still live. POST editor/save once more.")
  const second = await opts.save()
  const retried = { tokenReuse: true, retriedAfter: first.status, ...token }
  if (second.ok) {
    opts.onProgress?.(`await: editor/save succeeded on the retry after Solari ${first.status}.`)
    return { ...second, ...retried }
  }
  const progress = editorSaveHttpProgress(second)
  if (progress) opts.onProgress?.(progress)
  return { ...second, ok: false, ...retried }
}
