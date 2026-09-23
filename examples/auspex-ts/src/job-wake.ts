/** Operator-local wake POST. Scrub lives in scrub.ts (job, step tools, webhook). */

import { isHttpOrHttpsUrl } from "./http-url.ts"
import { scrubJobString, scrubJobValue } from "./scrub.ts"

export { scrubJobString, scrubJobValue, scrubUrlString, type ScrubOpts as ScrubJobOpts } from "./scrub.ts"

export const AUSPEX_WAKE_WEBHOOK_ENV = "AUSPEX_WAKE_WEBHOOK"
export const WAKE_POST_TIMEOUT_MS = 5_000

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
