import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import path from "node:path"

/** Desktop saved-login idle life. A use resets this clock. Signup stays in use separately. */
export const OPERATOR_IDLE_MS = 30 * 60 * 1000

/** Phone QR list of those saved profiles. Clearing it does not delete the desktop copy. */
export const PHONE_LIST_MS = 10 * 60 * 1000

/** Open handoff / await-login counts as use so the idle clock does not fire during signup. */
export const SIGNUP_BUSY_MS = 30 * 60 * 1000

export const OPERATOR_PURGE_QUESTION =
  "After a saved login has been used and tested, ask the human whether testing is done and the login may be purged. Purge only after the human agrees. On the desktop, the same wipe runs when that profile has been idle for 30 minutes. A use resets that profile's 30-minute clock. Other profiles stay. One site at a time. Username and password stay in the local page fields only, and those fields are cleared after paste or Save. They are not included in the agent message."

export const OPERATOR_HELP =
  OPERATOR_PURGE_QUESTION +
  " auspex profiles lists those saved logins (site and profile name only). " +
  "npx auspex profiles --purge <name> --yes wipes one saved login only after the human agrees. " +
  "humanAgree is that same yes on MCP. No agent tool accepts a username, a password, or the Solari key. " +
  "The desktop thin client is docs/desktop.html (Solari remote view plus the typing door). " +
  "The phone door is docs/phone.html. Paste URL, username, and password on those pages; they stay on the page. " +
  "The desktop Solari key stays in that browser, or in gitignored .auspex/operator-key. It is not echoed to the agent."

export type OperatorProfileInput = {
  profile: string
  site?: string
  lastUsedMs: number
  /** Signup or an open handoff. Idle wipe skips it. */
  inUse?: boolean
  username?: string
  password?: string
  solariKey?: string
}

export type OperatorDecisionInput = {
  profiles: readonly OperatorProfileInput[]
  nowMs: number
  /** Voluntary wipe runs only when this is true. */
  humanAgree?: boolean
  /** Profile names the human agreed to purge. Ignored unless humanAgree is true. */
  voluntary?: readonly string[]
  username?: string
  password?: string
  solariKey?: string
}

export type OperatorSiteIdentity = {
  site: string
  profile: string
}

export type OperatorAgentNotice = {
  question: string
  idleMinutes: 30
  sites: OperatorSiteIdentity[]
}

export type PhoneSavedProfile = {
  site: string
  profile: string
}

export type OperatorDecision = {
  wipe: string[]
  agent: OperatorAgentNotice
}

export type StoredOperatorProfile = {
  site?: string
  lastUsedMs: number
  busyUntilMs?: number
}

export type OperatorState = {
  profiles: Record<string, StoredOperatorProfile>
}

export type OperatorNote = {
  profile: string
  site?: string
  busyMs?: number
  /** End of signup only. Ordinary checks keep an unexpired busy window. */
  clearBusy?: boolean
}

/** Loopback door the desktop page posts the Solari key to. Not an agent field. */
export const OPERATOR_KEY_PORT = 17321
export const OPERATOR_KEY_POST_PATH = "/auspex-operator-key"

export type OperatorWipeDeps = {
  list: () => Promise<Array<{ id: string; name: string }>>
  deleteProfile: (id: string) => Promise<void>
}

function cleanProfile(name: string): string {
  return name.trim()
}

function siteIdentity(row: { profile: string; site?: string }): OperatorSiteIdentity {
  const profile = cleanProfile(row.profile)
  const site = row.site?.trim() || profile
  return { site, profile }
}

/** Pure clock. Idle wipe is per profile. Voluntary wipe requires humanAgree. Secrets are dropped. */
export function decideOperatorSession(input: OperatorDecisionInput): OperatorDecision {
  const now = input.nowMs
  const voluntary = new Set(
    input.humanAgree === true ? (input.voluntary ?? []).map(cleanProfile).filter(Boolean) : [],
  )
  const wipe: string[] = []
  const sites: OperatorSiteIdentity[] = []
  const seen = new Set<string>()
  for (const row of input.profiles) {
    const profile = cleanProfile(row.profile)
    if (!profile || seen.has(profile)) continue
    seen.add(profile)
    sites.push(siteIdentity({ profile, site: row.site }))
    const idle = !row.inUse && now - row.lastUsedMs >= OPERATOR_IDLE_MS
    if (idle || voluntary.has(profile)) wipe.push(profile)
  }
  return {
    wipe,
    agent: {
      question: OPERATOR_PURGE_QUESTION,
      idleMinutes: 30,
      sites,
    },
  }
}

