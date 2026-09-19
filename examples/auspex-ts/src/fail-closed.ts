import type { CheckReason } from "./check-reason.ts"

/**
 * Fail-closed retry and verify helpers.
 *
 * This file contains only no-retry / skip-verify logic. The primary fail-closed security gates
 * that refuse unsafe actions before they run are implemented in:
 *
 * - tool-schema.ts — record+profile, fill/click+profile, and profile-attach validation
 * - page-actions.ts — password-fill ban (input[type=password] detection + refusal)
 * - sso.ts — SSO password/OTP wall detection (needsHuman)
 * - launch-options.ts — profile-attach recording gate
 *
 * Grep "fail-closed" or "Fail-closed" across the codebase to find all enforcement points.
 */

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

/**
 * Hosts where anonymous fetch/OCR cannot see logged-in UI.
 * Public marketing (ironadamant.com, checkpointprojects.com) is not in this list.
 */
const AUTH_GATED_ANONYMOUS_VERIFY_HOSTS = ["consistencyhub.io", "onedrive.live.com"] as const

function hostnameOf(url?: string): string | undefined {
  if (!url?.trim()) return undefined
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return undefined
  }
}

function hostIs(hostname: string, domain: string): boolean {
  const h = hostname.toLowerCase()
  const d = domain.toLowerCase()
  return h === d || h.endsWith(`.${d}`)
}

/** True when anonymous sandbox verify would see a login page, not the app. */
export function isAuthGatedAnonymousVerifyHost(url?: string): boolean {
  const host = hostnameOf(url)
  if (!host) return false
  return AUTH_GATED_ANONYMOUS_VERIFY_HOSTS.some((d) => hostIs(host, d))
}

/**
 * CLI and MCP share this policy. Default is verify (anonymous sandbox).
 *
 * Skip anonymous verify unless the caller passed explicit verify=true (`--verify`)
 * or verifyWithProfile, when:
 * - `--name consistencyhub` / `name=consistencyhub`
 * - `--profile consistencyhub` / `profile=consistencyhub` (ad-hoc CH or OneDrive)
 * - a profile is attached and the URL host is auth-gated (consistencyhub.io, onedrive.live.com)
 *
 * Public marketing hosts still verify by default even with a leftover profile.
 * verify=false (`--no-verify`) always skips.
 * verify=true is **anonymous** verify (poisons `ok` on auth-gated pages).
 * verifyWithProfile is the dogfood path (integrity + claimOkProfile). They are not the same.
 */
export function shouldVerifyCheck(opts: {
  name?: string
  profile?: string
  url?: string
  verify?: boolean
  verifyWithProfile?: boolean
}): boolean {
  if (opts.verify === false) return false
  if (opts.verify === true) return true
  if (opts.verifyWithProfile) return true
  const name = opts.name?.trim().toLowerCase()
  const profile = opts.profile?.trim().toLowerCase()
  if (name === "consistencyhub" || profile === "consistencyhub") return false
  if (profile && isAuthGatedAnonymousVerifyHost(opts.url)) return false
  return true
}
