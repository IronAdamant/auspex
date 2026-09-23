/** Operator-local wake POST + secret-aware scrub for job/status/webhook payloads. */

import { redactSecrets } from "./errors.ts"
import { isHttpOrHttpsUrl } from "./http-url.ts"
import { redactEmailsInString } from "./replay-redact.ts"

export const AUSPEX_WAKE_WEBHOOK_ENV = "AUSPEX_WAKE_WEBHOOK"
export const WAKE_POST_TIMEOUT_MS = 5_000

const DROP_KEY =
  /^(password|passwd|token|secret|cookie|cookies|authorization|apiKey|api_key|accessToken|refreshToken|handoffToken|sessionId|excerpt|solariKey|otp)$/i

export const JOB_WAKE_EVENTS = [
  "awaiting-save",
  "stream-expired",
  "hostChanged",
  "editor-save-hung",
  "profile-busy",
  "profile-saved",
  "profile-claimable",
  "completed",
  "failed",
] as const

export type JobWakeEvent = (typeof JOB_WAKE_EVENTS)[number]

export type JobWakeResult = {
  ok: boolean
  event?: JobWakeEvent
  skipped?: boolean
  status?: number
  error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/** Strip hash/query secrets from a URL string. Non-URLs pass through redact helpers. */
export function scrubUrlString(value: string): string {
  const redacted = redactSecrets(redactEmailsInString(value))
  try {
    const url = new URL(redacted)
    let changed = false
    if (url.username || url.password) {
      url.username = ""
      url.password = ""
      changed = true
    }
    if (url.hash && url.hash.length > 1) {
      url.hash = "#redacted"
      changed = true
    }
    for (const key of [...url.searchParams.keys()]) {
      if (/token|secret|key|password|auth|jwt|otp|code/i.test(key)) {
        url.searchParams.set(key, "redacted")
        changed = true
      }
    }
    return changed ? url.toString() : redacted
  } catch {
    return redacted
  }
}

export type ScrubJobOpts = {
  /** Webhook POSTs redact URL hashes; mint stdout keeps door.html hashes so the human can open the chooser. */
  redactUrlHashes?: boolean
}

export function scrubJobString(value: string, opts: ScrubJobOpts = {}): string {
  if (/^https?:\/\//i.test(value.trim())) {
    return opts.redactUrlHashes === false ? scrubUrlKeepHash(value) : scrubUrlString(value)
  }
  return redactSecrets(redactEmailsInString(value))
}

function scrubUrlKeepHash(value: string): string {
  const redacted = redactSecrets(redactEmailsInString(value))
  try {
    const url = new URL(redacted)
    if (!url.username && !url.password) return redacted
    url.username = ""
    url.password = ""
    return url.toString()
  } catch {
    return redacted
  }
}

export function scrubJobValue<T>(value: T, opts: ScrubJobOpts = {}): T {
  return walkScrub(value, opts) as T
}

function walkScrub(value: unknown, opts: ScrubJobOpts): unknown {
  if (value == null) return value
  if (typeof value === "string") return scrubJobString(value, opts)
  if (typeof value === "number" || typeof value === "boolean") return value
  if (Array.isArray(value)) return value.map((row) => walkScrub(row, opts))
  if (!isRecord(value)) return value
  const out: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (DROP_KEY.test(key)) continue
    out[key] = walkScrub(raw, opts)
  }
  return out
}

export function resolveWakeWebhookUrl(explicit?: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = (explicit ?? env[AUSPEX_WAKE_WEBHOOK_ENV] ?? "").trim()
  if (!raw) return undefined
  if (!isHttpOrHttpsUrl(raw)) {
    throw new Error("wakeWebhookUrl must be an http or https URL (no userinfo)")
  }
  return raw
}

export type PostJobWakeOpts = {
  url?: string
  fetch?: typeof fetch
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
}

/** POST a scrubbed JSON body. Missing URL skips. Fetch errors do not throw. */
export async function postJobWake(
  payload: object,
  opts: PostJobWakeOpts = {},
): Promise<JobWakeResult> {
  let dest: string | undefined
  try {
    dest = resolveWakeWebhookUrl(opts.url, opts.env)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  const event = isRecord(payload) && typeof payload.event === "string" ? (payload.event as JobWakeEvent) : undefined
  if (!dest) return { ok: true, skipped: true, event }
  const body = JSON.stringify(scrubJobValue(payload))
  const fetchFn = opts.fetch ?? fetch
  const timeoutMs = opts.timeoutMs ?? WAKE_POST_TIMEOUT_MS
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetchFn(dest, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: ac.signal,
    })
    if (!res.ok) return { ok: false, event, status: res.status, error: `wake POST ${res.status}` }
    return { ok: true, event, status: res.status }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { ok: false, event, error: scrubJobString(error) }
  } finally {
    clearTimeout(timer)
  }
}
