/** Live remote host vs the minted door URL. Fail closed. Does not rename jars. */

import type { NextCall } from "./next-call.ts"
import { profileSlugFromHost } from "./profile-slug.ts"
import { savedCheckForProfile } from "./saved-checks.ts"
import { hostIs, idpAuthHost } from "./sso.ts"

export const LIVE_HOST_CHANGED_MARK = "Live host changed:"

export const LIVE_HOST_CHANGED_SAVE_ERROR =
  "refusing to save: live browser host is not the minted profile host"

/** Trackers, doors, and Solari. Not the operator's app. IdP hosts are separate. */
const NOT_APP_HOST_SUFFIXES = [
  "ironadamant.com",
  "getsolari.com",
  "intercom.io",
  "intercomcdn.com",
  "segment.io",
  "segment.com",
  "sentry.io",
  "stripe.com",
  "googletagmanager.com",
  "google-analytics.com",
  "doubleclick.net",
  "gstatic.com",
  "googleapis.com",
  "facebook.com",
  "facebook.net",
  "cloudflare.com",
  "cloudfront.net",
  "amazonaws.com",
] as const

const MULTI_LABEL_SUFFIXES = new Set(["co.uk", "com.au", "co.jp", "com.br", "co.nz", "co.za", "com.mx"])

const EDITOR_PAGE_URL_KEYS = ["pageUrl", "href", "finalUrl", "location"] as const

export type LiveHostChange = {
  hostChanged: true
  profileHostMatch: false
  suggestedProfile: string
  suggestedUrl: string
  nextLead: string
  nextCall: NextCall
}

export type StorageLike = {
  cookies?: Array<{ domain?: string; name?: string }>
  origins?: Array<{ origin?: string; localStorage?: Array<{ name?: string }> }>
}

type HostCount = { host: string; count: number }

export function ignoredLiveHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase()
  if (!host) return true
  if (idpAuthHost(host)) return true
  return NOT_APP_HOST_SUFFIXES.some((suffix) => hostIs(host, suffix))
}

/** Registrable-ish family so www/cdn/auth siblings are one site. A different site is a different family. */
export function siteFamily(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean)
  if (labels.length <= 2) return labels.join(".")
  const last2 = labels.slice(-2).join(".")
  if (MULTI_LABEL_SUFFIXES.has(last2) && labels.length >= 3) return labels.slice(-3).join(".")
  return last2
}

export function hostsAlign(a: string, b: string): boolean {
  const left = a.trim().toLowerCase()
  const right = b.trim().toLowerCase()
  if (!left || !right) return false
  if (left === right || hostIs(left, right) || hostIs(right, left)) return true
  const slugA = profileSlugFromHost(left)
  const slugB = profileSlugFromHost(right)
  if (slugA && slugA === slugB) return true
  return siteFamily(left) === siteFamily(right)
}

export function profileOwnsHost(profile: string, hostname: string): boolean {
  const slug = profileSlugFromHost(hostname)
  if (slug && profile.trim().toLowerCase() === slug) return true
  const saved = savedCheckForProfile(profile)
  if (!saved?.url) return false
  try {
    return hostIs(hostname, new URL(saved.url).hostname)
  } catch {
    return false
  }
}

/** https origin, no userinfo. Empty when the value is not https. */
export function httpsOriginOnly(value?: string): string {
  const text = (value ?? "").trim()
  if (!/^https:\/\//i.test(text)) return ""
  try {
    const url = new URL(text)
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname) return ""
    return url.origin
  } catch {
    return ""
  }
}

/**
 * Save-line site URL. A live https URL wins over the minted hash.
 * `typed` is the password IME and is never a site picker.
 */
export function doorSaveSiteUrl(live?: string, minted?: string, typed?: string): string {
  void typed
  return httpsOriginOnly(live) || httpsOriginOnly(minted)
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ""
  }
}

function bestHost(rows: HostCount[], mintHost?: string): HostCount | undefined {
  const usable = rows.filter((row) => row.count > 0 && row.host && !ignoredLiveHost(row.host))
  if (!usable.length) return undefined
  usable.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    if (mintHost) {
      const foreignA = hostsAlign(a.host, mintHost) ? 0 : 1
      const foreignB = hostsAlign(b.host, mintHost) ? 0 : 1
      if (foreignA !== foreignB) return foreignB - foreignA
    }
    return a.host.localeCompare(b.host)
  })
  return usable[0]
}

