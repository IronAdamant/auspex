/**
 * Profile-editor HTTP (handoff token). Solari 409 means an editor is already running.
 * Remint POSTs first and reuses that editor by polling /editor/token.
 * DELETE runs only after that poll misses (one restart) or before a voluntary profile wipe.
 * It does not run before the first POST on login (that would kick a human still in the console).
 */

import type { LoginMintStage } from "./login-trace.ts"
import { remintLoginNextCall, type NextCall } from "./next-call.ts"

/** Same origin as CONSOLE_PROFILES_URL. Local so this module does not import profiles.ts. */
export const EDITOR_CONSOLE_ORIGIN = "https://console.getsolari.com"

export type EditorPost = (path: string) => Promise<{ status: number; json: Record<string, unknown> }>

export type EditorVncMint = {
  token?: string
  editorStartStatus: number
  tokenLastStatus?: number
  tokenTries: number
}

/** 200/201 ready, 202 Accepted (starting — poll token). 409 is a live editor, not a successful start. */
export function editorStartOk(status: number): boolean {
  return status === 200 || status === 201 || status === 202
}

export const EDITOR_BUSY_STATUS = "editor-busy"
export const EDITOR_START_CONFLICT_REASON = "editor-start-409"

const EDITOR_RECOVER_WAIT_MS = 400

export function editorApiPath(profileId: string, tail = ""): string {
  return `/api/profiles/${encodeURIComponent(profileId)}/editor${tail}`
}

function editorHeaders(handoffToken: string): Record<string, string> {
  return {
    "x-handoff-token": handoffToken,
    Origin: EDITOR_CONSOLE_ORIGIN,
    Referer: `${EDITOR_CONSOLE_ORIGIN}/handoff/${handoffToken}`,
    Accept: "application/json",
  }
}

