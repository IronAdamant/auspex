import type { CheckReason } from "./check-reason.ts"

/** Reasons that must not be retried and must not spend a second Solari VM. */
export const NO_RETRY_REASONS = ["loggedOut", "needsHuman"] as const

export type NoRetryReason = (typeof NO_RETRY_REASONS)[number]

export function isNoRetryReason(reason: string | undefined): reason is NoRetryReason {
  return reason === "loggedOut" || reason === "needsHuman"
}

/** Blind retry after these reasons burns minutes and cannot succeed without a human. */
export function mayRetryCheck(reason: CheckReason | string | undefined): boolean {
  return !isNoRetryReason(reason)
}

/** Independent sandbox verify is skipped when the check already failed closed. */
export function shouldVerifyAfterCheck(reason: CheckReason | string | undefined): boolean {
  return mayRetryCheck(reason) && reason !== "recordedLoggedIn"
}
