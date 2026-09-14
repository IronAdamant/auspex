import { isIP } from "node:net"
import { z } from "zod"

export const LOOPBACK_URL_ERROR =
  "url is a loopback address, link-local, or cloud-metadata address; Solari cloud Chrome cannot see the agent machine"

function stripBrackets(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "")
}

/** inet_aton-style: 127.1 → 127.0.0.1, 127 → 0.0.0.127 */
export function parseIPv4Loose(host: string): [number, number, number, number] | undefined {
  if (!/^[0-9.]+$/.test(host)) return undefined
  const parts = host.split(".")
  if (parts.length < 1 || parts.length > 4) return undefined
  const nums: number[] = []
  for (const p of parts) {
    if (p === "" || !/^\d+$/.test(p)) return undefined
    const n = Number(p)
    if (!Number.isInteger(n) || n < 0 || n > 255) return undefined
    nums.push(n)
  }
  if (parts.length === 1) return [0, 0, 0, nums[0]!]
  if (parts.length === 2) return [nums[0]!, 0, 0, nums[1]!]
  if (parts.length === 3) return [nums[0]!, nums[1]!, 0, nums[2]!]
  return [nums[0]!, nums[1]!, nums[2]!, nums[3]!]
}

function ipv4Blocked(octets: [number, number, number, number]): boolean {
  const [a, b] = octets
  if (a === 0) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  return false
}

function ipv4FromMappedIPv6(host: string): [number, number, number, number] | undefined {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){0,3})$/i.exec(host)
  if (dotted) return parseIPv4Loose(dotted[1]!)
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host)
  if (!hex) return undefined
  const hi = Number.parseInt(hex[1]!, 16)
  const lo = Number.parseInt(hex[2]!, 16)
  return [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255]
}

function ipv6LinkLocalOrUnspecified(host: string): boolean {
  if (host === "::" || host === "0:0:0:0:0:0:0:0") return true
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true
  const head = host.split(":")[0] ?? ""
  if (/^fe[89ab]/i.test(head)) return true
  return false
}

/** True for localhost, 127.0.0.1, and ::1 (bracketed IPv6 hostnames included). */
export function isLoopbackHost(hostname: string): boolean {
  const h = stripBrackets(hostname)
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0:0:0:0:0:0:0:1") return true
  return false
}

/** Loopback aliases, IPv4-mapped IPv6, link-local, and cloud metadata. Public URLs stay allowed. */
export function isForbiddenCheckHost(hostname: string): boolean {
  const h = stripBrackets(hostname)
  if (h === "localhost" || h.endsWith(".localhost") || h === "localhost.localdomain") return true
  const mapped = ipv4FromMappedIPv6(h)
  if (mapped && ipv4Blocked(mapped)) return true
  const v4 = parseIPv4Loose(h)
  if (v4 && ipv4Blocked(v4)) return true
  const ip = isIP(h)
  if (ip === 4) {
    const parsed = parseIPv4Loose(h)
    return Boolean(parsed && ipv4Blocked(parsed))
  }
  if (ip === 6) return ipv6LinkLocalOrUnspecified(h)
  return false
}

export function isHttpOrHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value)
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    if (u.username !== "" || u.password !== "") return false
    return true
  } catch {
    return false
  }
}

export function isCheckUrl(value: string): boolean {
  if (!isHttpOrHttpsUrl(value)) return false
  return !isForbiddenCheckHost(new URL(value).hostname)
}

export function requireHttpUrl(value: string, label = "url"): string {
  if (!isHttpOrHttpsUrl(value)) {
    throw new Error(`${label} must be an http or https URL`)
  }
  return value
}

export function requireCheckUrl(value: string, label = "url"): string {
  requireHttpUrl(value, label)
  if (isForbiddenCheckHost(new URL(value).hostname)) {
    throw new Error(LOOPBACK_URL_ERROR)
  }
  return value
}

export const httpUrlSchema = z
  .string()
  .refine(isHttpOrHttpsUrl, { message: "url must be an http or https URL" })

export const checkUrlSchema = z.string().superRefine((value, ctx) => {
  if (!isHttpOrHttpsUrl(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "url must be an http or https URL" })
    return
  }
  if (isForbiddenCheckHost(new URL(value).hostname)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: LOOPBACK_URL_ERROR })
  }
})
