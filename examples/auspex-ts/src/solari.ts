import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Solari, SolariError, type BrowserSession, type StorageState } from "@solarisdk/browser"

export const GOTO_TIMEOUT_MS = 45_000
export const NETWORKIDLE_TIMEOUT_MS = 15_000
export const OVERALL_TIMEOUT_MS = 120_000
const REPLAY_ATTEMPTS = 10
const REPLAY_DELAY_MS = 3_000

export const DOTENV_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env")

export type PlaywrightStorageState = {
  cookies: Array<{
    name: string
    value: string
    domain: string
    path: string
    expires: number
    httpOnly: boolean
    secure: boolean
    sameSite: "Strict" | "Lax" | "None"
  }>
  origins: Array<{
    origin: string
    localStorage: Array<{ name: string; value: string }>
  }>
}

/** Fill Playwright-required cookie fields; drop cookies that have no domain. */
export function toPlaywrightStorageState(state: StorageState): PlaywrightStorageState {
  const cookies: PlaywrightStorageState["cookies"] = []
  for (const c of state.cookies ?? []) {
    if (!c.domain || !c.name) continue
    const sameSite =
      c.sameSite === "Strict" || c.sameSite === "Lax" || c.sameSite === "None" ? c.sameSite : "Lax"
    cookies.push({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path ?? "/",
      expires: c.expires ?? -1,
      httpOnly: c.httpOnly ?? true,
      secure: c.secure ?? true,
      sameSite,
    })
  }
  const origins = (state.origins ?? []).map((o) => ({
    origin: o.origin,
    localStorage: o.localStorage ?? [],
  }))
  return { cookies, origins }
}

export function findProfileId(profiles: { id: string; name: string }[], name: string): string {
  const want = name.trim()
  const existing = profiles.find((p) => p.name.trim() === want)
  if (!existing) {
    throw new Error(`Solari profile not found: ${want}. Run login --profile ${want} first.`)
  }
  return existing.id
}

/** Load gitignored examples/auspex-ts/.env if the process env has no key. */
export function loadDotEnv(file = DOTENV_PATH): void {
  if (process.env.SOLARI_API_KEY) return
  if (!existsSync(file)) return
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    let line = raw
    if (line.charCodeAt(0) === 0xfeff) line = line.slice(1)
    line = line.trim()
    if (!line || line.startsWith("#")) continue
    if (line.startsWith("export ")) line = line.slice(7).trim()
    const cut = line.indexOf("=")
    if (cut <= 0) continue
    const name = line.slice(0, cut).trim()
    let value = line.slice(cut + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (name === "SOLARI_API_KEY" && value) {
      process.env.SOLARI_API_KEY = value
      return
    }
  }
}

export function requireApiKey(): string {
  loadDotEnv()
  const key = process.env.SOLARI_API_KEY
  if (!key) {
    throw new Error(
      "SOLARI_API_KEY is not set. Put slr_live_… in examples/auspex-ts/.env (gitignored) or export it in the same process that runs Auspex/Grok.",
    )
  }
  return key
}

export function createClient(): Solari {
  return new Solari({ apiKey: requireApiKey() })
}

export async function resolveProfileId(solari: Solari, name: string): Promise<string> {
  return findProfileId(await solari.profiles.list(), name)
}

/** Profile cookies live on session.storageState, not the default context. */
export async function pageForSession(browser: BrowserSession) {
  const state = browser.session.storageState
  const pw = state ? toPlaywrightStorageState(state) : { cookies: [], origins: [] }
  const hasState = pw.cookies.length > 0 || pw.origins.length > 0
  const ctx = hasState
    ? await browser.newContext({ storageState: pw })
    : (browser.contexts()[0] ?? (await browser.newContext()))
  return ctx.pages()[0] ?? ctx.newPage()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Replay upload is async after release. Stops at deadline so teardown cannot run unbounded. */
export async function waitForReplayUrl(
  solari: Solari,
  sessionId: string,
  deadlineMs = Date.now() + REPLAY_ATTEMPTS * REPLAY_DELAY_MS,
): Promise<string | undefined> {
  for (let attempt = 1; attempt <= REPLAY_ATTEMPTS; attempt++) {
    const remain = deadlineMs - Date.now()
    if (remain <= 0) return undefined
    await sleep(Math.min(REPLAY_DELAY_MS, remain))
    if (Date.now() >= deadlineMs) return undefined
    try {
      const replay = await solari.sessions.getReplayUrl(sessionId)
      return replay.url
    } catch (err) {
      const status = err instanceof SolariError ? err.status : undefined
      if (status === 404) continue
      throw err
    }
  }
  return undefined
}
