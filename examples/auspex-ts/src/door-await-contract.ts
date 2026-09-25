/**
 * One door/await contract. AGENTS.md, the package AGENTS.md, llms.txt, and
 * auspex_await_login tool copy are stamped from these strings.
 * The app-visible refuse stays in the tool description.
 */

export const DOOR_AWAIT_BEGIN = "<!-- auspex-door-await:begin -->"
export const DOOR_AWAIT_END = "<!-- auspex-door-await:end -->"
export const AWAIT_LOGIN_BEGIN = "<!-- auspex-await-login:begin -->"
export const AWAIT_LOGIN_END = "<!-- auspex-await-login:end -->"

export const DOOR_DETAIL = "Detail: docs/door-card-api.md and AGENTS.md."

/** Loud refuse. Tool copy and both AGENTS files include this sentence. */
export const SIGN_IN_WALL_REMIN =
  "idpOnlyKind sign-in-wall: the human is still on Microsoft or Google — finish sign-in, land on the app UI, then Save, and remint."

/** Loud refuse. No nextCall and no finalize when the app is already on screen. */
export const APP_VISIBLE_REFUSE =
  "idpOnlyKind app-visible: liveHost is already the app. The dashboard on screen is not a saved login. " +
  "Solari handoff Save cannot read MSAL sessionStorage (no CDP). Do not remint to finish Microsoft. Do not finalize-login."

export function agentsFoldBullet(): string {
  return (
    "- `editorSave` 200 + `editorFold` `no-cdp` (or any fold that cannot refresh sessionStorage) with cookies is **finalize-login now**, even if the JWT is already past, when the jar includes the app host. " +
    "`status` is `completed`, `foldMiss` is true, `nextCall` is `auspex_finalize_login`. Do not remint because of stream-expired alone. " +
    "A jar that omits the app host is `idp-only-save` when cookie hosts are only Microsoft or Google sign-in hosts (including exact `google.com` and `www.google.com`) or when cookies are present and liveHost is already the app. " +
    "Empty or stale sessionStorage is required. Do not poll until JWT death after editorSave already inspected that jar. " +
    "A stream-expired or timeout from that drain is not rewritten to finalize. Do not finalize that seed. " +
    `${SIGN_IN_WALL_REMIN} ${APP_VISIBLE_REFUSE} ` +
    "There is no `nextCall`. Finalize on that jar opens a new session and returns `needsHuman`. Do not `--verify-with-profile` on that fold. " +
    "After finalize writes the profile store, `--verify-with-profile` boots a **fresh** `POST /sessions` from that store (no editor JWT, no fold CDP). " +
    "Default `--save-editor` chains finalize when url and expect are known (`--no-chain-finalize` opts out)."
  )
}

export function agentsAwaitLoginBullet(): string {
  return (
    "- `auspex_await_login` / `auspex await-login` — wait until Save stored cookies or origins (default **30 minutes**, matching the cold login-handoff). " +
    "Returns status: **`completed`** (success), **`timeout`** (deadline exceeded), **`empty-save`** (Save bumped version but stored no cookies/origins), " +
    "**`idp-only-save`** (cookies are only Microsoft or Google sign-in hosts; `idpOnlyKind` `sign-in-wall` remints, `app-visible` has no nextCall), " +
    "**`waiting`** (still polling), **`host-changed`** (live https host diverged; remint, do not save into the old profile), " +
    "**`stream-expired`** (VNC `streamExpiresAt` past; the Save poll is capped to that stamp plus a short grace; remint `auspex_login`, do not wait 30 minutes), " +
    "**`editor-save-hung`** (editorSave/fold timed out; do not finalize in parallel), **`profile-busy`** (save lock held; retry await after that save ends). " +
    "Empty Save is not success. Soft-warns if profile has cookies/origins but no sessionStorage, or folded `__auspex_ss__:expiresOn` is past/within ~5m (leftover count is not fresh). " +
    "Stale/weak `next` remint or finalize-now — do **not** run `--verify-with-profile` on a dead fold (`claimOkProfile` will not pass). " +
    "**`--save-editor` does not refresh folded sessionStorage** unless `editorFold.ok` (Solari editor is noVNC today; leftover count is not a fresh capture). " +
    "`editorSave` 200 with `editorFold` `no-cdp` and cookies that include the app host: `next` says finalize-login NOW. " +
    "An IdP-only jar is `idp-only-save` (`sign-in-wall` remints `auspex_login`; `app-visible` has no nextCall and must not be finalized). " +
    `${SIGN_IN_WALL_REMIN} ${APP_VISIBLE_REFUSE} ` +
    "If `editorSave` fails (e.g. 401), remint — cookies are not proof of login. Remint if finalize-login returns `needsHuman`. " +
    "SPAs that keep tokens in sessionStorage still need `finalize-login` while the token is valid. Live inspect **forwards origin** so that sessionStorage warning can fire."
  )
}

