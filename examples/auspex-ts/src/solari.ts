import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Solari, SolariError, type BrowserSession } from "@solarisdk/browser"

export const GOTO_TIMEOUT_MS = 45_000
export const NETWORKIDLE_TIMEOUT_MS = 15_000
export const OVERALL_TIMEOUT_MS = 120_000
const REPLAY_ATTEMPTS = 10
const REPLAY_DELAY_MS = 3_000

export const DOTENV_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env")

/** Load gitignored examples/auspex-ts/.env if the process env has no key. */
export function loadDotEnv(file = DOTENV_PATH): void {
  if (process.env.SOLARI_API_KEY) return
  if (!existsSync(file)) return
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
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
  const existing = (await solari.profiles.list()).find((p) => p.name === name)
  const profile = existing ?? (await solari.profiles.create({ name }))
  return profile.id
}

/** Profile cookies live on session.storageState, not the default context. */
export async function pageForSession(browser: BrowserSession) {
  const state = browser.session.storageState
  const hasState = Boolean(state?.cookies?.length || state?.origins?.length)
  const ctx = hasState && state
    ? await browser.newContext({ storageState: state as never })
    : (browser.contexts()[0] ?? (await browser.newContext()))
  return ctx.pages()[0] ?? ctx.newPage()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Replay upload is async after release. First poll usually 404s. */
export async function waitForReplayUrl(
  solari: Solari,
  sessionId: string,
): Promise<string | undefined> {
  for (let attempt = 1; attempt <= REPLAY_ATTEMPTS; attempt++) {
    await sleep(REPLAY_DELAY_MS)
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
