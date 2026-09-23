import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { recordLoginTrace, type LoginMintStage } from "./login-trace.ts"
import type { NextCall } from "./next-call.ts"
import { AuspexError, classifySolariError } from "./errors.ts"
import { asFiniteNumber } from "./profile-persist.ts"
import { derivedProfileNext } from "./profile-slug.ts"
import {
  applyOperatorWipes,
  commitOperatorSession,
  type OperatorAgentNotice,
  type OperatorNote,
} from "./operator-session.ts"
import {
  desktopHandoffUrlFromPhone,
  doorHandoffUrlFromPhone,
  isDoorUrl,
  isPhoneImeUrl,
  phoneHandoffUrl,
} from "./handoff-doors.ts"
import { packageRoot } from "./paths.ts"
import { BROWSER_API_BASE, createClient, requireApiKey } from "./solari.ts"

export {
  DESKTOP_HANDOFF_PAGE,
  DOOR_HANDOFF_PAGE,
  PHONE_HANDOFF_PAGE,
  desktopHandoffUrl,
  desktopHandoffUrlFromPhone,
  doorHandoffUrl,
  doorHandoffUrlFromPhone,
  handoffHash,
  isDesktopDoorUrl,
  isDoorUrl,
  isPhoneImeUrl,
  phoneHandoffUrl,
} from "./handoff-doors.ts"

export const CONSOLE_PROFILES_URL = "https://console.getsolari.com"

export type HandoffHostKind = "public" | "cluster-internal" | "other"

/** Rewrite in-cluster Solari hostnames so humans never see k8s DNS. Path (handoff id) is kept. */
export function classifyHandoffHost(url: string): HandoffHostKind {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host === "console.getsolari.com" || host.endsWith(".getsolari.com")) return "public"
    if (host.includes("cluster.local") || host.includes(".svc.")) return "cluster-internal"
    return "other"
  } catch {
    return "other"
  }
}

export function publicHandoffUrl(url: string): string {
  try {
    const u = new URL(url)
    if (classifyHandoffHost(url) !== "cluster-internal") return url
    u.protocol = "https:"
    u.host = "console.getsolari.com"
    return u.toString()
  } catch {
    return url
  }
}
export const PROFILE_NAME_ERROR = "profile name must be non-empty"

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
  hostKind?: HandoffHostKind
}

export type HandoffPacket = {
  /** Chooser (door.html) when VNC minted; else Solari handoff. */
  url: string
  /** Phone: Auspex phone.html (real text field) when a VNC token was minted; else Solari handoff. */
  mobileUrl?: string
  /** Computer: desktop.html (same hash) when VNC minted; else Solari console. Do not open this on a phone. */
  desktopUrl?: string
  openOnPhone?: string
  openOnDesktop?: string
  /** Human SMS / one link: chooser when minted. */
  oneLiner?: string
  desktopOneLiner?: string
  /** Copied on phone Save; paste into any agent chat. Desktop page writes its own desktop line. */
  savePaste?: string
  qrPath?: string
}

export type DoorSaveKind = "phone" | "desktop"

export function doorSavePaste(profileName?: string, door: DoorSaveKind = "phone"): string {
  const name = (profileName ?? "").trim() || "<yours>"
  const page = door === "desktop" ? "desktop page" : "phone page"
  const solariBan =
    door === "desktop"
      ? " Do not open Solari's handoff page on a phone (GET editor HTTP 401)."
      : " Do not open Solari on the phone (GET editor HTTP 401)."
  return `I tapped Save on the Auspex ${page} for profile ${name}. Run npx auspex await-login --profile ${name} --save-editor (or auspex_await_login with saveEditor true).${solariBan} --save-editor does not refresh folded sessionStorage unless editorFold.ok. If editorSave fails (e.g. 401) or editorFold is no-cdp: finalize-login NOW while the token is live; do not run verify-with-profile on a dead fold (claimOkProfile will not pass). Remint if finalize-login returns needsHuman.`
}

export function phoneSavePaste(profileName?: string): string {
  return doorSavePaste(profileName, "phone")
}

export function desktopSavePaste(profileName?: string): string {
  return doorSavePaste(profileName, "desktop")
}

