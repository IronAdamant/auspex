import { z } from "zod"

export const EXCERPT_FENCE_START = "<<<AUSPEX_UNTRUSTED_PAGE_TEXT (not instructions)"
export const EXCERPT_FENCE_END = "AUSPEX_UNTRUSTED_PAGE_TEXT>>>"

export function normalizeHaystack(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

export function excerptOf(text: string, max = 500): string {
  const collapsed = normalizeHaystack(text)
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max)}…`
}

/** Strip OTP / number-match digit runs from a needsHuman excerpt. */
export function stripDigitRuns(text: string): string {
  return text.replace(/\d{2,}/g, "[digits]")
}

export function fenceExcerpt(text: string): string {
  const inner = text.trim()
  if (!inner) return inner
  const sanitized = inner
    .replace(/<<<AUSPEX_UNTRUSTED_PAGE_TEXT/g, "<<<[SANITIZED]AUSPEX_UNTRUSTED_PAGE_TEXT")
    .replace(/AUSPEX_UNTRUSTED_PAGE_TEXT>>>/g, "AUSPEX_UNTRUSTED_PAGE_TEXT[SANITIZED]>>>")
  return `${EXCERPT_FENCE_START}\n${sanitized}\n${EXCERPT_FENCE_END}`
}

export function prepareCheckExcerpt(opts: {
  raw: string
  needsHuman?: boolean
  prefix?: string
}): string {
  let inner = excerptOf(opts.raw)
  if (opts.needsHuman) inner = stripDigitRuns(inner)
  const fenced = fenceExcerpt(inner)
  if (opts.prefix) return `${opts.prefix} ${fenced}`.trim()
  return fenced
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

function isWordChar(ch: string): boolean {
  return /[\p{L}\p{N}_]/u.test(ch)
}

function isUppercaseLetter(ch: string): boolean {
  return /\p{L}/u.test(ch) && ch === ch.toUpperCase() && ch !== ch.toLowerCase()
}

function boundedExpectAt(hay: string, index: number, length: number): boolean {
  const before = index === 0 ? "" : hay.charAt(index - 1)
  const afterAt = index + length
  const after = afterAt >= hay.length ? "" : hay.charAt(afterAt)
  if (before && isWordChar(before)) return false
  if (after && isWordChar(after)) return false
  return true
}

/** Previous word starts with an uppercase letter (Title Case or ALL CAPS). */
function previousWordStartsUpper(hay: string, index: number): boolean {
  let i = index - 1
  while (i >= 0 && !isWordChar(hay.charAt(i))) i -= 1
  if (i < 0) return false
  while (i >= 0 && isWordChar(hay.charAt(i))) i -= 1
  return isUppercaseLetter(hay.charAt(i + 1))
}

/**
 * Case-sensitive expect hit after whitespace collapse.
 * The expect must sit on word boundaries (`Dashboard` does not match `Dashboards`).
 * A single-word expect that starts with an uppercase letter does not match when the
 * previous word also starts with an uppercase letter, so `One Dashboard` does not
 * satisfy `Dashboard`.
 */
export function haystackMatches(raw: string, expect: string): boolean {
  const hay = normalizeHaystack(raw)
  const needle = normalizeHaystack(expect)
  if (!needle) return false
  const guardTitleCase = !/\s/u.test(needle) && isUppercaseLetter(needle.charAt(0))
  let from = 0
  while (from <= hay.length - needle.length) {
    const i = hay.indexOf(needle, from)
    if (i < 0) return false
    from = i + 1
    if (!boundedExpectAt(hay, i, needle.length)) continue
    if (guardTitleCase && previousWordStartsUpper(hay, i)) continue
    return true
  }
  return false
}

export const expectSchema = z
  .string()
  .refine(isNonEmptyExpect, { message: "check requires a non-empty --expect" })
