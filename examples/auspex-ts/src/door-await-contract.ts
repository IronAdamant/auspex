/**
 * One door/await contract. Root AGENTS.md and llms.txt are stamped from these
 * strings. The package AGENTS.md is a pointer and is not stamped.
 * MCP await-login points at the table columns. It does not restate IdP or fold rows.
 * Opposite table rows stay adjacent. Do not merge an IdP row with a fold row.
 */

export const DOOR_AWAIT_BEGIN = "<!-- auspex-door-await:begin -->"
export const DOOR_AWAIT_END = "<!-- auspex-door-await:end -->"
export const AWAIT_LOGIN_BEGIN = "<!-- auspex-await-login:begin -->"
export const AWAIT_LOGIN_END = "<!-- auspex-await-login:end -->"
export const LONG_RUN_BEGIN = "<!-- auspex-long-run:begin -->"
export const LONG_RUN_END = "<!-- auspex-long-run:end -->"

/** profile-status `next` when the live probe matched. Not a reuse gate and not a lease. */
export const LOGGED_IN_SEED_HEALTH =
  "loggedIn is a live probe. It is not claimOkProfile and not overnight-safe. " +
  "Before a long unattended loop, run check --verify-with-profile and read claimOkProfile. " +
  "ok is not claimOk and not claimOkProfile. " +
  "Longevity is the Solari profile and the site session, not an Auspex TTL. There is no keepalive."

export const NOT_OVERNIGHT_SAFE = "This seed is not overnight-safe."

/** Appended to a sign-in wall. Does not change nextCall. */
export const RE_GATE_STOP =
  "This is a re-gate. Stop the loop. One human door. Do not auto-fill a secret or claim a challenge is solved. " +
  NOT_OVERNIGHT_SAFE

export const NOT_A_LEASE =
  "That pass is not an overnight lease. Longevity is the Solari profile and the site session, not an Auspex TTL. There is no keepalive."

/** claimOkProfile false. Points at the door table. Does not merge app-visible with finalize-now. */
export const CLAIM_FALSE_STOP =
  "claimOkProfile=false — do not reuse this seed. Stop the loop. Follow the door table once. " +
  "Do not retry this check to chase claimOkProfile. " +
  "auspex_login only when that row's nextCall is auspex_login. " +
  "This is not app-visible and not a keepalive."

export const SEED_HEALTH_TOOL_LINE =
  "loggedIn is a live probe, not claimOkProfile, and not overnight-safe. " +
  "Before a long unattended loop, read claimOkProfile. There is no keepalive."

export const RE_GATE_TOOL_LINE =
  "A finished job is not a 24–48h lease. " +
  "On a sign-in wall, a fresh challenge, bare stream-expired, or a non-reusable seed, stop and follow that row's nextCall once. " +
  "app-visible has no remint. editorFold no-cdp with the app host stays finalize-now. There is no Auspex keepalive."

export const LONG_RUN_CLI_LINE =
  "Long unattended loop: profile-status, then claimOkProfile on an auth-gated host. " +
  "ok, loggedIn, weakSeed, and app-visible are not overnight-safe. " +
  "On re-gate, stop and take that row's nextCall once. No Auspex TTL or keepalive."

export const DOOR_DETAIL = "Detail: docs/door-card-api.md and AGENTS.md."

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
  {
    status: "seed health (before and during a job)",
    doThis:
      "Run `profile-status`, then `--verify-with-profile` on an auth-gated host. Reuse the seed only when `claimOkProfile` is true.",
    dont: "Do not treat `ok`, `loggedIn`, `weakSeed`, IdP-only, or `app-visible` as overnight-safe. No Auspex keepalive or TTL.",
    nextCall: "(none)",
  },
  {
    status: "`re-gate` (sign-in wall, fresh challenge, bare `stream-expired`, or a non-reusable seed)",
    doThis: "Stop the loop. Take the matching row once. That status stays the clear status.",
    dont:
      "Do not auto-fill a password, OTP, or CAPTCHA. Do not claim a challenge is solved. Do not remint `app-visible`. Do not skip finalize-now on `editorFold` `no-cdp`. Do not burn hours retrying.",
    nextCall: "`auspex_login` once, only when the matching row's nextCall is `auspex_login`",
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
  const longRunNote =
    "Seed health and re-gate are their own rows at the end of this table. They do not replace the rows above. " +
    "`loggedIn` is a live probe, not `claimOkProfile`, and not overnight-safe. " +
    "A long loop has no Auspex TTL and no keepalive. On re-gate, stop and take the matching row once. " +
    "`app-visible` stays (none). `editorFold` `no-cdp` with the app host in the jar stays finalize now."
  return [
    "Decision table. Opposite rows stay adjacent. Do not merge an IdP row with a fold row.",
    "",
    header,
    rule,
    ...lines,
    "",
    note,
    "",
    longRunNote,
  ].join("\n")
}

