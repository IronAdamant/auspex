/** Soft profile/host advisor. Does not refuse the command. */

import { hostChangeNextCall, type NextCall } from "./next-call.ts"
import { loadEditorSave } from "./profiles.ts"
import { profileSlugFromUrl } from "./profile-slug.ts"
import { savedCheckForProfile } from "./saved-checks.ts"
import { hostIs } from "./sso.ts"

export const PROFILE_HOST_MISMATCH_MARK = "Profile host mismatch:"

export type ProfileHostStamp = {
  profileHostMatch?: boolean
  suggestedProfile?: string
}

export type ProfileHostAdvice = {
  profileHostMatch: boolean
  suggestedProfile?: string
  nextLead: string
  nextCall?: NextCall
}

export function profileHostMismatchLead(profile: string, suggested: string, url: string): string {
  return (
    `${PROFILE_HOST_MISMATCH_MARK} --profile ${profile} is not the host slug for ${url} ` +
    `(suggestedProfile ${suggested}). profileHostMatch is false. ` +
    `Do not reuse this profile for the new host. ` +
    `Remint with npx auspex login --profile ${suggested} --url ${url} ` +
    `(or omit --profile and let the host slug win). ` +
    `This command still ran (soft advise, not a refuse). ` +
    `Do not follow later steps that pass --profile ${profile} for this host.`
  )
}

/** Saved-check profile owns that check's host and its subdomains. Not a foreign host. */
function savedProfileOwnsHost(profile: string, hostname: string): boolean {
  const saved = savedCheckForProfile(profile)
  if (!saved?.url) return false
  try {
    return hostIs(hostname, new URL(saved.url).hostname)
  } catch {
    return false
  }
}

/**
 * Compare an explicit profile to the URL host slug (`profileSlugFromUrl`).
 * Match when the names are equal (case-insensitive) or the profile is the saved-check
 * name for that host (consistencyhub on consistencyhub.io). No URL, or a URL we cannot
 * slug, returns undefined — omission is not a match.
 */
export function adviseProfileHost(opts: { profile?: string; url?: string }): ProfileHostAdvice | undefined {
  const profile = opts.profile?.trim()
  const url = opts.url?.trim()
  if (!profile || !url) return undefined
  let suggested: string
  let hostname: string
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined
    hostname = parsed.hostname
    suggested = profileSlugFromUrl(url)
  } catch {
    return undefined
  }
  if (!suggested) return undefined
  if (profile.toLowerCase() === suggested || savedProfileOwnsHost(profile, hostname)) {
    return { profileHostMatch: true, nextLead: "" }
  }
  return {
    profileHostMatch: false,
    suggestedProfile: suggested,
    nextLead: profileHostMismatchLead(profile, suggested, url),
    nextCall: hostChangeNextCall(suggested, url),
  }
}

export type StampedProfileHost<T> = Omit<T, "next" | "nextCall"> &
  ProfileHostStamp & { next?: string; nextCall?: NextCall }

export function stampProfileHostAdvice<T extends { next?: string; nextCall?: NextCall }>(
  result: T,
  opts: { profile?: string; url?: string },
): StampedProfileHost<T> {
  const advice = adviseProfileHost(opts)
  if (!advice) return result
  if (advice.profileHostMatch) return { ...result, profileHostMatch: true }
  const prior = result.next?.trim() ?? ""
  const next =
    prior.startsWith(PROFILE_HOST_MISMATCH_MARK) ? prior : prior ? `${advice.nextLead} ${prior}` : advice.nextLead
  return {
    ...result,
    profileHostMatch: false,
    suggestedProfile: advice.suggestedProfile,
    next,
    nextCall: advice.nextCall,
  }
}

export function stampLoginHost<T extends { name: string; next?: string; nextCall?: NextCall }>(
  result: T,
  url?: string,
): StampedProfileHost<T> {
  return stampProfileHostAdvice(result, { profile: result.name, url })
}

/** Explicit --url wins. Otherwise the site URL stored on the last login mint for this profile. */
export async function resolveProfileHostUrl(opts: {
  profile: string
  url?: string
  root?: string
}): Promise<string | undefined> {
  const explicit = opts.url?.trim()
  if (explicit) return explicit
  const handle = await loadEditorSave(opts.profile, opts.root)
  const stored = handle?.siteUrl?.trim()
  return stored || undefined
}

export async function stampAwaitLoginHost<T extends { next?: string; nextCall?: NextCall }>(
  result: T,
  opts: { profile: string; url?: string; root?: string },
): Promise<StampedProfileHost<T>> {
  const url = await resolveProfileHostUrl(opts)
  return stampProfileHostAdvice(result, { profile: opts.profile, url })
}