export function formatOperatorNotice(agent: OperatorAgentNotice): string {
  const rows = agent.sites.map((row) => `${row.site} (profile ${row.profile})`)
  const list = rows.length > 0 ? ` Saved logins: ${rows.join("; ")}.` : ""
  return `${agent.question}${list}`
}

export function attachMatchedPurgeNext<T extends { next?: string; reason?: string }>(
  receipt: T,
  agent: OperatorAgentNotice | undefined,
): T {
  if (!agent || receipt.reason !== "matched" || receipt.next) return receipt
  if (agent.sites.length === 0) return receipt
  return { ...receipt, next: formatOperatorNotice(agent) }
}

export function emptyOperatorState(): OperatorState {
  return { profiles: {} }
}

export function operatorStatePath(root: string): string {
  return path.join(root, ".auspex", "operator-session.json")
}

export function readOperatorState(root: string): OperatorState {
  const file = operatorStatePath(root)
  if (!existsSync(file)) return emptyOperatorState()
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { profiles?: unknown }
    if (!parsed || typeof parsed !== "object" || !parsed.profiles || typeof parsed.profiles !== "object") {
      return emptyOperatorState()
    }
    const profiles: OperatorState["profiles"] = {}
    for (const [name, raw] of Object.entries(parsed.profiles as Record<string, unknown>)) {
      const profile = cleanProfile(name)
      if (!profile || !raw || typeof raw !== "object") continue
      const row = raw as { site?: unknown; lastUsedMs?: unknown; busyUntilMs?: unknown }
      const lastUsedMs = typeof row.lastUsedMs === "number" && Number.isFinite(row.lastUsedMs) ? row.lastUsedMs : 0
      const site = typeof row.site === "string" && row.site.trim() ? row.site.trim() : undefined
      const busyUntilMs =
        typeof row.busyUntilMs === "number" && Number.isFinite(row.busyUntilMs) ? row.busyUntilMs : undefined
      profiles[profile] = { site, lastUsedMs, ...(busyUntilMs !== undefined ? { busyUntilMs } : {}) }
    }
    return { profiles }
  } catch {
    return emptyOperatorState()
  }
}

export function writeOperatorState(root: string, state: OperatorState): void {
  const file = operatorStatePath(root)
  mkdirSync(path.dirname(file), { recursive: true })
  const profiles: OperatorState["profiles"] = {}
  for (const [name, row] of Object.entries(state.profiles)) {
    const profile = cleanProfile(name)
    if (!profile) continue
    profiles[profile] = {
      ...(row.site ? { site: row.site } : {}),
      lastUsedMs: row.lastUsedMs,
      ...(row.busyUntilMs !== undefined ? { busyUntilMs: row.busyUntilMs } : {}),
    }
  }
  writeFileSync(file, JSON.stringify({ profiles }, null, 2) + "\n", { mode: 0o600 })
  chmodSync(file, 0o600)
}

/** Signup ends only when the wait stored cookies. Timeout and empty-save keep the busy window. */
export function noteAfterSignupWait(opts: { profile: string; status: string; site?: string }): OperatorNote {
  const note: OperatorNote = { profile: opts.profile }
  if (opts.site) note.site = opts.site
  if (opts.status === "completed") note.clearBusy = true
  return note
}

export function noteOperatorUse(state: OperatorState, note: OperatorNote, nowMs: number): OperatorState {
  const profile = cleanProfile(note.profile)
  if (!profile) return state
  const prev = state.profiles[profile]
  const next: StoredOperatorProfile = {
    site: note.site?.trim() || prev?.site,
    lastUsedMs: nowMs,
  }
  if (note.busyMs !== undefined && note.busyMs > 0) {
    next.busyUntilMs = nowMs + note.busyMs
  } else if (note.clearBusy) {
    /* signup finished; the idle clock starts from this use */
  } else if (prev?.busyUntilMs !== undefined && prev.busyUntilMs > nowMs) {
    next.busyUntilMs = prev.busyUntilMs
  }
  return { profiles: { ...state.profiles, [profile]: next } }
}

