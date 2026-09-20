# Auspex — for agents

Canonical any-host instructions: [AGENTS.md](../../AGENTS.md) at the repository root. Receipt field list (schema v1 frozen): [Receipt schema v1](../../AGENTS.md#receipt-schema-v1-frozen). This copy stays next to the package so a host that only opens `examples/auspex-ts` still has the contract.

## First calls

From the **repository root** after `npm install` and `export SOLARI_API_KEY`:

```bash
npx auspex check --name ironadamant
npx auspex check https://example.com --expect "Example Domain"
# any Microsoft-gated host (url + expect unless a saved check):
npx auspex profile-status --profile myapp --url https://app.example --expect "Dashboard"
npx auspex login --profile myapp --url https://app.example
# human: Microsoft consent in the handoff, then Save. Do not intern-ping.
npx auspex await-login --profile myapp
npx auspex finalize-login --profile myapp --url https://app.example --expect "Dashboard"
npx auspex check --profile myapp --url https://app.example --expect "Dashboard"   # never --record
# dogfood saved check:
npx auspex profile-status --name consistencyhub
npx auspex login --profile consistencyhub
npx auspex await-login --profile consistencyhub
npx auspex finalize-login --profile consistencyhub
npx auspex check --name consistencyhub          # never --record
npx auspex reap                                 # after 429
npx auspex-mcp
```

Never type passwords. Never `--record` a logged-in ConsistencyHub session. Do not call `auspex_verify` after a default check. Desktop is not a first call.

Use Auspex when you need **evidence from a live web page**. You drive a **Solari cloud Chrome** (its own remote instance, not the human’s local browser). Snapshot text + PNG, check a claim, close. The human does not watch that window.

Do **not** use it for pages you can already curl, for generic research crawls, or instead of Browser Use when the job is “click around in the user’s already-open Chrome.”

For **ironadamant.com**, **checkpointprojects.com**, and **consistencyhub.io**, prefer saved checks (`name=ironadamant|checkpoint|consistencyhub`) over reconstructing flags.

Three primitives: browser check, sandbox verify, named sandbox desktop demo. Login, finalize-login, profile-status, and reap are the auth + hygiene doors. No fourth primitive. Desktop is not the user's Mac.

## Understanding Verification Signals

Three distinct booleans in receipts, each with different meaning:

- **`ok`** — Agent success: did the live browser match **and** did verify pass (when it ran)?
- **`verify.claimOk`** — Anonymous sandbox claim: did an unauthenticated HTTP fetch + OCR see the expect string?
- **`verify.claimOkProfile`** — Profile-seeded sandbox claim: did a second Solari browser with the profile see the expect string in page text?

**For public marketing pages:** Use default verify (anonymous). `ok=true` requires `claimOk=true`.

**For auth-gated SaaS:** Anonymous verify cannot see logged-in UI. Either skip verify entirely (`--no-verify` for smoke tests), or use `--verify-with-profile` to get `claimOkProfile`. `name=consistencyhub`, `profile=consistencyhub`, or any attached profile on a non-public-marketing URL **skip** anonymous verify by default. Public marketing (ironadamant.com, checkpointprojects.com) still verifies even with a leftover profile. No profile still verifies. `--verify` is still anonymous and will poison `ok` on auth-gated pages. A VWP timeout after anonymous claim is skipped keeps `anonymousClaimSkipped` and sets `claimOkProfile=false`; it does not treat the miss as an anonymous `claimOk` failure. When verify integrity fails after that skip, overlay `reason` is `network` (intentional, retry-shaped). That is not a 502 and not an anonymous `claimOk` miss — do not retry the check to chase `claimOkProfile`. `ok` still follows integrity `verify.ok` — do not fold `claimOkProfile` into `ok`.

**Verified dogfood (2026-09-18):** ConsistencyHub with `--verify-with-profile` → `ok=true`, `claimOkProfile=true` (committed redacted receipt). OneDrive with the same Microsoft profile is local dogfood only — **no committed OneDrive PNG/receipt** (PII).

If this session has **`solari__*`** / **`solari_*`** tools (official Solari MCP), you may use them for ad-hoc cloud browser / sandbox / desktop. Prefer Auspex for check → verify → tear-down. For 429 leftovers call **`auspex_reap`** (works even when Solari MCP did not start). If `solari_*` are missing, do not invent them.

## Tools

- `auspex_check` — launch → goto → optional wait-for (fill/click only without a profile, or with `allowPageActions`) → assert → screenshot (≤2 MiB) → close. **Verifies by default** (headless sandbox HTTP fetch + OCR) except **`name=consistencyhub`**, **`profile=consistencyhub`**, or **any attached profile on a non-public-marketing URL**, which **default to `verify=false`** on both CLI and MCP (anonymous sandbox fetch cannot see auth-gated UI). Public marketing still verifies with a leftover profile. No profile still verifies. **`verify=true` / `--verify` is not `verifyWithProfile`:** `--verify` forces **anonymous** sandbox verify and will poison `ok` on auth-gated pages. **`verifyWithProfile` / `--verify-with-profile`** is the dogfood path: enables the sandbox, skips anonymous claim, adds `claimOkProfile`; read `claimOkProfile`, do not treat `ok` as that signal. Pass **`verify=false`** to skip. Returns a parseable **schema v1** receipt (required: `schemaVersion`, `ok`, `reason` (`matched` / `loggedOut` / `needsHuman` / `mismatch` / `network` / `recordedLoggedIn`), `url`, `expect`, `screenshotPath`; extra keys optional). See root AGENTS.md. JSON plus a downscaled JPEG attach. Do **not** also call `auspex_verify` after a default check. `loggedOut` / `needsHuman` skip verify and are not retried. `needsHuman` omits the screenshot/MCP image and strips digit runs from excerpt. Saved checks: **`name=ironadamant`** (expect `One office job.`), **`name=checkpoint`** (expect `Checkpoint`), **`name=consistencyhub`** (`profile=consistencyhub`, expect `Document Editor`; no sso, no record, no fill/click unless `allowPageActions`). **Mobile emulation (best-effort)**: `--mobile` / `mobile=true` emulates iPhone viewport/UA (390x844, iOS Safari UA); `--device` / `device` uses iphone-12, iphone-13-pro, pixel-5, galaxy-s21, ipad-pro. Not verified against live Solari sessions.
- `auspex_login` — create/reuse a named profile and return a **single-use login-handoff URL**. Returns **mobile-first handoff packet** with `handoff.url`, `handoff.openOnPhone`, `handoff.oneLiner`, `handoff.qrPath`. `--url` is a start hint in the handoff reason. Show the packet to the human; they sign in (agent never handles the password). Do not ping the user. Then `auspex_await_login` (a version bump with 0 cookies is **not** success), then `auspex_finalize_login` (unknown profiles need `--url` and `--expect`), then `auspex_check`. Do not skip finalize-login after Save.
- `auspex_await_login` — wait until Save stored cookies or origins. Returns status: **`completed`** | **`timeout`** | **`empty-save`** | **`waiting`**. Empty Save is not success. Soft-warns if profile has cookies/origins but no sessionStorage (common with auth-gated SaaS after console Save). Live inspect forwards the ConsistencyHub origin so that warning can fire.
- `auspex_finalize_login` — post-login one-shot helper (CLI **and** MCP): after `await-login` (or weak-seed warn), run SSO + `--save-profile` in one step to capture sessionStorage. Saved-check profiles (e.g. `consistencyhub`) supply URL and expect; unknown profiles require `--url` and `--expect`. Use when console Save alone is insufficient.
- `auspex_profiles` — list names/ids, version, and whether storage is populated.
- `auspex_profile_status` — `loggedIn` vs `loggedOut` vs `needsHuman` vs **`weakSeed`** vs **`emptySave`**. **`emptySave`** = profile not found or empty. **`weakSeed`** is cookies/origins with a counted `sessionStorage === 0` (Microsoft OAuth SPAs). Public marketing saved checks (`ironadamant`, `checkpoint`) stay `loggedOut`. Unknown sessionStorage (no origin) is not `weakSeed`. Default path uses **one** browser session (inspect only when there is no URL; otherwise one live check). Live probe never uses `--sso` or `--record`. Re-seed is human SSO once. Never type a Microsoft or Google password/OTP. Path `/` is `loggedOut` unless expect matched. If ConsistencyHub is logged out, report `loggedOut` and skip.
- `auspex_verify` — only if you already ran `auspex_check` **with `verify=false`**. Uploads the on-disk PNG + JSON, asserts **integrity `ok`** vs **claim `claimOk`** (fetch/OCR of expect — not JSON echo), kills the VM.
- `auspex_reap` — list leftover browser sessions (Auspex live ledger) and kill those ledger ids. Use after **429**. Default does not wipe every VM on the key; pass `accountWide`. `dryRun` lists only. `packReceipts` copies last receipts per URL into `.auspex/pack` for a PR attach.
- `auspex_desktop` — named Solari sandbox desktop demo: wait for X11, open Mousepad by default. **Not the user's Mac.** Wait/expect/`ok` share one process haystack. `windowOk` only if a real window list exists. `clicked` only if verified. Tool text is the ASCII log **plus** JSON. `streamUrl` is live VNC. **FAIL-CLOSED `--type` refuses password/OTP-like strings** (6-8 digits, password keywords, API-key patterns, high-complexity no-space strings) because desktop cannot detect password fields like page-actions can. Use only for demo text.

## Rules

- Always let Auspex **close** the Solari check session. A leaked session burns concurrency until you `auspex_reap`.
- **402 FeatureRequiresPlan** (stealth, proxy, captcha, desktops on a plan that lacks them) is **not retryable**. Drop the gated option or upgrade. `proxy`/`captcha` imply stealth.
- **413 Payload Too Large** (profile save exceeds 1 MiB) is **not retryable** with the same payload. By default, Auspex omits indexedDB to keep saves lean while still capturing sessionStorage (required for apps like ConsistencyHub). If save still fails, remint `auspex_login` and use console Save for a leaner seed. Do not retry identical save.
- **429 ConcurrencyLimitExceeded** is **not retryable**. Call `auspex_reap`, then retry. Do not only use the Solari console. Do not retry create while the slot is held.
- **502/503/504 Solari infrastructure errors** are **transient and retryable**. These indicate Solari proxy, capacity, or upstream issues (not app login failures). Wait 5-10 seconds, call `auspex_reap` if concurrency is suspect, then retry once. If error occurred during login handoff, remint with `auspex_login` (handoff URLs are single-use). Do not conflate with `loggedOut` or `needsHuman`.
- **Handoff Chromium hang**: If the login handoff Chromium card is blank/spinning for >2–3 minutes, refresh the page once; if still unresponsive, remint with `auspex_login` for a new handoff URL. Complete Microsoft + OneDrive consent in the handoff card before hitting Save. Do not open parallel agent checks mid-consent.
- `record` + `profile` is forbidden unless `allowRecordProfile` on a public marketing host. `allowRecordProfile` is refused for consistencyhub. Never `--record` a logged-in session (`sso`, `saveProfile`, or a dashboard landing).
- `fill` / `click` with a profile requires `--allow-page-actions`. Public checks without a profile may still fill/click.
- Never commit `SOLARI_API_KEY`, `.env`, or `.auspex/` artifacts. The only secret is env `SOLARI_API_KEY`. Concurrent `--save-profile` on the same name is locked (`ProfileBusy`).
- Prefer `auspex_check` over driving raw CDP.
- `--record` / `record: true` records for Solari console Replay via `sessionId`. Do not put a presigned `replayUrl` on success JSON. Public demo is `demo/ironadamant.png` + `demo/receipt.json` (`sessionId`) + `demo/replay.html`. Refresh with `npx tsx scripts/save-demo-receipt.ts`. Never record a logged-in ConsistencyHub session.
- Profiles must be **saved** after login. Attaching a profile does not auto-save. `auspex_await_login` / `login --wait` only succeed when Save stored cookies or origins. **Profiles are OAuth secret stores** — they contain session cookies, localStorage, and sessionStorage (including OAuth `accessToken` for SPAs). Treat profiles like passwords and never commit `.auspex/` artifacts. Concurrent `--save-profile` on the same name is locked (`ProfileBusy`).
- **Profile save defaults**: `--save-profile` captures cookies, localStorage, and sessionStorage but **omits indexedDB by default** to stay under Solari's 1 MiB limit. SessionStorage is preserved (Microsoft OAuth SPAs need `accessToken` in sessionStorage). **Console Solari Save is insufficient** for those SPAs. After human IdP + Save, run `finalize-login` (unknown profiles need `--url` and `--expect`). Cookies alone may not restore app sessions.
- **ConsistencyHub agent recipe** (dogfood saved check): `login --profile consistencyhub` → human completes Microsoft + OneDrive consent in handoff → Save → `await-login` (may warn if no sessionStorage) → `finalize-login --profile consistencyhub` → then `check --name consistencyhub`. Do not use console Save alone. Optional: `--verify-with-profile` (`claimOkProfile`). **Verified 2026-09-18:** After reseed v20, `check --name consistencyhub --verify-with-profile` → `ok=true`, `claimOkProfile=true`.
- **OneDrive with Microsoft profile**: The ConsistencyHub profile seed (Microsoft cookies + sessionStorage) can be reused for OneDrive and likely other Microsoft hosts that accept the same cookie seed. Recipe: `check https://onedrive.live.com/ --expect "My files" --profile consistencyhub`. Live dogfood on a local Microsoft profile; **no committed OneDrive PNG/receipt** (PII). Default is now **no** anonymous verify (attached profile on a non-public-marketing host). Use `--no-verify` for smoke tests or `--verify-with-profile` for profile-seeded claim verification. **`--verify` is still anonymous** and will poison `ok` (fetch sees the login page). A URL with no profile still default-verifies. Public marketing still verifies even with a leftover profile.

## CLI

From the **repository root** after `npm install`: `npx auspex <command>` or `npx auspex-mcp`. Same contract from this directory: `npx tsx src/cli.ts …`. Stdout is one JSON object; exit 0 only when `ok` is true.

```
npx auspex check [--name <ironadamant|checkpoint|consistencyhub>] [<url>] [--expect <string>] [--selector <css>] [--profile <name>] [--stealth] [--proxy <cc|smart>] [--proxy-sticky <id>] [--captcha] [--record] [--allow-record-profile] [--allow-page-actions] [--sso] [--sso-provider microsoft|google|auto] [--wait-for <css>] [--fill <css> --value <text>] [--click <css>] [--save-profile] [--verify|--no-verify] [--verify-with-profile] [--mobile] [--device <name>]
npx auspex login --profile <name> [--url <hint>] [--wait]
npx auspex finalize-login --profile <name> [--url <url>] [--expect <string>]
npx auspex await-login --profile <name> [--since-version <n>] [--timeout-ms <n>]
npx auspex profiles
npx auspex profile-status [--profile <name>] [--name <saved>] [--url <hint>]
npx auspex verify [runDir]
npx auspex desktop [--open <app>] [--type <text>] [--click <x,y>] [--expect <string>]
npx auspex reap [--dry-run] [--session <id>] [--vm <id>] [--pack-receipts] [--account-wide]
npx auspex mcp
```

`--sso` clicks Microsoft, then Google, then a generic Sign in with … button. Use with `--profile`. `--sso-provider` pins a vendor. Agents must never type passwords: `--fill` / `fill` is refused on `input[type=password]` selectors, and Microsoft and Google password/OTP walls return `needsHuman: true`. `--profile` applies the saved Playwright storage state onto a new context **before first navigation** (`chromium.connect` does not expose Solari's default context). Empty seeds (0 cookies and 0 origins) fail closed unless `--sso`. `--save-profile` writes cookies, localStorage, and sessionStorage via `POST /profiles/:id/save` and **refuses an empty overwrite, a public /landing session, or a save with no bytes for the page origin**. A later `--profile` check that lands on `/landing`, `/login`, or `/` without a matched expect is `ok: false` with `reason: loggedOut`. `record`+`profile` is forbidden unless `--allow-record-profile` on a public marketing host. `--allow-record-profile` is refused for consistencyhub. Never `--record` with `--sso`, `--save-profile`, or a dashboard landing. `fill`/`click` with a profile requires `--allow-page-actions`. `--verify-with-profile` enables profile-seeded claim verification (adds `claimOkProfile`/`claimErrorsProfile` to receipt) and skips anonymous claim check (integrity still runs; `ok` requires only `verify.ok` when anonymous claim skipped); for `--name consistencyhub`, this flag also enables the verify step (which is skipped by default without explicit `--verify`). **`--mobile`** and **`--device <name>`** apply Playwright BrowserContextOptions (viewport, userAgent, deviceScaleFactor, isMobile, hasTouch) to browser.newContext(). **Best-effort mobile emulation**: effectiveness depends on Solari cloud Chrome respecting Playwright viewport/UA overrides; not verified against live Solari sessions. Receipt `ok` is agent success (same on stdout, MCP, and on-disk `manifest.json`); optional `protocolOk` is URL+PNG protocol success and is not a second `ok`.

## MCP hosts

Primary door after `npm install` at the repository root: `npx auspex-mcp`.

- **stdio:** `npx auspex-mcp` from the repo root (or `npx tsx src/mcp.ts` from this directory).
- **Cursor** — `.cursor/mcp.json` in this repo. Also `mcp.cursor.example.json`.
- **Claude Desktop** — merge `mcp.claude.example.json`.
- **Grok** — `grok.mcp.example.toml` (`npx auspex-mcp` from the clone; if PATH lacks node, pin absolute `node` + `bin/auspex-mcp.mjs`).
