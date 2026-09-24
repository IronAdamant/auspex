import type { CreateSessionOptions } from "@solarisdk/browser"
import { isPublicMarketingUrl } from "./saved-checks.ts"

export const PROXY_FLAG_ERROR = "--proxy must be a 2-letter country code, smart, or off"

export type ProxySticky = { country: string; session: string }

export function parseProxyFlag(raw: string | undefined, sticky?: string): CreateSessionOptions["proxy"] {
  const pin = sticky?.trim()
  if (!raw) {
    if (!pin) return undefined
    return { country: "us", session: pin }
  }
  const v = raw.trim().toLowerCase()
  if (v === "off") return "off"
  if (v === "smart") {
    if (pin) throw new Error("--proxy-sticky cannot be used with --proxy smart")
    return "smart"
  }
  if (!/^[a-z]{2}$/.test(v)) throw new Error(PROXY_FLAG_ERROR)
  return pin ? { country: v, session: pin } : v
}

/**
 * Fresh session for claimOkProfile. Saved profile id only.
 * No editor JWT, no fold CDP, no handoff token, no stealth flag.
 */
export function profileClaimSessionCreate(profileId: string): CreateSessionOptions {
  return { profileId }
}

export function sessionCreateFromCheck(opts: {
  stealth?: boolean
  record?: boolean
  captcha?: boolean
  proxy?: string
  proxySticky?: string
  profileId?: string
  url?: string
}): CreateSessionOptions {
  const proxy = parseProxyFlag(opts.proxy, opts.proxySticky)
  const captcha = opts.captcha === true
  const proxyOn = proxy !== undefined && proxy !== "off"
  const recordAtCreate =
    opts.record === true && (!opts.profileId || Boolean(opts.url && isPublicMarketingUrl(opts.url)))
  return {
    stealth: opts.stealth === true || proxyOn || captcha,
    recording: recordAtCreate,
    profileId: opts.profileId,
    captcha: captcha || undefined,
    proxy: proxyOn ? proxy : undefined,
  }
}
