import { isLoggedOutLanding } from "./profile-storage.ts"
import { listProfiles, requireProfileName, type ProfileInfo } from "./profiles.ts"
import { emptyProfileGuidance, finalizeLoginGuidance, inspectProfileSeed, isWeakSeed } from "./profile-persist.ts"
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
  finalUrl?: string
  excerpt?: string
  screenshotPath?: string
  cookies?: number
  origins?: number
  sessionStorage?: number
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
  inspectSeed?: (profileId: string, origin?: string) => Promise<{ cookies: number; origins: number; sessionStorage?: number }>
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
    return {
      ok: false,
      reason: "emptySave",
      profile,
      url,
      populated: false,
      live: false,
      skippedLive: true,
      skipReason: emptyProfileGuidance(profile),
    }
  }

  const willLive = Boolean(url)
  let seed: { cookies: number; origins: number; sessionStorage?: number } | undefined
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
  }
  if (isWeakSeed(weakOpts)) {
    return {
      ok: false,
      reason: "weakSeed",
      profile,
      url,
      populated: true,
      live: false,
      skippedLive: true,
      skipReason: `profile ${profile} has cookies/origins but no counted sessionStorage. ${finalizeLoginGuidance(profile)}`,
      cookies: seed?.cookies,
      origins: seed?.origins,
      sessionStorage: seed?.sessionStorage,
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
      cookies: seed?.cookies,
      origins: seed?.origins,
      sessionStorage: seed?.sessionStorage,
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
      return {
        ok: false,
        reason: "emptySave",
        profile,
        url,
        populated: row.populated,
        live: false,
        skippedLive: true,
        skipReason: `${msg} ${emptyProfileGuidance(profile)}`,
        cookies: seed?.cookies,
        origins: seed?.origins,
        sessionStorage: seed?.sessionStorage,
      }
    }
    throw err
  }
  if (!seed && result.profileSeed) seed = result.profileSeed
  if (result.needsHuman || result.reason === "needsHuman") {
    return {
      ok: false,
      reason: "needsHuman",
      profile,
      url,
      populated: true,
      live: true,
      skippedLive: true,
      skipReason: "password/OTP wall. Skip live; human SSO once. Agent never types a password.",
      finalUrl: result.finalUrl,
      excerpt: result.excerpt,
      screenshotPath: result.screenshotPath,
      cookies: seed?.cookies,
      origins: seed?.origins,
      sessionStorage: seed?.sessionStorage,
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
    })
  ) {
    return {
      ok: false,
      reason: "weakSeed",
      profile,
      url,
      populated: true,
      live: true,
      skipReason: `profile ${profile} has cookies/origins but no counted sessionStorage. ${finalizeLoginGuidance(profile)}`,
      finalUrl: landed,
      excerpt: result.excerpt,
      screenshotPath: result.screenshotPath,
      cookies: seed?.cookies,
      origins: seed?.origins,
      sessionStorage: seed?.sessionStorage,
    }
  }
  if (loggedOutLive) {
    const hasCookies = (seed?.cookies ?? 0) > 0 || (seed?.origins ?? 0) > 0
    return {
      ok: false,
      reason: "loggedOut",
      profile,
      url,
      populated: true,
      live: true,
      skipReason: hasCookies
        ? finalizeLoginGuidance(profile)
        : emptyProfileGuidance(profile),
      finalUrl: landed,
      excerpt: result.excerpt,
      screenshotPath: result.screenshotPath,
      cookies: seed?.cookies,
      origins: seed?.origins,
      sessionStorage: seed?.sessionStorage,
    }
  }
  return {
    ok: true,
    reason: "loggedIn",
    profile,
    url,
    populated: true,
    live: true,
    finalUrl: landed,
    excerpt: result.excerpt,
    screenshotPath: result.screenshotPath,
    cookies: seed?.cookies,
    origins: seed?.origins,
    sessionStorage: seed?.sessionStorage,
  }
}