/** https only. A pasted field wins over the URL minted into the link. Secrets are not accepted. */
export function desktopSaveSiteUrl(minted?: string, field?: string): string {
  const typed = (field ?? "").trim()
  const fromMint = (minted ?? "").trim()
  const chosen = /^https:\/\//i.test(typed) ? typed : fromMint
  return /^https:\/\//i.test(chosen) ? chosen : ""
}

/** Phone.html is IME + Save paste for an auth seed — not a live-session takeover. */
export const PHONE_HANDOFF_NOT_TAKEOVER =
  "Auspex phone.html is a seed/handoff door for off-site typing (IME + Save paste), not a same-session VNC takeover of the agent's live check."

/** Solari's handoff/editor is noVNC. iOS will not raise the software keyboard there. */
export const HANDOFF_PHONE_DOOR_BAN =
  "Never type in Solari's remote Chromium / noVNC card on a phone: that stream is a picture of Chrome, so the phone software keyboard will not open. Never open handoff.desktopUrl on a phone. " +
  PHONE_HANDOFF_NOT_TAKEOVER

export const HANDOFF_OPEN_ON_PHONE =
  "Phone: open handoff.url (chooser) or handoff.mobileUrl in the phone's own Safari or Chrome. That page has a real text field so the phone keyboard can open. Tap the remote Chrome to click, type or paste in the one field at the bottom (keys go into remote Chrome and the site; they stay off agent chat / MCP / receipts), then tap Save on the phone page (stay there). Save copies a line to the clipboard; paste it in the AI chat. Do not open Solari's handoff page on a phone: GET editor HTTP 401. Then auspex_await_login with saveEditor true. " +
  HANDOFF_PHONE_DOOR_BAN +
  " Never paste the password into chat."

export const HANDOFF_OPEN_ON_PHONE_NOVNC_FALLBACK =
  "Phone: Solari handoff is noVNC (a picture of Chrome). The phone software keyboard will not open there. Use a computer (handoff.desktopUrl, hardware keyboard) or remint auspex_login for the Auspex phone page. " +
  HANDOFF_PHONE_DOOR_BAN +
  " Never paste the password into chat."

export function handoffOpenOnDesktop(profileName: string): string {
  return `Computer: open handoff.desktopUrl, then Profiles → ${profileName} → Open editor. Type with the hardware keyboard, then Save. Do not send this URL to a phone.`
}

export const HANDOFF_OPEN_ON_DESKTOP_PAGE =
  "Computer: open handoff.url (chooser) or handoff.desktopUrl in the computer's browser. That is the Auspex desktop page (desktop.html), the same remote Chrome and the same link hash as the phone. Hardware keyboard. One typing field: click the remote login field, then paste. Keys go into remote Chrome and the site. They stay off agent chat, MCP, and receipts. Do not send this URL to a phone."

const HANDOFF_HANG_GUIDANCE =
  " If the handoff Chromium card is blank or spinning for more than 2 to 3 minutes, refresh once; if it stays unresponsive, remint with auspex_login (new handoff URL). Complete IdP consent in the handoff card before Save; do not open parallel agent checks mid-consent."

