/**
 * Platform preflight. GET /profiles once, with an 8s cap.
 * The browser SDK's health probe runs only after launch() connects Chrome.
 * This command does not POST /sessions, so it does not mint, and it does not
 * say the app is logged in. profile-status is that jar probe.
 */
import { installInfo } from "./paths.ts"
import { Solari, SolariError, type SolariOptions } from "@solarisdk/browser"
import { AuspexError, classifySolariError, redactSecrets, type SolariBlame, type SolariIssue } from "./errors.ts"
import { reapNextCall, type NextCall } from "./next-call.ts"
import { BROWSER_API_BASE, requireApiKey } from "./solari.ts"
import { stampSchema } from "./schema-version.ts"

export const SOLARI_HEALTH_PROBE_PATH = "/profiles"
export const SOLARI_HEALTH_PROBE = "GET /profiles" as const
export const SOLARI_HEALTH_TIMEOUT_MS = 8_000
export const SOLARI_HEALTH_ENDPOINT = `${BROWSER_API_BASE}${SOLARI_HEALTH_PROBE_PATH}`

export const SOLARI_HEALTH_REASONS = [
  "reachable",
  "missing-key",
  "auth",
  "concurrency",
  "plan",
  "BrowserUnhealthy",
  "infra-5xx",
  "timeout",
  "network",
  "unknown-exhausted",
  "stealth-pool-empty",
  "error",
] as const

export type SolariHealthReason = (typeof SOLARI_HEALTH_REASONS)[number]

export type SolariHealthReceipt = {
  ok: boolean
  reason: SolariHealthReason
  probe: typeof SOLARI_HEALTH_PROBE
  endpoint: string
  /** False when the key was missing and Solari was not called. */
  called: boolean
  /** This command never creates a browser session. */
  minted: false
  /** This command never probes the user's app. */
  appLogin: false
  elapsedMs: number
  next: string
  profileCount?: number
  code?: string
  status?: number
  retryable?: boolean
  solariBlame?: SolariBlame
  nextCall?: NextCall
  error?: string
  /** npm, clone or AUSPEX_HOME; where local state lives; and the shell command for this install. */
  install?: string
  stateDir?: string
  command?: string
}

export type SolariHealthResponse = {
  ok: boolean
  status: number
  text: () => Promise<string>
  json: () => Promise<unknown>
}

export type SolariHealthClient = {
  request: (method: string, path: string, body?: unknown) => Promise<SolariHealthResponse>
  close: () => Promise<void>
}

/** One attempt. The SDK default is two attempts and 90s, which is the wrong shape for a preflight. */
export function healthSolariOptions(apiKey: string): SolariOptions {
  return {
    apiKey,
    maxAttempts: 1,
    timeoutMs: SOLARI_HEALTH_TIMEOUT_MS,
    backoffMs: 0,
  }
}

function causeChain(err: unknown): unknown[] {
  const out: unknown[] = []
  let cur: unknown = err
  for (let i = 0; i < 4 && cur !== undefined && cur !== null; i++) {
    out.push(cur)
    if (!(cur instanceof Error)) break
    cur = (cur as Error & { cause?: unknown }).cause
  }
  return out
}

function chainBlob(err: unknown): string {
  return causeChain(err)
    .map((item) => (item instanceof Error ? `${item.name} ${item.message}` : typeof item === "string" ? item : ""))
    .join("\n")
}

function chainStatus(err: unknown): number | undefined {
  for (const item of causeChain(err)) {
    if (item instanceof SolariError && typeof item.status === "number") return item.status
    if (item instanceof AuspexError && typeof item.issue.status === "number") return item.issue.status
  }
  return undefined
}

const TIMEOUT_RE = /AbortError|TimeoutError|operation was aborted|this operation was aborted|\baborted\b|timed out|ETIMEDOUT/i
const NETWORK_RE = /ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|EPIPE|fetch failed|getaddrinfo|socket hang up|UND_ERR|network/i
const MISSING_KEY_RE = /SOLARI_API_KEY is not set|apiKey is required/i