export function profilesFromState(state: OperatorState, nowMs: number): OperatorProfileInput[] {
  return Object.entries(state.profiles).map(([profile, row]) => ({
    profile,
    site: row.site,
    lastUsedMs: row.lastUsedMs,
    inUse: row.busyUntilMs !== undefined && row.busyUntilMs > nowMs,
  }))
}

export function forgetOperatorProfiles(state: OperatorState, names: readonly string[]): OperatorState {
  const drop = new Set(names.map(cleanProfile))
  const profiles: OperatorState["profiles"] = {}
  for (const [name, row] of Object.entries(state.profiles)) {
    if (!drop.has(name)) profiles[name] = row
  }
  return { profiles }
}

/** Deletes by Solari profile id. The password is not an argument. */
export async function applyOperatorWipes(
  names: readonly string[],
  deps: OperatorWipeDeps,
): Promise<string[]> {
  const wanted: string[] = []
  const seen = new Set<string>()
  for (const name of names) {
    const profile = cleanProfile(name)
    if (!profile || seen.has(profile)) continue
    seen.add(profile)
    wanted.push(profile)
  }
  if (wanted.length === 0) return []
  const rows = await deps.list()
  const deleted: string[] = []
  for (const name of wanted) {
    const row = rows.find((item) => item.name.trim() === name)
    if (!row) continue
    await deps.deleteProfile(row.id)
    deleted.push(name)
  }
  return deleted
}

export async function commitOperatorSession(opts: {
  root: string
  nowMs: number
  note?: OperatorNote
  humanAgree?: boolean
  voluntary?: readonly string[]
  applyWipes?: (names: readonly string[]) => Promise<readonly string[]>
}): Promise<{ agent: OperatorAgentNotice; wiped: string[] }> {
  let state = readOperatorState(opts.root)
  if (opts.note?.profile.trim()) state = noteOperatorUse(state, opts.note, opts.nowMs)
  const known = profilesFromState(state, opts.nowMs)
  const seen = new Set(known.map((row) => row.profile))
  const agreed = opts.humanAgree === true ? (opts.voluntary ?? []) : []
  const extras = agreed
    .map((name) => name.trim())
    .filter((name) => name && !seen.has(name))
    .map((profile) => ({ profile, lastUsedMs: opts.nowMs, inUse: true }))
  const decision = decideOperatorSession({
    profiles: [...known, ...extras],
    nowMs: opts.nowMs,
    humanAgree: opts.humanAgree,
    voluntary: opts.voluntary,
  })
  let wiped: string[] = []
  if (decision.wipe.length > 0 && opts.applyWipes) {
    wiped = [...(await opts.applyWipes(decision.wipe))]
    state = forgetOperatorProfiles(state, wiped)
  }
  writeOperatorState(opts.root, state)
  return { agent: decision.agent, wiped }
}

export function operatorKeyPath(root: string): string {
  return path.join(root, ".auspex", "operator-key")
}

