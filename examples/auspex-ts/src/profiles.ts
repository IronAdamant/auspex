import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { asFiniteNumber } from "./profile-persist.ts"
import { packageRoot } from "./paths.ts"
import { resolvePhoneExpirySeconds } from "./phone-expiry.ts"
import { BROWSER_API_BASE, createClient, requireApiKey } from "./solari.ts"

export const CONSOLE_PROFILES_URL = "https://console.getsolari.com"
/** Pages viewer with a real text field so the phone software keyboard can open. */
export const PHONE_HANDOFF_PAGE = "https://ironadamant.com/auspex/phone.html"
export const PROFILE_NAME_ERROR = "profile name must be non-empty"

export function isPhoneImeUrl(url: string | undefined): boolean {
  return Boolean(url?.startsWith(PHONE_HANDOFF_PAGE))
}

export function phoneHandoffUrl(
  vncToken: string,
  handoffUrl: string,
  extra?: { profileId?: string; profileName?: string; handoffToken?: string; expiresAt?: string },
): string {
  const token = vncToken.trim()
  const save = handoffUrl.trim()
  if (!token) return ""
  const hash = new URLSearchParams({ v: token })
  if (save) hash.set("h", save)
  if (extra?.profileId?.trim()) hash.set("p", extra.profileId.trim())
  if (extra?.profileName?.trim()) hash.set("n", extra.profileName.trim())
  if (extra?.handoffToken?.trim()) hash.set("t", extra.handoffToken.trim())
  const expiry = resolvePhoneExpirySeconds({ expiresAt: extra?.expiresAt, jwt: token })
  if (expiry.exp !== undefined) hash.set("exp", String(expiry.exp))
  return `${PHONE_HANDOFF_PAGE}#${hash.toString()}`
}

export type EditorSaveHandle = {
  profileId: string
  name: string
  handoffToken: string
  expiresAt?: string
}

export function editorSavePath(name: string, root = packageRoot): string {
  return path.join(root, ".auspex", "editor-save", `${requireProfileName(name)}.json`)
}

export async function persistEditorSave(handle: EditorSaveHandle, root = packageRoot): Promise<void> {
  const file = editorSavePath(handle.name, root)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(handle), "utf8")
}

export async function loadEditorSave(name: string, root = packageRoot): Promise<EditorSaveHandle | undefined> {
  try {
    const raw = JSON.parse(await readFile(editorSavePath(name, root), "utf8")) as Partial<EditorSaveHandle>
    const profileId = typeof raw.profileId === "string" ? raw.profileId.trim() : ""
    const handoffToken = typeof raw.handoffToken === "string" ? raw.handoffToken.trim() : ""
    const profileName = typeof raw.name === "string" ? raw.name.trim() : requireProfileName(name)
    if (!profileId || !handoffToken) return undefined
    return {
      profileId,
      name: profileName,
      handoffToken,
      expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : undefined,
    }
  } catch {
    return undefined
  }
}

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
  /** Phone: Auspex phone.html (real text field) when a VNC token was minted; else Solari handoff. */
  mobileUrl?: string
  /** Computer: Solari console. Hardware keyboard in Chromium. Do not open this on a phone. */
  desktopUrl?: string
  openOnPhone?: string
  openOnDesktop?: string
  oneLiner?: string
  desktopOneLiner?: string
  /** Copied on phone Save; paste into any agent chat. */
  savePaste?: string
  qrPath?: string
}