export function isMissingSolariKey(err: unknown): boolean {
  if (err instanceof AuspexError && err.issue.code === "MissingApiKey") return true
  return MISSING_KEY_RE.test(chainBlob(err))
}

function isTimeout(err: unknown): boolean {
  if (chainStatus(err) !== undefined) return false
  return TIMEOUT_RE.test(chainBlob(err))
}

function isNetwork(err: unknown): boolean {
  if (chainStatus(err) !== undefined) return false
  return NETWORK_RE.test(chainBlob(err))
}

function healthNext(reason: SolariHealthReason, status?: number): string {
  switch (reason) {
    case "reachable":
      return "Solari accepted the key and listed profiles. This is not a saved login and not a browser mint. You can attempt the next Auspex call. profile-status is the jar check."
    case "missing-key":
      return "SOLARI_API_KEY is not set. Export it from https://console.getsolari.com in the process that runs Auspex. Auspex did not call Solari."
    case "auth":
      return "Solari rejected the API key. Check SOLARI_API_KEY. Do not remint a login."
    case "concurrency":
      return "Solari 429: leftover sessions hold a slot. Run auspex reap (ledger, not account-wide), then retry. Do not remint while the slot is held."
    case "plan":
      return "Solari refused the plan. This probe did not start a browser. Drop stealth, proxy, captcha, or desktop, or upgrade, then retry. Do not remint to fix a plan refusal."
    case "BrowserUnhealthy":
      return "Solari BrowserUnhealthy. Retry auspex solari-health. This is not loggedOut and not a phone door."
    case "infra-5xx":
      return "Solari infrastructure error. Wait 5-10 seconds and run auspex solari-health once more. auspex reap only if a leftover slot is suspect. Do not remint yet. This is not an app login failure."
    case "timeout":
      return "Solari did not answer GET /profiles before the timeout. Wait, then run auspex solari-health again. Do not remint."
    case "network":
      return "Could not reach api.getsolari.com. Check the network, then run auspex solari-health again. This is not an app login failure."
    case "unknown-exhausted":
      return "Solari SDK exhausted retries and stripped the HTTP status. Wait once, then run auspex solari-health again. Do not remint from this probe. This is not loggedOut or needsHuman."
    case "stealth-pool-empty":
      return "Solari stealth pool is empty. This probe did not send stealth. Drop --stealth on later checks, or wait once and retry auspex solari-health. Do not remint."
    case "error":
      return status !== undefined
        ? `Solari GET /profiles returned HTTP ${status}. Retry auspex solari-health once. This is not an app login.`
        : "Solari did not look healthy enough to proceed. Retry auspex solari-health once. This is not an app login."
  }
}

function bucket(issue: SolariIssue): SolariHealthReason {
  if (issue.code === "MissingApiKey") return "missing-key"
  if (issue.code === "BrowserUnhealthy") return "BrowserUnhealthy"
  if (issue.solariBlame === "concurrency" || issue.code === "ConcurrencyLimitExceeded" || issue.status === 429) {
    return "concurrency"
  }
  if (issue.solariBlame === "infra-5xx" || (typeof issue.status === "number" && issue.status >= 500 && issue.status <= 599)) {
    return "infra-5xx"
  }
  if (issue.solariBlame === "stealth-pool-empty") return "stealth-pool-empty"
  if (issue.solariBlame === "unknown-exhausted") return "unknown-exhausted"
  if (
    issue.code === "FeatureRequiresPlan" ||
    issue.code === "PlanLimitExceeded" ||
    issue.status === 402 ||
    issue.status === 403
  ) {
    return "plan"
  }
  if (issue.status === 401) return "auth"
  return "error"
}

function baseReceipt(reason: SolariHealthReason, called: boolean, elapsedMs: number): SolariHealthReceipt {
  return {
    ok: reason === "reachable",
    reason,
    probe: SOLARI_HEALTH_PROBE,
    endpoint: SOLARI_HEALTH_ENDPOINT,
    called,
    minted: false,
    appLogin: false,
    elapsedMs,
    next: healthNext(reason),
  }
}

