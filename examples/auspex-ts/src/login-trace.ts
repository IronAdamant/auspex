import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { StorageState } from "@solarisdk/browser"
import { foldedExpiresOnMs } from "./profile-storage.ts"
import { packageRoot } from "./paths.ts"
import { hostIs } from "./sso.ts"

/** Gitignored. Cookie hosts + counts only — never tokens, values, excerpts, or session ids. */
export const LOGIN_TRACE_PATH = path.join(packageRoot, ".auspex", "trace", "login.jsonl")
export const LOGIN_TRACE_ACTIVE_PATH = path.join(packageRoot, ".auspex", "trace", "active.json")

export const LOGIN_TRACE_LIMIT_DEFAULT = 50
export const LOGIN_TRACE_LIMIT_MAX = 200
const COOKIE_HOST_CAP = 40

/** Production writes mint lead-up only. await-login / finalize-login / check are not journaled. */
export type LoginTraceEventName = "login"

export type PhoneDoor = "ime" | "novnc-fallback" | "none"

export type LoginMintStage =
  | "key-check"
  | "profile-ensure"
  | "handoff-post"
  | "editor-start"
  | "editor-token"
  | "ready"

/** Seed extras on profileSeed (await/check). Not journal rows — production does not write those stages. */
export type LoginTraceSeedExtras = {
  cookieHosts?: string[]
  idpCookies?: boolean
  foldedExpiresInSec?: number
}

export type LoginTraceEvent = {
  ts: string
  event: LoginTraceEventName
  episodeId?: string
  remintIndex?: number
  profile?: string
  phoneDoor?: PhoneDoor
  computerDoor?: "console-editor"
  vncMintOk?: boolean
  mintStage?: LoginMintStage
  urlPresent?: boolean
  hostKind?: "public" | "cluster-internal" | "other"
  editorStartStatus?: number
  tokenLastStatus?: number
  tokenTries?: number
  expiresAt?: string
  sinceVersion?: number
  solariStatus?: number
  solariCode?: string
}

export type LoginTraceAttach = {
  tracePath?: string
  episodeId?: string
  remintCount?: number
  traceSummary?: string
}

type ActiveMap = Record<string, { episodeId: string; remintIndex: number }>

const FORBIDDEN_KEYS = new Set([
  "token",
  "password",
  "cookievalue",
  "excerpt",
  "sessionid",
  "apikey",
  "handoff",
  "handofftoken",
  "secret",
  "email",
])

export function cookieHostsFromState(state: StorageState | null | undefined): string[] {
  const hosts = new Set<string>()
  for (const c of state?.cookies ?? []) {
    const raw = (c?.domain ?? "").trim().toLowerCase().replace(/^\./, "")
    if (!raw || raw.includes("/") || raw.includes("@")) continue
    hosts.add(raw)
    if (hosts.size >= COOKIE_HOST_CAP) break
  }
  return [...hosts].sort()
}

export function idpCookiesFromHosts(hosts: string[]): boolean {
  return hosts.some(
    (h) => hostIs(h, "login.microsoftonline.com") || hostIs(h, "login.live.com") || hostIs(h, "accounts.google.com"),
  )
}

export function foldedExpiresInSecFromState(
  state: StorageState | null | undefined,
  origin?: string,
  now = Date.now(),
): number | undefined {
  if (!state || !origin) return undefined
  const expiresMs = foldedExpiresOnMs(state, origin)
  if (expiresMs === undefined) return undefined
  return Math.round((expiresMs - now) / 1000)
}

export function loginTraceSeedExtras(
  state: StorageState | null | undefined,
  origin?: string,
): LoginTraceSeedExtras {
  const cookieHosts = cookieHostsFromState(state)
  const extras: LoginTraceSeedExtras = {}
  if (cookieHosts.length) extras.cookieHosts = cookieHosts
  if (cookieHosts.length) extras.idpCookies = idpCookiesFromHosts(cookieHosts)
  const folded = foldedExpiresInSecFromState(state, origin)
  if (folded !== undefined) extras.foldedExpiresInSec = folded
  return extras
}

export function traceUrlParts(url: string | undefined): { finalHost?: string; finalPath?: string } {
  if (!url) return {}
  try {
    const u = new URL(url)
    return { finalHost: u.hostname, finalPath: u.pathname || "/" }
  } catch {
    return {}
  }
}