export function agentsAwaitLoginBullet(): string {
  return (
    "- `auspex_await_login` / `auspex await-login` — wait until Save stored cookies or origins (default **30 minutes**, matching the cold login-handoff). " +
    "Returns status: **`completed`**, **`timeout`**, **`empty-save`** (a version bump with no cookies or origins is not success), " +
    "**`idp-only-save`**, **`waiting`**, **`host-changed`** (remint; do not save into the old profile), " +
    "**`stream-expired`**, **`editor-save-hung`** (do not finalize in parallel), **`profile-busy`** (retry await after that save ends). " +
    "IdP, fold-miss, bare `stream-expired`, `weakSeed`, `emptySave`, seed health, and re-gate actions are the decision table in the frozen door-await block. Do not merge those rows and do not restate them here. " +
    "Do not merge seed health or re-gate into `app-visible` or into finalize-now. " +
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
    "IdP, fold, bare stream-expired, weakSeed, emptySave, seed health, and re-gate are one door decision table: status | do | don't | nextCall. " +
    "Follow that row. Do not restate it. Do not merge an IdP row with a fold row. " +
    "app-visible, sign-in-wall, editorFold no-cdp finalize-now, and bare stream-expired stay separate rows. " +
    "If editorSave fails (for example 401), cookies are not proof of login. Follow the table. " +
    "Leftover sessionStorage is not a fresh capture. Save is not sessionStorage. " +
    "verify-with-profile is refused on weakSeed, emptySave, and a dead fold (no claim session). " +
    "That refuse is the table don't column. It does not add a nextCall. " +
    "Statuses: completed | timeout | empty-save | idp-only-save | waiting | host-changed | stream-expired | editor-save-hung | profile-busy. " +
    "saveEditor re-checks streamExpiresAt during the Save poll and caps the wait to that VNC stamp (plus a short grace). " +
    "Once that stamp is past and the profile has no cookies, status is stream-expired. Follow that row's nextCall. Do not poll for 30 minutes. " +
    "If profile is not the host slug: profileHostMatch false, suggestedProfile (soft advise). " +
    "Live host divergence: hostChanged, remint auspex_login. " +
    DOOR_DETAIL
  )
}

/** Stamped into root AGENTS.md. Plain-language long-loop contract. Not a new tool. */
export function agentsLongRunBlock(): string {
  return [
    "A saved profile can keep working after the five-minute typing window dies. How long it lasts is Solari and the site. Auspex does not set a 24–48 hour timer, and it does not send a keepalive.",
    "",
    "Before you leave a loop running, and again before you treat an older pass as still true:",
    "",
    "1. `profile-status` with that profile, the app URL, and the expect. `loggedIn` means the live probe saw the expect. The `next` line on that result says this is not `claimOkProfile` and not overnight-safe. It does not set `nextCall`.",
    "2. On an auth-gated host, `check --verify-with-profile`. Read `claimOkProfile`. That field is the reuse gate. `ok` is not `claimOk` and not `claimOkProfile`.",
    "",
    "The heartbeat is that pair of checks. There is no other ping.",
    "",
    "`weakSeed`, an IdP-only jar, and `app-visible` are not overnight-safe. `claimOkProfile` true is evidence you can reuse the seed for another check. It is not a lease.",
    "",
    "If the loop hits a sign-in wall, a fresh challenge (a new password, code, or challenge page), a dead typing window with no cookies (bare `stream-expired`), or a seed you cannot reuse: stop. The clear status is the matching row in the door table. Take that row's `nextCall` once. The human door is `auspex_login` only when that nextCall is `auspex_login`. Do not type a password, OTP, or CAPTCHA answer. Do not claim the challenge is solved. Do not keep the loop running for hours.",
    "",
    "`app-visible` still has no `nextCall`. Do not mint again to finish Microsoft. `editorFold` `no-cdp` with the app host in the jar is still finalize now, even if the window already died. A counted `sessionStorage === 0` while the token is live is still finalize-login, not a remint. Those rows stay separate from each other.",
  ].join("\n")
}

/** Stamped into llms.txt. Short door. Same stops as the AGENTS section. */
export function llmsLongRunBlock(): string {
  return [
    "A saved login can outlast the five-minute window. That span is the Solari profile and the site session, not an Auspex timer. There is no keepalive.",
    "",
    "Before a long unattended loop, run `profile-status`, then on an auth-gated host `check --verify-with-profile` and read `claimOkProfile`. `ok`, `loggedIn`, `weakSeed`, and `app-visible` are not overnight-safe.",
    "",
    "If you hit a sign-in wall, a fresh challenge, a dead typing window with no cookies, or a seed you cannot reuse: stop. One human door when the door table says `auspex_login`. Do not type a secret. Do not claim a CAPTCHA is solved. Do not keep checking for hours.",
    "",
    "`app-visible` still means stop with no mint. `editorFold` `no-cdp` with the app host in the jar still means finalize now.",
  ].join("\n")
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
