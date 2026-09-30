import { z } from "zod"
import { redactEmailsInString } from "./replay-redact.ts"

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

/**
 * Key-shaped strings a dashboard may show (API keys, JWTs, long tokens), and email addresses (a
 * logged-in page shows the account's). Receipts keep page text on disk and get attached to PRs;
 * they must not keep these. Runs before truncation so a value cut at the limit is still masked.
 * Matching always uses the unmasked page text.
 */
export function maskSecrets(text: string): string {
  return redactEmailsInString(text)
    .replace(/\beyJ[\w-]{8,}\.[\w-]{8,}(?:\.[\w-]+)?/g, "[redacted-jwt]")
    .replace(/\b(?:sk|pk|rk|sb|slr)[-_](?:(?:live|test|proj)[-_])?[A-Za-z0-9_-]{16,}/g, "[redacted-key]")
    .replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g, "[redacted-token]")
}

export function prepareCheckExcerpt(opts: {
  raw: string
  needsHuman?: boolean
  prefix?: string
}): string {
  let inner = excerptOf(maskSecrets(opts.raw))
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

/** Line breaks and sentence punctuation end a capitalized phrase (nav items, "Overview. Dashboard"). */
const PHRASE_BREAK = /[\n.!?:;|•·]/u

/**
 * Previous word starts with an uppercase letter (Title Case or ALL CAPS) in the same phrase.
 * `lines` keeps newlines where `hay` has spaces, index for index.
 */
function previousWordStartsUpper(lines: string, index: number): boolean {
  let i = index - 1
  while (i >= 0 && !isWordChar(lines.charAt(i))) {
    if (PHRASE_BREAK.test(lines.charAt(i))) return false
    i -= 1
  }
  if (i < 0) return false
  while (i >= 0 && isWordChar(lines.charAt(i))) i -= 1
  return isUppercaseLetter(lines.charAt(i + 1))
}

/** Same length and indices as normalizeHaystack(text), but a whitespace run with a newline stays "\n". */
function lineAwareHaystack(text: string): string {
  return text.replace(/\s+/g, (run) => (run.includes("\n") ? "\n" : " ")).trim()
}

/**
 * Case-sensitive expect hit after whitespace collapse.
 * The expect must sit on word boundaries (`Dashboard` does not match `Dashboards`).
 * A single-word expect that starts with an uppercase letter does not match when the
 * previous word in the same phrase also starts with an uppercase letter, so `One Dashboard`
 * does not satisfy `Dashboard`. A line break or sentence punctuation ends the phrase, so a
 * nav list (`Home` / `Dashboard` / `Settings`) still matches.
 */
export function haystackMatches(raw: string, expect: string): boolean {
  const hay = normalizeHaystack(raw)
  const lines = lineAwareHaystack(raw)
  const needle = normalizeHaystack(expect)
  if (!needle) return false
  const guardTitleCase = !/\s/u.test(needle) && isUppercaseLetter(needle.charAt(0))
  let from = 0
  while (from <= hay.length - needle.length) {
    const i = hay.indexOf(needle, from)
    if (i < 0) return false
    from = i + 1
    if (!boundedExpectAt(hay, i, needle.length)) continue
    if (guardTitleCase && previousWordStartsUpper(lines, i)) continue
    return true
  }
  return false
}

export const expectSchema = z
  .string()
  .refine(isNonEmptyExpect, { message: "check requires a non-empty --expect" })

/**
 * A bot or browser check (Cloudflare "Just a moment...", "Attention Required!", "Verify you are human")
 * served instead of the site. Not a logout and not a password wall. Auspex never solves these.
 */
export function isBotChallengePage(title: string, text: string): boolean {
  const t = title.trim()
  if (/^just a moment\.{0,3}…?$/i.test(t)) return true
  if (/^attention required!?\s*\|\s*cloudflare$/i.test(t)) return true
  const body = text.slice(0, 2000)
  return /verify you are human by completing|checking (if the site connection is secure|your browser before accessing)|enable javascript and cookies to continue/i.test(body)
}