export function sanitizeLoginTraceEvent(raw: LoginTraceEvent): LoginTraceEvent {
  const out: LoginTraceEvent = { ts: raw.ts, event: raw.event }
  for (const [key, value] of Object.entries(raw) as Array<[keyof LoginTraceEvent, LoginTraceEvent[keyof LoginTraceEvent]]>) {
    if (value === undefined || value === null) continue
    if (FORBIDDEN_KEYS.has(String(key).toLowerCase())) continue
    if (typeof value === "string" && /eyJ[\w-]+\.[\w-]+/.test(value)) continue
    ;(out as Record<string, unknown>)[key] = value
  }
  return out
}

export async function appendLoginTrace(
  event: Omit<LoginTraceEvent, "ts"> & { ts?: string },
  file = LOGIN_TRACE_PATH,
): Promise<string | undefined> {
  try {
    const row = sanitizeLoginTraceEvent({
      ts: event.ts ?? new Date().toISOString(),
      ...event,
    })
    await mkdir(path.dirname(file), { recursive: true })
    await appendFile(file, `${JSON.stringify(row)}\n`, "utf8")
    return file
  } catch {
    return undefined
  }
}

export function clampTraceLimit(limit?: number): number {
  const n = typeof limit === "number" && Number.isFinite(limit) ? Math.floor(limit) : LOGIN_TRACE_LIMIT_DEFAULT
  return Math.min(Math.max(n, 1), LOGIN_TRACE_LIMIT_MAX)
}

async function loadJsonl(file: string): Promise<LoginTraceEvent[]> {
  const events: LoginTraceEvent[] = []
  try {
    const raw = await readFile(file, "utf8")
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line) as LoginTraceEvent
        if (!parsed || typeof parsed.event !== "string") continue
        events.push(sanitizeLoginTraceEvent(parsed))
      } catch {
        /* skip bad line */
      }
    }
  } catch {
    return events
  }
  return events
}

async function loadActive(file: string): Promise<ActiveMap> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as ActiveMap
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export function newEpisodeId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-")
  return `ep-${stamp}-${Math.random().toString(36).slice(2, 6)}`
}

export function summarizeLoginTrace(events: LoginTraceEvent[]): string {
  if (!events.length) return "No Solari mint-trace events."
  const profile = [...events].reverse().find((e) => e.profile)?.profile ?? "unknown"
  const logins = events.filter((e) => e.event === "login")
  const lastLogin = logins.at(-1)
  const remints = lastLogin?.remintIndex ?? logins.length
  const last = events.at(-1)!
  const prefix = `Episode ${last.episodeId ?? "ungrouped"} (${profile}): remint ${remints}.`
  if (last.solariCode === "MissingApiKey" || last.mintStage === "key-check") {
    return `${prefix} Mint stopped at key-check: SOLARI_API_KEY is not set. Export it in the process that runs Auspex. Do not remint until the key is present.`
  }
  if (last.solariStatus === 429 || last.solariCode === "ConcurrencyLimitExceeded") {
    return `${prefix} Mint stopped: Solari 429 ConcurrencyLimitExceeded. Call auspex_reap, then remint. Do not retry create while the slot is held.`
  }
  if (last.solariStatus === 402 || last.solariCode === "FeatureRequiresPlan") {
    return `${prefix} Mint stopped: Solari 402 FeatureRequiresPlan. Not retryable. Drop stealth/proxy/captcha/desktop or upgrade. Login mint does not need stealth.`
  }
  if (last.solariStatus === 403 || last.solariCode === "PlanLimitExceeded") {
    return `${prefix} Mint stopped: Solari 403 PlanLimitExceeded. Not retryable. Delete unused profiles or upgrade. Do not retry create.`
  }
  if (last.solariCode === "NoHandoffUrl" || (last.mintStage === "handoff-post" && last.urlPresent === false)) {
    return `${prefix} Mint stopped at handoff-post: login-handoff returned no url. Remint auspex_login. Laptop-only fallback is console Profiles → Open editor.`
  }
  if (last.editorStartStatus === 401) {
    return `${prefix} Mint stopped at editor-start HTTP 401. Handoff token was rejected. Remint auspex_login; do not open Solari editor on a phone.`
  }
  if (last.editorStartStatus === 503 || last.solariStatus === 503) {
    return `${prefix} Mint stopped at editor-start HTTP 503 (Solari overload). Wait 5-10s, auspex_reap if the slot may be held, then remint. Not loggedOut or needsHuman.`
  }
  if (last.solariStatus === 502 || last.solariStatus === 504) {
    return `${prefix} Transient Solari infrastructure HTTP ${last.solariStatus}. Wait 5-10s, remint login (handoff URLs are single-use).`
  }
  if (last.mintStage === "editor-token" && last.vncMintOk === false) {
    if ((last.editorStartStatus ?? 0) === 0 && (last.tokenTries ?? 0) === 0) {
      return `${prefix} Mint stopped at editor-token: empty handoff token (VNC not minted). Phone door not ready. Computer Open editor may still work. Remint if the human cannot open the card.`
    }
    const start = last.editorStartStatus ?? "ok"
    const tries = last.tokenTries ?? 20
    return `${prefix} Mint stopped at editor-token: no VNC token after ${tries}s (editor start ${start}). Phone door not ready. Computer Open editor may still work. Refresh the handoff card once; if still blank after 2-3 minutes, remint.`
  }
  const door =
    last.phoneDoor === "ime"
      ? "Phone door is phone.html (IME)."
      : last.phoneDoor === "novnc-fallback"
        ? "Phone door fell back to Solari noVNC; computer Open editor still works."
        : "Computer Open editor is the door."
  const clusterNote =
    last.hostKind === "cluster-internal"
      ? "Solari login-handoff hostname was cluster-internal; human packet uses the public console host. Report to Solari. "
      : ""
  if (last.vncMintOk === true) {
    return `${prefix} ${clusterNote}Mint ready. ${door} Mint log stops here. Use await-login / finalize-login / check as normal ops.`
  }
  if (last.urlPresent === true && last.vncMintOk === false) {
    return `${prefix} Handoff URL minted but phone VNC did not. ${door} Computer Open editor may still work. Remint only if the human cannot open the card.`
  }
  if (last.solariCode || last.solariStatus) {
    return `${prefix} Mint stopped: Solari ${last.solariStatus ?? ""} ${last.solariCode ?? ""}`.trim() + "."
  }
  return `${prefix} ${door}`
}

