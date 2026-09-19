/** Parseable check `reason` codes. Keep this list stable for agents. */
export const CHECK_REASONS = [
  "matched",
  "loggedOut",
  "needsHuman",
  "mismatch",
  "network",
  "recordedLoggedIn",
] as const

export type CheckReason = (typeof CHECK_REASONS)[number]

export type SpecialCheckReason = "loggedOut" | "needsHuman" | "recordedLoggedIn"

export function deriveCheckReason(input: {
  special?: SpecialCheckReason
  needsHuman?: boolean
  matched: boolean
  networkIdle: boolean
  finalUrl: string
  excerpt: string
  screenshotOk: boolean
}): CheckReason {
  if (input.needsHuman || input.special === "needsHuman") return "needsHuman"
  if (input.special === "loggedOut") return "loggedOut"
  if (input.special === "recordedLoggedIn") return "recordedLoggedIn"
  if (!input.finalUrl || !input.screenshotOk) return "network"
  if (!input.matched) {
    if (!input.networkIdle && !input.excerpt.trim()) return "network"
    return "mismatch"
  }
  return "matched"
}

export function overlayVerifyReason(
  reason: CheckReason,
  verify: { ok: boolean; claimOk: boolean; anonymousClaimSkipped?: boolean; errors?: string[]; claimErrors?: string[] },
): CheckReason {
  if (reason !== "matched") return reason
  if (verify.anonymousClaimSkipped) return verify.ok ? "matched" : "network"
  if (verify.ok && verify.claimOk) return "matched"
  const blob = [...(verify.errors ?? []), ...(verify.claimErrors ?? [])].join(" ").toLowerCase()
  if (!verify.claimOk && /expect|mismatch|not found|missing/i.test(blob)) return "mismatch"
  if (/fetch|network|timeout|econn|http|dns/i.test(blob)) return "network"
  if (!verify.claimOk) return "mismatch"
  return "network"
}

export function agentReceiptOk(opts: {
  protocolOk: boolean
  reason: CheckReason
  verify?: { ok: boolean; claimOk: boolean; anonymousClaimSkipped?: boolean; skipped?: boolean }
}): boolean {
  if (!opts.protocolOk) return false
  if (opts.reason !== "matched") return false
  if (opts.verify && !opts.verify.skipped) {
    if (opts.verify.anonymousClaimSkipped) return opts.verify.ok
    return opts.verify.ok && opts.verify.claimOk
  }
  return true
}
