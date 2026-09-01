import { SolariError } from "@solarisdk/browser"

export function explainSolariError(err: unknown): string {
  if (err instanceof SolariError) {
    if (err.code === "FeatureRequiresPlan" || err.status === 402) {
      return "Solari 402 FeatureRequiresPlan: stealth, proxy, captcha, or desktops need Starter or higher."
    }
    if (err.code === "ConcurrencyLimitExceeded" || err.status === 429) {
      return "Solari 429 ConcurrencyLimitExceeded: kill leftover sessions in the console, then retry."
    }
  }
  return err instanceof Error ? err.message : String(err)
}
