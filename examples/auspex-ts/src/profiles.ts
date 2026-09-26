import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { recordLoginTrace, type LoginMintStage } from "./login-trace.ts"
import { awaitSaveEditorNextCall, remintLoginNextCall, type NextCall } from "./next-call.ts"
import { AuspexError, classifySolariError } from "./errors.ts"
import { asFiniteNumber } from "./profile-persist.ts"
import { httpsOriginOnly, isHttpOrHttpsUrl } from "./http-url.ts"
import { derivedProfileNext, requireProfileName } from "./profile-slug.ts"
import {
  applyOperatorWipes,
  commitOperatorSession,
  wipeErrorMessage,
  type OperatorAgentNotice,
  type OperatorNote,
  type OperatorWipeDeps,
  type OperatorWipeReport,
  type WipeFailure,
} from "./operator-session.ts"
import {
  isPhoneImeUrl,
  phoneHandoffUrl,
  streamExpiryStamp,
  type PhoneExpirySource,
} from "./handoff-doors.ts"
import { packageRoot } from "./paths.ts"
import { BROWSER_API_BASE, createClient, requireApiKey } from "./solari.ts"
import {
  EDITOR_BUSY_STATUS,
  EDITOR_START_CONFLICT_REASON,
  editorHandoffCall,
  editorStartConflictGuide,
  fetchEditorVncToken,
  mintStageAfterVnc,
  stopProfileEditor,
  type EditorPost,
} from "./editor-vnc.ts"

export {
  EDITOR_BUSY_STATUS,
  EDITOR_START_CONFLICT_REASON,
  EDITOR_CONSOLE_ORIGIN,
  editorApiPath,
  editorHandoffCall,
  editorStartConflictGuide,
  editorStartOk,
  fetchEditorVncToken,
  mintStageAfterVnc,
  stopProfileEditor,
} from "./editor-vnc.ts"
export type { EditorPost, EditorVncMint, FetchEditorVncOpts } from "./editor-vnc.ts"

export {
  PHONE_HANDOFF_PAGE,
  HANDOFF_HASH_KEYS,
  handoffHash,
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
export { PROFILE_NAME_ERROR, profileNameSchema, requireProfileName } from "./profile-slug.ts"

export type EditorSaveHandle = {
  profileId: string
  name: string
  handoffToken: string
  expiresAt?: string
  /** Site URL from login --url. Used so await-login can see a host the agent does not repeat. */
  siteUrl?: string
  /** Live browser host diverged. Cleared by the next login mint. Not cookies. */
  hostChanged?: boolean
  suggestedUrl?: string
  suggestedProfile?: string
  /** Earliest VNC JWT / handoff expiry. ISO. The JWT itself is never stored. */
  streamExpiresAt?: string
  streamExpirySource?: PhoneExpirySource
  /** Profile version at mint, before the human Save. Await uses this when --since-version is omitted. */
  sinceVersion?: number
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
    const siteRaw = typeof raw.siteUrl === "string" ? raw.siteUrl.trim() : ""
    const siteUrl = siteRaw && isHttpOrHttpsUrl(siteRaw) ? siteRaw : undefined
    const suggestedUrl = raw.hostChanged === true ? httpsOriginOnly(typeof raw.suggestedUrl === "string" ? raw.suggestedUrl : "") : ""
    const suggestedProfile =
      suggestedUrl && typeof raw.suggestedProfile === "string" ? raw.suggestedProfile.trim() : ""
    const streamExpiresAt =
      typeof raw.streamExpiresAt === "string" && raw.streamExpiresAt.trim() ? raw.streamExpiresAt.trim() : undefined
    const streamExpirySource =
      raw.streamExpirySource === "expiresAt" || raw.streamExpirySource === "jwt" || raw.streamExpirySource === "unknown"
        ? raw.streamExpirySource
        : undefined
    const sinceVersion =
      typeof raw.sinceVersion === "number" && Number.isFinite(raw.sinceVersion) ? raw.sinceVersion : undefined
    return {
      profileId,
      name: profileName,
      handoffToken,
      expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : undefined,
      ...(siteUrl ? { siteUrl } : {}),
      ...(suggestedUrl && suggestedProfile
        ? { hostChanged: true as const, suggestedUrl, suggestedProfile }
        : {}),
      ...(streamExpiresAt ? { streamExpiresAt } : {}),
      ...(streamExpirySource ? { streamExpirySource } : {}),
      ...(sinceVersion !== undefined ? { sinceVersion } : {}),
    }
  } catch {
    return undefined
  }
}

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
  /** Phone door (phone.html) when VNC minted; else Solari handoff. Same page on a computer. */
  url: string
  /** Same phone.html URL when a VNC token was minted; else Solari handoff. */
  mobileUrl?: string
  openOnPhone?: string
  /** Human SMS / one link: the phone door when minted. */
  oneLiner?: string
  /** Copied on Save; paste into any agent chat. */
  savePaste?: string
  qrPath?: string
  /** Earliest VNC/handoff expiry as ISO. Optional extra key. Never the JWT. */
  streamExpiresAt?: string
  streamExpirySource?: PhoneExpirySource
}