export function phoneSavePaste(profileName?: string): string {
  const name = (profileName ?? "").trim()
  if (name) {
    return `I tapped Save on the Auspex phone page for profile ${name}. Run npx auspex await-login --profile ${name} --save-editor (or auspex_await_login with saveEditor true). Do not open Solari on the phone (GET editor HTTP 401). --save-editor does not refresh folded sessionStorage unless editorFold.ok. If editorSave fails (e.g. 401) or editorFold is no-cdp: finalize-login NOW while the token is live; do not run verify-with-profile on a dead fold (claimOkProfile will not pass). Remint if finalize-login returns needsHuman.`
  }
  return "I tapped Save on the Auspex phone page. Run npx auspex await-login --save-editor (or auspex_await_login with saveEditor true). Do not open Solari on the phone (GET editor HTTP 401). --save-editor does not refresh folded sessionStorage unless editorFold.ok. If editorSave fails (e.g. 401) or editorFold is no-cdp: finalize-login NOW while the token is live; do not run verify-with-profile on a dead fold (claimOkProfile will not pass). Remint if finalize-login returns needsHuman."
}

/** Phone.html is IME + Save paste for an auth seed — not a live-session takeover. */
export const PHONE_HANDOFF_NOT_TAKEOVER =
  "Auspex phone.html is a seed/handoff door for off-site typing (IME + Save paste), not a same-session VNC takeover of the agent's live check."

/** Solari's handoff/editor is noVNC. iOS will not raise the software keyboard there. */
export const HANDOFF_PHONE_DOOR_BAN =
  "Never type in Solari's remote Chromium / noVNC card on a phone: that stream is a picture of Chrome, so the phone software keyboard will not open. Never open handoff.desktopUrl on a phone. " +
  PHONE_HANDOFF_NOT_TAKEOVER

export const HANDOFF_OPEN_ON_PHONE =
  "Phone: open handoff.mobileUrl in the phone's own Safari or Chrome. That page has a real text field so the phone keyboard can open. Tap the remote Chrome to click, type in the field at the bottom (keys go into remote Chrome, not into chat), then tap Save on that page (stay there). Save copies a line to the clipboard; paste it in the AI chat. Do not open Solari's handoff page on a phone: GET editor HTTP 401. Then auspex_await_login with saveEditor true. " +
  HANDOFF_PHONE_DOOR_BAN +
  " Never paste the password into chat."

