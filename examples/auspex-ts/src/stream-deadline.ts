/** VNC JWT deadline for await Save and for refusing a new POST /sessions. */

import { streamExpiredGuide } from "./await-fail.ts"
import { isStreamExpired } from "./handoff-doors.ts"
import type { NextCall } from "./next-call.ts"

/** Under this remaining VNC lifetime, save-editor cannot finish before the phone stream dies. */
export const STREAM_LOW_REMAINING_MS = 90_000
/** Poll a little past streamExpiresAt so one in-flight Save can still land. */
export const STREAM_DEADLINE_GRACE_MS = 5_000

export type StreamPreflight = "proceed" | "low" | "past"

export function parseStreamExpiresAtMs(iso?: string): number | undefined {
  const text = iso?.trim()
  if (!text) return undefined
  const ms = Date.parse(text)
  return Number.isFinite(ms) ? ms : undefined
}

/**
 * save-editor plan. Uses streamExpiresAt only — never the longer handoff expiresAt.
 * `low` and `past` must not enter the default 30-minute Save poll.
 */
export function awaitStreamPlan(opts: {
  saveEditor?: boolean
  streamExpiresAt?: string
  timeoutMs?: number
  nowMs: number
  defaultTimeoutMs: number
  lowRemainingMs?: number
  graceMs?: number
}): {
  preflight: StreamPreflight
  waitTimeoutMs?: number
  watchStreamExpiresAt?: string
} {
  const exp = parseStreamExpiresAtMs(opts.streamExpiresAt)
  if (!opts.saveEditor || exp === undefined) {
    return { preflight: "proceed", waitTimeoutMs: opts.timeoutMs }
  }
  const stamp = opts.streamExpiresAt!.trim()
  const remain = exp - opts.nowMs
  if (remain <= 0) {
    return { preflight: "past", watchStreamExpiresAt: stamp }
  }
  const grace = opts.graceMs ?? STREAM_DEADLINE_GRACE_MS
  const untilDeadline = exp + grace - opts.nowMs
  const requested = opts.timeoutMs ?? opts.defaultTimeoutMs
  return {
    preflight: "proceed",
    waitTimeoutMs: Math.min(requested, untilDeadline),
    watchStreamExpiresAt: stamp,
  }
}

export function streamWatchDeadlineMs(iso: string | undefined, graceMs = STREAM_DEADLINE_GRACE_MS): number | undefined {
  const exp = parseStreamExpiresAtMs(iso)
  if (exp === undefined) return undefined
  return exp + graceMs
}

export function streamIsPast(iso: string | undefined, nowMs: number): boolean {
  if (parseStreamExpiresAtMs(iso) === undefined) return false
  return isStreamExpired({ expiresAt: iso, nowSec: Math.floor(nowMs / 1000) })
}

/** Past VNC JWT and no completed non-empty seed: do not POST /sessions. */
export function shouldRefuseDeadStreamSession(opts: {
  streamExpiresAt?: string
  nowMs: number
  seed?: { populated?: boolean; sizeBytes?: number; storageStateS3Key?: unknown }
}): boolean {
  if (!streamIsPast(opts.streamExpiresAt, opts.nowMs)) return false
  return !profileHasCompletedSeed(opts.seed)
}

/** True when a listed profile already holds a non-empty Save. Does not open a browser. */
export function profileHasCompletedSeed(row: {
  populated?: boolean
  sizeBytes?: number
  storageStateS3Key?: unknown
} | undefined): boolean {
  if (!row) return false
  if (row.populated === false) return false
  if (row.populated === true) return true
  if (typeof row.sizeBytes === "number" && row.sizeBytes > 0) return true
  return Boolean(row.storageStateS3Key)
}

export type DeadStreamReceipt = {
  ok: false
  protocolOk: false
  reason: "stream-expired"
  url: string
  expect: string
  screenshotPath: string
  title: string
  finalUrl: string
  matched: false
  excerpt: string
  sessionId: string
  networkIdle: false
  next: string
  nextCall: NextCall
}

/** Fail-closed check/finalize body. No session id, no screenshot, remint nextCall. */
export function deadStreamCheckResult(opts: { url: string; expect: string; profile: string }): DeadStreamReceipt {
  const guide = streamExpiredGuide(opts.profile)
  return {
    ok: false,
    protocolOk: false,
    reason: "stream-expired",
    url: opts.url,
    expect: opts.expect,
    screenshotPath: "",
    title: "",
    finalUrl: "",
    matched: false,
    excerpt: "",
    sessionId: "",
    networkIdle: false,
    next: guide.text,
    nextCall: guide.nextCall,
  }
}