export function phoneSavePaste(profileName?: string): string {
  const name = (profileName ?? "").trim() || "<yours>"
  return [
    `I tapped Save on the Auspex phone page for profile ${name}.`,
    `Run: npx auspex await-login --profile ${name} --save-editor`,
    `(MCP: auspex_await_login with saveEditor true).`,
    `Then: npx auspex finalize-login --profile ${name} --url <the URL the logged-in app lands on> --expect "<unique logged-in text>".`,
    `Never open Solari's editor on a phone (GET editor HTTP 401).`,
    `editorSave 200 with editorFold no-cdp → finalize-login NOW, even if the VNC JWT is past. --save-editor does not refresh folded sessionStorage unless editorFold.ok. Do not --verify-with-profile on that fold.`,
    `A different product is hostChanged → remint. A same-product rebrand is adopted (SkySQL and MariaDB).`,
    `Console Save stores cookies only. It cannot read sessionStorage (the handoff editor has no Playwright attach). An app already on screen is not saved by this button, and finalize-login cannot recover an IdP-only jar. Expect must be unique to the logged-in app surface, not marketing.`,
  ].join("\n")
}

/** Phone.html is IME + Save paste for an auth seed — not a live-session takeover. */
export const PHONE_HANDOFF_NOT_TAKEOVER =
  "Auspex phone.html is a seed/handoff door for off-site typing (IME + Save paste), not a same-session VNC takeover of the agent's live check."

/** Solari's handoff/editor is noVNC. iOS will not raise the software keyboard there. */
export const HANDOFF_PHONE_DOOR_BAN =
  "Never type in Solari's remote Chromium / noVNC card on a phone: that stream is a picture of Chrome, so the phone software keyboard will not open. " +
  PHONE_HANDOFF_NOT_TAKEOVER

export const HANDOFF_OPEN_ON_PHONE =
  "Open handoff.url (phone.html) in the phone's own Safari or Chrome, or on a computer. handoff.mobileUrl is that same page. Chrome on phone is the dogfood browser. That page has a real text field so the phone keyboard can open. Check Show as bullets so 1Password / iOS Passwords / Android / Chrome can autofill without leaving this tab; paste still works with bullets off. If you swipe out for a password manager or Mail (OTP), return before the link timer — phone.html pauses and reconnects the same VNC token and does not invent a live stream. Remint only when stream-expired. Click the remote address bar (or the remote field you mean to fill) before typing anything in the one field at the bottom. Keys stream into Solari remote Chrome as you type (no Paste button). Enter sends Enter and clears the local field. Clear empties the whole field. Show as bullets is off by default so a password manager can paste into the text field. ironadamant.com does not see the password or any keystrokes (keys go into Solari remote Chrome and the destination site only; the destination site logs its own login; they stay off agent chat / MCP / receipts). If cookies or cache are cleared, or the remote session or saved profile is wiped, type the login again. Auspex and ironadamant.com do not host those credentials or session secrets; they live only in the remote Chrome session and on the destination site. Then tap Save on that page (stay there). Save copies a line to the clipboard; paste it in the AI chat. Do not open Solari's handoff page on a phone: GET editor HTTP 401. Then auspex_await_login with saveEditor true. " +
  HANDOFF_PHONE_DOOR_BAN +
  " Never paste the password into chat."

export const HANDOFF_OPEN_ON_PHONE_NOVNC_FALLBACK =
  "Solari handoff is noVNC (a picture of Chrome). The phone software keyboard will not open there. Remint auspex_login for the Auspex phone page. " +
  HANDOFF_PHONE_DOOR_BAN +
  " Never paste the password into chat."

const HANDOFF_HANG_GUIDANCE =
  " If the handoff Chromium card is blank or spinning for more than 2 to 3 minutes, refresh once; if it stays unresponsive, remint with auspex_login (new handoff URL). Complete IdP consent in the handoff card before Save; do not open parallel agent checks mid-consent."

