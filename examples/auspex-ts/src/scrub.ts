/** One secret-aware scrub for job files, step-tool JSON, and the wake webhook. */

import { redactSecrets } from "./errors.ts"
import { redactEmailsInString } from "./replay-redact.ts"

const DROP_KEY =
  /^(password|passwd|token|secret|cookie|cookies|authorization|apiKey|api_key|accessToken|refreshToken|handoffToken|sessionId|excerpt|solariKey|otp)$/i

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

export type ScrubOpts = {
  /** Webhook POSTs redact URL hashes; mint stdout keeps phone.html hashes so the human can open the door. */
  redactUrlHashes?: boolean
}

export function scrubString(value: string, opts: ScrubOpts = {}): string {
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

export function scrubValue<T>(value: T, opts: ScrubOpts = {}): T {
  return walkScrub(value, opts) as T
}

function walkScrub(value: unknown, opts: ScrubOpts): unknown {
  if (value == null) return value
  if (typeof value === "string") return scrubString(value, opts)
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

/** @deprecated Use scrubValue. Same walk; kept for existing job/wake callers. */
export const scrubJobValue = scrubValue
export const scrubJobString = scrubString
