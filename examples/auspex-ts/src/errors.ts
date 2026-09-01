import { SolariError } from "@solarisdk/browser"

export function redactSecrets(text: string): string {
  return text
    .replace(/slr_[a-z]+_[A-Za-z0-9_\-]+/gi, "slr_…")
    .replace(/\bsk-[A-Za-z0-9]{10,}\b/g, "sk-…")
    .replace(/\bAKIA[A-Z0-9]{16}\b/g, "AKIA…")
    .replace(/Bearer\s+\S+/gi, "Bearer …")
}

export function explainSolariError(err: unknown): string {
  let msg: string
  if (err instanceof SolariError) {
    if (err.code === "FeatureRequiresPlan" || err.status === 402) {
      msg =
        "Solari 402 FeatureRequiresPlan: stealth, proxy, captcha, or desktops need Starter or higher."
    } else if (err.code === "ConcurrencyLimitExceeded" || err.status === 429) {
      msg = "Solari 429 ConcurrencyLimitExceeded: kill leftover sessions in the console, then retry."
    } else if (err.code === "PlanLimitExceeded" || err.status === 403) {
      msg =
        "Solari 403 PlanLimitExceeded: this account is at a plan limit (profiles, minutes, or storage)."
    } else if (err.code === "BrowserUnhealthy") {
      msg = "Solari BrowserUnhealthy: the cloud Chrome failed its health probe; retry the check."
    } else if (err.code === "InvalidSessionId") {
      msg =
        "Solari InvalidSessionId: that session id is unknown or not this account's; it was not released."
    } else {
      msg = err.message
    }
  } else {
    msg = err instanceof Error ? err.message : String(err)
  }
  return redactSecrets(msg)
}
