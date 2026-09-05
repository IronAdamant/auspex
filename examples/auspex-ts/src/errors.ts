import { SolariError } from "@solarisdk/browser"

export const CLOSE_KILL_RECOVERY =
  "Not retryable. Free the slot with solari_browser_close / solari_kill (or let Auspex check/verify/desktop finish teardown), then retry."

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
