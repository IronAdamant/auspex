import { Solari, SolariError } from "@solarisdk/browser"

export const GOTO_TIMEOUT_MS = 45_000
export const NETWORKIDLE_TIMEOUT_MS = 15_000
export const OVERALL_TIMEOUT_MS = 90_000
const REPLAY_ATTEMPTS = 10
const REPLAY_DELAY_MS = 3_000

export function requireApiKey(): string {
  const key = process.env.SOLARI_API_KEY
  if (!key) {
    throw new Error(
      "SOLARI_API_KEY is not set. Export a slr_live_ key from https://console.getsolari.com",
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
