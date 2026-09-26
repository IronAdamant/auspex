/**
 * One door/await contract. Root AGENTS.md and llms.txt are stamped from these
 * strings. The package AGENTS.md is a pointer and is not stamped.
 * The app-visible refuse stays in the tool description.
 * Opposite table rows stay adjacent. Do not merge an IdP row with a fold row.
 */

export const DOOR_AWAIT_BEGIN = "<!-- auspex-door-await:begin -->"
export const DOOR_AWAIT_END = "<!-- auspex-door-await:end -->"
export const AWAIT_LOGIN_BEGIN = "<!-- auspex-await-login:begin -->"
export const AWAIT_LOGIN_END = "<!-- auspex-await-login:end -->"

export const DOOR_DETAIL = "Detail: docs/door-card-api.md and AGENTS.md."

/** Loud refuse. Tool copy includes this sentence. */
export const SIGN_IN_WALL_REMIN =
  "idpOnlyKind sign-in-wall: the human is still on Microsoft or Google — finish sign-in, land on the app UI, then Save, and remint."

/** Loud refuse. No nextCall and no finalize when the app is already on screen. */
export const APP_VISIBLE_REFUSE =
  "idpOnlyKind app-visible: liveHost is already the app. The dashboard on screen is not a saved login. " +
  "Solari handoff Save cannot read MSAL sessionStorage (no CDP). Do not remint to finish Microsoft. Do not finalize-login."

export type DoorDecisionRow = {
  status: string
  doThis: string
  dont: string
  nextCall: string
}

/**
 * Order is frozen. These pairs must stay adjacent and distinct:
 * app-visible | sign-in-wall, and no-cdp | bare stream-expired.
 */
export const DOOR_AWAIT_ROWS: readonly DoorDecisionRow[] = [
  {
    status: "`idp-only-save` / `app-visible`",
    doThis: "Stop. The dashboard on screen is not a saved login.",
    dont: "Do not finalize. Do not remint to finish Microsoft.",
    nextCall: "(none)",
  },
  {
    status: "`idp-only-save` / `sign-in-wall`",
    doThis: "Finish sign-in, land on the app UI, then Save.",
    dont: "Do not finalize this jar.",
    nextCall: "`auspex_login`",
  },
  {
    status: "`editorFold` `no-cdp` + app-host jar",
    doThis: "Finalize **now**, even if the JWT is already past.",
    dont: "Do not remint because of stream-expired alone. Do not `--verify-with-profile` on this fold.",
    nextCall: "`auspex_finalize_login`",
  },
  {
    status: "bare `stream-expired`",
    doThis: "Remint. The profile has no cookies.",
    dont: "Do not poll await-login for 30 minutes. A dropped socket before `exp` is not this row. Do not `POST /sessions` when this JWT is past and there is no completed seed.",
    nextCall: "`auspex_login`",
  },
  {
    status: "`weakSeed` (counted sessionStorage 0)",
    doThis: "Finalize-login while the token is live.",
    dont: "Do not `--verify-with-profile`. This row is not `app-visible`.",
    nextCall: "`auspex_finalize_login`",
  },
  {
    status: "`weakSeed` (stale `expiresOn`)",
    doThis: "Remint. Finalize only if the live editor tab is still on the app with a valid session.",
    dont: "Do not `--verify-with-profile`. This row is not `app-visible`.",
    nextCall: "`auspex_login`",
  },
  {
    status: "`emptySave`",
    doThis: "Remint. The profile is missing or empty.",
    dont: "Do not finalize-login.",
    nextCall: "`auspex_login`",
  },
  {
    status: "triad / `--verify-with-profile`",
    doThis: "Read `claimOkProfile`. That is the reuse gate.",
    dont: "Do not fold `claimOkProfile` into `ok`. `ok` is not `claimOk` and not `claimOkProfile`.",
    nextCall: "(none)",
  },
]

