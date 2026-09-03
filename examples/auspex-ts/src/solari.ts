import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { BrowserSession, Solari, SolariError, type StorageState } from "@solarisdk/browser"
import { chromium } from "patchright-core"
import {
  boundPromise,
  CHROMIUM_CONNECT_TIMEOUT_MS,
  CLOSE_TIMEOUT_MS,
  closeThenRelease,
} from "./timeout.ts"

/** Playwright ConnectOptions so chromium.connect cannot wait forever (timeout 0). */
export const CHROMIUM_CONNECT_OPTS = { timeout: CHROMIUM_CONNECT_TIMEOUT_MS } as const

export type LaunchSession = { id: string; wsEndpoint: string }
export type LaunchDeps = {
  create: (opts: {
    stealth?: boolean
    recording?: boolean
    profileId?: string
  }) => Promise<LaunchSession>
  connect: (wsEndpoint: string, opts: { timeout: number }) => Promise<unknown>
  wrap: (session: LaunchSession, browser: unknown) => { close: () => Promise<void> }
  releaseAndWait: (id: string) => Promise<void>
  closeTimeoutMs?: number
}

export function defaultLaunchDeps(solari: Solari): LaunchDeps {
  return {
    create: (opts) => solari.sessions.create(opts),
    connect: (ws, opts) => chromium.connect(ws, opts),
    wrap: (session, browser) =>
      new BrowserSession(solari, session as never, browser as never),
    releaseAndWait: (id) => solari.sessions.releaseAndWait(id),
  }
}

export const GOTO_TIMEOUT_MS = 45_000
export const NETWORKIDLE_TIMEOUT_MS = 15_000
export const OVERALL_TIMEOUT_MS = 120_000
export const REPLAY_ATTEMPTS = 10
export const REPLAY_DELAY_MS = 3_000

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

/** sessions.create then chromium.connect with a real timeout; release if connect fails or abort fires. */
export async function launchBrowser(
  solari: Solari,
  options: { stealth?: boolean; recording?: boolean; profileId?: string } = {},
  signal?: AbortSignal,
  deps: LaunchDeps = defaultLaunchDeps(solari),
): Promise<BrowserSession> {
  const closeMs = deps.closeTimeoutMs ?? CLOSE_TIMEOUT_MS
  const session = await deps.create({
    stealth: options.stealth,
    recording: options.recording,
    profileId: options.profileId,
  })
  const release = () =>
    boundPromise(
      deps.releaseAndWait(session.id),
      closeMs,
      `session release timed out after ${closeMs}ms`,
    ).catch(() => undefined)
  if (signal?.aborted) {
    await release()
    throw new Error("aborted")
  }
  try {
    const browser = await deps.connect(session.wsEndpoint, {
      timeout: CHROMIUM_CONNECT_OPTS.timeout,
    })
    if (signal?.aborted) {
      const held = deps.wrap(session, browser)
      await closeThenRelease(() => held.close(), () => deps.releaseAndWait(session.id), closeMs).catch(
        () => undefined,
      )
      throw new Error("aborted")
    }
    return deps.wrap(session, browser) as BrowserSession
  } catch (err) {
    if (err instanceof Error && err.message === "aborted") throw err
    await release()
    throw err
  }
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

export type ReplayRetryOpts = {
  deadlineMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

function replayStatus(err: unknown): number | undefined {
  if (err instanceof SolariError) return err.status
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status?: unknown }).status
    return typeof s === "number" ? s : undefined
  }
  return undefined
}

/** Retry an async replay call while the endpoint 404s (upload is async after release). */
export async function retryReplay404<T>(op: () => Promise<T>, opts: ReplayRetryOpts = {}): Promise<T> {
  const now = opts.now ?? Date.now
  const sleepFn = opts.sleep ?? sleep
  const deadlineMs = opts.deadlineMs ?? now() + REPLAY_ATTEMPTS * REPLAY_DELAY_MS
  let lastErr: unknown
  for (let attempt = 1; attempt <= REPLAY_ATTEMPTS; attempt++) {
    if (now() >= deadlineMs) break
    try {
      return await op()
    } catch (err) {
      if (replayStatus(err) !== 404) throw err
      lastErr = err
    }
    const remain = deadlineMs - now()
    if (remain <= 0) break
    await sleepFn(Math.min(REPLAY_DELAY_MS, remain))
  }
  if (lastErr) throw lastErr
  throw new Error("replay was not ready before deadline")
}

export async function downloadReplayWhenReady(
  download: (sessionId: string) => Promise<Uint8Array>,
  sessionId: string,
  opts: ReplayRetryOpts = {},
): Promise<Uint8Array> {
  return retryReplay404(() => download(sessionId), opts)
}

/** Replay upload is async after release. Stops at deadline so teardown cannot run unbounded. */
export async function waitForReplayUrl(
  solari: Solari,
  sessionId: string,
  deadlineMs = Date.now() + REPLAY_ATTEMPTS * REPLAY_DELAY_MS,
): Promise<string | undefined> {
  try {
    return await retryReplay404(async () => {
      const replay = await solari.sessions.getReplayUrl(sessionId)
      return replay.url
    }, { deadlineMs })
  } catch (err) {
    if (replayStatus(err) === 404) return undefined
    throw err
  }
}
