/**
 * One Solari editor/save, and one live /editor/token check when the editor is not savable.
 * The token call does not lengthen the JWT and the token is not returned.
 */

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
}

export function isNotSavableConflict(status: number, error?: string): boolean {
  return status === 409 && /not in a savable state/i.test(error ?? "")
}

/**
 * POST editor/save. On 409 "not in a savable state", ask /editor/token once.
 * A token means the editor still exists: save one more time. Otherwise stop.
 * A failed save stays not ok. This function does not read cookies.
 */
export async function saveEditorWithNotSavableReuse(opts: {
  save: () => Promise<EditorSaveSnap>
  editorStillLive: () => Promise<boolean>
  onProgress?: (phase: string) => void
}): Promise<EditorSaveOutcome> {
  const first = await opts.save()
  if (first.hung || !isNotSavableConflict(first.status, first.error)) return first
  opts.onProgress?.("await: editor/save 409 not in a savable state. One live editor/token check.")
  let live = false
  try {
    live = await opts.editorStillLive()
  } catch {
    live = false
  }
  if (!live) {
    opts.onProgress?.("await: editor token is gone. stream-expired. Not claiming cookies.")
    return { ...first, ok: false, notSavableExhausted: true, tokenReuse: false }
  }
  opts.onProgress?.("await: editor still live. POST editor/save once more.")
  const second = await opts.save()
  if (second.hung) return { ...second, ok: false, tokenReuse: true }
  if (!second.ok) {
    opts.onProgress?.("await: editor/save failed after the token check. stream-expired. Not claiming cookies.")
    return { ...second, ok: false, notSavableExhausted: true, tokenReuse: true }
  }
  return { ...second, tokenReuse: true }
}
