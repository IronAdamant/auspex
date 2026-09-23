import { resolvePhoneExpirySeconds } from "./phone-expiry.ts"

/** Pages viewer with a real text field so the phone software keyboard can open. */
export const PHONE_HANDOFF_PAGE = "https://ironadamant.com/auspex/phone.html"
/** Same remote Chrome as the phone page, for a hardware keyboard. */
export const DESKTOP_HANDOFF_PAGE = "https://ironadamant.com/auspex/desktop.html"
/** One mint, one link: human picks Phone or Desktop. Same hash as both doors. */
export const DOOR_HANDOFF_PAGE = "https://ironadamant.com/auspex/door.html"

/** Hash keys door JS reads. Unused Solari tokens stay off agent JSON / QR / SMS. */
export const HANDOFF_HASH_KEYS = ["v", "n", "exp", "u"] as const

export type HandoffHashExtra = {
  profileId?: string
  profileName?: string
  handoffToken?: string
  expiresAt?: string
  saved?: string
  plist?: string
  /** https site to open. Username and password are never accepted here. */
  siteUrl?: string
}

export function isPhoneImeUrl(url: string | undefined): boolean {
  return Boolean(url?.startsWith(PHONE_HANDOFF_PAGE))
}

export function isDoorUrl(url: string | undefined): boolean {
  return Boolean(url?.startsWith(DOOR_HANDOFF_PAGE))
}

export function isDesktopDoorUrl(url: string | undefined): boolean {
  return Boolean(url?.startsWith(DESKTOP_HANDOFF_PAGE))
}

/** Shared hash: only door-JS keys (v, n, exp, u). Drop t/h/p/saved/plist/k/pair. */
export function handoffHash(
  vncToken: string,
  _handoffUrl: string,
  extra?: HandoffHashExtra,
): string {
  const token = vncToken.trim()
  if (!token) return ""
  const hash = new URLSearchParams({ v: token })
  if (extra?.profileName?.trim()) hash.set("n", extra.profileName.trim())
  const siteUrl = extra?.siteUrl?.trim() ?? ""
  if (/^https:\/\//i.test(siteUrl)) hash.set("u", siteUrl)
  const expiry = resolvePhoneExpirySeconds({ expiresAt: extra?.expiresAt, jwt: token })
  if (expiry.exp !== undefined) hash.set("exp", String(expiry.exp))
  return hash.toString()
}

function pageWithHash(page: string, hash: string): string {
  return hash ? `${page}#${hash}` : ""
}

export function phoneHandoffUrl(
  vncToken: string,
  handoffUrl: string,
  extra?: HandoffHashExtra,
): string {
  return pageWithHash(PHONE_HANDOFF_PAGE, handoffHash(vncToken, handoffUrl, extra))
}

export function desktopHandoffUrl(
  vncToken: string,
  handoffUrl: string,
  extra?: HandoffHashExtra,
): string {
  return pageWithHash(DESKTOP_HANDOFF_PAGE, handoffHash(vncToken, handoffUrl, extra))
}

export function doorHandoffUrl(
  vncToken: string,
  handoffUrl: string,
  extra?: HandoffHashExtra,
): string {
  return pageWithHash(DOOR_HANDOFF_PAGE, handoffHash(vncToken, handoffUrl, extra))
}

function swapHandoffPage(url: string | undefined, from: string, to: string): string | undefined {
  if (!url?.startsWith(from)) return undefined
  return to + url.slice(from.length)
}

/** Same hash as the phone door on the desktop thin client. */
export function desktopHandoffUrlFromPhone(mobileUrl: string | undefined): string | undefined {
  return swapHandoffPage(mobileUrl, PHONE_HANDOFF_PAGE, DESKTOP_HANDOFF_PAGE)
}

/** Same hash as the phone door on the chooser. */
export function doorHandoffUrlFromPhone(mobileUrl: string | undefined): string | undefined {
  return swapHandoffPage(mobileUrl, PHONE_HANDOFF_PAGE, DOOR_HANDOFF_PAGE)
}
