import { z } from "zod"

export const LOOPBACK_URL_ERROR =
  "url is a loopback address; Solari cloud Chrome cannot see the agent machine"

/** True for localhost, 127.0.0.1, and ::1 (bracketed IPv6 hostnames included). */
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "")
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0:0:0:0:0:0:0:1"
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
  return !isLoopbackHost(new URL(value).hostname)
}

export function requireHttpUrl(value: string, label = "url"): string {
  if (!isHttpOrHttpsUrl(value)) {
    throw new Error(`${label} must be an http or https URL`)
  }
  return value
}

export function requireCheckUrl(value: string, label = "url"): string {
  requireHttpUrl(value, label)
  if (isLoopbackHost(new URL(value).hostname)) {
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
  if (isLoopbackHost(new URL(value).hostname)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: LOOPBACK_URL_ERROR })
  }
})