/** Handoff-auth POST or DELETE. No API key. No body. */
export async function editorHandoffCall(handoffToken: string, method: "POST" | "DELETE"): Promise<EditorPost> {
  return async (path) => {
    const res = await fetch(`${EDITOR_CONSOLE_ORIGIN}${path}`, {
      method,
      headers: editorHeaders(handoffToken),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { status: res.status, json }
  }
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pollEditorToken(
  post: EditorPost,
  profileId: string,
  editorStartStatus: number,
  tries: number,
  sleepMs: number,
): Promise<EditorVncMint> {
  let tokenLastStatus: number | undefined
  for (let i = 0; i < tries; i++) {
    const got = await post(editorApiPath(profileId, "/token"))
    tokenLastStatus = got.status
    const vnc = typeof got.json.token === "string" ? got.json.token.trim() : ""
    if (got.status === 200 && vnc) {
      return { token: vnc, editorStartStatus, tokenLastStatus, tokenTries: i + 1 }
    }
    if (i + 1 < tries) await delay(sleepMs)
  }
  return { editorStartStatus, tokenLastStatus, tokenTries: tries }
}

/**
 * Solari 409: the live editor was not reused and a one-shot restart did not yield a token.
 * Do not steer purge-then-remint; profile delete stays locked until the editor is stopped.
 */
export function editorStartConflictGuide(profile: string): { text: string; nextCall: NextCall } {
  const name = profile.trim() || "<name>"
  const who = name === "<name>" ? "" : name
  return {
    text:
      `status ${EDITOR_BUSY_STATUS}: Solari editor start returned 409 and the live editor token was not reused` +
      `${who ? ` (--profile ${who})` : ""}. This mint did not start a new stream. Do not finalize-login. ` +
      `Do not purge and remint while that editor is still running: profile delete stays locked and the next mint returns 409 again. ` +
      `Wait for the editor to close, or stop it (DELETE /api/profiles/:id/editor). Then remint: npx auspex login` +
      `${who ? ` --profile ${who}` : ""}.`,
    nextCall: remintLoginNextCall(who),
  }
}

/** Phone-door mint stage. Empty token / failed VNC is never "ready". */
export function mintStageAfterVnc(
  mint: Pick<EditorVncMint, "token" | "editorStartStatus" | "tokenTries">,
  vncMintOk = Boolean(mint.token),
): Extract<LoginMintStage, "editor-start" | "editor-token" | "ready"> {
  if (vncMintOk) return "ready"
  const editorStartBad = mint.editorStartStatus !== 0 && !editorStartOk(mint.editorStartStatus)
  return editorStartBad ? "editor-start" : "editor-token"
}

export type FetchEditorVncOpts = {
  post?: EditorPost
  /** DELETE /editor. Used only when recover is true and the 409 token poll misses. */
  del?: EditorPost
  tries?: number
  sleepMs?: number
  /**
   * After a 409 token poll misses: DELETE, brief wait, POST, poll.
   * Never DELETEs before the first POST. Login passes true. Omit to reuse only.
   */
  recover?: boolean
  recoverWaitMs?: number
}

/**
 * POST the profile editor, then poll /editor/token.
 * HTTP 409 falls through into that poll (reuse). Other non-ok starts return with tokenTries 0.
 */
export async function fetchEditorVncToken(
  profileId: string,
  handoffToken: string,
  opts?: FetchEditorVncOpts,
): Promise<EditorVncMint> {
  const token = handoffToken.trim()
  const id = profileId.trim()
  const tries = opts?.tries ?? 20
  if (!token || !id) return { editorStartStatus: 0, tokenTries: 0 }
  const post = opts?.post ?? (await editorHandoffCall(token, "POST"))
  const sleepMs = opts?.sleepMs ?? 1000
  const start = await post(editorApiPath(id))
  if (start.status !== 409 && !editorStartOk(start.status)) {
    return { editorStartStatus: start.status, tokenTries: 0 }
  }
  const polled = await pollEditorToken(post, id, start.status, tries, sleepMs)
  if (polled.token || start.status !== 409 || opts?.recover !== true) return polled
  const del = opts?.del ?? (await editorHandoffCall(token, "DELETE"))
  await del(editorApiPath(id))
  const recoverWait = opts?.recoverWaitMs ?? (opts?.sleepMs === undefined ? EDITOR_RECOVER_WAIT_MS : 0)
  await delay(recoverWait)
  const restart = await post(editorApiPath(id))
  if (restart.status !== 409 && !editorStartOk(restart.status)) {
    return {
      editorStartStatus: restart.status,
      tokenLastStatus: polled.tokenLastStatus,
      tokenTries: polled.tokenTries,
    }
  }
  const again = await pollEditorToken(post, id, restart.status, tries, sleepMs)
  if (!again.token && start.status === 409) {
    return {
      editorStartStatus: 409,
      tokenLastStatus: again.tokenLastStatus ?? polled.tokenLastStatus,
      tokenTries: polled.tokenTries + again.tokenTries,
    }
  }
  return { ...again, tokenTries: polled.tokenTries + again.tokenTries }
}

/**
 * One live POST /editor/token. True only when Solari returns a token.
 * Does not store the token, does not lengthen it, and does not DELETE the editor.
 */
export async function editorTokenStillLive(
  profileId: string,
  handoffToken: string,
  opts?: { post?: EditorPost },
): Promise<boolean> {
  const id = profileId.trim()
  const token = handoffToken.trim()
  if (!id || !token) return false
  const post = opts?.post ?? (await editorHandoffCall(token, "POST"))
  const got = await post(editorApiPath(id, "/token"))
  const vnc = typeof got.json.token === "string" ? got.json.token.trim() : ""
  return got.status === 200 && vnc.length > 0
}

/** Handoff-auth DELETE /api/profiles/:id/editor. 404 means no editor is running. */
export async function stopProfileEditor(
  profileId: string,
  handoffToken: string,
  opts?: { del?: EditorPost },
): Promise<{ ok: boolean; status: number }> {
  const id = profileId.trim()
  const token = handoffToken.trim()
  if (!id || !token) return { ok: false, status: 0 }
  const del = opts?.del ?? (await editorHandoffCall(token, "DELETE"))
  const got = await del(editorApiPath(id))
  const ok = got.status === 200 || got.status === 202 || got.status === 204 || got.status === 404
  return { ok, status: got.status }
}