export function llmsDoorAwaitBlock(): string {
  return [
    "- Save returned 200 but could not refresh in-tab session storage, and the jar already includes the app host. Run finalize-login now. Skip `--verify-with-profile` on that fold.",
    "- Save returned 200, the app is already on screen, and the jar is still only Microsoft or Google cookies (in-tab session storage 0). Status `idp-only-save`, kind `app-visible`. Do not finalize. Do not mint again to finish Microsoft. The picture is not a saved login.",
  ].join("\n")
}

export function awaitLoginDescription(): string {
  return (
    "Treating an empty Save (a version bump with zero cookies) as success is a lie; the profile is still logged out. " +
    "Wait until Save stores cookies or origins (default 30 minutes). Pass saveEditor true after phone/desktop Save " +
    "(do not open Solari on a phone: GET editor HTTP 401). empty-save is not success. " +
    "If editorSave is 200 and editorFold is no-cdp and the profile has cookies, finalize-login NOW even when the VNC JWT is past. " +
    "If the app host is missing from the jar (Microsoft or Google sign-in hosts, including google.com and www.google.com, or any cookies while liveHost is already the app), status is idp-only-save: do not finalize. " +
    `${SIGN_IN_WALL_REMIN} ${APP_VISIBLE_REFUSE} ` +
    "If editorSave fails, remint. Cookies alone are not proof of login. " +
    "Leftover sessionStorage is not a fresh capture. " +
    "Do not remint for stream-expired after editorSave 200 when cookies exist. Do not verify-with-profile on that fold. " +
    "verify-with-profile after finalize uses a fresh session from the saved profile, not the editor JWT. " +
    "verify-with-profile is refused on weakSeed, emptySave, and a dead fold (no claim session). Save is not sessionStorage. " +
    "Stale/weak next: remint or finalize-now. " +
    "Statuses: completed | timeout | empty-save | idp-only-save | waiting | host-changed | stream-expired | editor-save-hung | profile-busy. " +
    "saveEditor re-checks streamExpiresAt during the Save poll and caps the wait to that VNC stamp (plus a short grace). " +
    "Once that stamp is past, status is stream-expired with a remint nextCall — not a 30-minute poll and not before the stamp. " +
    "If profile is not the host slug: profileHostMatch false, suggestedProfile (soft advise). " +
    "Live host divergence: hostChanged, remint auspex_login. " +
    DOOR_DETAIL
  )
}

export function replaceMarked(text: string, begin: string, end: string, body: string): string {
  const start = text.indexOf(begin)
  const finish = text.indexOf(end, start + begin.length)
  if (start < 0 || finish < 0) throw new Error(`missing markers ${begin}`)
  return `${text.slice(0, start)}${begin}\n${body.trim()}\n${text.slice(finish)}`
}

export function extractMarked(text: string, begin: string, end: string): string {
  const start = text.indexOf(begin)
  const finish = text.indexOf(end, start + begin.length)
  if (start < 0 || finish < 0) throw new Error(`missing markers ${begin}`)
  return text.slice(start + begin.length, finish).trim()
}