export function agentsDoorAwaitBlock(): string {
  const header = "| status | do | don't | nextCall |"
  const rule = "| --- | --- | --- | --- |"
  const lines = DOOR_AWAIT_ROWS.map(
    (row) => `| ${row.status} | ${row.doThis} | ${row.dont} | ${row.nextCall} |`,
  )
  const note =
    "Rows stay separate. Do not merge an IdP row with a fold row. " +
    "A jar that omits the app host is `idp-only-save` when sessionStorage is empty or stale and the cookie hosts are only Microsoft or Google sign-in hosts (including exact `google.com` and `www.google.com`), or when cookies are present and liveHost is already the app. " +
    "A `stream-expired` or timeout from that drain is not rewritten to finalize. " +
    "Finalize on an `app-visible` jar opens a new session and returns `needsHuman`. There is no `nextCall`. " +
    "The fold-miss row sets `status` to `completed` and `foldMiss` true. " +
    "After finalize writes the profile store, `--verify-with-profile` boots a fresh `POST /sessions` from that store (no editor JWT, no fold CDP). " +
    "Default `--save-editor` chains finalize when url and expect are known (`--no-chain-finalize` opts out)."
  return [
    "Decision table. Opposite rows stay adjacent. Do not merge an IdP row with a fold row.",
    "",
    header,
    rule,
    ...lines,
    "",
    note,
  ].join("\n")
}

export function agentsAwaitLoginBullet(): string {
  return (
    "- `auspex_await_login` / `auspex await-login` — wait until Save stored cookies or origins (default **30 minutes**, matching the cold login-handoff). " +
    "Returns status: **`completed`**, **`timeout`**, **`empty-save`** (a version bump with no cookies or origins is not success), " +
    "**`idp-only-save`**, **`waiting`**, **`host-changed`** (remint; do not save into the old profile), " +
    "**`stream-expired`**, **`editor-save-hung`** (do not finalize in parallel), **`profile-busy`** (retry await after that save ends). " +
    "IdP, fold-miss, bare `stream-expired`, `weakSeed`, and `emptySave` actions are the decision table in the frozen door-await block. Do not merge those rows and do not restate them here. " +
    "**`--save-editor` does not refresh folded sessionStorage** unless `editorFold.ok` (Solari editor is noVNC today; leftover count is not a fresh capture). " +
    "If `editorSave` fails (e.g. 401), remint — cookies are not proof of login. Remint if finalize-login returns `needsHuman`. " +
    "SPAs that keep tokens in sessionStorage still need `finalize-login` while the token is valid. Live inspect **forwards origin** so that sessionStorage warning can fire."
  )
}

/** Short If-stuck lines. Opposite pairs stay adjacent. Not a second copy of the AGENTS table. */
export function llmsDoorAwaitBlock(): string {
  return [
    "- `idp-only-save` / `app-visible`: do not finalize. Do not mint again to finish Microsoft. The picture is not a saved login.",
    "- `idp-only-save` / `sign-in-wall`: finish sign-in, land on the app UI, then Save, and mint again.",
    "- `editorFold` `no-cdp` and the jar includes the app host: finalize-login now, even if the window already died. Skip `--verify-with-profile` on that fold.",
    "- Bare `stream-expired` (no cookies): mint again. Skip a 30-minute wait. Do not treat this as finalize-now.",
  ].join("\n")
}

export function awaitLoginDescription(): string {
  return (
    "Treating an empty Save (a version bump with zero cookies) as success is a lie; the profile is still logged out. " +
    "Wait until Save stores cookies or origins (default 30 minutes). Pass saveEditor true after phone/desktop Save " +
    "(do not open Solari on a phone: GET editor HTTP 401). empty-save is not success. " +
    "If editorSave is 200 and editorFold is no-cdp and the jar includes the app host, finalize-login NOW even when the VNC JWT is past. " +
    "If the app host is missing from the jar (Microsoft or Google sign-in hosts, including google.com and www.google.com, or any cookies while liveHost is already the app), status is idp-only-save: do not finalize. " +
    `${SIGN_IN_WALL_REMIN} ${APP_VISIBLE_REFUSE} ` +
    "If editorSave fails, remint. Cookies alone are not proof of login. " +
    "Leftover sessionStorage is not a fresh capture. " +
    "Do not remint for stream-expired after editorSave 200 when the jar includes the app host. Do not verify-with-profile on that fold. " +
    "verify-with-profile after finalize uses a fresh session from the saved profile, not the editor JWT. " +
    "verify-with-profile is refused on weakSeed, emptySave, and a dead fold (no claim session). Save is not sessionStorage. " +
    "weakSeed with counted sessionStorage 0: finalize-login while the token is live. " +
    "emptySave: remint and do not finalize. " +
    "Stale folded expiresOn: remint. " +
    "None of these is app-visible. " +
    "Statuses: completed | timeout | empty-save | idp-only-save | waiting | host-changed | stream-expired | editor-save-hung | profile-busy. " +
    "saveEditor re-checks streamExpiresAt during the Save poll and caps the wait to that VNC stamp (plus a short grace). " +
    "Once that stamp is past and the profile has no cookies, status is stream-expired with a remint nextCall — not a 30-minute poll and not before the stamp. " +
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
