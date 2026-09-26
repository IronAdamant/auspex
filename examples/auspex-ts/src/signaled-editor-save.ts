/** POST Solari editor/save when Save is signaled. A second call signals the waiter. */

import { isStreamExpired } from "./handoff-doors.ts"
import {
  consumeSaveDrain,
  readSaveWaiter,
  registerSaveWaiter,
  saveSignaledNext,
  signalSaveDrain,
  waiterIsOtherProcess,
} from "./save-drain.ts"
import {
  saveEditorWithNotSavableReuse,
  type EditorSaveOutcome,
  type EditorSaveSnap,
} from "./editor-save-attempt.ts"
import { parseStreamExpiresAtMs } from "./stream-deadline.ts"

export type SaveSignal = "drain" | "version" | "expired" | "timeout"

export async function waitForSaveSignal(opts: {
  sinceVersion: number
  deadlineMs: number
  now: () => number
  sleep: (ms: number) => Promise<void>
  pollMs?: number
  readVersion: () => Promise<number>
  consumeDrain: () => Promise<boolean>
  streamExpiresAt?: string
  onProgress?: (phase: string) => void
}): Promise<SaveSignal> {
  const pollMs = opts.pollMs ?? 2_000
  while (true) {
    const now = opts.now()
    const past = isStreamExpired({ expiresAt: opts.streamExpiresAt, nowSec: Math.floor(now / 1000) })
    if (past) return "expired"
    if (now >= opts.deadlineMs) return "timeout"
    if (await opts.consumeDrain()) return "drain"
    const version = await opts.readVersion()
    if (version > opts.sinceVersion) return "version"
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

export type SignaledSaveMode = "posted" | "signaled-waiter" | "expired-before-save"

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
  const other = await readSaveWaiter(opts.profile, opts.drainRoot)
  if (waiterIsOtherProcess(other)) {
    await signalSaveDrain(opts.profile, opts.drainRoot, "paste")
    opts.onProgress?.("await: signaled the running Save. Do not kill that process.")
    return { mode: "signaled-waiter", next: saveSignaledNext(opts.profile) }
  }

  const postNow = async (): Promise<{ mode: SignaledSaveMode; editorSave: EditorSaveOutcome }> => {
    await consumeSaveDrain(opts.profile, opts.drainRoot)
    opts.onProgress?.("await: Save signaled. POST editor/save")
    const editorSave = await saveEditorWithNotSavableReuse({
      save: opts.save,
      editorStillLive: opts.editorStillLive,
      onProgress: opts.onProgress,
    })
    return { mode: "posted", editorSave }
  }

  if (!opts.waitForSaveSignal) return postNow()

  const claimed = await registerSaveWaiter(opts.profile, opts.drainRoot)
  if (!claimed.ok) {
    await signalSaveDrain(opts.profile, opts.drainRoot, "paste")
    opts.onProgress?.("await: signaled the running Save. Do not kill that process.")
    return { mode: "signaled-waiter", next: saveSignaledNext(opts.profile) }
  }
  try {
    await consumeSaveDrain(opts.profile, opts.drainRoot)
    const signal = await waitForSaveSignal({
      sinceVersion: opts.sinceVersion,
      deadlineMs: opts.deadlineMs,
      now,
      sleep,
      readVersion: opts.readVersion,
      consumeDrain: () => consumeSaveDrain(opts.profile, opts.drainRoot),
      streamExpiresAt: opts.streamExpiresAt,
      onProgress: opts.onProgress,
      pollMs: opts.pollMs,
    })
    if (signal === "expired" || signal === "timeout") {
      opts.onProgress?.("await: Solari token ended before Save. stream-expired. Not claiming cookies.")
      return { mode: "expired-before-save" }
    }
    opts.onProgress?.(`await: Save signaled (${signal}). POST editor/save`)
    const editorSave = await saveEditorWithNotSavableReuse({
      save: opts.save,
      editorStillLive: opts.editorStillLive,
      onProgress: opts.onProgress,
    })
    return { mode: "posted", editorSave }
  } finally {
    await claimed.release()
  }
}
