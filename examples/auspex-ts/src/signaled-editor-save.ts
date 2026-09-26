/** POST Solari editor/save when Save is signaled. A second call signals the waiter. */

import { isStreamExpired } from "./handoff-doors.ts"
import {
  claimSaveOwner,
  consumeSaveDrain,
  readSaveWaiter,
  registerSaveWaiter,
  saveSignaledNext,
  siblingOwnsSave,
  siblingSavedNext,
  signalSaveDrain,
  waiterIsOtherProcess,
} from "./save-drain.ts"
import {
  saveEditorWithNotSavableReuse,
  type EditorSaveOutcome,
  type EditorSaveSnap,
} from "./editor-save-attempt.ts"
import { parseStreamExpiresAtMs } from "./stream-deadline.ts"

export type SaveSignal = "drain" | "version" | "expired" | "timeout" | "sibling-saved"

export async function waitForSaveSignal(opts: {
  sinceVersion: number
  deadlineMs: number
  now: () => number
  sleep: (ms: number) => Promise<void>
  pollMs?: number
  readVersion: () => Promise<number>
  consumeDrain: () => Promise<boolean>
  streamExpiresAt?: string
  siblingOwns?: () => Promise<boolean>
  onProgress?: (phase: string) => void
}): Promise<SaveSignal> {
  const pollMs = opts.pollMs ?? 2_000
  while (true) {
    if (opts.siblingOwns && (await opts.siblingOwns())) return "sibling-saved"
    const now = opts.now()
    const past = isStreamExpired({ expiresAt: opts.streamExpiresAt, nowSec: Math.floor(now / 1000) })
    if (past) {
      if (opts.siblingOwns && (await opts.siblingOwns())) return "sibling-saved"
      return "expired"
    }
    if (now >= opts.deadlineMs) {
      if (opts.siblingOwns && (await opts.siblingOwns())) return "sibling-saved"
      return "timeout"
    }
    if (await opts.consumeDrain()) {
      if (opts.siblingOwns && (await opts.siblingOwns())) return "sibling-saved"
      return "drain"
    }
    const version = await opts.readVersion()
    if (version > opts.sinceVersion) {
      if (opts.siblingOwns && (await opts.siblingOwns())) return "sibling-saved"
      return "version"
    }
    const exp = parseStreamExpiresAtMs(opts.streamExpiresAt)
    const leftSec = exp !== undefined ? Math.max(0, Math.ceil((exp - now) / 1000)) : Math.max(0, Math.ceil((opts.deadlineMs - now) / 1000))
    opts.onProgress?.(
      `await: waiting for Save (${leftSec}s left on the Solari token). Clipboard Save is not the jar.`,
    )
    const remain = Math.max(0, opts.deadlineMs - opts.now())
    if (remain <= 0) return past ? "expired" : "timeout"
    await opts.sleep(Math.min(pollMs, remain))
  }
}

export type SignaledSaveMode = "posted" | "signaled-waiter" | "expired-before-save" | "sibling-saved"

/**
 * waitForSaveSignal: this process is the long waiter (login --wait, job --wait).
 * Otherwise this call is the Save (the paste). If a waiter is already live, signal it and return.
 */
export async function postEditorSaveWhenSignaled(opts: {
  profile: string
  sinceVersion: number
  waitForSaveSignal: boolean
  streamExpiresAt?: string
  deadlineMs: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  readVersion: () => Promise<number>
  save: () => Promise<EditorSaveSnap>
  editorStillLive: () => Promise<boolean>
  onProgress?: (phase: string) => void
  drainRoot?: string
  pollMs?: number
}): Promise<{ mode: SignaledSaveMode; editorSave?: EditorSaveOutcome; next?: string }> {
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  const siblingNext = (): { mode: "sibling-saved"; next: string } => {
    opts.onProgress?.("await: sibling already owns editor/save. Not posting. Not stream-expired.")
    return { mode: "sibling-saved", next: siblingSavedNext(opts.profile) }
  }
  if (await siblingOwnsSave(opts.profile, opts.drainRoot)) return siblingNext()

  const other = await readSaveWaiter(opts.profile, opts.drainRoot)
  if (waiterIsOtherProcess(other)) {
    await signalSaveDrain(opts.profile, opts.drainRoot, "paste")
    opts.onProgress?.("await: signaled the running Save. Do not kill that process.")
    return { mode: "signaled-waiter", next: saveSignaledNext(opts.profile) }
  }

  const postOwned = async (
    progress: string,
  ): Promise<{ mode: SignaledSaveMode; editorSave?: EditorSaveOutcome; next?: string }> => {
    const claim = await claimSaveOwner(opts.profile, opts.drainRoot)
    if (!claim.ok) return siblingNext()
    try {
      await consumeSaveDrain(opts.profile, opts.drainRoot)
      opts.onProgress?.(progress)
      const editorSave = await saveEditorWithNotSavableReuse({
        save: opts.save,
        editorStillLive: opts.editorStillLive,
        onProgress: opts.onProgress,
      })
      await claim.finish(editorSave.ok ? "saved" : "failed", editorSave.status)
      return { mode: "posted", editorSave }
    } catch (err) {
      await claim.finish("failed").catch(() => undefined)
      throw err
    } finally {
      await claim.release()
    }
  }

  if (!opts.waitForSaveSignal) return postOwned("await: Save signaled. POST editor/save")

  const claimed = await registerSaveWaiter(opts.profile, opts.drainRoot)
  if (!claimed.ok) {
    await signalSaveDrain(opts.profile, opts.drainRoot, "paste")
    opts.onProgress?.("await: signaled the running Save. Do not kill that process.")
    return { mode: "signaled-waiter", next: saveSignaledNext(opts.profile) }
  }
  try {
    if (await siblingOwnsSave(opts.profile, opts.drainRoot)) return siblingNext()
    await consumeSaveDrain(opts.profile, opts.drainRoot)
    const signal = await waitForSaveSignal({
      sinceVersion: opts.sinceVersion,
      deadlineMs: opts.deadlineMs,
      now,
      sleep,
      readVersion: opts.readVersion,
      consumeDrain: () => consumeSaveDrain(opts.profile, opts.drainRoot),
      streamExpiresAt: opts.streamExpiresAt,
      siblingOwns: () => siblingOwnsSave(opts.profile, opts.drainRoot),
      onProgress: opts.onProgress,
      pollMs: opts.pollMs,
    })
    if (signal === "sibling-saved") return siblingNext()
    if (signal === "expired" || signal === "timeout") {
      if (await siblingOwnsSave(opts.profile, opts.drainRoot)) return siblingNext()
      opts.onProgress?.("await: Solari token ended before Save. stream-expired. Not claiming cookies.")
      return { mode: "expired-before-save" }
    }
    return postOwned(`await: Save signaled (${signal}). POST editor/save`)
  } finally {
    await claimed.release()
  }
}