export function formatHandoffNext(opts: {
  urlHint?: string
  qrPath?: string
  profileName?: string
  hasPhoneIme?: boolean
  profileDerived?: boolean
  hasDesktopPage?: boolean
}): string {
  const where = opts.urlHint ? ` Sign in at ${opts.urlHint}.` : " Sign in."
  const qrBit = opts.qrPath
    ? " Phone QR is handoff.qrPath (encodes handoff.mobileUrl)."
    : ""
  const profile = opts.profileName?.trim() || "<yours>"
  const derived = opts.profileDerived ? `${derivedProfileNext(profile)} ` : ""
  const phone = opts.hasPhoneIme
    ? "Show handoff.url (chooser: Phone or Desktop, same hash). Labeled deep links: handoff.mobileUrl (Auspex phone page, real text field so the phone keyboard can open — seed/handoff door for off-site typing, not a same-session VNC takeover) and handoff.desktopUrl (desktop.html). Tap the remote Chrome to click, type or paste in the one field, tap Save on that page (copies to the clipboard; paste in the AI chat), then auspex_await_login with saveEditor true. Do not open Solari's handoff page on a phone (GET editor HTTP 401)."
    : "Show BOTH URLs, labeled. Phone: Solari handoff is noVNC (a picture of Chrome); the phone software keyboard will not open there. Prefer a computer."
  const computer = opts.hasDesktopPage
    ? "Computer: handoff.desktopUrl is the Auspex desktop page (desktop.html, same remote Chrome and the same link hash as the phone, hardware keyboard). One typing field: click the remote field, then paste. Keys go into remote Chrome and the site. They stay off agent chat, MCP, and receipts."
    : `Computer: handoff.desktopUrl, then Profiles → ${profile} → Open editor (hardware keyboard), then Save.`
  return (
    `${derived}${phone} ${computer} Never paste or type the password through the agent. ${HANDOFF_PHONE_DOOR_BAN}${where} ` +
    `Then auspex_await_login --profile ${profile} with saveEditor true (waits up to 30 minutes), then auspex_finalize_login --profile ${profile} (pass --url and --expect unless a saved check), then auspex_check --profile ${profile}. Do not skip finalize-login after Save. ` +
    (opts.hasPhoneIme
      ? `Off-site: paste handoff.oneLiner (chooser). Phone deep link: handoff.mobileUrl. Computer deep link: handoff.desktopOneLiner.`
      : `Off-site phone: paste handoff.oneLiner. Off-site computer: paste handoff.desktopOneLiner.`) +
    `${qrBit}${HANDOFF_HANG_GUIDANCE}`
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
    profileDerived: result.profileDerived,
    hasDesktopPage: Boolean(desktopHandoffUrlFromPhone(result.handoff.mobileUrl)),
  })
  result.nextCall = { tool: "auspex_await_login", profile: result.name, saveEditor: true }
  return result
}

