import { classifySeedReadiness, type SeedReadiness } from "./cookie-save.ts"
import { LOGGED_IN_SEED_HEALTH, RE_GATE_STOP } from "./door-await-contract.ts"
import { isLoggedOutLanding } from "./profile-storage.ts"
import { HANDOFF_PHONE_DOOR_BAN, listProfiles, requireProfileName, type ProfileInfo } from "./profiles.ts"
import { remintLoginNextCall, type NextCall } from "./next-call.ts"
import {
  emptyProfileGuide,
  finalizeLoginGuide,
  inspectProfileSeed,
  isWeakSeed,
  weakSeedGuide,
  type ProfileSeed,
} from "./profile-persist.ts"
import { createClient } from "./solari.ts"
import { stillOnAuth } from "./sso.ts"
import { runCheck, type CheckOptions, type CheckResult } from "./check.ts"
import { isPublicMarketingUrl, resolveSavedCheck, savedCheckForProfile, type SavedCheck } from "./saved-checks.ts"

export type ProfileStatusReason = "loggedIn" | "loggedOut" | "needsHuman" | "weakSeed" | "emptySave" | "botWall"

export type ProfileStatusResult = {
  ok: boolean
  reason: ProfileStatusReason
  profile: string
  url?: string
  populated?: boolean
  live: boolean
  skippedLive?: boolean
  /** The site showed the probe a bot check. Says nothing about the login; no nextCall. */
  botWall?: boolean
  skipReason?: string
  /** Set on loggedIn. Live probe hint. Not a nextCall and not a lease. */
  next?: string
  nextCall?: NextCall
  finalUrl?: string
  excerpt?: string
  screenshotPath?: string
  cookies?: number
  origins?: number
  sessionStorage?: number
  sessionStorageStale?: boolean
  seedReadiness?: SeedReadiness
}

export type ProfileStatusOpts = {
  profile?: string
  name?: string
  url?: string
  /** Live-probe claim. loggedIn means this text was on the page. Saved checks fill it when omitted. */
  expect?: string
  authKeyNames?: string[]
}

export type ProfileStatusDeps = {
  listProfiles?: () => Promise<ProfileInfo[]>
  runCheck?: (opts: CheckOptions) => Promise<CheckResult>
  savedForName?: (name: string) => SavedCheck
  savedForProfile?: (profile: string) => SavedCheck | undefined
  inspectSeed?: (profileId: string, origin?: string) => Promise<ProfileSeed>
}

function seedCounts(seed?: ProfileSeed, url?: string, profile?: string, name?: string): {
  cookies?: number
  origins?: number
  sessionStorage?: number
  sessionStorageStale?: boolean
  seedReadiness?: SeedReadiness
} {
  const seedReadiness = seed
    ? classifySeedReadiness({
        name,
        profile,
        url,
        cookies: seed.cookies,
        origins: seed.origins,
        sessionStorage: seed.sessionStorage,
        sessionStorageStale: seed.sessionStorageStale,
        cookieHosts: seed.cookieHosts,
        liveHost: seed.liveHost,
        appOriginCookieCount: seed.appOriginCookieCount,
        localStorageCount: seed.localStorageCount,
        localStorageAuthKeyNames: seed.localStorageAuthKeyNames,
      })
    : undefined
  return {
    cookies: seed?.cookies,
    origins: seed?.origins,
    sessionStorage: seed?.sessionStorage,
    ...(seed?.sessionStorageStale ? { sessionStorageStale: true } : {}),
    ...(seedReadiness ? { seedReadiness } : {}),
  }
}

function resolveStatusTarget(opts: ProfileStatusOpts, deps?: ProfileStatusDeps): {
  profile: string
  url?: string
  expect?: string
} {
  let profile = opts.profile?.trim()
  let url = opts.url?.trim()
  let expect = opts.expect?.trim() || undefined
  if (opts.name?.trim()) {
    const saved = deps?.savedForName
      ? deps.savedForName(opts.name)
      : resolveSavedCheck(opts.name)
    profile = profile || saved.profile
    url = url || saved.url
    expect = expect || saved.expect
  }
  if (!profile) {
    throw new Error("profile-status requires --profile or --name")
  }
  profile = requireProfileName(profile)
  if (!url) {
    const byProfile = deps?.savedForProfile
      ? deps.savedForProfile(profile)
      : savedCheckForProfile(profile)
    url = byProfile?.url
    expect = expect ?? byProfile?.expect
  }
  return { profile, url, expect }
}

