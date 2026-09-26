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
import { resolveSavedCheck, savedCheckForProfile, type SavedCheck } from "./saved-checks.ts"

export type ProfileStatusReason = "loggedIn" | "loggedOut" | "needsHuman" | "weakSeed" | "emptySave"

export type ProfileStatusResult = {
  ok: boolean
  reason: ProfileStatusReason
  profile: string
  url?: string
  populated?: boolean
  live: boolean
  skippedLive?: boolean
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
}

export type ProfileStatusOpts = {
  profile?: string
  name?: string
  url?: string
}

export type ProfileStatusDeps = {
  listProfiles?: () => Promise<ProfileInfo[]>
  runCheck?: (opts: CheckOptions) => Promise<CheckResult>
  savedForName?: (name: string) => SavedCheck
  savedForProfile?: (profile: string) => SavedCheck | undefined
  inspectSeed?: (profileId: string, origin?: string) => Promise<ProfileSeed>
}

function seedCounts(seed?: ProfileSeed): {
  cookies?: number
  origins?: number
  sessionStorage?: number
  sessionStorageStale?: boolean
} {
  return {
    cookies: seed?.cookies,
    origins: seed?.origins,
    sessionStorage: seed?.sessionStorage,
    ...(seed?.sessionStorageStale ? { sessionStorageStale: true } : {}),
  }
}

function resolveStatusTarget(opts: ProfileStatusOpts, deps?: ProfileStatusDeps): {
  profile: string
  url?: string
  expect?: string
} {
  let profile = opts.profile?.trim()
  let url = opts.url?.trim()
  let expect: string | undefined
  if (opts.name?.trim()) {
    const saved = deps?.savedForName
      ? deps.savedForName(opts.name)
      : resolveSavedCheck(opts.name)
    profile = profile || saved.profile
    url = url || saved.url
    expect = saved.expect
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
      seed = await inspectProfileSeed(solari, row.id, url ? new URL(url).origin : undefined)
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
      ...seedCounts(seed),
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
      ...seedCounts(seed),
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
        ...seedCounts(seed),
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
        "password/OTP wall. Skip live. Call auspex_login and show handoff.url (chooser). Labeled deep links: handoff.mobileUrl (Auspex phone page, real text field) and handoff.desktopUrl (Auspex desktop page when minted, otherwise console Open editor). " +
        HANDOFF_PHONE_DOOR_BAN +
        ` Agent never types a password. ${RE_GATE_STOP}`,
      finalUrl: result.finalUrl,
      excerpt: result.excerpt,
      screenshotPath: result.screenshotPath,
      ...seedCounts(seed),
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
      ...seedCounts(seed),
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
      ...seedCounts(seed),
    }
  }
  return {
    ok: true,
    reason: "loggedIn",
    profile,
    url,
    populated: true,
    live: true,
    next: LOGGED_IN_SEED_HEALTH,
    finalUrl: landed,
    excerpt: result.excerpt,
    screenshotPath: result.screenshotPath,
    ...seedCounts(seed),
  }
}
