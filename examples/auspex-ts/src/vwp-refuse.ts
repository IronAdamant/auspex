/** Hard refuse for --verify-with-profile. Save is not sessionStorage. */

import { idpOnlySaveGuide, isIdpOnlySave, siteHostFromUrl } from "./fold-steer.ts"
import type { NextCall } from "./next-call.ts"
import { emptyProfileGuide, isWeakSeed, weakSeedGuide, type ProfileSeed } from "./profile-persist.ts"

export type VwpRefuseKind = "weakSeed" | "emptySave" | "dead-fold"

export type VwpRefuse = {
  kind: VwpRefuseKind
  next: string
  nextCall?: NextCall
}

/**
 * Refuse a profile-seeded claim session. Unknown sessionStorage (no count, not stale,
 * not an IdP-only jar) is not a refuse — same rule as profile-status.
 */
export function refuseVerifyWithProfile(opts: {
  profile: string
  url?: string
  name?: string
  seed: ProfileSeed
}): VwpRefuse | undefined {
  const profile = opts.profile.trim()
  const siteHost = siteHostFromUrl(opts.url)
  if ((opts.seed.cookies ?? 0) === 0 && (opts.seed.origins ?? 0) === 0) {
    const empty = emptyProfileGuide(profile)
    return {
      kind: "emptySave",
      next: `verify-with-profile refused: ${empty.text} Save is not a logged-in session.`,
      nextCall: empty.nextCall,
    }
  }
  if (
    isIdpOnlySave({
      cookieHosts: opts.seed.cookieHosts,
      siteHost,
      sessionStorage: opts.seed.sessionStorage,
      sessionStorageStale: opts.seed.sessionStorageStale,
      liveHost: opts.seed.liveHost,
      cookies: opts.seed.cookies,
      origins: opts.seed.origins,
      localStorageAuthKeyNames: opts.seed.localStorageAuthKeyNames,
    })
  ) {
    const guide = idpOnlySaveGuide(profile, { liveHost: opts.seed.liveHost, siteHost })
    return {
      kind: "dead-fold",
      next: `verify-with-profile refused: ${guide.text} Save is not sessionStorage.`,
      nextCall: guide.nextCall,
    }
  }
  if (
    isWeakSeed({
      name: opts.name,
      profile,
      url: opts.url,
      siteHost,
      cookies: opts.seed.cookies,
      origins: opts.seed.origins,
      sessionStorage: opts.seed.sessionStorage,
      sessionStorageStale: opts.seed.sessionStorageStale,
      cookieHosts: opts.seed.cookieHosts,
      appOriginCookieCount: opts.seed.appOriginCookieCount,
      localStorageAuthKeyNames: opts.seed.localStorageAuthKeyNames,
    })
  ) {
    const guide = weakSeedGuide(profile, opts.seed)
    return {
      kind: "weakSeed",
      next: `verify-with-profile refused: ${guide.text}`,
      nextCall: guide.nextCall,
    }
  }
  return undefined
}
