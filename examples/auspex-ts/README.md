# Auspex

Web eyes for **coding agents**. An agent calls Auspex; Solari boots a **throwaway Chrome in their cloud** (not on your Mac); the agent gets JSON + a PNG; the session is killed. You do not sit in that browser.

This is not Browser Use, not local Playwright, and not a tab in your Chrome. Humans only see the receipt (stdout, screenshot, optional replay) and, if a login is needed, **two labeled URLs**: the Auspex phone page (`handoff.mobileUrl`, real text field) or the Solari console (`handoff.desktopUrl`). Solari’s own handoff is noVNC and will not open a phone keyboard.

Use it when a live page, JS paint, a login, or an audit still is the point. Do not use it to scrape at scale.

## How this was built

Grok 4.6 in Grok Build wrote the CLI, MCP server, and Solari wiring. I pointed it at the intern challenge, the cookbook, and my own sites (ironadamant.com, Checkpoint, ConsistencyHub). AI used: the Solari SDK, not a stub; Microsoft/Google SSO click-through after a real console profile save; Grok MCP handshake (Content-Length + absolute `node`). I ran the live checks, saved the Solari profile, and wrote the public post. Private research notes never left this machine.

Public watch tape is ConsistencyHub’s Microsoft wall (not a logged-in session). Ironadamant still has a still + JSON:

- Still: [demo/ironadamant.png](demo/ironadamant.png)
- JSON + `sessionId`: [demo/receipt.json](demo/receipt.json) (**marketing summary** with `sessionId` + verify flags; agent contract is schema v1 on CLI/MCP stdout — see [Receipt schema v1](../../AGENTS.md#receipt-schema-v1-frozen))
- Watch: [demo/replay.html](demo/replay.html) (rrweb of ConsistencyHub → Sign in with Microsoft → empty Microsoft box). Emails and passwords are stripped. After clone, open that file locally, or the [Pages player](https://ironadamant.com/auspex/demo/replay.html) (jsDelivr serves this file as plain text).
- Same recording in **your** Solari org: [console](https://console.getsolari.com) → Sessions → that `sessionId` → Replay.

`--record` does not put a presigned replay URL on the JSON receipt. It does poll until replay is ready (`replayReady`) and may write `replay.ndjson` next to the receipt. Do not `--record` a logged-in ConsistencyHub session (recordings capture input).

![Solari cloud Chrome checking ironadamant.com](demo/ironadamant.png)

**Auspex MCP is the product** (`auspex_check`, `auspex_verify`, `auspex_desktop`, `auspex_reap`, login/profiles). Official Solari MCP is **optional and gated**: `dist/solari-mcp.mjs` starts `@solarisdk/mcp` only when `SOLARI_API_KEY` is set. No key → process exits so hosts do not list empty `solari_*` tools.

## Run

```bash
cd examples/auspex-ts
npm install
# Optional: gitignored .env is loaded only if SOLARI_API_KEY is unset. Prefer export.
export SOLARI_API_KEY
npx auspex check https://ironadamant.com --expect "One office job."
npx auspex check --name ironadamant
npx auspex check --name checkpoint
npx auspex check --name consistencyhub
npx auspex finalize-login --profile consistencyhub
npx auspex profile-status --name consistencyhub
npx auspex check --name consistencyhub --verify-with-profile
npx auspex verify
npm run public-check   # ironadamant.com + checkpointprojects.com; skips if no key
```

Always close the browser session (the CLI does this in `finally`) and **kill** the sandbox VM (`verify` does this in `finally`; `close()` is not teardown). Never commit `.env`, the API key, or `.auspex/` run artifacts.

### Commands

```
npx auspex check [--name <ironadamant|checkpoint|consistencyhub>] [<url>] [--expect <string>] [--selector <css>] [--profile <name>] [--stealth] [--proxy <cc|smart>] [--proxy-sticky <id>] [--captcha] [--record] [--allow-record-profile] [--allow-page-actions] [--sso] [--sso-provider microsoft|google|auto] [--wait-for <css>] [--fill <css> --value <text>] [--click <css>] [--save-profile] [--verify|--no-verify] [--verify-with-profile] [--mobile] [--device <name>]
npx auspex verify [runDir]
npx auspex finalize-login --profile <name> [--url <url>] [--expect <string>]
npx auspex desktop [--open <app>] [--type <text>] [--click <x,y>] [--expect <string>]
npx auspex reap [--dry-run] [--session <id>] [--vm <id>] [--pack-receipts] [--account-wide]
npx auspex login --profile <name> [--url <hint>] [--wait]
npx auspex await-login --profile <name> [--since-version <n>] [--timeout-ms <n>] [--save-editor]
npx auspex profiles
npx auspex profile-status [--profile <name>] [--name <saved>] [--url <hint>]
```

`login` creates or reuses a named Solari profile and prints **two labeled URLs**. Phone: `handoff.mobileUrl` (Auspex phone page with a real text field). Computer: `handoff.desktopUrl`. The agent never handles the password. On the phone, tap Save (copies a line; paste it in the AI chat), then `await-login --profile <name> --save-editor`. Do not open Solari’s handoff page on a phone (`GET editor HTTP 401`). A Save that stores **0 cookies and 0 origins** is not success. `--save-editor` / console Save do **not** refresh folded sessionStorage (ConsistencyHub keeps `accessToken` + `expiresOn` there), so after Microsoft login run `finalize-login --profile <name>` **while the token is valid** (or `check --profile <name> --sso --save-profile`). Then `check --name consistencyhub` (or `--profile <name>`) in a new session. Login does not hold an Auspex check session open. `--mobile` / `--device` emulates a phone viewport on cloud Chrome; it is not the phone-login door.

`--stealth` / `--proxy` / `--captcha` need Starter or higher (402 FeatureRequiresPlan on Free — not retryable). Proxy and captcha imply stealth. `--profile` restores cookies, localStorage, and sessionStorage onto a new Playwright context **before first navigation** (Solari's default context is not visible over `chromium.connect`). Empty seeds fail closed unless `--sso`. `--save-profile` persists cookies, localStorage, and sessionStorage via `POST /profiles/:id/save` and refuses an empty overwrite, a public `/landing` session, or a save with no bytes for the page origin. `--sso` clicks **Sign in with Microsoft**, then Google, then a generic Sign in with … button (`--sso-provider` pins a vendor). Microsoft **and Google** password/OTP walls fail closed (`needsHuman`) and are never typed. A `--profile` check that lands on `/landing`, `/login`, or `/` without a matched expect is `ok: false` with `reason: loggedOut`. `record`+`profile` is forbidden unless `--allow-record-profile` on a public marketing host. `--allow-record-profile` is refused for consistencyhub. Never `--record` a logged-in session.

`--wait-for`, `--fill`+`--value`, and `--click` run after goto/SSO and before extract. fill/click with a profile (including `--name consistencyhub`) requires `--allow-page-actions`. **`ok` is agent success** (`reason` is `matched`, and sandbox verify passed when it ran — same on stdout, MCP, and on-disk `manifest.json`). Optional `protocolOk` is URL+PNG protocol success (not leftover auth); do not treat it as a second `ok`. `matched` is the expect substring. `reason` is always set (`matched` / `loggedOut` / `needsHuman` / `mismatch` / `network` / `recordedLoggedIn`). CLI stdout is one JSON object. **schemaVersion 1 is frozen** (required: `schemaVersion`, `ok`, `reason`, `url`, `expect`, `screenshotPath`; extra keys optional — see root [AGENTS.md](../../AGENTS.md#receipt-schema-v1-frozen)). Exit 0 only when `ok` is true. Check verifies by default (sandbox HTTP + OCR) except `--name consistencyhub`, `--profile consistencyhub`, or an attached profile on a non-public-marketing URL (anonymous fetch cannot see auth-gated UI). Public marketing still verifies with a leftover profile. No profile still verifies. `--verify` forces anonymous verify (poisons `ok` on auth-gated pages). `--verify-with-profile` is the dogfood path (`claimOkProfile`; read that field, not only `ok`). `--no-verify` skips. `loggedOut`/`needsHuman` skip verify and are not retried. `needsHuman` omits the screenshot/MCP image and strips digit runs from excerpt.

**429 ConcurrencyLimitExceeded is not retryable.** Call `auspex_reap` (or `solari_browser_close` / `solari_kill` if that MCP started) to free leftover **ledger** sessions, then retry. Default reap does not kill every VM on the key; `--account-wide` does. `reap --pack-receipts` copies last receipts per URL into `.auspex/pack` for a PR attach.

**Browser then sandbox:** `check` writes `.auspex/runs/<stamp>/{manifest.json,screenshot.png}` (PNG scaled under 2 MiB so verify can upload it). Default `check` on public marketing pages (or `check … --verify`) boots a **headless** Solari microVM, uploads that receipt, independently re-checks `expect` (HTTP fetch + optional Tesseract OCR of the PNG — not `manifest.ok`), and **kills** the VM. Integrity (`ok`/`errors`) is separate from claim (`claimOk`/`claimErrors`) and from profile-seeded `claimOkProfile`. Do not also run `verify` after a default check. `--no-verify` leaves a check-only receipt. Optional `[runDir]`; default is the latest run.

Stdout for `check` is JSON: `ok`, `reason`, `url`, `expect`, `screenshotPath`, then `title`, `finalUrl`, `matched`, `excerpt`, `sessionId`, `networkIdle`, optional `diff` / `verify` / `replayReady` / action fields. Files land in `.auspex/runs/<timestamp>/`. `--record` does not put a presigned replay URL on the receipt. Refresh the public demo with `npx tsx scripts/save-demo-receipt.ts`.

`desktop` is a named Solari sandbox demo (default Mousepad). Not the user's Mac. 402 on Free. Wait, expect, and `ok` share one process haystack (`processList` + `ps`). `windowOk` is set only when a real window list exists. A `--click x,y` is attempted but `clicked` is not claimed. **FAIL-CLOSED `--type`** refuses password/OTP-like strings. `streamUrl` is the live VNC; Auspex still kills after the shot.

`profile-status` reports `loggedIn` / `loggedOut` / `needsHuman` / **`weakSeed`** / **`emptySave`**. `weakSeed` is cookies/origins with a counted `sessionStorage === 0`, or folded `__auspex_ss__:expiresOn` past/within ~5m (leftover count is not fresh). Public marketing saved checks stay `loggedOut`. `emptySave` = profile not found or empty. The agent never types a password and does not ping the user. If ConsistencyHub needs a human, skip live and report it.

## MCP

Auspex tools first. Rebuild with `npm run build:mcp` after changing `src/`.

**Cursor** — `.cursor/mcp.json` in this repo is the drop-in (same shape as [mcp.cursor.example.json](mcp.cursor.example.json)). Restart Cursor. That plus `npm run public-check` is the loop: MCP tools for agents, weekly public pages for CI.

**Claude Desktop** — merge [mcp.claude.example.json](mcp.claude.example.json) into `claude_desktop_config.json` with an absolute path.

**npx (stdio):** from the repo root, `npx auspex-mcp` or `node bin/auspex-mcp.mjs`. From this directory, `npx tsx src/mcp.ts`.

**Grok** — copy both tables from [grok.mcp.example.toml](grok.mcp.example.toml) into `~/.grok/config.toml`. Auspex hero is `npx auspex-mcp` from the clone; if PATH lacks node, pin absolute `node` + `bin/auspex-mcp.mjs`. Dual Content-Length transport is Grok-specific.

Tools:

- `auspex_check` — JSON + JPEG attach (verifies by default via sandbox HTTP + OCR except `name=consistencyhub` / `profile=consistencyhub` / an attached profile on a non-public-marketing URL; public marketing still verifies with a leftover profile; `verify=false` skips; `verify=true` is anonymous and poisons `ok` on auth-gated pages; `verifyWithProfile` is the dogfood `claimOkProfile` path; `name` runs a saved check; `saveProfile` persists a non-empty seed)
- `auspex_verify` — only after `verify=false`. Headless VM independently audits expect, then **kill**
- `auspex_reap` — 429 recovery: close leftover browsers, kill holding VMs; `packReceipts` for PR attach
- `auspex_login` / `auspex_await_login` / `auspex_finalize_login` / `auspex_profiles` / `auspex_profile_status` (`loggedIn` / `loggedOut` / `needsHuman` / `weakSeed` / `emptySave`). Login: show `handoff.mobileUrl` (Auspex phone page, real text field; Save copies a paste line) and `handoff.desktopUrl` (computer), labeled. After phone Save, `saveEditor` / `--save-editor`. Solari noVNC will not open the phone keyboard.
- `auspex_desktop` — named sandbox desktop demo, screenshot, **kill**. ASCII log **and** JSON. `streamUrl` for VNC. FAIL-CLOSED `type` refuses password/OTP-like strings. Not the user's Mac. 402 on Free.

The weekly public loop (Checkpoint + ironadamant.com `One office job.`): `npm run public-check`. GitHub Actions `public` job runs Mondays and on `workflow_dispatch`; it skips with exit 0 when `SOLARI_API_KEY` is unset. A **repo** secret named `SOLARI_API_KEY` is required for that job to run live; this repo does not add the secret, and missing it does not fail PRs. Do not `--record` a logged-in ConsistencyHub session.

Live: ironadamant.com (`One office job.`), checkpointprojects.com (`Checkpoint`), consistencyhub.io (`Document Editor` + saved `--profile`).

See [AGENTS.md](../../AGENTS.md) (canonical) and [DEMO.md](DEMO.md).