export async function profileStatus(
  opts: ProfileStatusOpts,
  deps?: ProfileStatusDeps,
): Promise<ProfileStatusResult> {
  const { profile, url, expect } = resolveStatusTarget(opts, deps)
  const list = deps?.listProfiles ?? listProfiles
  const rows = await list()
  const row = rows.find((p) => p.name.trim() === profile)
  if (!row || row.populated === false || (row.populated === undefined && !(row.sizeBytes && row.sizeBytes > 0))) {
    const missing = !row
    const emptyGuide = emptyProfileGuide(profile)
    return {
      ok: false,
      reason: "emptySave",
      profile,
      url,
      populated: false,
      live: false,
      skippedLive: true,
      skipReason: emptyGuide.text,
      nextCall: emptyGuide.nextCall,
    }
  }

  const willLive = Boolean(url)
  let seed: ProfileSeed | undefined
  if (deps?.inspectSeed) {
    try {
      seed = await deps.inspectSeed(row.id, url ? new URL(url).origin : undefined)
    } catch {
      seed = undefined
    }
  } else if (!willLive) {
    const solari = createClient()
    try {
      seed = await inspectProfileSeed(solari, row.id, url ? new URL(url).origin : undefined, opts.authKeyNames)
    } catch {
      seed = undefined
    } finally {
      await solari.close().catch(() => undefined)
    }
  }

  if (!url && seed) {
    seed = { cookies: seed.cookies, origins: seed.origins }
  }
  const weakOpts = {
    name: opts.name,
    profile,
    url,
    cookies: seed?.cookies,
    origins: seed?.origins,
    sessionStorage: seed?.sessionStorage,
    sessionStorageStale: seed?.sessionStorageStale,
    cookieHosts: seed?.cookieHosts,
    liveHost: seed?.liveHost,
    appOriginCookieCount: seed?.appOriginCookieCount,
    localStorageAuthKeyNames: seed?.localStorageAuthKeyNames,
  }
  if (isWeakSeed(weakOpts)) {
    const weak = weakSeedGuide(profile, seed)
    return {
      ok: false,
      reason: "weakSeed",
      profile,
      url,
      populated: true,
      live: false,
      skippedLive: true,
      skipReason: weak.text,
      nextCall: weak.nextCall,
      ...seedCounts(seed, url, profile, opts.name),
    }
  }
  
  if (!url) {
    return {
      ok: false,
      reason: "loggedOut",
      profile,
      populated: true,
      live: false,
      skippedLive: true,
      skipReason: "no url to probe; pass --url or --name. Not pinging the user.",
      ...seedCounts(seed, url, profile, opts.name),
    }
  }
  const check = deps?.runCheck ?? runCheck
  const claim = expect?.trim()
  let result: CheckResult
  try {
    result = await check({
      url,
      expect: claim || "AuspexLiveProbe",
      profile,
      authKeyNames: opts.authKeyNames,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/0 cookies|empty Save|profile not found/i.test(msg)) {
      const emptyGuide = emptyProfileGuide(profile)
      return {
        ok: false,
        reason: "emptySave",
        profile,
        url,
        populated: row.populated,
        live: false,
        skippedLive: true,
        skipReason: `${msg} ${emptyGuide.text}`,
        nextCall: emptyGuide.nextCall,
        ...seedCounts(seed, url, profile, opts.name),
      }
    }
    throw err
  }
  if (!seed && result.profileSeed) seed = result.profileSeed
  if (result.needsHuman || result.reason === "needsHuman") {
    const loginCall = remintLoginNextCall(profile)
    return {
      ok: false,
      reason: "needsHuman",
      profile,
      url,
      populated: true,
      live: true,
      skippedLive: true,
      nextCall: loginCall,
      skipReason:
        "password/OTP wall. Skip live. Call auspex_login and show handoff.url (phone.html, the only login door). handoff.mobileUrl is that same page, with a real text field. " +
        HANDOFF_PHONE_DOOR_BAN +
        ` Agent never types a password. ${RE_GATE_STOP}`,
      finalUrl: result.finalUrl,
      excerpt: result.excerpt,
      screenshotPath: result.screenshotPath,
      ...seedCounts(seed, url, profile, opts.name),
    }
  }
  if (result.botWall) {
    // The probe never saw the app, so this is neither loggedIn nor loggedOut. Finalizing or
    // reminting cannot get past a bot check.
    return {
      ok: false,
      reason: "botWall",
      botWall: true,
      profile,
      url,
      populated: true,
      live: true,
      skipReason:
        "The site showed the cloud browser a bot check (for example Cloudflare \"Just a moment...\") instead of the app. " +
        "This does not say whether the saved login is good or bad. Do not remint or finalize for it; Auspex does not solve bot checks.",
      finalUrl: result.finalUrl,
      excerpt: result.excerpt,
      screenshotPath: result.screenshotPath,
      ...seedCounts(seed, url, profile, opts.name),
    }
  }
  const landed = result.finalUrl || ""
  let auth = false
  try {
    auth = Boolean(landed) && stillOnAuth(new URL(landed))
  } catch {
    auth = false
  }
  const matchedClaim = Boolean(claim) && result.matched === true
  const loggedOutLive =
    result.reason === "loggedOut" || (landed && isLoggedOutLanding(landed, { matched: matchedClaim })) || auth
  if (
    loggedOutLive &&
    isWeakSeed({
      name: opts.name,
      profile,
      url,
      cookies: seed?.cookies,
      origins: seed?.origins,
      sessionStorage: seed?.sessionStorage,
      sessionStorageStale: seed?.sessionStorageStale,
      cookieHosts: seed?.cookieHosts,
      liveHost: seed?.liveHost,
      appOriginCookieCount: seed?.appOriginCookieCount,
      localStorageAuthKeyNames: seed?.localStorageAuthKeyNames,
    })
  ) {
    const weak = weakSeedGuide(profile, seed)
    return {
      ok: false,
      reason: "weakSeed",
      profile,
      url,
      populated: true,
      live: true,
      skipReason: weak.text,
      nextCall: weak.nextCall,
      finalUrl: landed,
      excerpt: result.excerpt,
      screenshotPath: result.screenshotPath,
      ...seedCounts(seed, url, profile, opts.name),
    }
  }
  if (loggedOutLive) {
    const hasCookies = (seed?.cookies ?? 0) > 0 || (seed?.origins ?? 0) > 0
    const guided = hasCookies ? finalizeLoginGuide(profile) : emptyProfileGuide(profile)
    return {
      ok: false,
      reason: "loggedOut",
      profile,
      url,
      populated: true,
      live: true,
      skipReason: guided.text,
      nextCall: guided.nextCall,
      finalUrl: landed,
      excerpt: result.excerpt,
      screenshotPath: result.screenshotPath,
      ...seedCounts(seed, url, profile, opts.name),
    }
  }
  if (isPublicMarketingUrl(landed || url)) {
    return {
      ok: false,
      reason: "loggedOut",
      profile,
      url,
      populated: true,
      live: true,
      skipReason: "Public marketing pages stay loggedOut. A text hit here is not a saved login.",
      finalUrl: landed,
      excerpt: result.excerpt,
      screenshotPath: result.screenshotPath,
      ...seedCounts(seed, url, profile, opts.name),
    }
  }
  if (claim && result.matched !== true) {
    const weakNow = isWeakSeed({
      name: opts.name,
      profile,
      url,
      cookies: seed?.cookies,
      origins: seed?.origins,
      sessionStorage: seed?.sessionStorage,
      sessionStorageStale: seed?.sessionStorageStale,
      cookieHosts: seed?.cookieHosts,
      liveHost: seed?.liveHost,
      appOriginCookieCount: seed?.appOriginCookieCount,
      localStorageAuthKeyNames: seed?.localStorageAuthKeyNames,
    })
    if (weakNow) {
      const weak = weakSeedGuide(profile, seed)
      return {
        ok: false,
        reason: "weakSeed",
        profile,
        url,
        populated: true,
        live: true,
        skipReason: `Live probe did not see expect "${claim}". ${weak.text}`,
        nextCall: weak.nextCall,
        finalUrl: landed,
        excerpt: result.excerpt,
        screenshotPath: result.screenshotPath,
        ...seedCounts(seed, url, profile, opts.name),
      }
    }
    const hasCookies = (seed?.cookies ?? 0) > 0 || (seed?.origins ?? 0) > 0
    const guided = hasCookies ? finalizeLoginGuide(profile) : emptyProfileGuide(profile)
    return {
      ok: false,
      reason: "loggedOut",
      profile,
      url,
      populated: true,
      live: true,
      skipReason: `Live probe did not see expect "${claim}". loggedIn means that expect was on the page. ${guided.text}`,
      nextCall: guided.nextCall,
      finalUrl: landed,
      excerpt: result.excerpt,
      screenshotPath: result.screenshotPath,
      ...seedCounts(seed, url, profile, opts.name),
    }
  }
  return {
    ok: true,
    reason: "loggedIn",
    profile,
    url,
    populated: true,
    live: true,
    // Without words to look for, the probe only saw that the page was not a sign-in or public page.
    next: claim
      ? LOGGED_IN_SEED_HEALTH
      : `No expect was given, so loggedIn only means the page did not land on a sign-in, landing, or public page. Pass --expect with words only the logged-in app shows. ${LOGGED_IN_SEED_HEALTH}`,
    finalUrl: landed,
    excerpt: result.excerpt,
    screenshotPath: result.screenshotPath,
    ...seedCounts(seed, url, profile, opts.name),
  }
}
