# Auspex — for agents

Canonical any-host instructions: [AGENTS.md](../../AGENTS.md) at the repository root. Receipt field list (schema v1 frozen): [Receipt schema v1](../../AGENTS.md#receipt-schema-v1-frozen). This copy stays next to the package so a host that only opens `examples/auspex-ts` still has the contract.

We do **not** claim Alice-vs-Bob wrong-account detection. A seeded profile can still be the wrong Microsoft user and match expect.

## First calls

From npm (no clone): `npx auspex-solari <command>`. MCP: `npx -p auspex-solari auspex-mcp`. Do not use npm `auspex` (a different scraper). After clone, `npx auspex` is the local bin.

From the **repository root** after `npm install` and `export SOLARI_API_KEY`:

```bash
npx auspex check --name ironadamant
npx auspex check https://example.com --expect "Example Domain"
# any Microsoft-gated host (their URL + expect unless a saved check):
npx auspex profile-status --profile app-example --url https://app.example --expect "Workspace ready"
npx auspex login --url https://app.example
# derives --profile app-example from the URL host; override with --profile <yours>
# New host: do not carry a previous --profile. Omit --profile or pass that host's slug. A mismatch sets profileHostMatch false and suggestedProfile; remint with that name.
# human: open handoff.url (chooser: Phone or Desktop, same hash). Phone: handoff.mobileUrl in the phone's own Safari or Chrome (real text field). Computer: handoff.desktopUrl (desktop.html). Seed/handoff door for off-site typing — not a Handraise-style same-session VNC takeover; tap Save on that page. Do not open Solari (GET editor HTTP 401). Then await-login --save-editor. Do not intern-ping.
# mint is traced; if silent or login fails, read traceSummary / npx auspex trace before reminting (not a fourth primitive)
npx auspex await-login --profile app-example --save-editor
npx auspex finalize-login --profile app-example --url https://app.example --expect "Workspace ready"
npx auspex check --profile app-example --url https://app.example --expect "Workspace ready"   # never --record
npx auspex reap                                 # after 429
npx auspex-mcp
```

Never type passwords. Never `--record` a logged-in session. Do not call `auspex_verify` after a default check. The named sandbox desktop demo (`auspex_desktop`) is not a first call. The login desktop door is part of `auspex login` (chooser → phone or desktop). The generic path above is the recipe. A named saved check is optional; see [Worked example (dogfood)](#worked-example-dogfood).

Expect on an auth-gated host must be unique to the logged-in app surface and must not appear in public marketing copy. Match is case-sensitive and word-bounded: `Dashboard` does not match `Dashboards` or the capitalized phrase `One Dashboard` (Socialaize-style). If finalize-login still hits expect text on `/`, `/landing`, `/login`, `/signup`, or `/auth`, `reason` is `expectMatchedPublicLanding` (`ok` false, `matched` false, profile not saved). Pass a real app URL and a better expect.

Use Auspex when you need **evidence from a live web page**. You drive a **Solari cloud Chrome** (its own remote instance, not the human’s local browser). Snapshot text + PNG, check a claim, close. The human does not watch that window.

Do **not** use it for pages you can already curl, for generic research crawls, or instead of Browser Use when the job is “click around in the user’s already-open Chrome.”

This repo ships optional saved checks (`name=ironadamant|checkpoint|consistencyhub`) for those three hosts only. Strangers verifying *their* site should use `login --url <https>` (derives `--profile` from the host; override `--profile <yours>`) plus their URL and expect — do not invent that any host works without dogfood.

Three primitives: browser check, sandbox verify, named sandbox desktop demo. Login, finalize-login, profile-status, reap, and trace are the auth + hygiene doors. No fourth primitive. `auspex_desktop` (Mousepad) is not the user's Mac. The login desktop door is `docs/desktop.html`.

## Understanding Verification Signals

Three distinct booleans in receipts, each with different meaning:

- **`ok`** — Agent success: did the live browser match **and** did verify pass (when it ran)?
- **`verify.claimOk`** — Anonymous sandbox claim: did an unauthenticated HTTP fetch + OCR see the expect string?
- **`verify.claimOkProfile`** — Profile-seeded sandbox claim: did a second Solari browser with the profile see the expect string in page text?

**`ok` ≠ `claimOk` ≠ `claimOkProfile`.** Do not treat any one as the others. We do **not** claim Alice-vs-Bob wrong-account detection: a seeded profile can still be the wrong Microsoft user and match expect.

**Reuse gate:** After `--verify-with-profile`, **`claimOkProfile` is the profile-reuse signal.** `ok` alone is not enough to treat the profile as reusable. Do not invent `claimOkProfile=true`.

**For public marketing pages:** Use default verify (anonymous). `ok=true` requires `claimOk=true`.

**For auth-gated SaaS:** Anonymous verify cannot see logged-in UI. Either skip verify entirely (`--no-verify` for smoke tests), or use `--verify-with-profile` to get `claimOkProfile`. `name=consistencyhub`, `profile=consistencyhub`, or any attached profile on a non-public-marketing URL **skip** anonymous verify by default. Public marketing (ironadamant.com, checkpointprojects.com) still verifies even with a leftover profile. No profile still verifies. `--verify` is still anonymous and will poison `ok` on auth-gated pages. A VWP timeout after anonymous claim is skipped keeps `anonymousClaimSkipped` and sets `claimOkProfile=false`; it does not treat the miss as an anonymous `claimOk` failure. When verify integrity fails after that skip, overlay `reason` is `network` (intentional, retry-shaped). That is not a 502 and not an anonymous `claimOk` miss — do not retry the check to chase `claimOkProfile`. `ok` still follows integrity `verify.ok` — do not fold `claimOkProfile` into `ok`.

**Verified dogfood (2026-09-18):** redacted auth-gated SaaS demo with `--verify-with-profile` → `ok=true`, `claimOkProfile=true` (committed redacted receipt under `demo/consistencyhub-*`). Same Microsoft profile on OneDrive is local dogfood only — **no committed OneDrive PNG/receipt** (PII). See [Worked example (dogfood)](#worked-example-dogfood) and [RECEIPTS.md](../../RECEIPTS.md).

If this session has **`solari__*`** / **`solari_*`** tools (official Solari MCP), you may use them for ad-hoc cloud browser / sandbox / desktop. Prefer Auspex for check → verify → tear-down. For 429 leftovers call **`auspex_reap`** (works even when Solari MCP did not start). If `solari_*` are missing, do not invent them.

## Tools

- `auspex_check` — launch → goto → optional wait-for (fill/click only without a profile, or with `allowPageActions`) → assert → screenshot (≤2 MiB) → close. **Verifies by default** (headless sandbox HTTP fetch + OCR) except **`name=consistencyhub`**, **`profile=consistencyhub`**, or **any attached profile on a non-public-marketing URL**, which **default to `verify=false`** on both CLI and MCP (anonymous sandbox fetch cannot see auth-gated UI). Public marketing still verifies with a leftover profile. No profile still verifies. **`verify=true` / `--verify` is not `verifyWithProfile`:** `--verify` forces **anonymous** sandbox verify and will poison `ok` on auth-gated pages. **`verifyWithProfile` / `--verify-with-profile`** is the dogfood path: enables the sandbox, skips anonymous claim, adds `claimOkProfile`; **`claimOkProfile` is the profile-reuse gate** — `ok` alone is not enough to treat the profile as reusable; read `claimOkProfile`, do not treat `ok` as that signal. Pass **`verify=false`** to skip. Returns a parseable **schema v1** receipt (required: `schemaVersion`, `ok`, `reason` (`matched` / `loggedOut` / `needsHuman` / `mismatch` / `network` / `recordedLoggedIn` / `expectMatchedPublicLanding` / `hostChanged`), `url`, `expect`, `screenshotPath`; extra keys optional). See root AGENTS.md. JSON plus a downscaled JPEG attach. Do **not** also call `auspex_verify` after a default check. `loggedOut` / `needsHuman` / `expectMatchedPublicLanding` / `hostChanged` skip verify and are not retried. `needsHuman` omits the screenshot/MCP image and strips digit runs from excerpt. Saved checks: **`name=ironadamant`** (expect `One office job.`), **`name=checkpoint`** (expect `Checkpoint`), **`name=consistencyhub`** (`profile=consistencyhub`, expect `Document Editor`; no sso, no record, no fill/click unless `allowPageActions`). **Mobile emulation (best-effort)**: `--mobile` / `mobile=true` emulates iPhone viewport/UA (390x844, iOS Safari UA); `--device` / `device` uses iphone-12, iphone-13-pro, pixel-5, galaxy-s21, ipad-pro. Not verified against live Solari sessions.
- `auspex_login` — create/reuse a named profile and mint **once**. `handoff.url` / `oneLiner` is the chooser (`door.html`). Labeled deep links: `handoff.mobileUrl` (phone) and `handoff.desktopUrl` (desktop). Requires `profile` or `url`. `url` without `profile` derives a safe host slug (`app.example.com` → `app-example-com`) and echoes it on stdout, `next`, and phone Save paste. Explicit `profile` wins. A new host must not keep a previous profile: when it is not the host slug, `login`, `await-login`, and `finalize-login` still run and set `profileHostMatch` false, `suggestedProfile`, and a remint `next` / `nextCall` (omit `profile` or pass the slug). `profileHostMatch` true on a slug match or saved-check host affinity. No URL omits the fields. **Phone:** `handoff.mobileUrl` is the **Auspex phone page** (`phone.html`) with a **real text field** so the phone software keyboard can open. Keys go into remote Chrome (and the site). They stay off agent chat / MCP / receipts. Seed/handoff door for off-site typing — **not** a Handraise-style same-session VNC takeover. Solari's own handoff is **noVNC** and will not open the phone keyboard. **Computer:** `handoff.desktopUrl` is the Auspex desktop page (`desktop.html`, same link hash as the phone) when login minted a remote Chrome; otherwise the Solari console Open editor. Hardware keyboard. One typing field: click the remote login field, then paste. Packet also has `openOnPhone`, `openOnDesktop`, `oneLiner`, `desktopOneLiner`, `qrPath` (QR of the chooser URL). `--url` is also a start hint in the handoff reason. **Never type in Solari noVNC on a phone** (remote Chromium live view will not open the software keyboard). The agent never copies the password. Do not intern-ping. Then `auspex_await_login` with `saveEditor` after they tap Save on the phone or desktop page (default 30 minutes; a version bump with 0 cookies is **not** success). Do not open Solari's handoff page on a phone (`GET editor HTTP 401`). Then `auspex_finalize_login` (unknown profiles need `--url` and `--expect`), then `auspex_check`. Do not skip finalize-login after Save.
- `auspex_await_login` — wait until Save stored cookies or origins (default **30 minutes**, matching the cold login-handoff). Returns status: **`completed`** | **`timeout`** | **`empty-save`** | **`waiting`** | **`host-changed`** (live https host diverged; remint). Empty Save is not success. Soft-warns if profile has cookies/origins but no sessionStorage, or folded `__auspex_ss__:expiresOn` is past/within ~5m (leftover count is not fresh). Stale/weak `next` remint or finalize-now — do **not** run `--verify-with-profile` on a dead fold (`claimOkProfile` will not pass). **`--save-editor` does not refresh folded sessionStorage** unless `editorFold.ok` (Solari editor is noVNC today; leftover count is not a fresh capture). If `editorSave` fails (e.g. 401) or `editorFold` is `no-cdp`, `next` says finalize-login NOW while the token is live; remint if finalize-login returns `needsHuman`. SPAs that keep tokens in sessionStorage still need `finalize-login` while the token is valid. Live inspect forwards the page origin so that warning can fire.
- `auspex_finalize_login` — post-login one-shot helper (CLI **and** MCP): after `await-login` (or weak-seed warn), run SSO + `--save-profile` in one step to capture sessionStorage. Saved-check profiles (e.g. `consistencyhub`) supply URL and expect; unknown profiles require `--url` and `--expect`. Use when console Save or `--save-editor` alone is insufficient (Save is not fold). Later reuse still needs `claimOkProfile=true` from `--verify-with-profile`; `ok` alone is not enough. Expect must be unique to the logged-in surface. A text hit on a public or landing URL during save is `expectMatchedPublicLanding`, not `matched`.
- `auspex_profiles` — list names/ids, version, and whether storage is populated. After a saved login has been used and tested, ask the human whether testing is done and the login may be purged. Purge only after the human agrees (`--purge <name> --yes`, or MCP `purge` + `humanAgree: true`). An idle saved profile is deleted on the next Auspex command after 30 minutes without use. A use resets that profile's 30-minute clock. There is no live 30-minute timer on the typing field. One site at a time. Keys typed on `docs/door.html` → `docs/phone.html` or `docs/desktop.html` go into Solari remote Chrome (and the site). They stay off agent chat, MCP, and receipts. The local field clears on paste, Save, or lock. They are not included in the agent message. Other profiles stay. No username, password, or Solari key is in the payload. Agents use `SOLARI_API_KEY` or gitignored `.auspex/operator-key` on the operator machine. Door pages do not collect or store the Solari key. That is not the 30-minute profile wipe.
- `auspex_profile_status` — `loggedIn` vs `loggedOut` vs `needsHuman` vs **`weakSeed`** vs **`emptySave`**. **`emptySave`** = profile not found or empty. **`weakSeed`** is cookies/origins with a counted `sessionStorage === 0`, or folded `__auspex_ss__:expiresOn` past/within ~5m (leftover count is not fresh). Public marketing saved checks (`ironadamant`, `checkpoint`) stay `loggedOut`. Unknown sessionStorage (no origin) is not `weakSeed`. Default path uses **one** browser session (inspect only when there is no URL; otherwise one live check). Live probe never uses `--sso` or `--record`. Re-seed is human SSO once. Never type a Microsoft or Google password/OTP. Path `/` is `loggedOut` unless expect matched. If the live probe is logged out, report `loggedOut` and skip.
- `auspex_verify` — only if you already ran `auspex_check` **with `verify=false`**. Uploads the on-disk PNG + JSON, asserts **integrity `ok`** vs **claim `claimOk`** (fetch/OCR of expect — not JSON echo), kills the VM.
- `auspex_reap` — list leftover browser sessions (Auspex live ledger) and kill those ledger ids. Use after **429**. Default does not wipe every VM on the key; pass `accountWide`. `dryRun` lists only. `packReceipts` copies last receipts per URL into `.auspex/pack` for a PR attach.
- `auspex_desktop` — named Solari sandbox desktop demo: wait for X11, open Mousepad by default. **Not the user's Mac.** Wait/expect/`ok` share one process haystack. `windowOk` only if a real window list exists. `clicked` only if verified. Tool text is the ASCII log **plus** JSON. `streamUrl` is live VNC. **FAIL-CLOSED `--type` refuses password/OTP-like strings** (6-8 digits, password keywords, API-key patterns, high-complexity no-space strings) because desktop cannot detect password fields like page-actions can. Use only for demo text.
- `auspex_trace` — last **login mint** episode plus `traceSummary`. Traces **lead-up only** (`event: login`; API key, profile ensure, handoff POST, editor-start, editor-token). After the handoff is ready, production writes one redacted post-handoff row (status and fold reason: empty-save, editor 401, no-cdp, or finalize needsHuman). Check rows are not written. `mintStage: ready` only when VNC/token mint succeeded. If mint fails, the summary says why (missing key, 429, 402, 503, no url, editor-start HTTP, VNC timeout, empty handoff token). `--all` dumps history. Never tokens, passwords, excerpts, or session ids. If mint is silent or fails, **read `traceSummary` / `auspex_trace` before reminting**. Not a fourth primitive. Never commit `.auspex/`.

## Rules

- Always let Auspex **close** the Solari check session. A leaked session burns concurrency until you `auspex_reap`.
- A **new URL host** needs its own profile. Do not carry the previous `--profile` across sites. `login`, `await-login`, and `finalize-login` still run, and when the profile is not that host's slug they set `profileHostMatch` false, `suggestedProfile` (same host-slug helper as `login --url` without `--profile`), and a remint `next` / `nextCall`. Saved-check host affinity still matches (`consistencyhub` on `consistencyhub.io`). `profileHostMatch` true when they match. No URL omits the fields — omission is not a match. ConsistencyHub is a worked example for that host only.
- A **live host change** (the remote browser's https origin is a different site than the URL minted into the door, and the profile does not already own that host) fails closed on `await-login`, `finalize-login`, and `--save-profile`. `hostChanged` is true, `ok` is false, and `claimOkProfile` is not granted. `next` / `nextCall` remints `auspex_login --profile <suggestedProfile> --url <suggestedUrl>`. Do not write the live site into the old jar and do not rename jars. Door pages cannot read the address bar (noVNC). The password field is not a site picker. The same host still completes. A name that is not the host slug, while the browser stayed on the minted host, stays soft advise. An ordinary check without save and without a stored marker does not treat a second host as a change.
- **402 FeatureRequiresPlan** (stealth, proxy, captcha, desktops on a plan that lacks them) is **not retryable**. Drop the gated option or upgrade. `proxy`/`captcha` imply stealth.
- **413 Payload Too Large** (profile save exceeds 1 MiB) is **not retryable** with the same payload. By default, Auspex omits indexedDB to keep saves lean while still capturing sessionStorage (required for apps like ConsistencyHub). If save still fails, remint `auspex_login` and use console Save for a leaner seed. Do not retry identical save.
- **429 ConcurrencyLimitExceeded** is **not retryable**. Call `auspex_reap`, then retry. Do not only use the Solari console. Do not retry create while the slot is held.
- **502/503/504 Solari infrastructure errors** are **transient and retryable**. These indicate Solari proxy, capacity, or upstream issues (not app login failures). Wait 5-10 seconds, call `auspex_reap` if concurrency is suspect, then retry once. If error occurred during login handoff, remint with `auspex_login` (handoff URLs are single-use). Do not conflate with `loggedOut` or `needsHuman`.
- **Handoff Chromium hang**: If the login handoff Chromium card is blank/spinning for >2–3 minutes, refresh the page once; if still unresponsive, remint with `auspex_login` for a new handoff URL. Complete IdP consent in the handoff card before hitting Save. Do not open parallel agent checks mid-consent.
- `record` + `profile` is forbidden unless `allowRecordProfile` on a public marketing host. `allowRecordProfile` is refused for consistencyhub. Never `--record` a logged-in session (`sso`, `saveProfile`, or a dashboard landing).
- `fill` / `click` with a profile requires `--allow-page-actions`. Public checks without a profile may still fill/click.
- Never commit `SOLARI_API_KEY`, `.env`, or `.auspex/` artifacts. The only secret is env `SOLARI_API_KEY`. Concurrent `--save-profile` on the same name is locked (`ProfileBusy`).
- Prefer `auspex_check` over driving raw CDP.
- `--record` / `record: true` records for Solari console Replay via `sessionId`. Do not put a presigned `replayUrl` on success JSON. Public demo is `demo/ironadamant.png` + `demo/receipt.json` (`sessionId`) + `demo/replay.html`. Refresh with `npx tsx scripts/save-demo-receipt.ts`. Never record a logged-in ConsistencyHub session.
- Profiles must be **saved** after login. Attaching a profile does not auto-save. `auspex_await_login` / `login --wait` only succeed when Save stored cookies or origins. **Profiles are OAuth secret stores** — they contain session cookies, localStorage, and sessionStorage (including OAuth `accessToken` for SPAs). Treat profiles like passwords and never commit `.auspex/` artifacts. Concurrent `--save-profile` on the same name is locked (`ProfileBusy`).
- **Profile save defaults**: `--save-profile` captures cookies, localStorage, and sessionStorage but **omits indexedDB by default** to stay under Solari's 1 MiB limit. SessionStorage is preserved (Microsoft OAuth SPAs need `accessToken` in sessionStorage). **Console Solari Save is insufficient** for those SPAs. After human IdP + Save, run `finalize-login` (unknown profiles need `--url` and `--expect`). Cookies alone may not restore app sessions.
## Worked example (dogfood)

ConsistencyHub and OneDrive are **evidence that auth-gated SaaS works** — not the default recipe. The generic `login --url` / `--profile <yours>` path above is the recipe; this named check is the verified example. Do not invent that any host works without dogfood. Saved-check name `consistencyhub` is optional.

**Redacted auth-gated SaaS demo** (committed blur + receipt): `demo/consistencyhub.png` and `demo/consistencyhub-receipt.json`. Triad stays honest: `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`**. Do **not** fold `claimOkProfile` into `ok`.

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

Console Save and `--save-editor` do **not** refresh folded sessionStorage unless `editorFold.ok`. If `next` says stale/weakSeed: remint or finalize-now — do not run `--verify-with-profile` on a dead fold. **Verified 2026-09-18:** After reseed v20, `check --name consistencyhub --verify-with-profile` → `ok=true`, `claimOkProfile=true`.

**OneDrive (same Microsoft profile, recipe only):** `check https://onedrive.live.com/ --expect "My files" --profile consistencyhub`. That `check` reuses the seeded Microsoft profile. Do not pass that profile to `login`, `await-login`, or `finalize-login` for a different host — those commands soft-advise with `profileHostMatch` false and `suggestedProfile` and still run. Live dogfood on a local Microsoft profile; **no committed OneDrive PNG/receipt** (PII). Attached profile on a non-public-marketing host defaults to no anonymous verify. **`--verify` is still anonymous** and will poison `ok`. Use `--no-verify` for smoke tests or `--verify-with-profile` for the reuse-gate field.

## CLI

From the **repository root** after `npm install`: `npx auspex <command>` or `npx auspex-mcp`. Same contract from this directory: `npx tsx src/cli.ts …`. Stdout is one JSON object; exit 0 only when `ok` is true.

```
npx auspex check [--name <ironadamant|checkpoint|consistencyhub>] [<url>] [--expect <string>] [--selector <css>] [--profile <name>] [--stealth] [--proxy <cc|smart>] [--proxy-sticky <id>] [--captcha] [--record] [--allow-record-profile] [--allow-page-actions] [--sso] [--sso-provider microsoft|google|auto] [--wait-for <css>] [--fill <css> --value <text>] [--click <css>] [--save-profile] [--verify|--no-verify] [--verify-with-profile] [--mobile] [--device <name>]
npx auspex login [--profile <name>] [--url <https>] [--wait]
npx auspex finalize-login --profile <name> [--url <url>] [--expect <string>]
npx auspex await-login --profile <name> [--since-version <n>] [--timeout-ms <n>] [--save-editor] [--url <https>]
npx auspex profiles [--purge <name>] [--yes]
npx auspex profile-status [--profile <name>] [--name <saved>] [--url <hint>]
npx auspex verify [runDir]
npx auspex desktop [--open <app>] [--type <text>] [--click <x,y>] [--expect <string>]
npx auspex reap [--dry-run] [--session <id>] [--vm <id>] [--pack-receipts] [--account-wide]
npx auspex trace [--profile <name>] [--limit <n>] [--all]
npx auspex mcp
```

`--sso` clicks Microsoft, then Google, then a generic Sign in with … button. Use with `--profile`. `--sso-provider` pins a vendor. Agents must never type passwords: `--fill` / `fill` is refused on `input[type=password]` selectors, and Microsoft and Google password/OTP walls return `needsHuman: true`. `--profile` applies the saved Playwright storage state onto a new context **before first navigation** (`chromium.connect` does not expose Solari's default context). Empty seeds (0 cookies and 0 origins) fail closed unless `--sso`. `--save-profile` writes cookies, localStorage, and sessionStorage via `POST /profiles/:id/save` and **refuses an empty overwrite, a public /landing session, or a save with no bytes for the page origin**. A later `--profile` check that lands on `/landing`, `/login`, or `/` without a matched expect is `ok: false` with `reason: loggedOut`. Expect must be unique to the logged-in app and absent from public marketing copy. A capitalized word does not match inside a capitalized phrase (`Dashboard` does not match `One Dashboard`). If `--save-profile` still hits expect text on a non-persistable URL, `reason` is `expectMatchedPublicLanding` (`ok` false, `matched` false, profile not saved). `record`+`profile` is forbidden unless `--allow-record-profile` on a public marketing host. `--allow-record-profile` is refused for consistencyhub. Never `--record` with `--sso`, `--save-profile`, or a dashboard landing. `fill`/`click` with a profile requires `--allow-page-actions`. `--verify-with-profile` enables profile-seeded claim verification (adds `claimOkProfile`/`claimErrorsProfile` to receipt) and skips anonymous claim check (integrity still runs; `ok` requires only `verify.ok` when anonymous claim skipped — **`claimOkProfile` is the reuse gate; `ok` alone is not enough to treat the profile as reusable**); for `--name consistencyhub`, this flag also enables the verify step (which is skipped by default without explicit `--verify`). **`--mobile`** and **`--device <name>`** apply Playwright BrowserContextOptions (viewport, userAgent, deviceScaleFactor, isMobile, hasTouch) to browser.newContext(). **Best-effort mobile emulation**: effectiveness depends on Solari cloud Chrome respecting Playwright viewport/UA overrides; not verified against live Solari sessions. Receipt `ok` is agent success (same on stdout, MCP, and on-disk `manifest.json`); optional `protocolOk` is URL+PNG protocol success and is not a second `ok`.

## MCP hosts

Primary door after `npm install` at the repository root: `npx auspex-mcp`.

- **stdio:** `npx auspex-mcp` from the repo root (or `npx tsx src/mcp.ts` from this directory).
- **Cursor** — `.cursor/mcp.json` in this repo. Also `mcp.cursor.example.json`.
- **Claude Desktop** — merge `mcp.claude.example.json`.
- **Grok** — `grok.mcp.example.toml` (`npx auspex-mcp` from the clone; if PATH lacks node, pin absolute `node` + `bin/auspex-mcp.mjs`).
