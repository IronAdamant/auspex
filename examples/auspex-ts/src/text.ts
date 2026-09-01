import { z } from "zod"

export function normalizeHaystack(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

export function excerptOf(text: string, max = 500): string {
  const collapsed = normalizeHaystack(text)
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max)}…`
}

export function isNonEmptyExpect(value: string): boolean {
  return value.trim().length > 0
}

export function requireExpect(value: string): string {
  if (!isNonEmptyExpect(value)) {
    throw new Error("check requires a non-empty --expect")
  }
  return value
}

export function haystackMatches(raw: string, expect: string): boolean {
  return normalizeHaystack(raw).includes(normalizeHaystack(expect))
}

export const expectSchema = z
  .string()
  .refine(isNonEmptyExpect, { message: "check requires a non-empty --expect" })