export async function recordLoginTrace(
  event: Omit<LoginTraceEvent, "ts" | "episodeId" | "remintIndex"> & {
    ts?: string
    episodeId?: string
    remintIndex?: number
  },
  opts: { file?: string; activeFile?: string } = {},
): Promise<LoginTraceAttach> {
  const file = opts.file ?? LOGIN_TRACE_PATH
  const activeFile = opts.activeFile ?? LOGIN_TRACE_ACTIVE_PATH
  const profile = event.profile?.trim()
  try {
    const existing = await loadJsonl(file)
    const active = await loadActive(activeFile)
    let episodeId = event.episodeId
    let remintIndex = event.remintIndex
    if (profile) {
      remintIndex = existing.filter((e) => e.event === "login" && e.profile === profile).length + 1
      episodeId = event.episodeId ?? newEpisodeId()
      active[profile] = { episodeId, remintIndex }
      await mkdir(path.dirname(activeFile), { recursive: true })
      await writeFile(activeFile, `${JSON.stringify(active)}\n`)
    }
    await appendLoginTrace({ ...event, episodeId, remintIndex }, file)
    const episodeEvents = (await loadJsonl(file)).filter((e) => (episodeId ? e.episodeId === episodeId : true))
    return {
      tracePath: file,
      episodeId,
      remintCount: remintIndex,
      traceSummary: summarizeLoginTrace(episodeEvents),
    }
  } catch {
    return {}
  }
}

export async function readLoginTrace(opts: {
  profile?: string
  limit?: number
  file?: string
  all?: boolean
} = {}): Promise<{
  tracePath: string
  episodeId?: string
  remintCount?: number
  traceSummary?: string
  events: LoginTraceEvent[]
}> {
  const file = opts.file ?? LOGIN_TRACE_PATH
  const limit = clampTraceLimit(opts.limit)
  const want = opts.profile?.trim()
  let events = (await loadJsonl(file)).filter((e) => !want || e.profile === want)
  let episodeId: string | undefined
  if (!opts.all) {
    episodeId = [...events].reverse().find((e) => e.event === "login" && e.episodeId)?.episodeId
      ?? [...events].reverse().find((e) => e.episodeId)?.episodeId
    if (episodeId) events = events.filter((e) => e.episodeId === episodeId)
  }
  if (events.length > limit) events = events.slice(-limit)
  const remintCount = [...events].reverse().find((e) => e.remintIndex)?.remintIndex
  return {
    tracePath: file,
    episodeId,
    remintCount,
    traceSummary: summarizeLoginTrace(events),
    events,
  }
}