export function formatHandoffNext(opts: {
  urlHint?: string
  qrPath?: string
  profileName?: string
  hasPhoneIme?: boolean
  profileDerived?: boolean
}): string {
  const where = opts.urlHint ? ` Sign in at ${opts.urlHint}.` : " Sign in."
  const qrBit = opts.qrPath
    ? " Phone QR is handoff.qrPath (encodes handoff.url)."
    : ""
  const profile = opts.profileName?.trim() || "<yours>"
  const derived = opts.profileDerived ? `${derivedProfileNext(profile)} ` : ""
  const phone = opts.hasPhoneIme
    ? "Show handoff.url. That is the Auspex phone page (phone.html), the only login door, on a phone or a computer. handoff.mobileUrl is the same page. It has a real text field so the phone keyboard can open — seed/handoff door for off-site typing, not a same-session VNC takeover. Click the remote address bar (or the remote field you mean to fill) before typing anything. Keys stream as you type (no Paste button). Enter clears the local field. Clear empties the whole field. ironadamant.com does not see those keystrokes. Tap Save on that page (copies to the clipboard; paste in the AI chat), then auspex_await_login with saveEditor true. Do not open Solari's handoff page on a phone (GET editor HTTP 401)."
    : "Solari handoff is noVNC (a picture of Chrome). The phone software keyboard will not open there. Remint auspex_login for the Auspex phone page."
  return (
    `${derived}${phone} If cookies or cache are cleared, or the remote session or saved profile is wiped, type the login again. Auspex and ironadamant.com do not host those credentials or session secrets; they live only in the remote Chrome session and on the destination site. Never paste or type the password through the agent. ${HANDOFF_PHONE_DOOR_BAN}${where} ` +
    `Then auspex_await_login --profile ${profile} with saveEditor true (waits up to 30 minutes), then auspex_finalize_login --profile ${profile} (pass --url and --expect unless a saved check), then auspex_check --profile ${profile}. Do not skip finalize-login after Save. ` +
    (opts.hasPhoneIme
      ? `Off-site: paste handoff.oneLiner. The link is handoff.url (phone.html).`
      : `Off-site: remint auspex_login for the phone page.`) +
    `${qrBit}${HANDOFF_HANG_GUIDANCE}`
  )
}

function jwtFromHandoffMobileUrl(mobileUrl: string | undefined): string | undefined {
  if (!mobileUrl) return undefined
  try {
    const hash = new URL(mobileUrl).hash.replace(/^#/, "")
    const token = new URLSearchParams(hash).get("v")?.trim()
    return token || undefined
  } catch {
    return undefined
  }
}

/** Stamp optional streamExpiresAt on login JSON. Never writes the JWT. */
export function stampLoginStreamExpiry(result: LoginResult, expiresAt?: string): LoginResult {
  if (!result.handoff) return result
  const stamp = streamExpiryStamp({
    expiresAt: expiresAt ?? result.expiresAt,
    jwt: jwtFromHandoffMobileUrl(result.handoff.mobileUrl),
  })
  if (stamp.streamExpiresAt) result.handoff.streamExpiresAt = stamp.streamExpiresAt
  result.handoff.streamExpirySource = stamp.streamExpirySource
  return result
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
  })
  result.nextCall = awaitSaveEditorNextCall(result.name)
  return result
}

export function qrPayloadForHandoff(handoff: HandoffPacket): string {
  if (isPhoneImeUrl(handoff.url)) return handoff.url
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
  /** Set when a live editor could not be reused. `editor-busy` is Solari 409 after the token poll misses. */
  status?: string
  reason?: string
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
    const packetUrl = hasPhoneIme ? phone : handoff.url
    const handoffPacket: HandoffPacket = {
      url: packetUrl,
      mobileUrl: phone,
      openOnPhone: hasPhoneIme ? HANDOFF_OPEN_ON_PHONE : HANDOFF_OPEN_ON_PHONE_NOVNC_FALLBACK,
      oneLiner: hasPhoneIme ? `Auspex login: ${phone}` : `Auspex login (phone): ${phone}`,
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
      }),
    }
    minted.nextCall = awaitSaveEditorNextCall(profile.name)
    return stampLoginStreamExpiry(minted, handoff.expiresAt)
  }
  const derived = profileDerived ? `${derivedProfileNext(profile.name)} ` : ""
  const missed: LoginResult = {
    profileId: profile.id,
    name: profile.name,
    consoleUrl: CONSOLE_PROFILES_URL,
    sinceVersion: handoff?.version,
    profileDerived: profileDerived || undefined,
    next: `${derived}Handoff mint returned no url. Remint with auspex_login for the phone door. ${HANDOFF_PHONE_DOOR_BAN}${where} Hit Save (must store cookies or origins), then auspex_await_login --profile ${profile.name}, then auspex_finalize_login --profile ${profile.name} (pass --url and --expect unless a saved check), then auspex_check --profile ${profile.name}. Do not skip finalize-login after Save.${HANDOFF_HANG_GUIDANCE}`,
  }
  missed.nextCall = remintLoginNextCall(profile.name)
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