function originCounts(state?: StorageLike): HostCount[] {
  const counts = new Map<string, number>()
  for (const origin of state?.origins ?? []) {
    const raw = (origin?.origin ?? "").trim()
    if (!raw) continue
    const originUrl = httpsOriginOnly(raw)
    const host = originUrl ? hostnameOf(originUrl) : ""
    if (!host || ignoredLiveHost(host)) continue
    const entries = (origin.localStorage ?? []).filter((row) => row?.name).length
    counts.set(host, (counts.get(host) ?? 0) + Math.max(entries, 1))
  }
  return [...counts.entries()].map(([host, count]) => ({ host, count }))
}

function cookieCounts(state?: StorageLike): HostCount[] {
  const counts = new Map<string, number>()
  for (const cookie of state?.cookies ?? []) {
    if (!cookie?.name) continue
    const host = (cookie.domain ?? "").trim().toLowerCase().replace(/^\./, "")
    if (!host || host.includes("/") || ignoredLiveHost(host)) continue
    counts.set(host, (counts.get(host) ?? 0) + 1)
  }
  return [...counts.entries()].map(([host, count]) => ({ host, count }))
}

export function selectLiveHost(opts: {
  pageUrl?: string
  state?: StorageLike
  fallbackHost?: string
  mintUrl?: string
}): { host: string; suggestedUrl: string } | undefined {
  const mintHost = opts.mintUrl ? hostnameOf(httpsOriginOnly(opts.mintUrl) || "") : ""
  const pageOrigin = httpsOriginOnly(opts.pageUrl)
  const pageHost = pageOrigin ? hostnameOf(pageOrigin) : ""
  const pageOk = Boolean(pageHost && !ignoredLiveHost(pageHost))
  const bestOrigin = bestHost(originCounts(opts.state), mintHost || undefined)
  const fallback = (opts.fallbackHost ?? "").trim().toLowerCase().replace(/^\./, "")
  const fallbackOk = Boolean(fallback && !ignoredLiveHost(fallback))

  if (pageOk && bestOrigin && !hostsAlign(pageHost, bestOrigin.host)) {
    const suggestedUrl = httpsOriginOnly(`https://${bestOrigin.host}`)
    return suggestedUrl ? { host: bestOrigin.host, suggestedUrl } : undefined
  }
  if (pageOk && fallbackOk && !hostsAlign(pageHost, fallback)) {
    const suggestedUrl = httpsOriginOnly(`https://${fallback}`)
    return suggestedUrl ? { host: fallback, suggestedUrl } : undefined
  }
  if (pageOk) return { host: pageHost, suggestedUrl: pageOrigin }
  if (bestOrigin) {
    const suggestedUrl = httpsOriginOnly(`https://${bestOrigin.host}`)
    return suggestedUrl ? { host: bestOrigin.host, suggestedUrl } : undefined
  }
  const bestCookie = bestHost(cookieCounts(opts.state), mintHost || undefined)
  if (bestCookie) {
    const suggestedUrl = httpsOriginOnly(`https://${bestCookie.host}`)
    return suggestedUrl ? { host: bestCookie.host, suggestedUrl } : undefined
  }
  if (fallbackOk) {
    const suggestedUrl = httpsOriginOnly(`https://${fallback}`)
    return suggestedUrl ? { host: fallback, suggestedUrl } : undefined
  }
  return undefined
}

export function liveHostChangedLead(profile: string, suggested: string, suggestedUrl: string): string {
  return (
    `${LIVE_HOST_CHANGED_MARK} the remote browser is on ${suggestedUrl}, not the host minted for --profile ${profile}. ` +
    `hostChanged is true. profileHostMatch is false. suggestedProfile ${suggested}. suggestedUrl ${suggestedUrl}. ` +
    `Do not finalize-login, do not save this browser into --profile ${profile}, and do not treat claimOkProfile as true. ` +
    `Remint with npx auspex login --profile ${suggested} --url ${suggestedUrl} (auspex_login). ` +
    `That creates the profile if it does not exist. Do not rename or migrate the old jar.`
  )
}

