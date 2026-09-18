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

export type LoginResult = {
  profileId: string
  name: string
  consoleUrl: string
  next: string
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
): LoginResult {
  const where = urlHint ? ` Sign in at ${urlHint}.` : " Sign in."
  const hangGuidance = " If handoff Chromium is blank/spinning >2–3 minutes, refresh the page once; if still unresponsive, remint with auspex_login (new handoff URL). Complete Microsoft + OneDrive consent in the handoff card before Save; do not open parallel agent checks mid-consent."
  if (handoff?.url) {
    return {
      profileId: profile.id,
      name: profile.name,
      consoleUrl: CONSOLE_PROFILES_URL,
      url: handoff.url,
      handoffId: handoff.handoffId,
      expiresAt: handoff.expiresAt,
      sinceVersion: handoff.version,
      next: `Open the url (single-use Solari login handoff; no password through the agent).${where} Save when done (must store cookies or origins), then auspex_await_login or check --profile ${profile.name}.${hangGuidance}`,
    }
  }
  return {
    profileId: profile.id,
    name: profile.name,
    consoleUrl: CONSOLE_PROFILES_URL,
    sinceVersion: handoff?.version,
    next: `Open ${CONSOLE_PROFILES_URL} → Profiles → Open editor.${where} Hit Save (must store cookies or origins), then auspex_await_login or check --profile ${profile.name}.${hangGuidance}`,
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
): Promise<LoginResult> {
  const profile = await ensureProfile(name)
  const client = http ?? (await defaultProfileHttp())
  const handoff = await requestLoginHandoff(
    profile.id,
    `Auspex login for profile ${profile.name}`,
    client,
  )
  return loginInstructions(profile, urlHint, handoff)
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