export async function saveProfileEditor(
  handle: EditorSaveHandle,
  opts?: { post?: EditorPost },
): Promise<{ ok: boolean; status: number; error?: string; json?: Record<string, unknown> }> {
  const post = opts?.post ?? (await editorHandoffCall(handle.handoffToken, "POST"))
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
    const siteUrl = urlHint && isHttpOrHttpsUrl(urlHint.trim()) ? urlHint.trim() : undefined
    const sinceVersion = typeof handoff.version === "number" && Number.isFinite(handoff.version) ? handoff.version : undefined
    if (handoffToken) {
      await persistEditorSave({
        profileId: profile.id,
        name: profile.name,
        handoffToken,
        expiresAt: handoff.expiresAt,
        ...(siteUrl ? { siteUrl } : {}),
        ...(sinceVersion !== undefined ? { sinceVersion } : {}),
      }).catch(() => undefined)
    }
    const vncMint = await fetchEditorVncToken(profile.id, handoffToken, {
      recover: Boolean(handoffToken),
    })
    let mobileUrl: string | undefined
    if (vncMint.token) {
      mobileUrl = phoneHandoffUrl(vncMint.token, handoff.url, {
        profileName: profile.name,
        expiresAt: handoff.expiresAt,
        siteUrl: urlHint,
      })
    }
    const streamStamp = streamExpiryStamp({ expiresAt: handoff.expiresAt, jwt: vncMint.token })
    if (handoffToken) {
      await persistEditorSave({
        profileId: profile.id,
        name: profile.name,
        handoffToken,
        expiresAt: handoff.expiresAt,
        ...(siteUrl ? { siteUrl } : {}),
        ...(sinceVersion !== undefined ? { sinceVersion } : {}),
        ...streamStamp,
      }).catch(() => undefined)
    }
    let result = loginInstructions(profile, urlHint, handoff, qrPath, mobileUrl, opts)
    if (!vncMint.token && vncMint.editorStartStatus === 409) {
      const guide = editorStartConflictGuide(profile.name)
      result = {
        ...result,
        status: EDITOR_BUSY_STATUS,
        reason: EDITOR_START_CONFLICT_REASON,
        next: guide.text,
        nextCall: guide.nextCall,
      }
      delete result.handoff
    }
    const vncMintOk = Boolean(vncMint.token) && result.status !== EDITOR_BUSY_STATUS
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

/**
 * Stop the handoff editor before profiles.delete.
 * No saved handoff token means there is nothing to DELETE; profile delete still runs.
 */
export async function stopEditorBeforeProfileDelete(
  row: { id: string; name: string },
  opts?: { root?: string; del?: EditorPost },
): Promise<void> {
  const saved = await loadEditorSave(row.name, opts?.root)
  const handoffToken = saved?.handoffToken.trim() ?? ""
  if (!handoffToken) return
  const profileId = saved?.profileId.trim() || row.id
  const stopped = await stopProfileEditor(profileId, handoffToken, opts?.del ? { del: opts.del } : undefined)
  if (!stopped.ok && stopped.status !== 0) {
    throw new Error(`editor stop HTTP ${stopped.status}`)
  }
}

/** Deletes saved logins by name through Solari profiles.delete. No username or password argument. */
export async function deleteSolariProfilesByName(
  names: readonly string[],
  deps?: OperatorWipeDeps,
): Promise<OperatorWipeReport> {
  if (names.length === 0) return { wiped: [], wipeFailed: [] }
  if (deps) return applyOperatorWipes(names, deps)
  const solari = createClient()
  try {
    return await applyOperatorWipes(names, {
      list: async () => (await solari.profiles.list()).map((p) => ({ id: p.id, name: p.name })),
      deleteProfile: (id) => solari.profiles.delete(id),
      stopEditor: (row) => stopEditorBeforeProfileDelete(row),
    })
  } finally {
    await solari.close()
  }
}

/** Records a use, then wipes idle or human-agreed profiles. A delete failure stays on wipeFailed and leaves the stamp. */
export async function withOperatorSession(opts: {
  nowMs?: number
  note?: OperatorNote
  humanAgree?: boolean
  voluntary?: readonly string[]
  root?: string
}): Promise<{ agent: OperatorAgentNotice; wiped: string[]; wipeFailed: WipeFailure[] }> {
  return commitOperatorSession({
    root: opts.root ?? packageRoot,
    nowMs: opts.nowMs ?? Date.now(),
    note: opts.note,
    humanAgree: opts.humanAgree,
    voluntary: opts.voluntary,
    applyWipes: async (names) => {
      try {
        return await deleteSolariProfilesByName(names)
      } catch (err) {
        const wipeFailed = names
          .map((name) => name.trim())
          .filter(Boolean)
          .map((name) => ({ name, error: wipeErrorMessage(err) }))
        return { wiped: [], wipeFailed }
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
