import { z } from "zod"
import { createClient } from "./solari.ts"

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
}

export type LoginResult = {
  profileId: string
  name: string
  consoleUrl: string
  next: string
}

export function loginInstructions(profile: ProfileInfo, urlHint?: string): LoginResult {
  const where = urlHint ? ` Log in at ${urlHint}.` : " Log in."
  return {
    profileId: profile.id,
    name: profile.name,
    consoleUrl: CONSOLE_PROFILES_URL,
    next: `Open ${CONSOLE_PROFILES_URL} → Profiles → Open editor.${where} Hit Save, then run auspex check with --profile ${profile.name}`,
  }
}

export function formatLogin(result: LoginResult): string {
  return `${JSON.stringify(result, null, 2)}\n`
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

export async function loginProfile(name: string, urlHint?: string): Promise<LoginResult> {
  const profile = await ensureProfile(name)
  return loginInstructions(profile, urlHint)
}

export async function listProfiles(): Promise<ProfileInfo[]> {
  const solari = createClient()
  try {
    return (await solari.profiles.list()).map((p) => ({ id: p.id, name: p.name }))
  } finally {
    await solari.close()
  }
}
