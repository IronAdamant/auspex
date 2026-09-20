import { z } from "zod"
import { asFiniteNumber } from "./profile-persist.ts"
import { BROWSER_API_BASE, createClient, requireApiKey } from "./solari.ts"

export const CONSOLE_PROFILES_URL = "https://console.getsolari.com"
export const PROFILE_NAME_ERROR = "profile name must be non-empty"

export function requireProfileName(value: string): string {
  const name = value.trim()
  if (!name) throw new Error(PROFILE_NAME_ERROR)
  return name
}

export const profileNameSchema = z.string().trim().min(1, { message: PROFILE_NAME_ERROR })

export type ProfileInfo = {
  id: string
  name: string
  version?: number
  sizeBytes?: number
  populated?: boolean
}

export type LoginHandoff = {
  url: string
  handoffId?: string
  expiresAt?: string
  version?: number
}

export type HandoffPacket = {
  url: string
  /** Phone: Solari login-handoff. Same as url. Open in the phone's own Safari or Chrome. */
  mobileUrl?: string
  /** Computer: Solari console. Hardware keyboard in Chromium. Do not open this on a phone. */
  desktopUrl?: string
  openOnPhone?: string
  openOnDesktop?: string
  oneLiner?: string
  desktopOneLiner?: string
  qrPath?: string
}

/** Phone must not use the console Chromium live view. */
export const HANDOFF_PHONE_DOOR_BAN =
  "Never open handoff.desktopUrl on a phone and do not click the remote Chromium live view there: that stream is a picture of Chrome, so the phone software keyboard will not open."

export const HANDOFF_OPEN_ON_PHONE =
  "Phone: open handoff.mobileUrl in the phone's own Safari or Chrome (a real tab). Type the password on the phone keyboard, then Save. " +
  HANDOFF_PHONE_DOOR_BAN +
  " Never paste the password into chat."

export function handoffOpenOnDesktop(profileName: string): string {
  return `Computer: open handoff.desktopUrl, then Profiles → ${profileName} → Open editor. Type with the hardware keyboard, then Save. Do not send this URL to a phone.`
}

const HANDOFF_HANG_GUIDANCE =
  " If the handoff Chromium card is blank or spinning for more than 2 to 3 minutes, refresh once; if it stays unresponsive, remint with auspex_login (new handoff URL). Complete Microsoft + OneDrive consent in the handoff card before Save; do not open parallel agent checks mid-consent."

export function formatHandoffNext(opts: {
  urlHint?: string
  qrPath?: string
  profileName?: string
}): string {
  const where = opts.urlHint ? ` Sign in at ${opts.urlHint}.` : " Sign in."
  const qrBit = opts.qrPath
    ? " Phone QR is handoff.qrPath (encodes handoff.mobileUrl)."
    : ""
  const profile = opts.profileName?.trim() || "<profile>"
  return (
    `Show BOTH URLs, labeled. Phone: handoff.mobileUrl (same as handoff.url). Open in the phone's own Safari or Chrome, type the password on the phone keyboard, then Save. Computer: handoff.desktopUrl, then Profiles → ${profile} → Open editor (hardware keyboard), then Save. Never paste or type the password through the agent. ${HANDOFF_PHONE_DOOR_BAN}${where} ` +
    `Then auspex_await_login (waits up to 30 minutes), then auspex_finalize_login (pass --url and --expect unless a saved check), then auspex_check. Do not skip finalize-login after Save. Off-site phone: paste handoff.oneLiner. Off-site computer: paste handoff.desktopOneLiner.${qrBit}${HANDOFF_HANG_GUIDANCE}`
  )
}

export function attachHandoffQr(result: LoginResult, qrPath: string, urlHint?: string): LoginResult {
  if (!result.handoff) return result
  if (qrPath) result.handoff.qrPath = qrPath
  else delete result.handoff.qrPath
  result.next = formatHandoffNext({
    urlHint,
    qrPath: result.handoff.qrPath,
    profileName: result.name,
  })
  return result
}

export function qrPayloadForHandoff(handoff: HandoffPacket): string {
  return handoff.mobileUrl || handoff.url
}

export type LoginResult = {
  profileId: string
  name: string
  consoleUrl: string
  next: string
  handoff?: HandoffPacket
  url?: string
  handoffId?: string
  expiresAt?: string
  sinceVersion?: number
}

export type ProfileHttp = {
  post: (path: string, body: unknown) => Promise<Record<string, unknown>>
}

