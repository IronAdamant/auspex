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

const SECRET_PARAM = /token|secret|key|password|auth|jwt|otp|code|state|session|sig/i

/**
 * Secret query and hash parameters in a URL (an OAuth `code`/`state` on a redirect, an
 * `#access_token=` fragment) become "redacted". Host, path, and a hash route such as `#/dashboard`
 * stay, so a receipt URL still says where the browser was.
 */
export function redactUrlSecrets(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return value
  }
  let changed = false
  for (const key of [...url.searchParams.keys()]) {
    if (SECRET_PARAM.test(key)) {
      url.searchParams.set(key, "redacted")
      changed = true
    }
  }
  const hash = url.hash.slice(1)
  if (hash.includes("=")) {
    const q = hash.indexOf("?")
    const route = q >= 0 ? hash.slice(0, q + 1) : ""
    const params = new URLSearchParams(q >= 0 ? hash.slice(q + 1) : hash)
    let hashChanged = false
    for (const key of [...params.keys()]) {
      if (SECRET_PARAM.test(key)) {
        params.set(key, "redacted")
        hashChanged = true
      }
    }
    if (hashChanged) {
      url.hash = `${route}${params.toString()}`
      changed = true
    }
  }
  return changed ? url.toString() : value
}

/** redactUrlSecrets on every http(s) URL inside free text (a Playwright error's "navigated to …"). */
export function redactUrlSecretsInText(text: string): string {
  return text.replace(/https?:\/\/[^\s"'<>]+/g, (url) => redactUrlSecrets(url))
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