function changeFor(profile: string, host: string, suggestedUrl: string): LiveHostChange | undefined {
  const suggested = profileSlugFromHost(host)
  if (!suggested || !suggestedUrl.startsWith("https://")) return undefined
  return {
    hostChanged: true,
    profileHostMatch: false,
    suggestedProfile: suggested,
    suggestedUrl,
    nextLead: liveHostChangedLead(profile, suggested, suggestedUrl),
    nextCall: { tool: "auspex_login", profile: suggested, url: suggestedUrl },
  }
}

/**
 * Divergence when the live app host matches neither the minted URL nor the profile.
 * No live app host is not a change. Same site (www, sibling subdomain, saved-check host) is not a change.
 */
export function adviseLiveHostChange(opts: {
  profile?: string
  mintUrl?: string
  pageUrl?: string
  state?: StorageLike
  liveHost?: string
}): LiveHostChange | undefined {
  const profile = opts.profile?.trim()
  if (!profile) return undefined
  const selected = selectLiveHost({
    pageUrl: opts.pageUrl,
    state: opts.state,
    fallbackHost: opts.liveHost,
    mintUrl: opts.mintUrl,
  })
  if (!selected) return undefined
  const mintOrigin = httpsOriginOnly(opts.mintUrl)
  const mintHost = mintOrigin ? hostnameOf(mintOrigin) : ""
  if (mintHost && hostsAlign(selected.host, mintHost)) return undefined
  if (profileOwnsHost(profile, selected.host)) return undefined
  if (!mintHost && !savedCheckForProfile(profile)) return undefined
  return changeFor(profile, selected.host, selected.suggestedUrl)
}

export function markerLiveHostChange(
  profile: string | undefined,
  marker?: { suggestedProfile?: string; suggestedUrl?: string },
): LiveHostChange | undefined {
  const name = profile?.trim()
  const suggested = marker?.suggestedProfile?.trim()
  const suggestedUrl = httpsOriginOnly(marker?.suggestedUrl)
  if (!name || !suggested || !suggestedUrl) return undefined
  return {
    hostChanged: true,
    profileHostMatch: false,
    suggestedProfile: suggested,
    suggestedUrl,
    nextLead: liveHostChangedLead(name, suggested, suggestedUrl),
    nextCall: { tool: "auspex_login", profile: suggested, url: suggestedUrl },
  }
}

/**
 * Save and finalize detect a live host change. A stored marker refuses later reuse.
 * Ordinary checks (no save, no marker) are left alone so a shared Microsoft profile can still open another host.
 */
export function decideLiveHostPersist(opts: {
  profile?: string
  mintUrl?: string
  pageUrl?: string
  state?: StorageLike
  liveHost?: string
  marker?: { suggestedProfile?: string; suggestedUrl?: string }
  enforceDetect: boolean
}): LiveHostChange | undefined {
  if (opts.enforceDetect) {
    const detected = adviseLiveHostChange(opts)
    if (detected) return detected
  }
  return markerLiveHostChange(opts.profile, opts.marker)
}

/** Editor JSON page URL when Solari sends one. Generic `url` is ignored (handoff, not the page). */
export function httpsPageUrlFromRecord(json: unknown): string | undefined {
  const found = pageUrlFromUnknown(json, 0)
  if (!found) return undefined
  const host = hostnameOf(found)
  if (!host || ignoredLiveHost(host)) return undefined
  return found
}

function pageUrlFromUnknown(json: unknown, depth: number): string | undefined {
  if (!json || typeof json !== "object" || Array.isArray(json) || depth > 2) return undefined
  const record = json as Record<string, unknown>
  for (const key of EDITOR_PAGE_URL_KEYS) {
    const origin = httpsOriginOnly(typeof record[key] === "string" ? record[key] : "")
    if (origin) return origin
  }
  if (depth === 2) return undefined
  for (const value of Object.values(record)) {
    const nested = pageUrlFromUnknown(value, depth + 1)
    if (nested) return nested
  }
  return undefined
}