export const HANDOFF_OPEN_ON_PHONE_NOVNC_FALLBACK =
  "Phone: Solari handoff is noVNC (a picture of Chrome). The phone software keyboard will not open there. Use a computer (handoff.desktopUrl, hardware keyboard) or remint auspex_login for the Auspex phone page. " +
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
  hasPhoneIme?: boolean
}): string {
  const where = opts.urlHint ? ` Sign in at ${opts.urlHint}.` : " Sign in."
  const qrBit = opts.qrPath
    ? " Phone QR is handoff.qrPath (encodes handoff.mobileUrl)."
    : ""
  const profile = opts.profileName?.trim() || "<profile>"
  const phone = opts.hasPhoneIme
    ? "Show BOTH URLs, labeled. Phone: handoff.mobileUrl (Auspex phone page, real text field so the phone keyboard can open — seed/handoff door for off-site typing, not a same-session VNC takeover). Tap the remote Chrome to click, type in the field at the bottom, tap Save on that page (copies to the clipboard; paste in the AI chat), then auspex_await_login with saveEditor true. Do not open Solari's handoff page on a phone (GET editor HTTP 401)."
    : "Show BOTH URLs, labeled. Phone: Solari handoff is noVNC (a picture of Chrome); the phone software keyboard will not open there. Prefer a computer."
  return (
    `${phone} Computer: handoff.desktopUrl, then Profiles → ${profile} → Open editor (hardware keyboard), then Save. Never paste or type the password through the agent. ${HANDOFF_PHONE_DOOR_BAN}${where} ` +
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
    hasPhoneIme: isPhoneImeUrl(result.handoff.mobileUrl),
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
  mobileUrl?: string,
): LoginResult {
  const where = urlHint ? ` Sign in at ${urlHint}.` : " Sign in."
  if (handoff?.url) {
    const phone = mobileUrl?.trim() || handoff.url
    const hasPhoneIme = isPhoneImeUrl(phone)
    const handoffPacket: HandoffPacket = {
      url: handoff.url,
      mobileUrl: phone,
      desktopUrl: CONSOLE_PROFILES_URL,
      openOnPhone: hasPhoneIme ? HANDOFF_OPEN_ON_PHONE : HANDOFF_OPEN_ON_PHONE_NOVNC_FALLBACK,
      openOnDesktop: handoffOpenOnDesktop(profile.name),
      oneLiner: `Auspex login (phone): ${phone}`,
      desktopOneLiner: `Auspex login (computer): ${CONSOLE_PROFILES_URL} → Profiles → ${profile.name} → Open editor`,
      savePaste: hasPhoneIme ? phoneSavePaste(profile.name) : undefined,
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
      next: formatHandoffNext({ urlHint, qrPath, profileName: profile.name, hasPhoneIme }),
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

export type EditorPost = (path: string) => Promise<{ status: number; json: Record<string, unknown> }>

export function handoffTokenFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname
    const parts = path.split("/").filter(Boolean)
    const i = parts.lastIndexOf("handoff")
    return i >= 0 ? (parts[i + 1] ?? "") : ""
  } catch {
    return ""
  }
}

async function defaultEditorPost(handoffToken: string): Promise<EditorPost> {
  return async (path) => {
    const res = await fetch(`${CONSOLE_PROFILES_URL}${path}`, {
      method: "POST",
      headers: {
        "x-handoff-token": handoffToken,
        Origin: CONSOLE_PROFILES_URL,
        Referer: `${CONSOLE_PROFILES_URL}/handoff/${handoffToken}`,
        Accept: "application/json",
      },
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { status: res.status, json }
  }
}

/** Start the profile editor if needed and return the noVNC bearer token. */
export async function fetchEditorVncToken(
  profileId: string,
  handoffToken: string,
  opts?: { post?: EditorPost; tries?: number; sleepMs?: number },
): Promise<string | undefined> {
  const token = handoffToken.trim()
  const id = profileId.trim()
  if (!token || !id) return undefined
  const post = opts?.post ?? (await defaultEditorPost(token))
  const tries = opts?.tries ?? 20
  const sleepMs = opts?.sleepMs ?? 1000
  const start = await post(`/api/profiles/${encodeURIComponent(id)}/editor`)
  if (start.status !== 200 && start.status !== 201 && start.status !== 409) {
    return undefined
  }
  for (let i = 0; i < tries; i++) {
    const got = await post(`/api/profiles/${encodeURIComponent(id)}/editor/token`)
    const vnc = typeof got.json.token === "string" ? got.json.token.trim() : ""
    if (got.status === 200 && vnc) return vnc
    if (i + 1 < tries && sleepMs > 0) {
      await new Promise((r) => setTimeout(r, sleepMs))
    }
  }
  return undefined
}

export async function saveProfileEditor(
  handle: EditorSaveHandle,
  opts?: { post?: EditorPost },
): Promise<{ ok: boolean; status: number; error?: string; json?: Record<string, unknown> }> {
  const post = opts?.post ?? (await defaultEditorPost(handle.handoffToken))
  const got = await post(`/api/profiles/${encodeURIComponent(handle.profileId)}/editor/save`)
  const error = typeof got.json.error === "string" ? got.json.error : undefined
  return { ok: got.status === 200 || got.status === 201, status: got.status, error, json: got.json }
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
  let mobileUrl: string | undefined
  const handoffToken = handoff.handoffId || handoffTokenFromUrl(handoff.url)
  try {
    if (handoffToken) {
      await persistEditorSave({
        profileId: profile.id,
        name: profile.name,
        handoffToken,
        expiresAt: handoff.expiresAt,
      })
    }
    const vnc = await fetchEditorVncToken(profile.id, handoffToken)
    if (vnc) {
      mobileUrl = phoneHandoffUrl(vnc, handoff.url, {
        profileId: profile.id,
        profileName: profile.name,
        handoffToken,
        expiresAt: handoff.expiresAt,
      })
    }
  } catch {
    mobileUrl = undefined
  }
  return loginInstructions(profile, urlHint, handoff, qrPath, mobileUrl)
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
