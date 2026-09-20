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

/** Decode JWT `exp` without verifying the signature. Missing/garbage is unknown. */
export function jwtExpSeconds(token: string | undefined | null): number | undefined {
  const raw = (token ?? "").trim()
  if (!raw) return undefined
  const parts = raw.split(".")
  if (parts.length < 2 || !parts[1]) return undefined
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
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

export type PhoneExpirySource = "expiresAt" | "jwt" | "unknown"

/** Prefer handoff expiresAt; else VNC JWT exp; else unknown (phone UI fail-closed). */
export function resolvePhoneExpirySeconds(opts: {
  expiresAt?: string
  jwt?: string
}): { exp?: number; source: PhoneExpirySource } {
  const fromAt = parseUnixSeconds(opts.expiresAt)
  if (fromAt !== undefined) return { exp: fromAt, source: "expiresAt" }
  const fromJwt = jwtExpSeconds(opts.jwt)
  if (fromJwt !== undefined) return { exp: fromJwt, source: "jwt" }
  return { source: "unknown" }
}
