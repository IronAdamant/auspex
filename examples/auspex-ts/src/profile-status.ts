import { isLoggedOutLanding } from "./profile-storage.ts"
import { listProfiles, requireProfileName, type ProfileInfo } from "./profiles.ts"
import { stillOnAuth } from "./sso.ts"
import { runCheck, type CheckOptions, type CheckResult } from "./check.ts"
import { resolveSavedCheck, savedCheckForProfile, type SavedCheck } from "./saved-checks.ts"

export type ProfileStatusReason = "loggedIn" | "loggedOut" | "needsHuman"

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
      reason: "loggedOut",
      profile,
      url,
      populated: false,
      live: false,
      skippedLive: true,
      skipReason: missing
        ? `profile ${profile} not found. Human SSO once (agent never types a password).`
        : `profile ${profile} is empty. Human SSO once (agent never types a password).`,
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
        reason: "loggedOut",
        profile,
        url,
        populated: row.populated,
        live: false,
        skippedLive: true,
        skipReason: `${msg} Human SSO once (agent never types a password).`,
      }
    }
    throw err
  }
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
  if (result.reason === "loggedOut" || (landed && isLoggedOutLanding(landed, { matched: matchedClaim })) || auth) {
    return {
      ok: false,
      reason: "loggedOut",
      profile,
      url,
      populated: true,
      live: true,
      finalUrl: landed,
      excerpt: result.excerpt,
      screenshotPath: result.screenshotPath,
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
  }
}