export async function noteProfileHostChanged(
  profile: string,
  change: LiveHostChange,
  root?: string,
): Promise<void> {
  const { loadEditorSave, persistEditorSave } = await import("./profiles.ts")
  const handle = await loadEditorSave(profile, root)
  if (!handle) return
  await persistEditorSave(
    {
      ...handle,
      hostChanged: true,
      suggestedUrl: change.suggestedUrl,
      suggestedProfile: change.suggestedProfile,
    },
    root,
  )
}

export function preserveAwaitLiveHost<T extends {
  hostChanged?: boolean
  status?: string
  next?: string
  nextCall?: NextCall
  profileHostMatch?: boolean
  suggestedProfile?: string
  suggestedUrl?: string
}>(stamped: T, raw: T): T {
  if (!raw.hostChanged) return stamped
  return {
    ...stamped,
    status: raw.status ?? "host-changed",
    hostChanged: true,
    profileHostMatch: false,
    suggestedProfile: raw.suggestedProfile,
    suggestedUrl: raw.suggestedUrl,
    next: raw.next,
    nextCall: raw.nextCall,
  }
}

export function awaitLoginHostChangedPatch(change: LiveHostChange): {
  status: "host-changed"
  hostChanged: true
  profileHostMatch: false
  suggestedProfile: string
  suggestedUrl: string
  next: string
  nextCall: NextCall
} {
  return {
    status: "host-changed",
    hostChanged: true,
    profileHostMatch: false,
    suggestedProfile: change.suggestedProfile,
    suggestedUrl: change.suggestedUrl,
    next: change.nextLead,
    nextCall: change.nextCall,
  }
}

export async function completedAwaitHostPatch(opts: {
  status: string
  profile: string
  mintUrl?: string
  pageUrl?: string
  liveHost?: string
}): Promise<ReturnType<typeof awaitLoginHostChangedPatch> | undefined> {
  if (opts.status !== "completed") return undefined
  const change = adviseLiveHostChange(opts)
  return change ? awaitLoginHostChangedPatch(change) : undefined
}

export async function rememberAwaitHostChange(
  name: string,
  waited: {
    status: string
    hostChanged?: boolean
    suggestedProfile?: string
    suggestedUrl?: string
    next: string
    nextCall?: NextCall
  },
  foldChange?: LiveHostChange,
): Promise<ReturnType<typeof awaitLoginHostChangedPatch> | undefined> {
  const patch =
    waited.hostChanged && waited.suggestedProfile && waited.suggestedUrl
      ? {
          status: "host-changed" as const,
          hostChanged: true as const,
          profileHostMatch: false as const,
          suggestedProfile: waited.suggestedProfile,
          suggestedUrl: waited.suggestedUrl,
          next: waited.next,
          nextCall: waited.nextCall ?? {
            tool: "auspex_login",
            profile: waited.suggestedProfile,
            url: waited.suggestedUrl,
          },
        }
      : foldChange && waited.status === "completed"
        ? awaitLoginHostChangedPatch(foldChange)
        : undefined
  if (!patch?.suggestedProfile || !patch.suggestedUrl) return undefined
  await noteProfileHostChanged(name, {
    hostChanged: true,
    profileHostMatch: false,
    suggestedProfile: patch.suggestedProfile,
    suggestedUrl: patch.suggestedUrl,
    nextLead: patch.next,
    nextCall: patch.nextCall ?? { tool: "auspex_login", profile: patch.suggestedProfile, url: patch.suggestedUrl },
  }).catch(() => undefined)
  return patch
}

export function loginWaitPublicFields(waited: {
  status: string
  hostChanged?: boolean
  suggestedProfile?: string
  suggestedUrl?: string
  next?: string
  nextCall?: NextCall
}): {
  ok: boolean
  hostChanged?: true
  profileHostMatch?: false
  suggestedProfile?: string
  suggestedUrl?: string
  next?: string
  nextCall?: NextCall
} {
  if (!waited.hostChanged) return { ok: waited.status === "completed" }
  return {
    ok: false,
    hostChanged: true,
    profileHostMatch: false,
    suggestedProfile: waited.suggestedProfile,
    suggestedUrl: waited.suggestedUrl,
    next: waited.next,
    nextCall: waited.nextCall,
  }
}
