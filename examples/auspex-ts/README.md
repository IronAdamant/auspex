# Auspex

Web eyes for **coding agents**. An agent calls Auspex; Solari boots a **throwaway Chrome in their cloud** (not on your Mac); the agent gets JSON + a PNG; the session is killed. You do not sit in that browser.

This is not Browser Use, not local Playwright, and not a tab in your Chrome. Humans only see the receipt (stdout, screenshot, optional replay) and, if a login is needed, **one chooser URL** (`handoff.url` / `oneLiner` → `door.html`) plus labeled deep links: the Auspex phone page (`handoff.mobileUrl`, real text field — seed/handoff door for off-site typing, not a same-session VNC takeover) and the Auspex desktop page (`handoff.desktopUrl`, `desktop.html` when login minted it). Click the remote address bar (or the remote field you mean to fill) before typing anything. Keys stream into Solari remote Chrome as you type (no Paste button). Enter clears the local field. Show as bullets is off by default so a password manager can paste into the text field; checking it only masks display (`type=password`); remote still gets real characters. ironadamant.com does not see the password or any keystrokes; the destination site logs its own login. If cookies or cache are cleared, or the remote session or saved profile is wiped, type the login again. Auspex and ironadamant.com do not host those credentials or session secrets; they live only in the remote Chrome session and on the destination site. They stay off agent chat / MCP / receipts. Solari’s own handoff is noVNC and will not open a phone keyboard.

Use it when a live page, JS paint, a login, or an audit still is the point. Do not use it to scrape at scale.

## How this was built

Grok 4.6 in Grok Build wrote the CLI, MCP server, and Solari wiring. I pointed it at the intern challenge, the cookbook, and my own sites (ironadamant.com, Checkpoint, ConsistencyHub). AI used: the Solari SDK, not a stub; Microsoft/Google SSO click-through after a real console profile save; Grok MCP handshake (Content-Length + absolute `node`). I ran the live checks, saved the Solari profile, and wrote the public post. Private research notes never left this machine.

Public watch tape is ConsistencyHub’s Microsoft wall (not a logged-in session). Ironadamant still has a still + JSON:

- Still: [demo/ironadamant.png](demo/ironadamant.png)
- JSON + `sessionId`: [demo/receipt.json](demo/receipt.json) (**marketing summary** with `sessionId` + verify flags; agent contract is schema v1 on CLI/MCP stdout — see [Receipt schema v1](../../AGENTS.md#receipt-schema-v1-frozen))
- Watch: generate the rrweb player with `npm run generate:replay` (from committed `demo/replay.ndjson`; the checked-in `demo/replay.html` is a stub). Emails and passwords are stripped. Pages CI generates the player at [ironadamant.com/auspex/demo/replay.html](https://ironadamant.com/auspex/demo/replay.html).
- Same recording in **your** Solari org: [console](https://console.getsolari.com) → Sessions → that `sessionId` → Replay.

`--record` does not put a presigned replay URL on the JSON receipt. It does poll until replay is ready (`replayReady`) and may write `replay.ndjson` next to the receipt. Do not `--record` a logged-in ConsistencyHub session (recordings capture input).

![Solari cloud Chrome checking ironadamant.com](demo/ironadamant.png)

**Auspex MCP is the product** (`auspex_check`, `auspex_verify`, `auspex_desktop`, `auspex_reap`, login/profiles, `auspex_job` / `auspex_job_status`). Official Solari MCP is **optional and gated**: `dist/solari-mcp.mjs` starts `@solarisdk/mcp` only when `SOLARI_API_KEY` is set. No key → process exits so hosts do not list empty `solari_*` tools.

## Run

```bash
cd examples/auspex-ts
npm install
# Optional: gitignored .env is loaded only if SOLARI_API_KEY is unset. Prefer export.
export SOLARI_API_KEY
npx auspex check https://ironadamant.com --expect "One office job."
npx auspex check --name ironadamant
npx auspex check --name checkpoint
npx auspex login --url https://app.example
# mint is traced; if silent or login fails, read traceSummary / npx auspex trace (not a fourth primitive)
npx auspex await-login --profile app-example --save-editor
npx auspex finalize-login --profile app-example --url https://app.example --expect "Workspace ready"
npx auspex profile-status --profile app-example --url https://app.example --expect "Workspace ready"
npx auspex check --profile app-example --url https://app.example --expect "Workspace ready"
# optional: --verify-with-profile after a live match; do not treat ok alone as reusable.
# Do not also run verify after a default / VWP check.
npm run public-check   # ironadamant.com + checkpointprojects.com; skips if no key
```

The generic `login --url` / `--profile <yours>` path is the recipe (`https://app.example` derives `--profile app-example`). A named saved check is optional; see [Worked example (dogfood)](#worked-example-dogfood). Frozen door sequence (not a same-session takeover): mint → human login in the door → human Save → `await-login --save-editor` → `finalize-login` (unique expect) → later `check` / optional `--verify-with-profile`. See root [AGENTS.md](../../AGENTS.md#frozen-agent-door-sequence). Expect must be unique to the logged-in app and absent from public marketing copy. Prefer the URL the logged-in app itself lands on (Clozemaster `/languages`, not a `/dashboard` that redirects). An expect miss with cookies present is not proof of login. Match is case-sensitive and word-bounded (`Dashboard` does not match `One Dashboard`, a Socialaize-style pitfall). A text hit on `/`, `/landing`, `/login`, `/signup`, or `/auth` during finalize is `reason: expectMatchedPublicLanding` (`ok` false, `matched` false, profile not saved).

Always close the browser session (the CLI does this in `finally`) and **kill** the sandbox VM (`verify` does this in `finally`; `close()` is not teardown). Never commit `.env`, the API key, or `.auspex/` run artifacts.

### Commands

```
npx auspex check [--name <ironadamant|checkpoint|consistencyhub>] [<url>] [--expect <string>] [--selector <css>] [--profile <name>] [--stealth] [--proxy <cc|smart>] [--proxy-sticky <id>] [--captcha] [--record] [--allow-record-profile] [--allow-page-actions] [--sso] [--sso-provider microsoft|google|auto] [--wait-for <css>] [--fill <css> --value <text>] [--click <css>] [--save-profile] [--verify|--no-verify] [--verify-with-profile] [--mobile] [--device <name>]
npx auspex verify [runDir]
npx auspex finalize-login --profile <name> [--url <url>] [--expect <string>]
npx auspex desktop [--open <app>] [--type <text>] [--click <x,y>] [--expect <string>]
npx auspex reap [--dry-run] [--session <id>] [--vm <id>] [--pack-receipts] [--account-wide]
npx auspex login [--profile <name>] [--url <https>] [--wait]
npx auspex await-login --profile <name> [--since-version <n>] [--timeout-ms <n>] [--save-editor] [--url <https>] [--expect <string>] [--no-chain-finalize]
npx auspex profiles [--purge <name>] [--yes]
npx auspex profile-status [--profile <name>] [--name <saved>] [--url <hint>]
npx auspex trace [--profile <name>] [--limit <n>] [--all]
npx auspex job [--job-id <id>] [--name <saved>] [--profile <name>] [--url <https>] [--expect <string>] [--skip-finalize] [--verify-with-profile] [--wait] [--wake-webhook <url>] [--timeout-ms <n>]
npx auspex job-status --job-id <id> [--wait-ms <n>]
```

**Mint debug (for agents):** `login` writes a redacted JSONL lead-up log (`event: login` for the mint; gitignored `.auspex/trace/login.jsonl`). After the handoff is ready, production writes one redacted post-handoff row (status and fold reason: empty-save, editor 401, no-cdp, or finalize needsHuman). Check rows are not written. `mintStage: ready` only when VNC/token mint succeeded. If Chromium never comes up, read `traceSummary` on the login JSON or run `npx auspex trace` **before reminting**. The summary names the stop (missing key, 429, 402, 503, no URL, editor-start HTTP, VNC timeout, empty handoff token). Never tokens or passwords. Not a fourth primitive.

`login` creates or reuses a named Solari profile and mints **once**. `handoff.url` / `oneLiner` is the chooser (`door.html`). Labeled deep links: `handoff.mobileUrl` (phone.html) and `handoff.desktopUrl` (desktop.html). `--url` without `--profile` derives a safe host slug (`app.example.com` → `app-example-com`) and echoes it on stdout, `next`, and phone Save paste. `--profile` wins. A new host must not keep a previous `--profile`: `login`, `await-login`, and `finalize-login` still run and, on a slug mismatch, set `profileHostMatch` false, `suggestedProfile`, and a remint `next`. Saved-check host affinity (`consistencyhub` on `consistencyhub.io`) stays a match. If the live browser host changes to a different site mid-handoff, await and finalize fail closed (`hostChanged`, remint `auspex_login` for that https origin) and do not save into the old profile. The password field is not a site picker. Phone: `handoff.mobileUrl` (Auspex phone page with a real text field — seed/handoff door, not a same-session VNC takeover). Computer: `handoff.desktopUrl`. Show as bullets is off by default so a password manager can paste into the text field; checking it only masks display (`type=password`); remote still gets real characters. The agent never handles the password. On the phone or desktop page, tap Save (copies a line; paste it in the AI chat), then `await-login --profile <yours> --save-editor`. Do not open Solari’s handoff page on a phone (`GET editor HTTP 401`). A Save that stores **0 cookies and 0 origins** is not success. `--save-editor` / console Save do **not** refresh folded sessionStorage unless `editorFold.ok` (Microsoft OAuth SPAs keep `accessToken` + `expiresOn` there). If `editorSave` fails (e.g. 401) or `editorFold` is `no-cdp`, finalize-login NOW while the token is live; remint if finalize returns `needsHuman`. Stale/weak `next` remint or finalize-now — do not run `--verify-with-profile` on a dead fold. After Microsoft login run `finalize-login --profile <name> --url <url> --expect <string>` **while the token is valid** (saved-check profiles may omit url/expect). Then `check --profile <name> --url <url> --expect <string>` in a new session. Login does not hold an Auspex check session open. `--mobile` / `--device` emulates a phone viewport on cloud Chrome; it is not the phone-login door.

`--stealth` / `--proxy` / `--captcha` need Starter or higher (402 FeatureRequiresPlan on Free — not retryable). Proxy and captcha imply stealth. `--profile` restores cookies, localStorage, and sessionStorage onto a new Playwright context **before first navigation** (Solari's default context is not visible over `chromium.connect`). Empty seeds fail closed unless `--sso`. `--save-profile` persists cookies, localStorage, and sessionStorage via `POST /profiles/:id/save` and refuses an empty overwrite, a public `/landing` session, or a save with no bytes for the page origin. `--sso` clicks **Sign in with Microsoft**, then Google, then a generic Sign in with … button (`--sso-provider` pins a vendor). Microsoft **and Google** password/OTP walls fail closed (`needsHuman`) and are never typed. A `--profile` check that lands on `/landing`, `/login`, or `/` without a matched expect is `ok: false` with `reason: loggedOut`. `record`+`profile` is forbidden unless `--allow-record-profile` on a public marketing host. `--allow-record-profile` is refused for consistencyhub. Never `--record` a logged-in session.

`--wait-for`, `--fill`+`--value`, and `--click` run after goto/SSO and before extract. fill/click with a profile (including `--name consistencyhub`) requires `--allow-page-actions`. **`ok` is agent success** (`reason` is `matched`, and sandbox verify passed when it ran — same on stdout, MCP, and on-disk `manifest.json`). Optional `protocolOk` is URL+PNG protocol success (not leftover auth); do not treat it as a second `ok`. `matched` is the word-bounded, case-sensitive expect hit. `reason` is always set (`matched` / `loggedOut` / `needsHuman` / `mismatch` / `network` / `recordedLoggedIn` / `expectMatchedPublicLanding` / `hostChanged` / `stream-expired`). CLI stdout is one JSON object. **schemaVersion 1 is frozen** (required: `schemaVersion`, `ok`, `reason`, `url`, `expect`, `screenshotPath`; extra keys optional — see root [AGENTS.md](../../AGENTS.md#receipt-schema-v1-frozen)). Exit 0 only when `ok` is true. Check verifies by default (sandbox HTTP + OCR) except `--name consistencyhub`, `--profile consistencyhub`, or an attached profile on a non-public-marketing URL (anonymous fetch cannot see auth-gated UI). Public marketing still verifies with a leftover profile. No profile still verifies. `--verify` forces anonymous verify (poisons `ok` on auth-gated pages). `--verify-with-profile` is the dogfood path (`claimOkProfile` is the profile-reuse gate; `ok` alone is not enough to treat the profile as reusable). `--no-verify` skips. `loggedOut`/`needsHuman`/`expectMatchedPublicLanding` skip verify and are not retried. `needsHuman` omits the screenshot/MCP image and strips digit runs from excerpt.

**429 ConcurrencyLimitExceeded is not retryable.** Call `auspex_reap` (or `solari_browser_close` / `solari_kill` if that MCP started) to free leftover **ledger** sessions, then retry. Default reap does not kill every VM on the key; `--account-wide` does. `reap --pack-receipts` copies last receipts per URL into `.auspex/pack` for a PR attach.

**Browser then sandbox:** `check` writes `.auspex/runs/<stamp>/{manifest.json,screenshot.png}` (PNG scaled under 2 MiB so verify can upload it). Default `check` on public marketing pages (or `check … --verify`) boots a **headless** Solari microVM, uploads that receipt, independently re-checks `expect` (HTTP fetch + optional Tesseract OCR of the PNG — not `manifest.ok`), and **kills** the VM. Integrity (`ok`/`errors`) is separate from claim (`claimOk`/`claimErrors`) and from profile-seeded `claimOkProfile`. Do not also run `verify` after a default check. `--no-verify` leaves a check-only receipt. Optional `[runDir]`; default is the latest run.

Stdout for `check` is JSON: `ok`, `reason`, `url`, `expect`, `screenshotPath`, then `title`, `finalUrl`, `matched`, `excerpt`, `sessionId`, `networkIdle`, optional `diff` / `verify` / `replayReady` / action fields. Files land in `.auspex/runs/<timestamp>/`. `--record` does not put a presigned replay URL on the receipt. Refresh the public demo with `npx tsx scripts/save-demo-receipt.ts`.

`desktop` is a named Solari sandbox demo (default Mousepad). Not the user's Mac. 402 on Free. Wait, expect, and `ok` share one process haystack (`processList` + `ps`). `windowOk` is set only when a real window list exists. A `--click x,y` is attempted but `clicked` is not claimed. **FAIL-CLOSED `--type`** refuses password/OTP-like strings. `streamUrl` is the live VNC; Auspex still kills after the shot.

`profile-status` reports `loggedIn` / `loggedOut` / `needsHuman` / **`weakSeed`** / **`emptySave`**. `weakSeed` is cookies/origins with a counted `sessionStorage === 0`, or folded `__auspex_ss__:expiresOn` past/within ~5m (leftover count is not fresh). Public marketing saved checks stay `loggedOut`. `emptySave` = profile not found or empty. The agent never types a password and does not ping the user. If the live probe needs a human, skip live and report it.

## MCP

Auspex tools first. After a clone: `npm install && npm run build:mcp` (do not commit `dist/`). CI and founder `prepublishOnly` build the same way. Missing `dist/mcp.mjs` fail-closes (`DistMissing`).

**Cursor** — `.cursor/mcp.json` in this repo is the drop-in (same shape as [mcp.cursor.example.json](mcp.cursor.example.json)). After clone run `npm install && npm run build:mcp`, then restart Cursor. That plus `npm run public-check` is the loop: MCP tools for agents, weekly public pages for CI.

**Claude Desktop** — merge [mcp.claude.example.json](mcp.claude.example.json) into `claude_desktop_config.json` with an absolute path (same `npm install && npm run build:mcp`).

**npx (stdio):** from the repo root, `npm run build:mcp` then `npx auspex-mcp` or `node bin/auspex-mcp.mjs`. Equivalent without dist: `npx tsx src/mcp.ts` from this directory.

**Grok** — copy both tables from [grok.mcp.example.toml](grok.mcp.example.toml) into `~/.grok/config.toml`. After clone: `npm install && npm run build:mcp`, then `npx auspex-mcp`. If PATH lacks node, pin absolute `node` + `bin/auspex-mcp.mjs` (still needs `dist/mcp.mjs`). Official Solari sibling is `dist/solari-mcp.mjs`. Dual Content-Length transport is Grok-specific.

Tools:

- `auspex_check` — JSON + JPEG attach (verifies by default via sandbox HTTP + OCR except `name=consistencyhub` / `profile=consistencyhub` / an attached profile on a non-public-marketing URL; public marketing still verifies with a leftover profile; `verify=false` skips; `verify=true` is anonymous and poisons `ok` on auth-gated pages; `verifyWithProfile` is the dogfood `claimOkProfile` reuse-gate path — `ok` alone is not enough to treat the profile as reusable; `name` runs a saved check; `saveProfile` persists a non-empty seed)
- `auspex_verify` — only after `verify=false`. Headless VM independently audits expect, then **kill**
- `auspex_reap` — 429 recovery: close leftover browsers, kill holding VMs; `packReceipts` for PR attach
- `auspex_login` / `auspex_await_login` / `auspex_finalize_login` / `auspex_profiles` / `auspex_profile_status` (`loggedIn` / `loggedOut` / `needsHuman` / `weakSeed` / `emptySave`). Login: show `handoff.url` (chooser) plus labeled `handoff.mobileUrl` (Auspex phone page, real text field; seed/handoff door, not a same-session VNC takeover; Save copies a paste line) and `handoff.desktopUrl` (computer). After Save on the phone or desktop page, `saveEditor` / `--save-editor`. editorSave 200 with editorFold no-cdp and cookies: finalize NOW. If editorSave fails, remint. Solari noVNC will not open the phone keyboard.
- `auspex_desktop` — named sandbox desktop demo, screenshot, **kill**. ASCII log **and** JSON. `streamUrl` for VNC. FAIL-CLOSED `type` refuses password/OTP-like strings. Not the user's Mac. 402 on Free.
- `auspex_job` / `auspex_job_status` — durable mint→await→finalize→check for autonomous agents (not a fourth primitive). Resume with `jobId`. Optional `AUSPEX_WAKE_WEBHOOK`. Step tools remain for debugging.

The weekly public loop (Checkpoint + ironadamant.com `One office job.`): `npm run public-check`. GitHub Actions `public` job runs Mondays and on `workflow_dispatch`. Repo secret `SOLARI_API_KEY` is **present** (masked). Observed: [Actions run 35605123361](https://github.com/IronAdamant/auspex/actions/runs/35605123361) (Mon 2026-09-21) — ironadamant + checkpoint `ok: true`. The step still skips with exit 0 if that secret were unset (PRs not blocked). Do not remove the secret. The workflow does not commit artifacts; demo files are refreshed by hand. Do not `--record` a logged-in ConsistencyHub session.

Live public checks: ironadamant.com (`One office job.`), checkpointprojects.com (`Checkpoint`). Auth-gated dogfood is the optional named check in [Worked example (dogfood)](#worked-example-dogfood).

See [AGENTS.md](../../AGENTS.md) (canonical) and [DEMO.md](DEMO.md).

## Worked example (dogfood)

ConsistencyHub / OneDrive are **evidence that auth-gated SaaS works** — not the default recipe. The generic `login --url` / `--profile <yours>` path is the recipe; `--name consistencyhub` is the verified example. Do not invent that any host works without dogfood.

```bash
npx auspex login --profile consistencyhub
npx auspex await-login --profile consistencyhub --save-editor
npx auspex finalize-login --profile consistencyhub
npx auspex profile-status --name consistencyhub
npx auspex check --name consistencyhub --verify-with-profile
```

**Verified 2026-09-18:** `ok=true`, `claimOkProfile=true` on the redacted auth-gated SaaS demo receipt (`demo/consistencyhub-receipt.json`). Do not fold `claimOkProfile` into `ok`. Same Microsoft profile on OneDrive is **receipt-only** evidence (`demo/onedrive-receipt.json`, `claimOkProfile=true`) — **no raw OneDrive PNG**. Dual pack is evidence, not the default recipe.