/** Writes the key under gitignored .auspex/. Returns the file path. Does not return the key. */
export function writeOperatorKey(root: string, key: string): string {
  const trimmed = key.trim()
  if (!trimmed) throw new Error("Solari key is empty")
  const file = operatorKeyPath(root)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${trimmed}\n`, { mode: 0o600 })
  chmodSync(file, 0o600)
  return file
}

/** Desktop Save posts `{ key }` here. The ack never includes the key. */
export function ingestOperatorKeyPost(body: string, root: string): { ok: true } {
  let parsed: { key?: unknown }
  try {
    parsed = JSON.parse(body) as { key?: unknown }
  } catch {
    throw new Error("Solari key body is not JSON")
  }
  if (typeof parsed.key !== "string") throw new Error("Solari key is missing")
  writeOperatorKey(root, parsed.key)
  return { ok: true }
}

function sendOperatorKeyAck(res: ServerResponse, status: number, ok: boolean): void {
  const payload = JSON.stringify({ ok })
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
  })
  res.end(payload)
}

/** Loopback server. The desktop page is the only caller. The response is `{ ok }`. */
export function createOperatorKeyServer(root: string): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const pathOnly = (req.url ?? "/").split("?")[0]
    if (req.method === "OPTIONS" && pathOnly === OPERATOR_KEY_POST_PATH) {
      sendOperatorKeyAck(res, 204, true)
      return
    }
    if (req.method === "GET" && pathOnly === OPERATOR_KEY_POST_PATH) {
      const payload = JSON.stringify({
        present: operatorKeyIsPresent(root, [path.resolve(root, "../../.env")]),
      })
      res.writeHead(200, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      })
      res.end(payload)
      return
    }
    if (req.method !== "POST" || pathOnly !== OPERATOR_KEY_POST_PATH) {
      sendOperatorKeyAck(res, 404, false)
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    req.on("data", (chunk: Buffer) => {
      size += chunk.length
      if (size > 8192) {
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      try {
        ingestOperatorKeyPost(Buffer.concat(chunks).toString("utf8"), root)
        sendOperatorKeyAck(res, 200, true)
      } catch {
        sendOperatorKeyAck(res, 400, false)
      }
    })
  })
}

/** Long-lived Auspex process (MCP). A second process that already holds the port is fine. */
export function startOperatorKeyListener(root: string, port = OPERATOR_KEY_PORT): Server {
  const server = createOperatorKeyServer(root)
  server.on("error", () => {})
  server.listen(port, "127.0.0.1")
  return server
}

/** Site and profile only. Password-shaped fields are dropped. The phone list expires in 10 minutes. */
export function phoneSavedParams(
  rows: readonly { site?: string; profile: string; username?: string; password?: string }[],
  nowMs: number,
): { saved?: string; plist?: string } {
  const clean: PhoneSavedProfile[] = []
  for (const row of rows) {
    const profile = row.profile.trim()
    const site = (row.site || profile).trim()
    if (!profile || !site) continue
    clean.push({ site, profile })
  }
  if (clean.length === 0) return {}
  return {
    saved: Buffer.from(JSON.stringify(clean), "utf8").toString("base64url"),
    plist: String(Math.floor(nowMs / 1000) + PHONE_LIST_MS / 1000),
  }
}

export function decodePhoneSavedList(saved: string): PhoneSavedProfile[] {
  try {
    const parsed = JSON.parse(Buffer.from(saved, "base64url").toString("utf8")) as unknown
    if (!Array.isArray(parsed)) return []
    const rows: PhoneSavedProfile[] = []
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue
      const row = item as { site?: unknown; profile?: unknown }
      if (typeof row.profile !== "string" || !row.profile.trim()) continue
      const profile = row.profile.trim()
      const site = typeof row.site === "string" && row.site.trim() ? row.site.trim() : profile
      rows.push({ site, profile })
    }
    return rows
  } catch {
    return []
  }
}

function fileHasSolariKey(file: string): boolean {
  if (!existsSync(file)) return false
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    let line = raw.trim()
    if (!line || line.startsWith("#")) continue
    if (line.startsWith("export ")) line = line.slice(7).trim()
    if (!line.startsWith("SOLARI_API_KEY=")) continue
    let value = line.slice("SOLARI_API_KEY=".length).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (value) return true
  }
  return false
}

/** True when this computer already has a Solari key. The key itself is not returned. */
export function operatorKeyIsPresent(root: string, extraEnvFiles: readonly string[] = []): boolean {
  if (process.env.SOLARI_API_KEY?.trim()) return true
  if (readOperatorKey(operatorKeyPath(root))) return true
  if (fileHasSolariKey(path.join(root, ".env"))) return true
  return extraEnvFiles.some((file) => fileHasSolariKey(file))
}

export function readOperatorKey(file: string): string | undefined {
  if (!existsSync(file)) return undefined
  const lines = readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
  const line = lines[0]
  if (!line) return undefined
  if (line.startsWith("SOLARI_API_KEY=")) {
    let value = line.slice("SOLARI_API_KEY=".length).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    return value || undefined
  }
  if (line.includes("=")) return undefined
  return line
}
