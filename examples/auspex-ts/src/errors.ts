import { SolariError } from "@solarisdk/browser"
import type { NextCall } from "./next-call.ts"
import { ProfileBusyError } from "./profile-lock.ts"

export const CLOSE_KILL_RECOVERY =
  "Not retryable. Free the slot with auspex_reap (or solari_browser_close / solari_kill if that MCP is loaded), then retry."

export type SolariIssue = {
  message: string
  code: string
  retryable: boolean
  recovery?: string
  status?: number
}

export class AuspexError extends Error {
  readonly issue: SolariIssue
  readonly sessionId?: string
  readonly screenshotPath?: string
  readonly log?: string
  readonly receipt?: object

  constructor(
    message: string,
    extra: {
      issue?: Partial<SolariIssue>
      sessionId?: string
      screenshotPath?: string
      log?: string
      receipt?: object
      cause?: unknown
    } = {},
  ) {
    super(redactSecrets(message))
    this.name = "AuspexError"
    this.issue = {
      message: this.message,
      code: extra.issue?.code ?? "AuspexError",
      retryable: extra.issue?.retryable === true,
      recovery: extra.issue?.recovery,
      status: extra.issue?.status,
    }
    this.sessionId = extra.sessionId
    this.screenshotPath = extra.screenshotPath
    this.log = extra.log
    this.receipt = extra.receipt
    if (extra.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = extra.cause
    }
  }
}

export function redactSecrets(text: string): string {
  return text
    .replace(/slr_[a-z]+_[A-Za-z0-9_\-]+/gi, "slr_…")
    .replace(/\bsk-[A-Za-z0-9]{10,}\b/g, "sk-…")
    .replace(/\bAKIA[A-Z0-9]{16}\b/g, "AKIA…")
    .replace(/Bearer\s+\S+/gi, "Bearer …")
}

function codeOf(err: SolariError): string | undefined {
  return typeof err.code === "string" && err.code ? err.code : undefined
}

export function classifySolariError(err: unknown): SolariIssue {
  if (err instanceof AuspexError) return err.issue
  if (err instanceof ProfileBusyError) {
    return {
      message: redactSecrets(err.message),
      code: err.code,
      retryable: false,
      recovery: "Wait for the other agent to finish. Do not retry in a loop.",
    }
  }
  if (err instanceof SolariError) {
    const code = codeOf(err)
    if (code === "FeatureRequiresPlan" || err.status === 402) {
      return {
        message: redactSecrets(
          "Solari 402 FeatureRequiresPlan: stealth, proxy, captcha, or desktops need Starter or higher.",
        ),
        code: "FeatureRequiresPlan",
        retryable: false,
        recovery: "Drop stealth/proxy/captcha/desktop or upgrade the plan. Do not retry the same call.",
        status: 402,
      }
    }
    if (code === "ConcurrencyLimitExceeded" || err.status === 429) {
      return {
        message: redactSecrets(
          "Solari 429 ConcurrencyLimitExceeded: leftover sessions still hold a slot.",
        ),
        code: "ConcurrencyLimitExceeded",
        retryable: false,
        recovery: CLOSE_KILL_RECOVERY,
        status: 429,
      }
    }
    if (code === "PlanLimitExceeded" || err.status === 403) {
      return {
        message: redactSecrets(
          "Solari 403 PlanLimitExceeded: this account is at a plan limit (profiles, minutes, or storage).",
        ),
        code: "PlanLimitExceeded",
        retryable: false,
        status: err.status,
      }
    }
    if (err.status === 413) {
      return {
        message: redactSecrets(
          "Solari 413 Payload Too Large: profile JSON exceeds the 1 MiB limit.",
        ),
        code: "PayloadTooLarge",
        retryable: false,
        recovery:
          "Profile save payload exceeded Solari 1 MiB limit. By default, Auspex now omits indexedDB to keep saves lean (sessionStorage is still captured for apps like ConsistencyHub). If this still fails, remint auspex_login and use console Save for a leaner seed. Do not retry identical save.",
        status: 413,
      }
    }
    if (err.status === 502 || err.status === 503 || err.status === 504) {
      const statusText = err.status === 502 ? "502 Bad Gateway" : err.status === 503 ? "503 Service Unavailable" : "504 Gateway Timeout"
      return {
        message: redactSecrets(
          `Solari ${statusText}: transient infrastructure issue (proxy, capacity, or upstream).`,
        ),
        code: "SolariInfraTransient",
        retryable: true,
        recovery:
          "Solari transient infrastructure issue (not app login failure). Wait 5-10 seconds, call auspex_reap if concurrency is suspect, then retry the same operation once. If the error was during login handoff (single-use URL), remint with auspex_login. Do not conflate with loggedOut or needsHuman.",
        status: err.status,
      }
    }
    if (code === "BrowserUnhealthy") {
      return {
        message: redactSecrets(
          "Solari BrowserUnhealthy: the cloud Chrome failed its health probe; retry the check.",
        ),
        code: "BrowserUnhealthy",
        retryable: true,
      }
    }
    if (code === "InvalidSessionId") {
      return {
        message: redactSecrets(
          "Solari InvalidSessionId: that session id is unknown or not this account's; it was not released.",
        ),
        code: "InvalidSessionId",
        retryable: false,
        status: err.status,
      }
    }
    return {
      message: redactSecrets(err.message),
      code: code ?? "SolariError",
      retryable: false,
      status: err.status,
    }
  }
  const message = redactSecrets(err instanceof Error ? err.message : String(err))
  return { message, code: "AuspexError", retryable: false }
}

/** Shared CLI stdout and MCP failure body. nextCall is reap only for a concurrency 429. */
export function solariFailurePayload(err: unknown): {
  ok: false
  error: string
  code: string
  retryable: boolean
  recovery?: string
  status?: number
  nextCall?: NextCall
} {
  const issue = classifySolariError(err)
  const reap = issue.code === "ConcurrencyLimitExceeded" || issue.status === 429
  return {
    ok: false,
    error: issue.message,
    code: issue.code,
    retryable: issue.retryable,
    ...(issue.recovery ? { recovery: issue.recovery } : {}),
    ...(issue.status !== undefined ? { status: issue.status } : {}),
    ...(reap ? { nextCall: { tool: "auspex_reap" } satisfies NextCall } : {}),
  }
}

export function explainSolariError(err: unknown): string {
  const issue = classifySolariError(err)
  return issue.recovery ? `${issue.message} ${issue.recovery}` : issue.message
}

export function formatSolariIssue(issue: SolariIssue): string {
  return JSON.stringify({
    code: issue.code,
    retryable: issue.retryable,
    message: issue.message,
    ...(issue.recovery ? { recovery: issue.recovery } : {}),
    ...(issue.status !== undefined ? { status: issue.status } : {}),
  })
}