export function loginInstructions(
  profile: ProfileInfo,
  urlHint?: string,
  handoff?: LoginHandoff,
  qrPath?: string,
): LoginResult {
  const where = urlHint ? ` Sign in at ${urlHint}.` : " Sign in."
  if (handoff?.url) {
    const handoffPacket: HandoffPacket = {
      url: handoff.url,
      mobileUrl: handoff.url,
      desktopUrl: CONSOLE_PROFILES_URL,
      openOnPhone: HANDOFF_OPEN_ON_PHONE,
      openOnDesktop: handoffOpenOnDesktop(profile.name),
      oneLiner: `Auspex login (phone): ${handoff.url}`,
      desktopOneLiner: `Auspex login (computer): ${CONSOLE_PROFILES_URL} → Profiles → ${profile.name} → Open editor`,
      qrPath,
    }
    return {
      profileId: profile.id,
      name: profile.name,
      consoleUrl: CONSOLE_PROFILES_URL,
      handoff: handoffPacket,
      url: handoff.url,
      handoffId: handoff.handoffId,
      expiresAt: handoff.expiresAt,
      sinceVersion: handoff.version,
      next: formatHandoffNext({ urlHint, qrPath, profileName: profile.name }),
    }
  }
  return {
    profileId: profile.id,
    name: profile.name,
    consoleUrl: CONSOLE_PROFILES_URL,
    sinceVersion: handoff?.version,
    next: `Handoff mint returned no url. Remint with auspex_login. ${HANDOFF_PHONE_DOOR_BAN} Laptop-only fallback if a handoff URL cannot be minted: ${CONSOLE_PROFILES_URL} → Profiles → Open editor.${where} Hit Save (must store cookies or origins), then auspex_await_login, then auspex_finalize_login (pass --url and --expect unless a saved check), then auspex_check. Do not skip finalize-login after Save.${HANDOFF_HANG_GUIDANCE}`,
  }
}

export function formatLogin(result: LoginResult): string {
  return `${JSON.stringify(result, null, 2)}\n`
}

export async function defaultProfileHttp(): Promise<ProfileHttp> {
  const key = requireApiKey()
  return {
    post: async (path, body) => {
      const res = await fetch(`${BROWSER_API_BASE}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body ?? {}),
      })
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        const err = typeof json.error === "string" ? json.error : `login-handoff ${res.status}`
        throw new Error(err)
      }
      return json
    },
  }
}

export async function requestLoginHandoff(
  profileId: string,
  reason: string,
  http: ProfileHttp,
): Promise<LoginHandoff> {
  const json = await http.post(`/profiles/${encodeURIComponent(profileId)}/login-handoff`, { reason })
  const url = typeof json.url === "string" ? json.url : ""
  if (!url) throw new Error("login-handoff returned no url")
  return {
    url,
    handoffId: typeof json.handoffId === "string" ? json.handoffId : undefined,
    expiresAt: typeof json.expiresAt === "string" ? json.expiresAt : undefined,
    version: typeof json.version === "number" ? json.version : undefined,
  }
}

export async function ensureProfile(name: string): Promise<ProfileInfo> {
  const want = requireProfileName(name)
  const solari = createClient()
  try {
    const existing = (await solari.profiles.list()).find((p) => p.name.trim() === want)
    const profile = existing ?? (await solari.profiles.create({ name: want }))
    return { id: profile.id, name: profile.name }
  } finally {
    await solari.close()
  }
}

export async function loginProfile(
  name: string,
  urlHint?: string,
  http?: ProfileHttp,
  qrPath?: string,
): Promise<LoginResult> {
  const profile = await ensureProfile(name)
  const client = http ?? (await defaultProfileHttp())
  const handoff = await requestLoginHandoff(
    profile.id,
    urlHint
      ? `Auspex login for profile ${profile.name}; start at ${urlHint}`
      : `Auspex login for profile ${profile.name}`,
    client,
  )
  return loginInstructions(profile, urlHint, handoff, qrPath)
}

export async function listProfiles(): Promise<ProfileInfo[]> {
  const solari = createClient()
  try {
    return (await solari.profiles.list()).map((p) => {
      const version = asFiniteNumber((p as { version?: unknown }).version)
      const sizeBytes = asFiniteNumber((p as { sizeBytes?: unknown }).sizeBytes)
      const s3 = (p as { storageStateS3Key?: unknown }).storageStateS3Key
      return {
        id: p.id,
        name: p.name,
        version,
        sizeBytes,
        populated: Boolean(s3) || (sizeBytes !== undefined && sizeBytes > 0),
      }
    })
  } finally {
    await solari.close()
  }
}