export function healthReceiptFromError(err: unknown, elapsedMs: number): SolariHealthReceipt {
  if (isMissingSolariKey(err)) {
    const receipt = baseReceipt("missing-key", false, elapsedMs)
    return { ...receipt, code: "MissingApiKey", retryable: false, error: redactSecrets(receipt.next) }
  }
  if (isTimeout(err)) {
    const receipt = baseReceipt("timeout", true, elapsedMs)
    return { ...receipt, code: "Timeout", retryable: true, error: redactSecrets(receipt.next) }
  }
  if (isNetwork(err)) {
    const receipt = baseReceipt("network", true, elapsedMs)
    return { ...receipt, code: "Network", retryable: true, error: redactSecrets(receipt.next) }
  }
  const issue = classifySolariError(err)
  const reason = bucket(issue)
  const receipt = baseReceipt(reason, true, elapsedMs)
  receipt.next = healthNext(reason, issue.status)
  const solariBlame: SolariBlame | undefined =
    issue.solariBlame ?? (reason === "infra-5xx" ? "infra-5xx" : undefined)
  return {
    ...receipt,
    code: issue.code,
    ...(issue.status !== undefined ? { status: issue.status } : {}),
    retryable: reason === "infra-5xx" ? true : issue.retryable === true,
    ...(solariBlame ? { solariBlame } : {}),
    ...(reason === "concurrency" ? { nextCall: reapNextCall() } : {}),
    error: redactSecrets(issue.message),
  }
}

function errorCodeFromBody(text: string): string | undefined {
  const slice = text.slice(0, 2_000)
  try {
    const parsed = JSON.parse(slice) as { code?: unknown }
    return typeof parsed.code === "string" && parsed.code ? parsed.code : undefined
  } catch {
    return undefined
  }
}

/** Read a profile list. Names, ids, and storage are dropped. */
export async function readSolariHealthList(client: SolariHealthClient): Promise<{ profileCount: number }> {
  const res = await client.request("GET", SOLARI_HEALTH_PROBE_PATH)
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new SolariError(
      `Solari GET /profiles failed: ${res.status}`,
      res.status,
      undefined,
      errorCodeFromBody(text),
    )
  }
  let body: unknown
  try {
    body = await res.json()
  } catch (err) {
    throw new AuspexError("Solari GET /profiles did not return JSON.", {
      issue: { code: "SolariError", retryable: true },
      cause: err,
    })
  }
  if (!Array.isArray(body)) {
    throw new AuspexError("Solari GET /profiles did not return a profile list.", {
      issue: { code: "SolariError", retryable: true },
    })
  }
  return { profileCount: body.length }
}

export async function defaultSolariHealthProbe(): Promise<{ profileCount: number }> {
  const solari = new Solari(healthSolariOptions(requireApiKey()))
  try {
    return await readSolariHealthList(solari)
  } finally {
    await solari.close()
  }
}

export async function solariHealth(
  deps: { probe?: () => Promise<{ profileCount: number }>; now?: () => number } = {},
): Promise<SolariHealthReceipt & { schemaVersion: number }> {
  const now = deps.now ?? Date.now
  const start = now()
  const elapsed = () => Math.max(0, now() - start)
  try {
    const got = await (deps.probe ?? defaultSolariHealthProbe)()
    const count = got.profileCount
    if (!Number.isFinite(count) || count < 0) {
      throw new AuspexError("Solari GET /profiles returned a profile count that was not a number.", {
        issue: { code: "SolariError", retryable: true },
      })
    }
    const receipt = baseReceipt("reachable", true, elapsed())
    return stampSchema({ ...receipt, profileCount: count, ...installInfo() })
  } catch (err) {
    return stampSchema({ ...healthReceiptFromError(err, elapsed()), ...installInfo() })
  }
}