export function qrPayloadForHandoff(handoff: HandoffPacket): string {
  if (isDoorUrl(handoff.url)) return handoff.url
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
  /** True when name was derived from --url host (no explicit --profile). */
  profileDerived?: boolean
  episodeId?: string
  remintCount?: number
  traceSummary?: string
  nextCall?: NextCall
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
  opts?: { profileDerived?: boolean },
): LoginResult {
  const where = urlHint ? ` Sign in at ${urlHint}.` : " Sign in."
  const profileDerived = opts?.profileDerived === true
  if (handoff?.url) {
    const phone = mobileUrl?.trim() || handoff.url
    const hasPhoneIme = isPhoneImeUrl(phone)
    const thinDesktop = desktopHandoffUrlFromPhone(phone)
    const chooser = doorHandoffUrlFromPhone(phone)
    const desktopUrl = thinDesktop ?? CONSOLE_PROFILES_URL
    const packetUrl = chooser || handoff.url
    const handoffPacket: HandoffPacket = {
      url: packetUrl,
      mobileUrl: phone,
      desktopUrl,
      openOnPhone: hasPhoneIme ? HANDOFF_OPEN_ON_PHONE : HANDOFF_OPEN_ON_PHONE_NOVNC_FALLBACK,
      openOnDesktop: thinDesktop ? HANDOFF_OPEN_ON_DESKTOP_PAGE : handoffOpenOnDesktop(profile.name),
      oneLiner: chooser ? `Auspex login: ${chooser}` : `Auspex login (phone): ${phone}`,
      desktopOneLiner: thinDesktop
        ? `Auspex login (computer): ${thinDesktop}`
        : `Auspex login (computer): ${CONSOLE_PROFILES_URL} → Profiles → ${profile.name} → Open editor`,
      savePaste: hasPhoneIme ? phoneSavePaste(profile.name) : undefined,
      qrPath,
    }
    const minted: LoginResult = {
      profileId: profile.id,
      name: profile.name,
      consoleUrl: CONSOLE_PROFILES_URL,
      handoff: handoffPacket,
      url: handoff.url,
      handoffId: handoff.handoffId,
      expiresAt: handoff.expiresAt,
      sinceVersion: handoff.version,
      profileDerived: profileDerived || undefined,
      next: formatHandoffNext({
        urlHint,
        qrPath,
        profileName: profile.name,
        hasPhoneIme,
        profileDerived,
        hasDesktopPage: Boolean(thinDesktop),
      }),
    }
    minted.nextCall = { tool: "auspex_await_login", profile: profile.name, saveEditor: true }
    return minted
  }
  const derived = profileDerived ? `${derivedProfileNext(profile.name)} ` : ""
  const missed: LoginResult = {
    profileId: profile.id,
    name: profile.name,
    consoleUrl: CONSOLE_PROFILES_URL,
    sinceVersion: handoff?.version,
    profileDerived: profileDerived || undefined,
    next: `${derived}Handoff mint returned no url. Remint with auspex_login. ${HANDOFF_PHONE_DOOR_BAN} Laptop-only fallback if a handoff URL cannot be minted: ${CONSOLE_PROFILES_URL} → Profiles → ${profile.name} → Open editor.${where} Hit Save (must store cookies or origins), then auspex_await_login --profile ${profile.name}, then auspex_finalize_login --profile ${profile.name} (pass --url and --expect unless a saved check), then auspex_check --profile ${profile.name}. Do not skip finalize-login after Save.${HANDOFF_HANG_GUIDANCE}`,
  }
  const loginCall: NextCall = { tool: "auspex_login" }
  if (profile.name.trim()) loginCall.profile = profile.name.trim()
  missed.nextCall = loginCall
  return missed
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
        const retryable = res.status === 502 || res.status === 503 || res.status === 504
        throw new AuspexError(err, {
          issue: { code: err, retryable, status: res.status },
        })
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
  if (!url) {
    throw new AuspexError("login-handoff returned no url", {
      issue: { code: "NoHandoffUrl", retryable: true },
    })
  }
  return {
    url: publicHandoffUrl(url),
    handoffId: typeof json.handoffId === "string" ? json.handoffId : undefined,
    expiresAt: typeof json.expiresAt === "string" ? json.expiresAt : undefined,
    version: typeof json.version === "number" ? json.version : undefined,
    hostKind: classifyHandoffHost(url),
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

export type EditorVncMint = {
  token?: string
  editorStartStatus: number
  tokenLastStatus?: number
  tokenTries: number
}

/** 200/201 ready, 202 Accepted (starting — poll token), 409 already running. */
export function editorStartOk(status: number): boolean {
  return status === 200 || status === 201 || status === 202 || status === 409
}

/** Phone-door mint stage. Empty token / failed VNC is never "ready". */
export function mintStageAfterVnc(
  mint: Pick<EditorVncMint, "token" | "editorStartStatus" | "tokenTries">,
  vncMintOk = Boolean(mint.token),
): Extract<LoginMintStage, "editor-start" | "editor-token" | "ready"> {
  if (vncMintOk) return "ready"
  const editorStartBad = mint.editorStartStatus !== 0 && !editorStartOk(mint.editorStartStatus)
  return editorStartBad ? "editor-start" : "editor-token"
}

/** Start the profile editor if needed and return the noVNC bearer token (never log the token). */
export async function fetchEditorVncToken(
  profileId: string,
  handoffToken: string,
  opts?: { post?: EditorPost; tries?: number; sleepMs?: number },
): Promise<EditorVncMint> {
  const token = handoffToken.trim()
  const id = profileId.trim()
  const tries = opts?.tries ?? 20
  if (!token || !id) return { editorStartStatus: 0, tokenTries: 0 }
  const post = opts?.post ?? (await defaultEditorPost(token))
  const sleepMs = opts?.sleepMs ?? 1000
  const start = await post(`/api/profiles/${encodeURIComponent(id)}/editor`)
  if (!editorStartOk(start.status)) {
    return { editorStartStatus: start.status, tokenTries: 0 }
  }
  let tokenLastStatus: number | undefined
  for (let i = 0; i < tries; i++) {
    const got = await post(`/api/profiles/${encodeURIComponent(id)}/editor/token`)
    tokenLastStatus = got.status
    const vnc = typeof got.json.token === "string" ? got.json.token.trim() : ""
    if (got.status === 200 && vnc) {
      return { token: vnc, editorStartStatus: start.status, tokenLastStatus, tokenTries: i + 1 }
    }
    if (i + 1 < tries && sleepMs > 0) {
      await new Promise((r) => setTimeout(r, sleepMs))
    }
  }
  return { editorStartStatus: start.status, tokenLastStatus, tokenTries: tries }
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
  opts?: { profileDerived?: boolean },
): Promise<LoginResult> {
  let mintStage: LoginMintStage = "key-check"
  try {
    mintStage = "profile-ensure"
    const profile = await ensureProfile(name)
    mintStage = "handoff-post"
    const client = http ?? (await defaultProfileHttp())
    const handoff = await requestLoginHandoff(
      profile.id,
      urlHint
        ? `Auspex login for profile ${profile.name}; start at ${urlHint}`
        : `Auspex login for profile ${profile.name}`,
      client,
    )
    const handoffToken = handoff.handoffId || handoffTokenFromUrl(handoff.url)
    if (handoffToken) {
      await persistEditorSave({
        profileId: profile.id,
        name: profile.name,
        handoffToken,
        expiresAt: handoff.expiresAt,
      }).catch(() => undefined)
    }
    const vncMint = await fetchEditorVncToken(profile.id, handoffToken)
    let mobileUrl: string | undefined
    if (vncMint.token) {
      mobileUrl = phoneHandoffUrl(vncMint.token, handoff.url, {
        profileId: profile.id,
        profileName: profile.name,
        handoffToken,
        expiresAt: handoff.expiresAt,
        keyInUse: true,
        siteUrl: urlHint,
      })
    }
    const result = loginInstructions(profile, urlHint, handoff, qrPath, mobileUrl, opts)
    const vncMintOk = Boolean(vncMint.token)
    const phoneDoor = isPhoneImeUrl(result.handoff?.mobileUrl)
      ? "ime"
      : result.handoff?.mobileUrl
        ? "novnc-fallback"
        : "none"
    mintStage = mintStageAfterVnc(vncMint, vncMintOk)
    const traced = await recordLoginTrace({
      event: "login",
      profile: result.name,
      phoneDoor,
      computerDoor: desktopHandoffUrlFromPhone(result.handoff?.mobileUrl) ? "desktop-page" : "console-editor",
      vncMintOk,
      mintStage,
      urlPresent: true,
      hostKind: handoff.hostKind,
      editorStartStatus: vncMint.editorStartStatus || undefined,
      tokenLastStatus: vncMint.tokenLastStatus,
      tokenTries: vncMint.tokenTries || undefined,
      expiresAt: result.expiresAt,
      sinceVersion: result.sinceVersion,
    })
    return { ...result, ...traced }
  } catch (err) {
    const issue = classifySolariError(err)
    if (issue.code === "MissingApiKey") mintStage = "key-check"
    await recordLoginTrace({
      event: "login",
      profile: name,
      mintStage,
      urlPresent: issue.code === "NoHandoffUrl" ? false : undefined,
      solariStatus: issue.status,
      solariCode: issue.code,
    }).catch(() => undefined)
    throw err
  }
}

/** Deletes saved logins by name through Solari profiles.delete. No username or password argument. */
export async function deleteSolariProfilesByName(names: readonly string[]): Promise<string[]> {
  if (names.length === 0) return []
  const solari = createClient()
  try {
    return await applyOperatorWipes(names, {
      list: async () => (await solari.profiles.list()).map((p) => ({ id: p.id, name: p.name })),
      deleteProfile: (id) => solari.profiles.delete(id),
    })
  } finally {
    await solari.close()
  }
}

/** Records a use, then wipes idle or human-agreed profiles. A delete failure leaves the stamp in place. */
export async function withOperatorSession(opts: {
  nowMs?: number
  note?: OperatorNote
  humanAgree?: boolean
  voluntary?: readonly string[]
  root?: string
}): Promise<{ agent: OperatorAgentNotice; wiped: string[] }> {
  return commitOperatorSession({
    root: opts.root ?? packageRoot,
    nowMs: opts.nowMs ?? Date.now(),
    note: opts.note,
    humanAgree: opts.humanAgree,
    voluntary: opts.voluntary,
    applyWipes: async (names) => {
      try {
        return await deleteSolariProfilesByName(names)
      } catch {
        return []
      }
    },
  })
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
