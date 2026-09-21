/** Host → safe Solari profile slug. Additive login --url pickup; not a saved-check name. */

export const PROFILE_SLUG_ERROR =
  "could not derive a profile name from url; pass --profile <yours>"

export const LOGIN_PROFILE_OR_URL_ERROR =
  "login requires --profile <name> or --url <https> (url without profile derives a host slug)"

export const PROFILE_SLUG_MAX = 48

/** `app.example.com` → `app-example-com`. Strips `www.`. Not first-label-only (collision-prone). */
export function profileSlugFromHost(host: string): string | undefined {
  let h = host.trim().toLowerCase()
  h = h.replace(/^\[/, "").replace(/\]$/, "")
  h = h.replace(/\.$/, "")
  h = h.replace(/%.*/, "")
  if (h.startsWith("www.")) h = h.slice(4)
  let slug = h.replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "")
  if (!slug) return undefined
  if (slug.length > PROFILE_SLUG_MAX) {
    slug = slug.slice(0, PROFILE_SLUG_MAX).replace(/-+$/g, "")
  }
  if (!slug || !/^[a-z0-9]/.test(slug)) return undefined
  return slug
}

export function profileSlugFromUrl(url: string): string {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error(PROFILE_SLUG_ERROR)
  }
  const slug = profileSlugFromHost(host)
  if (!slug) throw new Error(PROFILE_SLUG_ERROR)
  return slug
}

export type ResolvedLoginProfile = {
  name: string
  derived: boolean
}

/** Explicit `--profile` wins. `--url` without profile derives a host slug. */
export function resolveLoginProfile(opts: { profile?: string; url?: string }): ResolvedLoginProfile {
  const explicit = (opts.profile ?? "").trim()
  if (explicit) return { name: explicit, derived: false }
  const url = (opts.url ?? "").trim()
  if (!url) throw new Error(LOGIN_PROFILE_OR_URL_ERROR)
  return { name: profileSlugFromUrl(url), derived: true }
}

export function derivedProfileNext(name: string): string {
  return (
    `Profile name derived from URL host: ${name}. ` +
    `Use --profile ${name} on await-login, finalize-login, and check. ` +
    `Override with --profile <yours>.`
  )
}
