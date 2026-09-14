import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { requireCheckUrl } from "./http-url.ts"
import { requireProfileName } from "./profiles.ts"
import { hostIs } from "./sso.ts"
import { requireExpect } from "./text.ts"

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export type SavedCheck = {
  name: string
  url: string
  expect: string
  profile?: string
}

export const DEFAULT_SAVED_CHECKS: readonly SavedCheck[] = [
  { name: "ironadamant", url: "https://ironadamant.com", expect: "One office job." },
  { name: "checkpoint", url: "https://checkpointprojects.com", expect: "Checkpoint" },
  {
    name: "consistencyhub",
    url: "https://consistencyhub.io",
    expect: "Document Editor",
    profile: "consistencyhub",
  },
]

export function canonicalSavedCheckName(name: string): string {
  const key = name.trim().toLowerCase()
  if (key === "checkpoint") return "checkpoint"
  if (key === "consistencyhub") return "consistencyhub"
  if (key === "ironadamant") return "ironadamant"
  return key
}

export function defaultConfigPath(): string {
  return path.join(packageRoot, "auspex.yml")
}

/** Packed package YAML, then AUSPEX_CONFIG. Cwd auspex.yml is not consulted (no silent override). */
export function resolveConfigPath(explicit?: string): string | undefined {
  if (explicit) return explicit
  const env = process.env.AUSPEX_CONFIG?.trim()
  if (env) return env
  const packed = defaultConfigPath()
  if (existsSync(packed)) return packed
  return undefined
}

/** ironadamant.com / checkpointprojects.com (saved checks with no profile). */
export function isPublicMarketingUrl(url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  for (const row of DEFAULT_SAVED_CHECKS) {
    if (row.profile) continue
    try {
      if (hostIs(host, new URL(row.url).hostname)) return true
    } catch {
      /* skip */
    }
  }
  return false
}

function unquote(value: string): string {
  const t = value.trim()
  if (t.length >= 2) {
    const a = t[0]
    const b = t[t.length - 1]
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) return t.slice(1, -1)
  }
  return t
}

function asBool(value: string): boolean {
  const v = unquote(value).toLowerCase()
  if (v === "true" || v === "yes" || v === "1") return true
  if (v === "false" || v === "no" || v === "0" || v === "") return false
  throw new Error(`invalid boolean in auspex.yml: ${value}`)
}

type RawSaved = {
  url?: string
  expect?: string
  profile?: string
  sso?: boolean
  record?: boolean
}

/** Minimal mapping parser for `checks:` blocks in auspex.yml. */
export function parseSavedChecksYaml(text: string): Record<string, RawSaved> {
  const out: Record<string, RawSaved> = {}
  let inChecks = false
  let current: string | undefined
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, "  ")
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    if (trimmed === "checks:") {
      inChecks = true
      current = undefined
      continue
    }
    const nameMatch = /^  ([A-Za-z][\w-]*):\s*$/.exec(line)
    if (inChecks && nameMatch) {
      current = canonicalSavedCheckName(nameMatch[1]!)
      out[current] = out[current] ?? {}
      continue
    }
    const fieldMatch = /^    (url|expect|profile|sso|record):\s*(.*)$/.exec(line)
    if (inChecks && current && fieldMatch) {
      const key = fieldMatch[1] as keyof RawSaved
      const val = fieldMatch[2] ?? ""
      if (key === "sso" || key === "record") {
        out[current][key] = asBool(val)
      } else if (key === "url" || key === "expect" || key === "profile") {
        out[current][key] = unquote(val)
      }
      continue
    }
    throw new Error(`invalid auspex.yml line: ${trimmed}`)
  }
  return out
}

export function assertSavedCheckSafe(name: string, raw: RawSaved): void {
  const canon = canonicalSavedCheckName(name)
  if (canon === "consistencyhub") {
    if (raw.sso) throw new Error("saved check consistencyhub must not set sso")
    if (raw.record) throw new Error("saved check consistencyhub must not set record")
  }
  if (raw.sso) throw new Error(`saved check ${canon} must not set sso (human SSO is a separate login)`)
  if (raw.record) throw new Error(`saved check ${canon} must not set record`)
}

export function materializeSavedCheck(name: string, raw: RawSaved): SavedCheck {
  const canon = canonicalSavedCheckName(name)
  assertSavedCheckSafe(canon, raw)
  const url = requireCheckUrl(raw.url ?? "", "url")
  const expect = requireExpect(raw.expect ?? "")
  const profile = raw.profile ? requireProfileName(raw.profile) : undefined
  return { name: canon, url, expect, profile }
}

export function builtinSavedChecks(): Record<string, SavedCheck> {
  const out: Record<string, SavedCheck> = {}
  for (const row of DEFAULT_SAVED_CHECKS) {
    out[row.name] = { ...row }
  }
  return out
}

export function loadSavedChecks(configPath?: string): Record<string, SavedCheck> {
  const merged = builtinSavedChecks()
  const file = resolveConfigPath(configPath)
  if (!file || !existsSync(file)) return merged
  const parsed = parseSavedChecksYaml(readFileSync(file, "utf8"))
  for (const [name, raw] of Object.entries(parsed)) {
    const base = merged[name] ?? {}
    merged[name] = materializeSavedCheck(name, { ...base, ...raw })
  }
  return merged
}

export function listSavedCheckNames(checks?: Record<string, SavedCheck>): string[] {
  return Object.keys(checks ?? loadSavedChecks()).sort()
}

export function resolveSavedCheck(
  name: string,
  checks?: Record<string, SavedCheck>,
): SavedCheck {
  const catalog = checks ?? loadSavedChecks()
  const canon = canonicalSavedCheckName(name)
  const found = catalog[canon]
  if (!found) {
    throw new Error(
      `unknown saved check ${name.trim() || "(empty)"}. Known: ${listSavedCheckNames(catalog).join(", ")}`,
    )
  }
  return found
}

export function savedCheckForProfile(
  profile: string,
  checks?: Record<string, SavedCheck>,
): SavedCheck | undefined {
  const want = profile.trim().toLowerCase()
  return Object.values(checks ?? loadSavedChecks()).find((c) => c.profile?.toLowerCase() === want)
}

export function applySavedCheckName<T extends {
  name?: string
  url?: string
  expect?: string
  profile?: string
}>(
  args: T,
  checks?: Record<string, SavedCheck>,
): T & { url?: string; expect?: string; profile?: string } {
  if (!args.name?.trim()) return args
  const saved = resolveSavedCheck(args.name, checks)
  return {
    ...args,
    url: args.url || saved.url,
    expect: args.expect || saved.expect,
    profile: args.profile || saved.profile,
  }
}
