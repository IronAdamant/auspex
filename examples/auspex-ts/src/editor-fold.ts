import type { StorageState } from "@solarisdk/browser"
import { captureStorageState, originStoreCounts, SESSION_STORAGE_PREFIX } from "./profile-storage.ts"
import type { EditorSaveHandle } from "./profiles.ts"

export const EDITOR_FOLD_NO_CDP =
  "Solari profile editor exposes no Playwright CDP after save (noVNC / editor/save is cookies+localStorage only). wsEndpoint and cdpEndpoint exist on POST /sessions, not on the handoff editor. --save-editor did not refresh folded sessionStorage."

export const EDITOR_FOLD_CAPTURE_EMPTY =
  "Editor CDP attach returned no live sessionStorage; refusing to persist (would not refresh the fold)."

export type EditorCdpAttach = {
  wsEndpoint?: string
  cdpEndpoint?: string
  sessionId?: string
}

export type EditorFoldReason = "no-cdp" | "attached" | "persist-blocked" | "capture-empty" | "connect-failed"

export type EditorFoldResult = {
  ok: boolean
  reason: EditorFoldReason
  folded?: number
  via?: "editor-cdp"
  error?: string
}

const WS_RE = /^wss?:\/\//i

function asPlaywrightEndpoint(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const s = value.trim()
  if (!WS_RE.test(s)) return undefined
  if (/vnc/i.test(s)) return undefined
  return s
}

function attachFromRecord(rec: Record<string, unknown>): EditorCdpAttach | undefined {
  const ws =
    asPlaywrightEndpoint(rec.wsEndpoint) ??
    asPlaywrightEndpoint(rec.browserWSEndpoint) ??
    asPlaywrightEndpoint(rec.connectUrl)
  const cdp = asPlaywrightEndpoint(rec.cdpEndpoint) ?? asPlaywrightEndpoint(rec.cdpUrl)
  const sessionRaw = rec.sessionId
  const sessionId = typeof sessionRaw === "string" && sessionRaw.trim() ? sessionRaw.trim() : undefined
  if (!ws && !cdp) return undefined
  return {
    ...(ws ? { wsEndpoint: ws } : {}),
    ...(cdp ? { cdpEndpoint: cdp } : {}),
    ...(sessionId ? { sessionId } : {}),
  }
}

/** Fail-closed: only Playwright/CDP sockets. VNC JWTs and /vnc-proxy URLs are ignored. */
export function pickEditorCdp(json: unknown): EditorCdpAttach | undefined {
  if (!json || typeof json !== "object" || Array.isArray(json)) return undefined
  const rec = json as Record<string, unknown>
  const direct = attachFromRecord(rec)
  if (direct) return direct
  for (const key of ["session", "editor", "browser", "connect"]) {
    const nested = rec[key]
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const hit = attachFromRecord(nested as Record<string, unknown>)
      if (hit) return hit
    }
  }
  return undefined
}

export function foldedSessionStorageCount(state: StorageState, origin?: string): number {
  if (origin) return originStoreCounts(state, origin).sessionStorage
  let n = 0
  for (const o of state.origins ?? []) {
    for (const row of o.localStorage ?? []) {
      if (row?.name?.startsWith(SESSION_STORAGE_PREFIX)) n += 1
    }
  }
  return n
}

async function defaultConnectAndCapture(attach: EditorCdpAttach): Promise<StorageState> {
  const { chromium } = await import("patchright-core")
  const ws = attach.wsEndpoint
  const cdp = attach.cdpEndpoint
  const browser = ws
    ? await chromium.connect(ws, { timeout: 15_000 })
    : await chromium.connectOverCDP(cdp as string, { timeout: 15_000 })
  try {
    return await captureStorageState(browser as never)
  } finally {
    await browser.close().catch(() => undefined)
  }
}

export type CaptureEditorFoldOpts = {
  saveJson?: unknown
  probeJson?: unknown[]
  /** Injected in tests. Production connects only when pickEditorCdp finds a socket. */
  connectAndCapture?: (attach: EditorCdpAttach) => Promise<StorageState>
}

/**
 * Try to read live sessionStorage from the editor browser.
 * Never creates a new Solari session (that would recapture leftover fold).
 */
export async function captureEditorFoldState(
  opts: CaptureEditorFoldOpts = {},
): Promise<{ attach?: EditorCdpAttach; state?: StorageState; fold: EditorFoldResult }> {
  const attach = [opts.saveJson, ...(opts.probeJson ?? [])].map(pickEditorCdp).find((row) => row)
  if (!attach) return { fold: { ok: false, reason: "no-cdp", error: EDITOR_FOLD_NO_CDP } }
  const connect = opts.connectAndCapture ?? defaultConnectAndCapture
  try {
    const state = await connect(attach)
    const folded = foldedSessionStorageCount(state)
    if (folded <= 0) {
      return { attach, state, fold: { ok: false, reason: "capture-empty", error: EDITOR_FOLD_CAPTURE_EMPTY } }
    }
    return {
      attach,
      state,
      fold: { ok: false, reason: "attached", via: "editor-cdp", folded },
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { attach, fold: { ok: false, reason: "connect-failed", error } }
  }
}

export async function persistCapturedEditorFold(opts: {
  handle: EditorSaveHandle
  captured: { state?: StorageState; fold: EditorFoldResult }
  persist: (state: StorageState) => Promise<{ ok: boolean; error?: string }>
}): Promise<EditorFoldResult> {
  const { state, fold } = opts.captured
  if (fold.reason !== "attached" || !state) return fold
  try {
    const saved = await opts.persist(state)
    if (!saved.ok) {
      return {
        ok: false,
        reason: "persist-blocked",
        via: "editor-cdp",
        folded: fold.folded,
        error: saved.error ?? "profiles.save refused the editor fold",
      }
    }
    return { ok: true, reason: "attached", via: "editor-cdp", folded: fold.folded }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: "persist-blocked", via: "editor-cdp", folded: fold.folded, error }
  }
}
