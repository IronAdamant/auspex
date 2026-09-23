# Auspex

Agents report a dashboard loaded when the page is still the login screen. Auspex checks that claim on Solari cloud Chrome, then a second machine checks it again.

Cloud Chrome check → independent sandbox verify → tear-down. **`ok` ≠ `claimOk` ≠ `claimOkProfile`.** We do not claim Alice-vs-Bob wrong-account detection. Never types passwords.

## For Reviewers

The ironadamant one-liner is a **measured public check (no login)**. It does **not** prove logged-in honesty. The **auth-gated** triad is the **redacted auth-gated SaaS demo** receipt (`ok` / `claimOk` / `claimOkProfile`). The generic recipe is `login --url <https>` (derives `--profile` from the host; override `--profile <yours>`) plus *their* URL and expect — not a named dogfood host. See [RECEIPTS.md](RECEIPTS.md).

| Door | Open this |
| --- | --- |
| **Watch** (no clone, no key) | [Landing](https://ironadamant.com/auspex/) · [rrweb player](https://ironadamant.com/auspex/demo/replay.html) (auth-gated Microsoft wall, emails/passwords stripped) |
| **Auth-gated evidence** | Redacted auth-gated SaaS [receipt](examples/auspex-ts/demo/consistencyhub-receipt.json) — [RECEIPTS.md](RECEIPTS.md) |
| **Public check (no login)** | `npx auspex-solari check --name ironadamant` |
| **Any host** | `npx auspex-solari check https://example.com --expect "Example Domain"` |
| **Any Microsoft-gated host** | `npx auspex-solari login --url <https>` (derives `--profile` from the host; override `--profile <yours>`). Open `handoff.url` (chooser: Phone or Desktop, same hash). Phone: `handoff.mobileUrl` (Auspex page, real keyboard — seed/handoff door, not a same-session VNC takeover). Desktop: `handoff.desktopUrl`. Tap Save (copies a line; paste it in the AI chat). Then `await-login --profile <yours> --save-editor`, `finalize-login`, `check`. Never `--record`. |
| **MCP** | `npx -p auspex-solari auspex-mcp` |
| **Login stall** | After `login` mint, if nothing happens or login fails, read `traceSummary` / `npx auspex-solari trace` before reminting. Not a fourth primitive. |
| **Issues** | On. The weekly `public` job still skips without a repo `SOLARI_API_KEY` secret (not set). |
| **Do not** | Type passwords · `--record` a logged-in session · commit `SOLARI_API_KEY` / `.env` / `.auspex/` |

```bash
export SOLARI_API_KEY=slr_live_…   # console.getsolari.com — env only, never commit
npx auspex-solari check --name ironadamant
npx auspex-solari check https://example.com --expect "Example Domain"
npx -p auspex-solari auspex-mcp
```

Do not run npm `auspex` (a different scraper). After a clone, `npx auspex` and `npx auspex-mcp` are the local bins.

Built for [Pinetree Research's intern challenge](https://x.com/harrychow_/status/2094437473912844480) ([submissions close 30 Sep](https://x.com/harrychow_/status/2099130594076557556)). Thesis: [PITCH.md](PITCH.md).

![Solari cloud Chrome checking ironadamant.com (measured public check, no login)](examples/auspex-ts/demo/ironadamant.png)

### Auth-gated SaaS (redacted demo)

**Redacted auth-gated SaaS demo** — blurred dashboard proving the verification triad stays honest. Blur ≠ blank fail. Name in the demo path is the dogfood host, not the default recipe.

![Redacted auth-gated SaaS demo (blur protects PII)](examples/auspex-ts/demo/consistencyhub.png)

**Verification triad:** `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`** (profile-seeded verify passed). See [`demo/consistencyhub-receipt.json`](examples/auspex-ts/demo/consistencyhub-receipt.json) and [RECEIPTS.md](RECEIPTS.md). Schema v1 public receipt: [`demo/ironadamant-receipt.json`](examples/auspex-ts/demo/ironadamant-receipt.json) (`parseReceiptV1`).

Full agent instructions: [AGENTS.md](AGENTS.md) · Package: [examples/auspex-ts](examples/auspex-ts)

## What we shipped

Three primitives: browser check, sandbox verify, named sandbox desktop demo. Login / finalize / profile-status / reap / trace are the auth + hygiene doors.

- **`auspex_check`** — cloud Chrome: goto, optional wait-for (fill/click without a profile, or with `--allow-page-actions`), snapshot, claim check, close. **Verifies by default** (HTTP + OCR) except **`name=consistencyhub`**, **`profile=consistencyhub`**, or **any attached profile on a non-public-marketing URL** (shared `shouldVerifyCheck`). Public marketing still verifies with a leftover profile. No profile still verifies. `--verify` forces anonymous verify (poisons `ok` on auth-gated pages). `--verify-with-profile` is the dogfood claim recheck (`claimOkProfile` is the profile-reuse gate; `ok` alone is not enough to treat the profile as reusable). Frozen **schema v1**: `schemaVersion`, `ok`, `reason`, `url`, `expect`, `screenshotPath`.

- **`auspex_login` / `auspex_await_login`** — one mint, one chooser (`handoff.url` / `oneLiner` → `door.html`) plus labeled deep links. `login --url` without `--profile` derives a host slug and echoes it on `next` / phone Save paste; `--profile` wins. Phone: `handoff.mobileUrl` (Auspex phone page with a real text field; Save copies a line to paste in the AI chat). Computer: `handoff.desktopUrl` (Auspex desktop page when minted, otherwise Solari console Open editor). Those pages are seed/handoff doors for off-site typing, **not** a same-session VNC takeover. Keys go into remote Chrome (and the site); they stay off agent chat / MCP / receipts. Solari noVNC will not open the phone keyboard. After Save on the phone or desktop page, `await-login --profile <yours> --save-editor`. Empty Save is not success. Soft-warns if cookies/origins exist but sessionStorage is missing, or folded `expiresOn` is stale. If `editorSave` fails (e.g. 401) or `editorFold` is `no-cdp`, `next` says finalize-login NOW; remint if finalize returns `needsHuman`. Stale/weak `next` remint or finalize-now — do not run `--verify-with-profile` on a dead fold. **`--save-editor` does not refresh folded sessionStorage** unless `editorFold.ok`. SPAs that keep tokens in sessionStorage still need `finalize-login` while the token is valid. `--mobile` / `--device` is viewport emulation on cloud Chrome, not this phone-login door.

- **`auspex_finalize_login`** — post-login one-shot: SSO + `--save-profile` to capture sessionStorage. Saved-check profiles (e.g. `consistencyhub`) supply URL and expect; unknown profiles require `--url` and `--expect`. Same as `check --profile … --sso --save-profile`.

- **`auspex_verify`** — only if you passed `verify=false`. Headless sandbox re-checks PNG + JSON. Integrity `ok` is separate from claim `claimOk`. Kills the VM.

- **`auspex_profile_status`** — `loggedIn` / `loggedOut` / `needsHuman` / **`weakSeed`** / **`emptySave`**. `weakSeed` is cookies/origins with a counted `sessionStorage === 0`, or folded `__auspex_ss__:expiresOn` past/within ~5m (leftover count is not fresh). Public marketing saved checks stay `loggedOut`. `emptySave` = profile not found or empty. Human SSO once; **the agent never types a password.**

- **`auspex_reap`** — list/kill leftover **ledger** sessions after `429`. `--account-wide` wipes all VMs. `--pack-receipts` copies last receipts per URL into `.auspex/pack/`.

- **`auspex_trace`** — last login **mint** episode plus `traceSummary` (agents: read this if Chromium never comes up). Mint rows are `event: login` (API key, profile ensure, handoff POST, editor-start, editor-token). After the handoff is ready, production writes one redacted post-handoff row (status and fold reason: empty-save, editor 401, no-cdp, or finalize needsHuman). Check rows are not written. `mintStage: ready` only when VNC/token mint succeeded. If mint is silent or fails, read `traceSummary` / `npx auspex-solari trace` **before reminting**. Never tokens, passwords, excerpts, or session ids. Not a fourth primitive. Never commit `.auspex/`.

- **`auspex_desktop`** — named Solari sandbox Mousepad demo, not the user's Mac. 402 on Free.

### Fail-closed design

- **No password typing:** SSO handoff URL (human signs in once); `--fill` refused on `input[type=password]`; Microsoft/Google walls return `needsHuman`. Desktop `--type` refuses password/OTP-like strings.
- **No logged-in recording by default:** `--record` + `--profile` is forbidden unless `--allow-record-profile` on a public marketing host. Refused for consistencyhub.
- **No page actions with profiles by default:** `--fill` / `--click` with a profile requires `--allow-page-actions`.
- **Schema v1 frozen:** `schemaVersion: 1` on stdout. CLI and MCP are the same contract.
- **`ok` ≠ `claimOk` ≠ `claimOkProfile`:** After `--verify-with-profile`, **`claimOkProfile` is the reuse gate** — `ok` alone is not enough to treat the profile as reusable.

## Worked example (dogfood)

ConsistencyHub and OneDrive are **evidence** — not the default recipe. Use `login --url` (or `--profile <yours>`) plus *their* URL and expect first. This named check is the verified auth-gated example. Do not invent that any host works without dogfood.

Console Save and `--save-editor` do not refresh folded sessionStorage unless `editorFold.ok`. SPAs that keep tokens in sessionStorage still need `finalize-login` while the token is valid. If await-login/`profile-status` says stale or weakSeed, remint or finalize-now — do not expect `--verify-with-profile` to succeed on a dead fold.

```bash
npx auspex-solari login --profile consistencyhub
# human: open handoff.url (chooser) → Phone or Desktop, Microsoft + OneDrive consent, tap Save (copies a paste line). Do not intern-ping.
npx auspex-solari await-login --profile consistencyhub --save-editor
npx auspex-solari finalize-login --profile consistencyhub
npx auspex-solari check --name consistencyhub
npx auspex-solari check --name consistencyhub --verify-with-profile
```

OneDrive with the same Microsoft profile is **recipe only** (no committed PNG/receipt). See [RECEIPTS.md](RECEIPTS.md).

## MCP first (Cursor / Claude / Grok)

`.cursor/mcp.json` is committed. Auspex tools are the product; official Solari MCP is an optional gated sibling.

```bash
npx -p auspex-solari auspex-mcp
# after a clone, from the repo root: npx auspex-mcp
# or: npx tsx src/mcp.ts   # from examples/auspex-ts
```

Official `@solarisdk/mcp` exits unless `SOLARI_API_KEY` is set so hosts do not list empty `solari_*` tools. Prefer `auspex_reap` for 429 recovery.

The GitHub Actions `public` job is scheduled Monday + `workflow_dispatch` and **skips** without a repo `SOLARI_API_KEY` secret. This fork does not add that secret, so weekly live coverage is not running. Missing the secret does not fail pull requests. Run locally: `npx auspex-solari check --name ironadamant` and `--name checkpoint`, or `npm run public-check` from `examples/auspex-ts`.

## Links

- Pitch (hiring managers): [PITCH.md](PITCH.md)
- Agent instructions (any host): [AGENTS.md](AGENTS.md)
- Public receipts: [RECEIPTS.md](RECEIPTS.md)
- Issues is on. Weekly live coverage still skips without a repo `SOLARI_API_KEY` secret (not set).
- Console — [console.getsolari.com](https://console.getsolari.com)
- Docs — [docs.getsolari.com](https://docs.getsolari.com)

---

## Upstream cookbook (unmodified, not the submission)

This repo is a public fork of the Solari cookbook. GitHub's behind count is other cookbook examples added upstream after this fork. The submission is [examples/auspex-ts](examples/auspex-ts). Directories under [`examples/`](examples/) other than **[auspex-ts](examples/auspex-ts)** (the intern-challenge product) are the original Solari samples, unmodified, with no Auspex CI. Run them from their own folders for raw SDK patterns. One `slr_live_` key works across browsers, sandboxes, and desktops.

Gotchas the samples encode: call `await solari.close()` in TypeScript or the process hangs; recording is per session (`recording: true` at create); Auspex `--record` never puts a presigned `replayUrl` on stdout; sandbox `run("ls -la")` looks for a binary named `ls -la`; `kill()`, not `close()`, ends a VM; `timeoutMs` is a rolling idle window; 429 is not retryable — call `auspex_reap`.

---

MIT licensed.
