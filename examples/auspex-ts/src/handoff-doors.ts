/** Pages viewer with a real text field so the phone software keyboard can open. */
export const PHONE_HANDOFF_PAGE = "https://ironadamant.com/auspex/phone.html"
/** Same remote Chrome as the phone page, for a hardware keyboard. */
export const DESKTOP_HANDOFF_PAGE = "https://ironadamant.com/auspex/desktop.html"
/** One mint, one link: human picks Phone or Desktop. Same hash as both doors. */
export const DOOR_HANDOFF_PAGE = "https://ironadamant.com/auspex/door.html"

/** Hash keys door JS reads. Unused Solari tokens stay off agent JSON / QR / SMS. */
export const HANDOFF_HASH_KEYS = ["v", "n", "exp", "u"] as const

export type HandoffHashExtra = {
  profileId?: string
  profileName?: string
  handoffToken?: string
  expiresAt?: string
  saved?: string
  plist?: string
  /** https site to open. Username and password are never accepted here. */
  siteUrl?: string
}

export function isPhoneImeUrl(url: string | undefined): boolean {
  return Boolean(url?.startsWith(PHONE_HANDOFF_PAGE))
}

export function isDoorUrl(url: string | undefined): boolean {
  return Boolean(url?.startsWith(DOOR_HANDOFF_PAGE))
}

export function isDesktopDoorUrl(url: string | undefined): boolean {
  return Boolean(url?.startsWith(DESKTOP_HANDOFF_PAGE))
}

/** Shared hash: only door-JS keys (v, n, exp, u). Drop t/h/p/saved/plist/k/pair. */
export function handoffHash(
  vncToken: string,
  _handoffUrl: string,
  extra?: HandoffHashExtra,
): string {
  const token = vncToken.trim()
  if (!token) return ""
  const hash = new URLSearchParams({ v: token })
  if (extra?.profileName?.trim()) hash.set("n", extra.profileName.trim())
  const siteUrl = extra?.siteUrl?.trim() ?? ""
  if (/^https:\/\//i.test(siteUrl)) hash.set("u", siteUrl)
  const expiry = resolvePhoneExpirySeconds({ expiresAt: extra?.expiresAt, jwt: token })
  if (expiry.exp !== undefined) hash.set("exp", String(expiry.exp))
  return hash.toString()
}

function pageWithHash(page: string, hash: string): string {
  return hash ? `${page}#${hash}` : ""
}

export function phoneHandoffUrl(
  vncToken: string,
  handoffUrl: string,
  extra?: HandoffHashExtra,
): string {
  return pageWithHash(PHONE_HANDOFF_PAGE, handoffHash(vncToken, handoffUrl, extra))
}

export function desktopHandoffUrl(
  vncToken: string,
  handoffUrl: string,
  extra?: HandoffHashExtra,
): string {
  return pageWithHash(DESKTOP_HANDOFF_PAGE, handoffHash(vncToken, handoffUrl, extra))
}

export function doorHandoffUrl(
  vncToken: string,
  handoffUrl: string,
  extra?: HandoffHashExtra,
): string {
  return pageWithHash(DOOR_HANDOFF_PAGE, handoffHash(vncToken, handoffUrl, extra))
}

function swapHandoffPage(url: string | undefined, from: string, to: string): string | undefined {
  if (!url?.startsWith(from)) return undefined
  return to + url.slice(from.length)
}

/** Same hash as the phone door on the desktop thin client. */
export function desktopHandoffUrlFromPhone(mobileUrl: string | undefined): string | undefined {
  return swapHandoffPage(mobileUrl, PHONE_HANDOFF_PAGE, DESKTOP_HANDOFF_PAGE)
}

/** Same hash as the phone door on the chooser. */
export function doorHandoffUrlFromPhone(mobileUrl: string | undefined): string | undefined {
  return swapHandoffPage(mobileUrl, PHONE_HANDOFF_PAGE, DOOR_HANDOFF_PAGE)
}

/** Unix seconds from ISO, unix seconds, or epoch ms. Invalid / empty is unknown. */
export function parseUnixSeconds(value: string | number | undefined | null): number | undefined {
  if (value == null) return undefined
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return undefined
    return value > 1e12 ? Math.trunc(value / 1000) : Math.trunc(value)
  }
  const raw = String(value).trim()
  if (!raw) return undefined
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return undefined
    return n > 1e12 ? Math.trunc(n / 1000) : Math.trunc(n)
  }
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? Math.trunc(parsed / 1000) : undefined
}

function decodeJwtSegmentExp(segment: string): number | undefined {
  try {
    const b64 = segment.replace(/-/g, "+").replace(/_/g, "/")
    const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
    const json = Buffer.from(pad, "base64").toString("utf8")
    const payload = JSON.parse(json) as { exp?: unknown }
    if (typeof payload.exp === "number" || typeof payload.exp === "string") {
      return parseUnixSeconds(payload.exp)
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Decode JWT `exp` without verifying the signature.
 * Solari VNC editor tokens put the payload in segment 0 (lifetime ~305s);
 * standard JWTs use segment 1. Try both. Missing/garbage is unknown.
 */
export function jwtExpSeconds(token: string | undefined | null): number | undefined {
  const raw = (token ?? "").trim()
  if (!raw) return undefined
  const parts = raw.split(".")
  let earliest: number | undefined
  const limit = Math.min(parts.length, 2)
  for (let i = 0; i < limit; i++) {
    const part = parts[i]
    if (!part) continue
    const exp = decodeJwtSegmentExp(part)
    if (exp === undefined) continue
    earliest = earliest === undefined ? exp : Math.min(earliest, exp)
  }
  return earliest
}

export type PhoneExpirySource = "expiresAt" | "jwt" | "unknown"

/**
 * Earliest of handoff expiresAt (~30m) and VNC JWT exp (~5m).
 * One readable value is enough; none is unknown (phone UI fail-closed).
 */
export function resolvePhoneExpirySeconds(opts: {
  expiresAt?: string
  jwt?: string
}): { exp?: number; source: PhoneExpirySource } {
  const fromAt = parseUnixSeconds(opts.expiresAt)
  const fromJwt = jwtExpSeconds(opts.jwt)
  if (fromAt !== undefined && fromJwt !== undefined) {
    return fromJwt < fromAt ? { exp: fromJwt, source: "jwt" } : { exp: fromAt, source: "expiresAt" }
  }
  if (fromAt !== undefined) return { exp: fromAt, source: "expiresAt" }
  if (fromJwt !== undefined) return { exp: fromJwt, source: "jwt" }
  return { source: "unknown" }
}

/** True only when a readable exp is in the past. Unknown expiry is not expired (door UI fail-closes separately). */
export function isStreamExpired(opts: {
  expiresAt?: string
  jwt?: string
  nowSec?: number
}): boolean {
  const { exp } = resolvePhoneExpirySeconds(opts)
  if (exp === undefined) return false
  const now = opts.nowSec ?? Math.trunc(Date.now() / 1000)
  return now >= exp
}

/** Agent-facing stamp. Never includes the JWT. */
export function streamExpiryStamp(opts: { expiresAt?: string; jwt?: string }): {
  streamExpiresAt?: string
  streamExpirySource: PhoneExpirySource
} {
  const { exp, source } = resolvePhoneExpirySeconds(opts)
  return {
    streamExpirySource: source,
    ...(exp !== undefined ? { streamExpiresAt: new Date(exp * 1000).toISOString() } : {}),
  }
}
