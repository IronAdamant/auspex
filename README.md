# Auspex

Cloud Chrome check → independent sandbox verify → tear-down. **`ok` ≠ `claimOk` ≠ `claimOkProfile`.** We do not claim Alice-vs-Bob wrong-account detection. Never types passwords.

## For Reviewers

The ironadamant one-liner is a **public check (no login)**. It does **not** prove logged-in honesty. The **auth-gated** triad is the redacted ConsistencyHub receipt (`ok` / `claimOk` / `claimOkProfile`).

| Door | Open this |
| --- | --- |
| **Watch** (no clone, no key) | [Landing](https://ironadamant.com/auspex/) · [rrweb player](https://ironadamant.com/auspex/demo/replay.html) (ConsistencyHub, Microsoft, emails/passwords stripped) |
| **Public check (no login)** | `npx auspex-solari check --name ironadamant` |
| **Any host** | `npx auspex-solari check https://example.com --expect "Example Domain"` |
| **Any Microsoft-gated host** | `npx auspex-solari login --profile myapp --url <https>`. Phone: open `handoff.mobileUrl` (Auspex page, real keyboard). Tap Save (copies a line; paste it in the AI chat). Then `await-login --save-editor`, `finalize-login`, `check`. Never `--record`. |
| **MCP** | `npx -p auspex-solari auspex-mcp` |
| **Issues** | On. The weekly `public` job still skips without a repo `SOLARI_API_KEY` secret (not set). |
| **Do not** | Type passwords · `--record` logged-in ConsistencyHub · commit `SOLARI_API_KEY` / `.env` / `.auspex/` |

```bash
export SOLARI_API_KEY=slr_live_…   # console.getsolari.com — env only, never commit
npx auspex-solari check --name ironadamant
npx auspex-solari check https://example.com --expect "Example Domain"
npx -p auspex-solari auspex-mcp
```

Do not run npm `auspex` (a different scraper). After clone, `npx auspex` is the local bin.

Built for [Pinetree Research's intern challenge](https://x.com/harrychow_/status/2094437473912844480) ([submissions close 30 Sep](https://x.com/harrychow_/status/2099130594076557556)). Thesis: [PITCH.md](PITCH.md).

![Solari cloud Chrome checking ironadamant.com (public check, no login)](examples/auspex-ts/demo/ironadamant.png)

### Auth-gated SaaS (redacted ConsistencyHub)

**ConsistencyHub verified check** — blurred dashboard proving the verification triad stays honest. Blur ≠ blank fail.

![ConsistencyHub dashboard (blur protects PII)](examples/auspex-ts/demo/consistencyhub.png)

**Verification triad:** `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`** (profile-seeded verify passed). See [`demo/consistencyhub-receipt.json`](examples/auspex-ts/demo/consistencyhub-receipt.json) and [RECEIPTS.md](RECEIPTS.md). Schema v1 public receipt: [`demo/ironadamant-receipt.json`](examples/auspex-ts/demo/ironadamant-receipt.json) (`parseReceiptV1`).

Full agent instructions: [AGENTS.md](AGENTS.md) · Package: [examples/auspex-ts](examples/auspex-ts)

## What we shipped

Three primitives: browser check, sandbox verify, named sandbox desktop demo. Login / finalize / profile-status / reap are the auth + hygiene doors.

- **`auspex_check`** — cloud Chrome: goto, optional wait-for (fill/click without a profile, or with `--allow-page-actions`), snapshot, claim check, close. **Verifies by default** (HTTP + OCR) except **`name=consistencyhub`**, **`profile=consistencyhub`**, or **any attached profile on a non-public-marketing URL** (shared `shouldVerifyCheck`). Public marketing still verifies with a leftover profile. No profile still verifies. `--verify` forces anonymous verify (poisons `ok` on auth-gated pages). `--verify-with-profile` is the dogfood claim recheck (`claimOkProfile`; read that field, not only `ok`). Frozen **schema v1**: `schemaVersion`, `ok`, `reason`, `url`, `expect`, `screenshotPath`.

- **`auspex_login` / `auspex_await_login`** — two labeled URLs. Phone: `handoff.mobileUrl` (Auspex phone page with a real text field; Save copies a line to paste in the AI chat). Computer: `handoff.desktopUrl` (Solari console Open editor). Solari noVNC will not open the phone keyboard. After phone Save, `await-login --save-editor`. Empty Save is not success. Soft-warns if cookies/origins exist but sessionStorage is missing, or folded `expiresOn` is stale. Stale/weak `next` remints or finalize-now — do not run `--verify-with-profile` on a dead fold. **`--save-editor` does not refresh folded sessionStorage** unless `editorFold.ok`. ConsistencyHub still needs `finalize-login` while the token is valid. `--mobile` / `--device` is viewport emulation on cloud Chrome, not this phone-login door.

- **`auspex_finalize_login`** — post-login one-shot: SSO + `--save-profile` to capture sessionStorage. Saved-check profiles (e.g. `consistencyhub`) supply URL and expect; unknown profiles require `--url` and `--expect`. Same as `check --profile … --sso --save-profile`.

- **`auspex_verify`** — only if you passed `verify=false`. Headless sandbox re-checks PNG + JSON. Integrity `ok` is separate from claim `claimOk`. Kills the VM.

- **`auspex_profile_status`** — `loggedIn` / `loggedOut` / `needsHuman` / **`weakSeed`** / **`emptySave`**. `weakSeed` is cookies/origins with a counted `sessionStorage === 0`, or folded `__auspex_ss__:expiresOn` past/within ~5m (leftover count is not fresh). Public marketing saved checks stay `loggedOut`. `emptySave` = profile not found or empty. Human SSO once; **the agent never types a password.**

- **`auspex_reap`** — list/kill leftover **ledger** sessions after `429`. `--account-wide` wipes all VMs. `--pack-receipts` copies last receipts per URL into `.auspex/pack/`.

- **`auspex_desktop`** — named Solari sandbox Mousepad demo, not the user's Mac. 402 on Free.

### Fail-closed design

- **No password typing:** SSO handoff URL (human signs in once); `--fill` refused on `input[type=password]`; Microsoft/Google walls return `needsHuman`. Desktop `--type` refuses password/OTP-like strings.
- **No logged-in recording by default:** `--record` + `--profile` is forbidden unless `--allow-record-profile` on a public marketing host. Refused for consistencyhub.
- **No page actions with profiles by default:** `--fill` / `--click` with a profile requires `--allow-page-actions`.
- **Schema v1 frozen:** `schemaVersion: 1` on stdout. CLI and MCP are the same contract.
- **`ok` ≠ `claimOk` ≠ `claimOkProfile`:** After `--verify-with-profile`, read `claimOkProfile` — `ok` is not that signal.

## ConsistencyHub recipe (auth-gated example)

Console Save and `--save-editor` do not refresh folded sessionStorage unless `editorFold.ok`. ConsistencyHub still needs `finalize-login` while the token is valid (`accessToken` + `expiresOn` in sessionStorage). If await-login/`profile-status` says stale or weakSeed, remint or finalize-now — do not expect `--verify-with-profile` to succeed on a dead fold.

```bash
npx auspex login --profile consistencyhub
# human: open handoff.mobileUrl on the phone, Microsoft + OneDrive consent, tap Save (copies a paste line). Do not intern-ping.
npx auspex await-login --profile consistencyhub --save-editor
npx auspex finalize-login --profile consistencyhub
npx auspex check --name consistencyhub
npx auspex check --name consistencyhub --verify-with-profile
```

## MCP first (Cursor / Claude / Grok)

`.cursor/mcp.json` is committed. Auspex tools are the product; official Solari MCP is an optional gated sibling.

```bash
npx auspex-mcp
# or: npx tsx src/mcp.ts   # from examples/auspex-ts
```

Official `@solarisdk/mcp` exits unless `SOLARI_API_KEY` is set so hosts do not list empty `solari_*` tools. Prefer `auspex_reap` for 429 recovery.

The GitHub Actions `public` job is scheduled Monday + `workflow_dispatch` and **skips** without a repo `SOLARI_API_KEY` secret. This fork does not add that secret, so weekly live coverage is not running. Missing the secret does not fail pull requests. Run locally: `npx auspex check --name ironadamant` and `--name checkpoint`, or `npm run public-check` from `examples/auspex-ts`.

## Links

- Pitch (hiring managers): [PITCH.md](PITCH.md)
- Agent instructions (any host): [AGENTS.md](AGENTS.md)
- Public receipts: [RECEIPTS.md](RECEIPTS.md)
- Issues is on. Weekly live coverage still skips without a repo `SOLARI_API_KEY` secret (not set).
- Console — [console.getsolari.com](https://console.getsolari.com)
- Docs — [docs.getsolari.com](https://docs.getsolari.com)

---

## Upstream cookbook (unmodified, not the submission)

This repo is a public fork of the Solari cookbook. Directories under [`examples/`](examples/) other than **[auspex-ts](examples/auspex-ts)** (the intern-challenge product) are the original Solari samples, unmodified, with no Auspex CI. Run them from their own folders for raw SDK patterns. One `slr_live_` key works across browsers, sandboxes, and desktops.

Gotchas the samples encode: call `await solari.close()` in TypeScript or the process hangs; recording is per session (`recording: true` at create); Auspex `--record` never puts a presigned `replayUrl` on stdout; sandbox `run("ls -la")` looks for a binary named `ls -la`; `kill()`, not `close()`, ends a VM; `timeoutMs` is a rolling idle window; 429 is not retryable — call `auspex_reap`.

---

MIT licensed.
