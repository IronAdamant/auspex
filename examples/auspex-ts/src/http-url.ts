import { z } from "zod"

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

export function requireHttpUrl(value: string, label = "url"): string {
  if (!isHttpOrHttpsUrl(value)) {
    throw new Error(`${label} must be an http or https URL`)
  }
  return value
}

export const httpUrlSchema = z
  .string()
  .refine(isHttpOrHttpsUrl, { message: "url must be an http or https URL" })
