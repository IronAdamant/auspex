# Auspex — for agents (any host)

Source of truth for CLI, Cursor, Claude Code, Codex, and raw shell. Cursor rules in this repo are a pointer, not the only how-to-run.

We do **not** claim Alice-vs-Bob wrong-account detection. A seeded profile can still be the wrong Microsoft user and match expect.

Quick card: [llms.txt](llms.txt). Human front door: [README.md](README.md).

## If stuck, read this

- **Door table** — [Frozen agent door sequence](#frozen-agent-door-sequence). `app-visible`: do not finalize and do not remint. `sign-in-wall`: remint. `editorFold` `no-cdp` with the app host in the jar: finalize now. Bare `stream-expired`: remint. Encyclopedia: [docs/stream-jwt-solari.md](docs/stream-jwt-solari.md#remint-nextcall-frozen). Auspex cannot extend the VNC JWT.
- **429 / reap** — [Rules](#rules) and `auspex_reap`. Not retryable while the slot is held.
- **`expectMatchedPublicLanding`** — [Frozen agent door sequence](#frozen-agent-door-sequence). Expect hit a public or landing URL during save.
- **`hostChanged`** — [Frozen agent door sequence](#frozen-agent-door-sequence) and [Rules](#rules). Remint for the live https origin. Do not save into the old jar.
- **`weakSeed` / `emptySave`** — separate rows in that same table. Save is not sessionStorage. `--verify-with-profile` is refused on `weakSeed`, `emptySave`, and a dead fold (no claim session).
- **Schema v1** — [Receipt schema v1](#receipt-schema-v1-frozen). Required keys stay frozen.
- **Job compose** — [Autonomous agents](#autonomous-agents-job-compose). Prefer `auspex_job`; step tools stay for debugging.
- **Long run** — [Long unattended loops](#long-unattended-loops). Check seed health before you leave a loop running. On re-gate, stop. Longevity is the Solari profile and the site session, not an Auspex TTL.
- **Ops runbook** — [docs/ops-runbook.md](docs/ops-runbook.md). Heartbeat cadence, remint versus re-gate, who opens the human door, and when to stop the loop.

## First calls

From npm (no clone): `npx auspex-solari <command>`. MCP: `npx -p auspex-solari auspex-mcp`. Do not use npm `auspex` (a different scraper). After clone: `npm install && npm run build:mcp`, then `npx auspex` / `npx auspex-mcp`.

From the repository root after `npm install` and `export SOLARI_API_KEY`. Clone MCP also needs `npm run build:mcp` (`dist/` is gitignored):

```bash
npx auspex check --name ironadamant
npx auspex check https://example.com --expect "Example Domain"
# any Microsoft-gated host (their URL + expect unless a saved check):
npx auspex profile-status --profile app-example --url https://app.example --expect "Workspace ready"
npx auspex login --url https://app.example
# derives --profile app-example from the URL host; override with --profile <yours>
# New host: omit --profile or pass that host's slug. Mismatch sets profileHostMatch false and suggestedProfile; remint.
# Human: handoff.url (Phone or Desktop). Phone: handoff.mobileUrl. Desktop: handoff.desktopUrl. tap Save on that page. Do not intern-ping. Do not open Solari (GET editor HTTP 401).
# If mint is silent or login fails, read traceSummary / npx auspex trace before reminting.
npx auspex await-login --profile app-example --save-editor
npx auspex finalize-login --profile app-example --url https://app.example --expect "Workspace ready"
npx auspex check --profile app-example --url https://app.example --expect "Workspace ready"   # never --record
npx auspex reap                                 # after 429
npm run build:mcp                               # clone MCP; dist/ is gitignored — do not commit it
npx auspex-mcp
```

Never type passwords. Never `--record` a logged-in session. Do not call `auspex_verify` after a default check. The named sandbox desktop demo (`auspex_desktop`) is not a first call. The login desktop door is part of `auspex login` (chooser → phone or desktop). The generic path above is the recipe. A named saved check is optional; see [Worked example (dogfood)](#worked-example-dogfood).

Expect on an auth-gated host must be unique to the logged-in app surface and must not appear in public marketing copy. Match is case-sensitive and word-bounded: `Dashboard` does not match `Dashboards` or the capitalized phrase `One Dashboard` (Socialaize-style). If finalize-login still hits expect text on `/`, `/landing`, `/login`, `/signup`, or `/auth`, `reason` is `expectMatchedPublicLanding` (`ok` false, `matched` false, profile not saved). Pass a real app URL and a better expect.

Use Auspex when you need **evidence from a live web page**. You drive a **Solari cloud Chrome** (its own remote instance, not the human's local browser). Snapshot text + PNG, check a claim, close. The human does not watch that window.

Do **not** use it for pages you can already curl, for generic research crawls, or instead of Browser Use when the job is "click around in the user's already-open Chrome."

This repo ships optional saved checks (`--name ironadamant|checkpoint|consistencyhub`) for those three hosts only. Strangers verifying *their* site should use `login --url <https>` (derives `--profile` from the host; override `--profile <yours>`) plus their URL and expect — do not invent that any host works without dogfood.

Three primitives: browser check, sandbox verify, named sandbox desktop demo. Login, finalize-login, profile-status, reap, and trace are the auth + hygiene doors. No fourth primitive. `auspex_desktop` (Mousepad) is not the user's Mac. The login desktop door is `docs/desktop.html`.

## Frozen agent door sequence

Operators and agents: this is the **one** door-card sequence. It is a seed/handoff door for off-site typing — **not** a Handraise-style same-session live-view takeover.

1. **Mint** `login --url <https>` (derives `--profile` host slug; override `--profile <yours>`). Chooser is `handoff.url` (Phone or Desktop, same hash).
2. **Human logs in** in the door / VNC window. Secrets never appear on the agent line, chat, MCP, or receipts.
3. **Human Save** (desktop Save or phone path). Paste the copied line in chat; the IME is cleared.
4. **`await-login --save-editor`**, then **`finalize-login`** with `--url` and an expect unique to the logged-in app (absent from public marketing).
5. Later **`check`**. Optional `--verify-with-profile`. Triad stays honest: **`ok` ≠ `claimOk` ≠ `claimOkProfile`**. After VWP, `claimOkProfile` is the reuse gate.

The remote screen is not the seed. An IdP app, especially MSAL, can already show the logged-in app while Save stored only Microsoft or Google cookies (`idp-only-save`, kind `app-visible`). Do not finalize that jar, and do not remint to finish Microsoft. That stop is fail-closed honesty. Finalize only when the jar is the app session. ConsistencyHub and OneDrive are evidence, not the recipe. Strangers use `login --url <https>` (profile from the host), then Save, then `await-login --save-editor`.

Fail-closed already on tip:
- `expectMatchedPublicLanding` (#61) — expect hit on `/`, `/landing`, `/login`, `/signup`, or `/auth` during save (`ok` false, `matched` false, profile not saved). Use a real app URL and a better expect.
- `hostChanged` (#62) — live https host diverged from the minted door URL. Remint `auspex_login --profile <suggestedProfile> --url <suggestedUrl>`. Do not save into the old jar.
- `stream-expired` — the VNC/phone JWT or stored `streamExpiresAt` is past and the profile has no cookies. A dropped socket while that stamp is still ahead is not this status. Solari owns the ~5 minute editor JWT (`POST /editor/token` has no TTL). Auspex cannot lengthen it. The action is the bare `stream-expired` row in the table below. See [docs/stream-jwt-solari.md](docs/stream-jwt-solari.md).
<!-- auspex-door-await:begin -->
Decision table. Opposite rows stay adjacent. Do not merge an IdP row with a fold row.

| status | do | don't | nextCall |
| --- | --- | --- | --- |
| `idp-only-save` / `app-visible` | Stop. The dashboard on screen is not a saved login. | Do not finalize. Do not remint to finish Microsoft. | (none) |
| `idp-only-save` / `sign-in-wall` | Finish sign-in, land on the app UI, then Save. | Do not finalize this jar. | `auspex_login` |
| `editorFold` `no-cdp` + app-host jar | Finalize **now**, even if the JWT is already past, when the jar is not cookie-strong or local-storage-auth. | Do not remint because of stream-expired alone. Do not `--verify-with-profile` on this fold. | `auspex_finalize_login` |
| bare `stream-expired` | Remint. The profile has no cookies. | Do not poll await-login for 30 minutes. A dropped socket before `exp` is not this row. Do not `POST /sessions` when this JWT is past and there is no completed seed. | `auspex_login` |
| `cookie-strong` / `local-storage-auth` | Solari Save already holds app-origin cookies and/or allowlisted localStorage auth key names. sessionStorage 0 is expected. Run check --verify-with-profile and read claimOkProfile. | Do not call this weakSeed. Do not finalize to invent sessionStorage. Do not treat solariSaveReady as claimOkProfile. IdP hosts alone stay the IdP rows. | `auspex_check` |
| `weakSeed` (counted sessionStorage 0) | Finalize-login while the token is live. | Do not `--verify-with-profile`. This row is not `app-visible`. | `auspex_finalize_login` |
| `weakSeed` (stale `expiresOn`) | Remint. Finalize only if the live editor tab is still on the app with a valid session. | Do not `--verify-with-profile`. This row is not `app-visible`. | `auspex_login` |
| `emptySave` | Remint. The profile is missing or empty. | Do not finalize-login. | `auspex_login` |
| triad / `--verify-with-profile` | Read `claimOkProfile`. That is the reuse gate. | Do not fold `claimOkProfile` into `ok`. `ok` is not `claimOk` and not `claimOkProfile`. | (none) |
| seed health (before and during a job) | Run `profile-status`, then `--verify-with-profile` on an auth-gated host. Reuse the seed only when `claimOkProfile` is true. | Do not treat `ok`, `loggedIn`, `weakSeed`, `solariSaveReady`, IdP-only, or `app-visible` as overnight-safe. No Auspex keepalive or TTL. | (none) |
| `re-gate` (sign-in wall, fresh challenge, bare `stream-expired`, or a non-reusable seed) | Stop the loop. Take the matching row once. That status stays the clear status. | Do not auto-fill a password, OTP, or CAPTCHA. Do not claim a challenge is solved. Do not remint `app-visible`. Do not skip finalize-now on `editorFold` `no-cdp`. Do not burn hours retrying. | `auspex_login` once, only when the matching row's nextCall is `auspex_login` |

Rows stay separate. Do not merge an IdP row with a fold row. A jar that omits the app host is `idp-only-save` when sessionStorage is empty or stale and the cookie hosts are only Microsoft or Google sign-in hosts (including exact `google.com` and `www.google.com`), or when cookies are present and liveHost is already the app. A `stream-expired` or timeout from that drain is not rewritten to finalize. Finalize on an `app-visible` jar opens a new session and returns `needsHuman`. There is no `nextCall`. The fold-miss row sets `status` to `completed` and `foldMiss` true. After finalize writes the profile store, `--verify-with-profile` boots a fresh `POST /sessions` from that store (no editor JWT, no fold CDP). Default `--save-editor` chains finalize when url and expect are known (`--no-chain-finalize` opts out). A `cookie-strong` or `local-storage-auth` jar already has app-origin cookies or allowlisted localStorage auth key names. Counted sessionStorage 0 is expected on editor Save. `nextCall` is `auspex_check`. `solariSaveReady` is not `claimOkProfile`. Do not finalize to invent sessionStorage.

Seed health and re-gate are their own rows at the end of this table. They do not replace the rows above. `loggedIn` is a live probe, not `claimOkProfile`, and not overnight-safe. A long loop has no Auspex TTL and no keepalive. On re-gate, stop and take the matching row once. `app-visible` stays (none). `editorFold` `no-cdp` with the app host in the jar stays finalize now when the jar is not cookie-strong or local-storage-auth. A cookie-strong or local-storage-auth Save runs check --verify-with-profile. solariSaveReady is not claimOkProfile.
<!-- auspex-door-await:end -->
- Same-product host move (explicit alias, today `app.skysql.com` and `cloud.mariadb.com`) updates the profile canonical URL and continues finalize. A different product stays `hostChanged` and remints.
- `editor-save-hung` / `profile-busy` — editorSave/fold timed out or the save lock is held. Do not run finalize-login in parallel.

### Phone + password manager (Chrome-on-phone dogfood)

Desktop is **not** the product answer for this path. Phone must work standalone.

- **Dogfood browser:** open `handoff.mobileUrl` in the phone's own Safari or Chrome (Safari also works). Operator note only — `phone.html` has no dogfood banner.
- **Autofill without leaving Chrome:** the typing field is password-manager discoverable (`autocomplete="current-password"`, pairing `username` field, form that cannot POST). Check **Show as bullets** for a real `type=password` box (1Password / iOS Passwords / Android / Chrome). Paste still works with bullets off. **SMS / email code** sets `one-time-code`. Keys still stream only into remote Chrome; ironadamant.com does not see or store them.
- **Brief background:** mobile Chrome suspends the WebSocket. The door **pauses** (does not mark `stream-expired`) and **reconnects the same VNC JWT** on visibility return. It does not invent a live stream.
- **Solari limit (verified in-repo):** editor VNC tokens live ~305s (`streamExpirySource: jwt`). `POST /editor/token` has no TTL body. Door hash keys are `v,n,exp,u` only — no handoff token, no Solari HTTP from Pages. The JWT **cannot** be extended client-side. The door timer is the minted hash `exp` (same stamp as `streamExpiresAt`). A dropped socket while that stamp is still ahead reconnects; it is not `stream-expired`. After `exp`, `stream-expired` + remint `nextCall` stays honest.

Door-card JSON + remint examples: [docs/door-card-api.md](docs/door-card-api.md).

Do not intern-ping. Do not open Solari noVNC on a phone (`GET editor HTTP 401`). Never `--record` a logged-in session.

**Weekly live coverage:** GitHub Actions `public` job is Monday + `workflow_dispatch`. Repo secret `SOLARI_API_KEY` is **present** (masked). Observed: [Actions run 35605123361](https://github.com/IronAdamant/auspex/actions/runs/35605123361) (Mon 2026-09-21) — ironadamant + checkpoint `ok: true`. The step still skips if that secret were unset (PRs not blocked). Do not remove the secret. The workflow does not commit artifacts. Demo files are refreshed by hand.

## Autonomous agents (job compose)

Prefer **`auspex_job`** for the mint→await→finalize→check path. Step tools remain for debugging. First call mints and returns waiting + `handoff` (profile from the URL host unless `--profile` is set). After the human Saves, resume `--job-id`. Without `AUSPEX_WAKE_WEBHOOK`, use `auspex_job_status` (optional short `--wait-ms`) rather than a blind 30-minute `await-login` poll. On 429 the job reaps the ledger (not account-wide) and `nextCall` resumes the job. `claimOkProfile` only after `--verify-with-profile`. Not a fourth primitive. Not a hosted Solari push API. A finished job is not a 24–48h lease.

## Long unattended loops

<!-- auspex-long-run:begin -->
A saved profile can keep working after the five-minute typing window dies. How long it lasts is Solari and the site. Auspex does not set a 24–48 hour timer, and it does not send a keepalive.

Before you leave a loop running, and again before you treat an older pass as still true:

1. `profile-status` with that profile, the app URL, and the expect. `loggedIn` means the live probe saw the expect. The `next` line on that result says this is not `claimOkProfile` and not overnight-safe. It does not set `nextCall`.
2. On an auth-gated host, `check --verify-with-profile`. Read `claimOkProfile`. That field is the reuse gate. `ok` is not `claimOk` and not `claimOkProfile`.

The heartbeat is that pair of checks. That is the cadence: before the loop, and again before an older pass is treated as still true. There is no other ping and no minute timer.

`weakSeed`, an IdP-only jar, and `app-visible` are not overnight-safe. `claimOkProfile` true is evidence you can reuse the seed for another check. It is not a lease.

Operator note: longevity is the Solari profile and the site session, not an Auspex TTL. Budget an occasional human door. When the site session dies, that expiry is the re-gate path in the door table. Auspex does not extend it. Operator page: docs/ops-runbook.md.

If the loop hits a sign-in wall, a fresh challenge (a new password, code, or challenge page), a dead typing window with no cookies (bare `stream-expired`), or a seed you cannot reuse: stop. The clear status is the matching row in the door table. Take that row's `nextCall` once. The human door is `auspex_login` only when that nextCall is `auspex_login`. Do not type a password, OTP, or CAPTCHA answer. Do not claim the challenge is solved. Do not keep the loop running for hours.

`app-visible` still has no `nextCall`. Do not mint again to finish Microsoft. `editorFold` `no-cdp` with the app host in the jar is still finalize now, even if the window already died, when that jar is not cookie-strong or local-storage-auth. A cookie-strong or local-storage-auth Save is check --verify-with-profile. solariSaveReady is not claimOkProfile. A counted `sessionStorage === 0` with no app-origin cookies and no allowlisted localStorage auth key names, while the token is live, is still finalize-login, not a remint. Those rows stay separate from each other.
<!-- auspex-long-run:end -->

## Understanding Verification Signals

Three distinct booleans in receipts, each with different meaning:

- **`ok`** — Agent success: did the live browser match **and** did verify pass (when it ran)?
- **`verify.claimOk`** — Anonymous sandbox claim: did an unauthenticated HTTP fetch + OCR see the expect string?
- **`verify.claimOkProfile`** — Profile-seeded sandbox claim: did a second Solari browser with the profile see the expect string in page text?

**`ok` ≠ `claimOk` ≠ `claimOkProfile`.** Do not treat any one as the others. We do **not** claim Alice-vs-Bob wrong-account detection: a seeded profile can still be the wrong Microsoft user and match expect.

**Reuse gate:** After `--verify-with-profile`, **`claimOkProfile` is the profile-reuse signal.** `ok` alone is not enough to treat the profile as reusable. Do not invent `claimOkProfile=true`.

**For public marketing pages:** Use default verify (anonymous). `ok=true` requires `claimOk=true`.

**For auth-gated SaaS:** Anonymous verify cannot see logged-in UI. Either skip verify entirely (`--no-verify` for smoke tests), or use `--verify-with-profile` to get `claimOkProfile`. `name=consistencyhub`, `profile=consistencyhub`, or any attached profile on a non-public-marketing URL **skip** anonymous verify by default. Public marketing (ironadamant.com, checkpointprojects.com) still verifies even with a leftover profile. No profile still verifies. `--verify` is still anonymous and will poison `ok` on auth-gated pages. A VWP timeout after anonymous claim is skipped keeps `anonymousClaimSkipped` and sets `claimOkProfile=false`; it does not treat the miss as an anonymous `claimOk` failure. When verify integrity fails after that skip, overlay `reason` is `network` (intentional, retry-shaped). That is not a 502 and not an anonymous `claimOk` miss — do not retry the check to chase `claimOkProfile`. `ok` still follows integrity `verify.ok` — do not fold `claimOkProfile` into `ok`.

**Verified dogfood (2026-09-18):** redacted auth-gated SaaS demo with `--verify-with-profile` → `ok=true`, `claimOkProfile=true` (committed redacted receipt under `examples/auspex-ts/demo/consistencyhub-*`). Same Microsoft profile on OneDrive is **receipt-only** evidence (`examples/auspex-ts/demo/onedrive-receipt.json`) — **no raw OneDrive PNG** (PII). See [Worked example (dogfood)](#worked-example-dogfood) and [RECEIPTS.md](RECEIPTS.md). Dual pack is evidence, not the default recipe.

If this session has **`solari__*`** / **`solari_*`** tools (official Solari MCP), you may use them for ad-hoc cloud browser / sandbox / desktop. Prefer Auspex for check → verify → tear-down. For 429 leftovers call **`auspex_reap`**. If `solari_*` are missing, do not invent them.

## One install, two doors

From the **repository root** (do not hunt `examples/`):

```bash
git clone https://github.com/IronAdamant/auspex.git
cd auspex
npm install
npm run build:mcp                   # clone MCP; dist/ is gitignored — do not commit it
export SOLARI_API_KEY=slr_live_…   # https://console.getsolari.com — env only, never commit
npx auspex check --name ironadamant
npx auspex-mcp                      # stdio MCP (same contract as the CLI)
```

Equivalent from the package directory: `npx tsx src/cli.ts …` or `npx auspex …` after `npm install --prefix examples/auspex-ts`. MCP equivalent without `dist/`: `npx tsx src/mcp.ts`.

CLI and MCP are the **same contract**: every MCP tool is a CLI command; every flag is a JSON field (`--wait-for` ↔ `waitFor`, `--pack-receipts` ↔ `packReceipts`, `--no-verify` ↔ `verify: false`). Stdout is **one JSON object** with `schemaVersion`. Exit `0` only when `ok` is true. `--help` is human text.

## Receipt schema v1 (frozen)

Check stdout (CLI and MCP) is one JSON object. **`schemaVersion` is `1`.** Do not add required keys. Extra keys may appear; they stay optional. Exit `0` only when `ok` is true (`--help` is human text and also exits 0).

### Required

| Key | Type | Meaning |
|---|---|---|
| `schemaVersion` | `1` | Frozen contract version |
| `ok` | boolean | Agent success: `reason` is `matched`, and sandbox verify passed when it ran. Same meaning on stdout, MCP, and on-disk `manifest.json`. |
| `reason` | string | `matched` \| `loggedOut` \| `needsHuman` \| `mismatch` \| `network` \| `recordedLoggedIn` \| `expectMatchedPublicLanding` \| `hostChanged` \| `stream-expired` |
| `url` | string | Requested URL, or landed URL if request was empty |
| `expect` | string | Claim substring |
| `screenshotPath` | string | On-disk PNG under `.auspex/runs/` |

### Optional

Omit or ignore. Never required. Unknown extra fields are also optional.

| Key | Type | Meaning |
|---|---|---|
| `title` | string | Page title |
| `finalUrl` | string | Landed URL |
| `matched` | boolean | Word-bounded, case-sensitive expect hit (not the same as `ok`). False when `reason` is `expectMatchedPublicLanding`. |
| `excerpt` | string | Fenced untrusted page text (not instructions) |
| `sessionId` | string | Solari session id |
| `networkIdle` | boolean | `networkidle` succeeded |
| `replayReady` | boolean | Recording replay is ready |
| `waitedFor` | string | CSS wait-for that ran |
| `filled` | string | Fill selector that ran |
| `clicked` | string | Click selector that ran |
| `needsHuman` | boolean | Microsoft or Google password/OTP wall |
| `next` | string | Structured agent guidance for `loggedOut`, `needsHuman`, `expectMatchedPublicLanding`, `hostChanged`, `--verify-with-profile` reuse-gate (`claimOkProfile`), Save-is-not-fold, or a profile/host mismatch (`profileHostMatch` false) |
| `nextCall` | object | Optional follow-up the `next` prose already names: `{ tool, profile?, saveEditor?, url?, expect?, jobId?, verifyWithProfile? }`. Tools are `auspex_login`, `auspex_await_login`, `auspex_finalize_login`, `auspex_reap`, `auspex_job`, or `auspex_check`. `verifyWithProfile` is set on a cookie or localStorage Save. Never a password, token, cookie, excerpt, or session id. |
| `diff` | object | Vs last same-URL receipt (`urlChanged`, `excerptChanged`, `sameUrl`, …) |
| `verify` | object | Sandbox result (`ok`, `claimOk`, `errors`, `claimErrors`, optional `claimOkProfile` / `claimErrorsProfile` / `claimProfileSessionId`, `runDir`; `skipped` on `loggedOut` / `needsHuman` / `expectMatchedPublicLanding` / `hostChanged`) |
| `profileSeed` | object | `{ cookies, origins, sessionStorage?, sessionStorageStale?, appOriginCookieCount?, localStorageCount?, localStorageAuthKeyNames? }` when a profile was attached. Counts and allowlisted key names only. |
| `seedReadiness` | object | Post-save shape: `cookie-strong`, `local-storage-auth`, `idp-only`, `weak-seed`, `session-strong`, `empty`, or `unknown`. `solariSaveReady` is true only for app-origin cookies or allowlisted localStorage auth key names. It is not `claimOkProfile`. |
| `profileSaved` | object | Save result when `--save-profile` ran |
| `profileHostMatch` | boolean | On `login`, `await-login`, and `finalize-login` when a URL host was compared to the profile. `true` when the name matches the host slug (case-insensitive) or a saved-check host (`consistencyhub` on `consistencyhub.io`, including subdomains). `false` on a mismatch. Omitted when there is no URL. Omission is not a match. A slug mismatch still runs (soft advise). On `check`, set only with `hostChanged`. |
| `suggestedProfile` | string | Host slug from the same helper as `login --url` without `--profile`. Present only when `profileHostMatch` is false. Remint with `--profile <suggestedProfile>` or omit `--profile`. |
| `hostChanged` | boolean | Live remote https host diverged from the minted URL on await-login, finalize-login, or --save-profile. ok is false. claimOkProfile is not granted. |
| `suggestedUrl` | string | https origin of the live site. Present with hostChanged. Remint auspex_login --profile suggestedProfile --url suggestedUrl. |

Usage/failure JSON (`error`, `code`) is **not** this receipt; it still has `schemaVersion` and `ok: false`.

## Tools

- `auspex_check` / `auspex check` — launch → goto → optional wait-for (fill/click only without a profile, or with `--allow-page-actions`) → assert → screenshot (≤2 MiB) → close. **Verifies by default** (headless sandbox HTTP fetch + OCR) except **`name=consistencyhub`**, **`profile=consistencyhub`**, or **any attached profile on a non-public-marketing URL**, which **default to `verify=false` on both CLI and MCP** (shared `shouldVerifyCheck`; anonymous sandbox fetch cannot see auth-gated UI). Public marketing still verifies with a leftover profile. No profile still verifies. **`verify=true` / `--verify` is not `verifyWithProfile`:** `--verify` forces **anonymous** sandbox verify and will poison `ok` on auth-gated pages (`claimOk` false). **`--verify-with-profile` / `verifyWithProfile`** is the dogfood path: enables the sandbox, skips anonymous claim, adds `claimOkProfile` from a second profile-seeded browser; **`claimOkProfile` is the profile-reuse gate** — `ok` alone is not enough to treat the profile as reusable; read `claimOkProfile`, do not treat `ok` as that signal. `--no-verify` / `verify=false` always skips (and wins over `--verify-with-profile`). Returns a parseable **schema v1** receipt (required: `schemaVersion`, `ok`, `reason` (`matched` / `loggedOut` / `needsHuman` / `mismatch` / `network` / `recordedLoggedIn` / `expectMatchedPublicLanding` / `hostChanged`), `url`, `expect`, `screenshotPath`; `diff` / `verify` optional). JSON plus a downscaled JPEG attach. Do **not** also call `auspex_verify` after a default check. `loggedOut` / `needsHuman` / `expectMatchedPublicLanding` / `hostChanged` skip verify and are **not retried**. `needsHuman` omits the screenshot/MCP image and strips digit runs from `excerpt`. Saved checks: **`name=ironadamant`** (expect `One office job.`), **`name=checkpoint`** (expect `Checkpoint`), **`name=consistencyhub`** (`profile=consistencyhub`, expect `Document Editor`; no sso, no record, no fill/click unless `allowPageActions`). **Mobile emulation (best-effort)**: `--mobile` emulates iPhone viewport/UA (390x844, iOS Safari UA); `--device <name>` uses specific device profiles (iphone-12, iphone-13-pro, pixel-5, galaxy-s21, ipad-pro). Applies Playwright BrowserContextOptions to Solari browser.newContext(). **Solari-dependent**: effectiveness depends on Solari cloud Chrome respecting Playwright viewport/UA overrides; not verified against live Solari sessions. Receipt **`ok` is agent success** on stdout, MCP, and on-disk `manifest.json`. Optional **`protocolOk`** is URL+PNG protocol success — do not treat it as a second `ok`.
- `auspex_login` / `auspex login` — create/reuse a named profile and mint **once**. `handoff.url` / `oneLiner` is the chooser (`https://ironadamant.com/auspex/door.html`). Labeled deep links: `handoff.mobileUrl` (phone) and `handoff.desktopUrl` (desktop). Requires `--profile <name>` or `--url <https>`. `--url` without `--profile` derives a safe host slug (`app.example.com` → `app-example-com`) and echoes it on stdout, `next`, and phone Save paste. Explicit `--profile` wins (dogfood `--profile consistencyhub` is unchanged). A new host must not keep that name: when it is not the host slug, `login`, `await-login`, and `finalize-login` still run and set `profileHostMatch` false, `suggestedProfile`, and a remint `next` / `nextCall` (omit `--profile` or pass the slug). `profileHostMatch` true on a slug match or saved-check host affinity. No URL omits the fields. **Phone:** `handoff.mobileUrl` is the **Auspex phone page** (`https://ironadamant.com/auspex/phone.html`) with a **real text field** so the phone software keyboard can open. Chrome on phone is the dogfood browser. Check Show as bullets for in-tab autofill; a brief background pauses and reconnects the same VNC token (remint only when stream-expired). ironadamant.com does not see the password or any keystrokes. Keys go into Solari remote Chrome and the destination site only; the destination site logs its own login. If cookies or cache are cleared, or the remote session or saved profile is wiped, type the login again. Auspex and ironadamant.com do not host those credentials or session secrets; they live only in the remote Chrome session and on the destination site. They stay off agent chat / MCP / receipts. Seed/handoff door for off-site typing — **not** a Handraise-style same-session VNC takeover. Solari's own handoff/editor is **noVNC** (a picture of Chrome) and will not open the phone keyboard. **Computer:** `handoff.desktopUrl` is the Auspex desktop page (`desktop.html`, same link hash as the phone) when login minted a remote Chrome; otherwise the Solari console Open editor. Hardware keyboard. One typing field: click the remote address bar (or the remote field you mean to fill) before typing anything. Keys stream into Solari remote Chrome as you type (no Paste button). Enter sends Enter and clears the local field. Show as bullets is off by default so a password manager can paste into the text field. ironadamant.com does not see the password or any keystrokes. Packet also has `openOnPhone`, `openOnDesktop`, `oneLiner` (chooser SMS), `desktopOneLiner`, `qrPath` (QR of the chooser URL). `--url` is also a start hint in the handoff reason (Solari POST is still `{ reason }`). **Never type in Solari noVNC on a phone** (remote Chromium live view will not open the software keyboard). The agent never copies the password. Do not intern-ping. Then `auspex_await_login` with `saveEditor` after they tap Save on the phone or desktop page (default 30 minutes; a version bump with 0 cookies is **not** success). Do not open Solari's handoff page on a phone (`GET editor HTTP 401`). Then `auspex_finalize_login` (unknown profiles need `--url` and `--expect`), then `auspex_check`. Do not skip finalize-login after Save.
<!-- auspex-await-login:begin -->
- `auspex_await_login` / `auspex await-login` — wait until Save stored cookies or origins (default **30 minutes**, matching the cold login-handoff). Returns status: **`completed`**, **`timeout`**, **`empty-save`** (a version bump with no cookies or origins is not success), **`idp-only-save`**, **`waiting`**, **`host-changed`** (remint; do not save into the old profile), **`stream-expired`**, **`editor-save-hung`** (do not finalize in parallel), **`profile-busy`** (retry await after that save ends). IdP, fold-miss, bare `stream-expired`, `cookie-strong`, `local-storage-auth`, `weakSeed`, `emptySave`, seed health, and re-gate actions are the decision table in the frozen door-await block. Do not merge those rows and do not restate them here. Do not merge seed health or re-gate into `app-visible` or into finalize-now. **`--save-editor` does not refresh folded sessionStorage** unless `editorFold.ok` (Solari editor is noVNC today; leftover count is not a fresh capture). If `editorSave` fails (e.g. 401), remint — cookies are not proof of login. Remint if finalize-login returns `needsHuman`. SPAs that keep tokens in sessionStorage still need `finalize-login` while the token is valid. Live inspect **forwards origin** so that sessionStorage warning can fire.
<!-- auspex-await-login:end -->
- `auspex_finalize_login` / `auspex finalize-login` — post-login one-shot helper: after `await-login` (or weak-seed warn), run SSO + `--save-profile` in one step to capture sessionStorage. Saved-check profiles (e.g. `consistencyhub`) supply URL and expect; unknown profiles require `--url` and `--expect`. Use when console Save or `--save-editor` alone is insufficient (Save is not fold). Later reuse still needs `claimOkProfile=true` from `--verify-with-profile`; `ok` alone is not enough. Expect must be unique to the logged-in surface. A text hit on a public or landing URL during save is `expectMatchedPublicLanding`, not `matched`. If the editor-save VNC JWT is past and the profile has no completed non-empty seed, finalize returns `stream-expired` and does not open `POST /sessions`.
- `auspex_profiles` / `auspex profiles` — list names/ids, version, and whether storage is populated. Stdout is `{ ok, schemaVersion, profiles }` plus optional `operator` (site and profile only), `wiped`, and `wipeFailed`. Voluntary `--purge` + yes stops the profile editor before delete. If that named profile is not wiped, `ok` is false and `wipeFailed` names the error. After a saved login has been used and tested, ask the human whether testing is done and the login may be purged. Purge only after the human agrees (`--purge <name> --yes`, or MCP `purge` + `humanAgree: true`). An idle saved profile is deleted on the next Auspex command after 30 minutes without use. A use resets that profile's 30-minute clock. There is no live 30-minute timer on the typing field. One site at a time. One profile per host. login --url names the slug (app.example.com → app-example-com). A different host gets its own profile. profiles lists them. Purge one name only after the human agrees (--purge <name> --yes). Keys typed on `docs/door.html` → `docs/phone.html` or `docs/desktop.html` go into Solari remote Chrome (and the site). They stay off agent chat, MCP, and receipts. The local field clears on Enter, Save, or lock. The Save clipboard line does not include what was typed. ironadamant.com does not see the password or any IME keystrokes; the destination site logs its own login. If cookies or cache are cleared, or the remote session or saved profile is wiped, type the login again. Auspex and ironadamant.com do not host those credentials or session secrets; they live only in the remote Chrome session and on the destination site. They are not included in the agent message. Other profiles stay. No username, password, or Solari key is in the payload. Agents use `SOLARI_API_KEY` or gitignored `.auspex/operator-key` on the operator machine. Door pages do not collect or store the Solari key. That is not the 30-minute profile wipe.
- `auspex_profile_status` / `auspex profile-status` — `loggedIn` vs `loggedOut` vs `needsHuman` vs **`weakSeed`** vs **`emptySave`**. **`weakSeed`** is cookies/origins with a counted `sessionStorage === 0`, or folded `__auspex_ss__:expiresOn` past/within ~5m (leftover count is not fresh), when the jar is not `cookie-strong` or `local-storage-auth`. App-origin cookies or allowlisted localStorage auth key names are that Save: `nextCall` is `auspex_check` with `verifyWithProfile`. Counted sessionStorage 0 is expected. `solariSaveReady` is not `claimOkProfile`. IdP hosts alone stay `idp-only-save`. Public marketing saved checks (`ironadamant`, `checkpoint`) stay `loggedOut`. Unknown sessionStorage (no origin) is not `weakSeed`. **`emptySave`** = profile not found or empty. Returns storage counts (`cookies`, `origins`, `sessionStorage`) and optional `sessionStorageStale` when available. Default path uses **one** browser session: inspect only when there is no URL to probe, otherwise one live check (weakSeed can also be derived from the live `profileSeed`). Live probe never uses `--sso` or `--record`. Re-seed is human SSO once. Never type a Microsoft or Google password/OTP. Path `/` is `loggedOut` unless expect matched. If the live probe is logged out, report `loggedOut` and skip.
- `auspex_verify` / `auspex verify` — only if you already ran `auspex_check` **with `verify=false`**. Uploads the on-disk PNG + JSON, asserts **integrity `ok`** vs **claim `claimOk`** (fetch/OCR of expect — not JSON echo), kills the VM.
- `auspex_reap` / `auspex reap` — list leftover browser sessions (Auspex live ledger) and kill those ledger ids. Use after **429**. Default does **not** wipe every VM on the key; pass `accountWide` / `--account-wide` for that. `dryRun` lists only. `packReceipts` copies last receipts per URL into `.auspex/pack` for a PR attach.
- `auspex_desktop` / `auspex desktop` — named Solari sandbox desktop demo: wait for X11, open Mousepad by default. **Not the user's Mac.** Wait/expect/`ok` share one process haystack. `windowOk` only if a real window list exists. `clicked` only if verified. `streamUrl` is live VNC. **FAIL-CLOSED `--type` refuses password/OTP-like strings** (6-8 digits, password keywords, API-key patterns, high-complexity no-space strings) because desktop cannot detect password fields like page-actions can. Use only for demo text.
- `auspex_trace` / `auspex trace` — last **login mint** episode plus `traceSummary`. Traces **lead-up only** (`event: login`; API key, profile ensure, handoff POST, editor-start, editor-token). After the handoff is ready, production writes one redacted post-handoff row (status and fold reason: empty-save, editor 401, no-cdp, or finalize needsHuman). Check rows are not written. `mintStage: ready` only when VNC/token mint succeeded. If mint fails, the summary says why (missing key, 429, 402, 503, no url, editor-start HTTP, VNC timeout, empty handoff token). `--all` dumps history. Never tokens, passwords, excerpts, or session ids. If mint is silent or fails, **read `traceSummary` / `auspex_trace` before reminting**. Not a fourth primitive. Never commit `.auspex/`.
- `auspex_job` / `auspex job` — durable compose of mint→await→finalize→check. Prefer this for autonomous agents; step tools remain for debugging. Persist under `.auspex/jobs/` (gitignored). Resume with `--job-id`. Optional `--wake-webhook` / `AUSPEX_WAKE_WEBHOOK` (operator-local POST, not a Solari push API). On 429, ledger reap then `nextCall` resumes the job. `claimOkProfile` only after `--verify-with-profile`. Not a fourth primitive.
- `auspex_job_status` / `auspex job-status` — read the local job file; optional short `--wait-ms` (max 60s) until phase change. Honest local wake when no webhook is configured. Do not blind-poll `await-login` for 30 minutes.

## Blame Solari vs Auspex

| Signal | Whose | Retry? |
| --- | --- | --- |
| `402` FeatureRequiresPlan | Solari plan | No — drop stealth/proxy/captcha/desktop or upgrade. `check --stealth` only. Login mint does not send stealth: `POST /profiles/:id/login-handoff` and the profile editor ignore a stealth body |
| `429` ConcurrencyLimitExceeded | Solari slot | No — `auspex_reap`, then retry |
| `413` profile save too large | Solari limit | No — remint; leaner Save |
| `502` / `503` / `504` | Solari infra | Yes, once (5–10s). Not `loggedOut` / `needsHuman`. Receipt `solariBlame` `infra-5xx` |
| SDK `exhausted N attempts` with no status | Solari SDK ([cookbook #56](https://github.com/solari-sdk/solari-cookbook/issues/56)) | No storm. `solariBlame` `unknown-exhausted` remints `auspex_login`; cause status 502–504 is `infra-5xx` (wait once); stealth-pool text is `stealth-pool-empty` (drop `--stealth` or wait once). Never `loggedOut` / `needsHuman` |
| `loggedOut` / `needsHuman` | Auspex page | No — human SSO / remint |
| `expectMatchedPublicLanding` | Auspex expect | No — better URL/expect |
| `hostChanged` / `stream-expired` | Auspex door | No — remint `auspex_login` (`editorSave` 200 + fold miss with cookies is finalize-login now, not this row) |

Detail is in [Rules](#rules) below. Do not conflate Solari HTTP with `loggedOut` or `needsHuman`.

## Rules

- Always let Auspex **close** the Solari check session. A leaked session burns concurrency until you `auspex_reap`.
- A **new URL host** needs its own profile. Do not carry the previous `--profile` across sites. `login`, `await-login`, and `finalize-login` still run, and when the profile is not that host's slug they set `profileHostMatch` false, `suggestedProfile` (same host-slug helper as `login --url` without `--profile`), and a remint `next` / `nextCall`. Saved-check host affinity still matches (`consistencyhub` on `consistencyhub.io`). `profileHostMatch` true when they match. No URL omits the fields — omission is not a match. ConsistencyHub is a worked example for that host only.
- A **live host change** (the remote browser's https origin is a different site than the URL minted into the door, and the profile does not already own that host) fails closed on `await-login`, `finalize-login`, and `--save-profile`. Receipt fields: `hostChanged`, `profileHostMatch` false, `suggestedProfile`, `suggestedUrl` (https origin). `ok` is false. Cookies from the live site are not written into the old jar. `claimOkProfile` is not granted. `next` / `nextCall` is `auspex_login` with `--profile <suggestedProfile>` and `--url <suggestedUrl>`. Remint creates that profile when it does not exist. Do not rename or migrate jars. Phone and desktop pages are noVNC pictures and cannot read the address bar; the password field is not a site picker. Detection uses storage origins, cookie hosts, and `page.url()` when a browser session exists. The same host, including `www` and a saved-check subdomain, still completes. A profile name that is not the host slug, while the browser stayed on the minted host, stays the soft advise above. An ordinary check that does not save, and has no stored host-changed marker, does not treat a second host as a change.
- **402 FeatureRequiresPlan** (stealth, proxy, captcha, desktops on a plan that lacks them) is **not retryable**. Drop the gated option or upgrade. `proxy`/`captcha` imply stealth. Stealth is honored on `POST /sessions` (`auspex check --stealth`). Login mint does not send it: `POST /profiles/:id/login-handoff` and the profile editor ignore a stealth body (same cold handoff, no 402). Do not add `auspex login --stealth` until Solari applies it to that editor task.
- **413 Payload Too Large** (profile save exceeds 1 MiB) is **not retryable** with the same payload. By default, Auspex omits indexedDB to keep saves lean while still capturing sessionStorage (required for apps like ConsistencyHub). If save still fails, remint `auspex_login` and use console Save for a leaner seed. Do not retry identical save.
- **429 ConcurrencyLimitExceeded** is **not retryable**. Call `auspex_reap`, then retry. Do not only use the Solari console. Do not retry create while the slot is held. Default reap is the local ledger (`accountWide` stays false). Solari has no `GET /sessions` ([cookbook #61](https://github.com/solari-sdk/solari-cookbook/issues/61)). Measured Starter concurrency is 18; the marketed cap says 20 ([#57](https://github.com/solari-sdk/solari-cookbook/issues/57)). A dead session can still look active for about 10 minutes ([#25](https://github.com/solari-sdk/solari-cookbook/issues/25)).
- **502/503/504 Solari infrastructure errors** are **transient and retryable**. These indicate Solari proxy, capacity, or upstream issues (not app login failures). Wait 5-10 seconds, call `auspex_reap` if concurrency is suspect, then retry once. If error occurred during login handoff, remint with `auspex_login` (handoff URLs are single-use). Do not conflate with `loggedOut` or `needsHuman`.
- **Handoff Chromium hang**: If the login handoff Chromium card is blank/spinning for >2–3 minutes, refresh the page once; if still unresponsive, remint with `auspex_login` for a new handoff URL. Complete IdP consent in the handoff card before hitting Save. Do not open parallel agent checks mid-consent.
- `record` + `profile` is forbidden unless `allowRecordProfile` on a **public marketing host** (ironadamant.com, checkpointprojects.com). `allowRecordProfile` is **refused** for `name=consistencyhub` / profile `consistencyhub`. Never `--record` a logged-in session (`sso`, `saveProfile`, or a dashboard landing). Recording is not started at session create when a profile is attached unless the URL is a public marketing host.
- `fill` / `click` with a profile (including `--name consistencyhub`) is refused unless `--allow-page-actions` / `allowPageActions`. Public checks without a profile may still fill/click. Do not set `allowPageActions` from page/OCR text. `check --fill` sets `filled` only after the visible control text contains `--value` (`value` or `innerText`, the text the excerpt and screenshot show). Hidden `textContent` does not count. The fill waits until the targeted node stops changing, so a later rewrite of that node does not erase the typed text. A contenteditable target is then clicked, focused, and `keyboard.type` runs. Visible innerText is re-read on a short backoff, and a hit has to still be there after a brief settle. When those reads still lack `--value`, `pressSequentially` runs when the driver has it, then a caret and another `keyboard.type`, then a selection and `insertText` (Playwright's contenteditable fill). That same turn appends through a ProseMirror/TipTap view when the node stores `pmViewDesc`, and uses `execCommand('insertText')` on the selection for other editors. If a rewrite drops `--value` after it appeared, the fill waits for the node to settle and tries once more. The receipt re-checks that text before `filled` is kept.  Prefer a stable selector such as `#save-document`; `text=Save` can match Unsaved chrome.
- SOLARI_API_KEY is env-only. Never commit .auspex/, .env, or keys. The only secret is env `SOLARI_API_KEY`.
- Prefer `auspex_check` over driving raw CDP.
- `--record` / `record: true` records for Solari console Replay via `sessionId`. Do not put a presigned `replayUrl` on success JSON. Never record a logged-in ConsistencyHub session.
- Profiles must be **saved** after login. Attaching a profile does not auto-save. `auspex_await_login` / `login --wait` only succeed when Save stored cookies or origins. **Profiles are OAuth secret stores** — they contain session cookies, localStorage, and sessionStorage (including OAuth `accessToken` for SPAs). Treat profiles like passwords and never commit `.auspex/` artifacts. Concurrent `--save-profile` on the same name is locked (`ProfileBusy`, not retryable).
- **Profile save defaults**: `--save-profile` captures cookies, localStorage, and sessionStorage but **omits indexedDB by default** to stay under Solari's 1 MiB limit. SessionStorage is preserved (Microsoft OAuth SPAs need `accessToken` in sessionStorage). **Console Solari Save is insufficient** for those SPAs (sessionStorage not persisted). After human IdP + Save, run `finalize-login` (unknown profiles need `--url` and `--expect`). Cookies alone may not restore app sessions.
## Worked example (dogfood)

ConsistencyHub and OneDrive are **evidence that auth-gated SaaS works** — not the default recipe. The generic `login --url` / `--profile <yours>` path above is the recipe; this named check is the verified example. Do not invent that any host works without dogfood. Saved-check name `consistencyhub` is optional.

**Redacted auth-gated SaaS demo** (committed blur + receipt): `examples/auspex-ts/demo/consistencyhub.png` and `examples/auspex-ts/demo/consistencyhub-receipt.json`. Triad stays honest: `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`**. Do **not** fold `claimOkProfile` into `ok`.

```bash
npx auspex profile-status --name consistencyhub
npx auspex login --profile consistencyhub
# saved-check name for consistencyhub.io (host affinity). Do not reuse this --profile on a new host.
# human: Microsoft + OneDrive consent in handoff, tap Save. Do not intern-ping.
npx auspex await-login --profile consistencyhub --save-editor
npx auspex finalize-login --profile consistencyhub
npx auspex check --name consistencyhub          # never --record
npx auspex check --name consistencyhub --verify-with-profile
```

Console Save and `--save-editor` do **not** refresh folded sessionStorage unless `editorFold.ok`. If `next` says `weakSeed` or `emptySave`, follow that door-table row. Do not run `--verify-with-profile` on a dead fold. **Verified 2026-09-18:** After reseed v20, `check --name consistencyhub --verify-with-profile` → `ok=true`, `claimOkProfile=true`.

**OneDrive (same Microsoft profile, evidence only):** `check https://onedrive.live.com/ --expect "My files" --profile consistencyhub`. That `check` reuses the seeded Microsoft profile. Do not pass that profile to `login`, `await-login`, or `finalize-login` for a different host — those commands soft-advise with `profileHostMatch` false and `suggestedProfile` and still run. Published dual pack: redacted OneDrive receipt at `examples/auspex-ts/demo/onedrive-receipt.json` (`claimOkProfile=true`). **No raw OneDrive PNG** (PII; receipt-only). Still evidence, not the default recipe. Attached profile on a non-public-marketing host defaults to no anonymous verify. **`--verify` is still anonymous** and will poison `ok`. Use `--no-verify` for smoke tests or `--verify-with-profile` for the reuse-gate field.

## CLI

```
npx auspex login --url <https> [--profile <name>] [--wait]
npx auspex check <url> --expect <string> [--selector <css>] [--profile <name>] [--sso] [--sso-provider microsoft|google|auto] [--wait-for <css>] [--save-profile] [--verify|--no-verify] [--verify-with-profile] [--mobile] [--device <name>]
npx auspex await-login --profile <name> [--since-version <n>] [--timeout-ms <n>] [--save-editor] [--url <https>] [--expect <string>] [--no-chain-finalize]
npx auspex finalize-login --profile <name> [--url <url>] [--expect <string>]
npx auspex profiles [--purge <name>] [--yes]
npx auspex profile-status [--profile <name>] [--name <saved>] [--url <hint>]
npx auspex job [--job-id <id>] [--name <saved>] [--profile <name>] [--url <https>] [--expect <string>] [--skip-finalize] [--verify-with-profile] [--wait] [--wake-webhook <url>] [--timeout-ms <n>]
npx auspex job-status --job-id <id> [--wait-ms <n>]
npx auspex reap [--dry-run] [--session <id>] [--vm <id>] [--pack-receipts] [--account-wide]
npx auspex trace [--profile <name>] [--limit <n>] [--all]
npx auspex verify [runDir]
npx auspex desktop [--open <app>] [--type <text>] [--click <x,y>] [--expect <string>]
npx auspex mcp
```

Optional dogfood saved checks (not the stranger path): `npx auspex check --name <ironadamant|checkpoint|consistencyhub>`.

Leave alone (not first-line tools): `--stealth`, `--proxy`, `--proxy-sticky`, `--captcha` (402 is not retryable), `--record`, `--allow-record-profile` (never `--record` a logged-in session), `--fill`, `--value`, `--click`, `--allow-page-actions` (never type a password).

`--sso` clicks Microsoft, then Google, then a generic Sign in with … button. Use with `--profile`. `--sso-provider` pins a vendor. Agents must never type passwords: `--fill` / `fill` is refused on `input[type=password]` selectors, and Microsoft **and Google** password/OTP walls return `needsHuman: true`. `--profile` applies the saved Playwright storage state onto a new context **before first navigation**. Empty seeds (0 cookies and 0 origins) fail closed unless `--sso`. `--save-profile` writes cookies, localStorage, and sessionStorage via `POST /profiles/:id/save` and **refuses an empty overwrite, a public /landing session, or a save with no bytes for the page origin**. A later `--profile` check that lands on `/landing`, `/login`, or `/` without a matched expect is `ok: false` with `reason: loggedOut`. Expect must be unique to the logged-in app and absent from public marketing copy. A capitalized word does not match inside a capitalized phrase (`Dashboard` does not match `One Dashboard`). If `--save-profile` still hits expect text on a non-persistable URL, `reason` is `expectMatchedPublicLanding` (`ok` false, `matched` false, profile not saved). `record`+`profile` is forbidden unless `--allow-record-profile` on a public marketing host. `--allow-record-profile` is refused for consistencyhub. Never `--record` with `--sso`, `--save-profile`, or a dashboard landing. `fill`/`click` with a profile requires `--allow-page-actions`. `--verify-with-profile` enables profile-seeded claim verification (adds `claimOkProfile`/`claimErrorsProfile` to receipt) and skips anonymous claim check (integrity still runs; `ok` requires only `verify.ok` when anonymous claim skipped — **`claimOkProfile` is the reuse gate; `ok` alone is not enough to treat the profile as reusable**); for `--name consistencyhub`, this flag also enables the verify step (which is skipped by default without explicit `--verify`). **`--mobile`** and **`--device <name>`** apply Playwright BrowserContextOptions (viewport, userAgent, deviceScaleFactor, isMobile, hasTouch) to browser.newContext(). **Best-effort mobile emulation**: effectiveness depends on Solari cloud Chrome respecting Playwright viewport/UA overrides; not verified against live Solari sessions.

## MCP hosts

Published package (no clone): `npx -p auspex-solari auspex-mcp` with `SOLARI_API_KEY` in `env`. Paste cards: [README](README.md#mcp), [CLAUDE.md](CLAUDE.md), [docs/HOSTS.md](docs/HOSTS.md). Local stdio only. This repo does not publish a remote HTTP MCP server. A login wait can run about 30 minutes; a ~300s tool timeout ends first. Prefer `auspex_job`, then `auspex_job_status`.

Primary door after `npm install` **and** `npm run build:mcp` at the repository root: `npx auspex-mcp`. `dist/` is gitignored (policy B). Missing `dist/mcp.mjs` fail-closes with `DistMissing` (not a silent empty server).

- **stdio:** `npx auspex-mcp` from the repo root (needs `dist/mcp.mjs`). Equivalent without dist: `npx tsx src/mcp.ts` from `examples/auspex-ts`. Published equivalent: `npx -p auspex-solari auspex-mcp`.
- **Cursor** — published JSON on the root README. This clone: `.cursor/mcp.json` and `examples/auspex-ts/mcp.cursor.example.json`. After clone: `npm install && npm run build:mcp`, then restart Cursor.
- **Claude Code / Desktop** — `examples/auspex-ts/mcp.claude.example.json` (published `npx -p auspex-solari auspex-mcp` plus `env`). [CLAUDE.md](CLAUDE.md) points at this file and [llms.txt](llms.txt).
- **Grok** — `examples/auspex-ts/grok.mcp.example.toml` (same published command, `env`, `tool_timeout_sec` 1800). Official Solari sibling is still the clone `dist/solari-mcp.mjs`. If PATH lacks node, pin absolute `node` + `bin/auspex-mcp.mjs` after `npm run build:mcp`.
