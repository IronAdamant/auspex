# Auspex

Cloud Chrome check → independent sandbox verify → tear-down. `ok` ≠ `claimOk` ≠ `claimOkProfile`. Never types passwords.

## For Reviewers

The ironadamant one-liner is a **public check (no login)**. It does **not** prove logged-in honesty. The **auth-gated** triad is the redacted ConsistencyHub receipt (`ok` / `claimOk` / `claimOkProfile`).

| Door | Open this |
| --- | --- |
| **Watch** (no clone, no key) | [rrweb replay](https://cdn.jsdelivr.net/gh/IronAdamant/auspex@main/examples/auspex-ts/demo/replay.html) |
| **Public check (no login)** | `npx auspex check --name ironadamant` |
| **Any host** | `npx auspex check https://example.com --expect "Example Domain"` |
| **MCP** | `npx auspex-mcp` |
| **Issues** | This fork has no public GitHub Issues tracker (`has_issues` is false). |
| **Do not** | Type passwords · `--record` logged-in ConsistencyHub · commit `SOLARI_API_KEY` / `.env` / `.auspex/` |

```bash
git clone https://github.com/IronAdamant/auspex.git
cd auspex
npm install
export SOLARI_API_KEY=slr_live_…   # console.getsolari.com — env only, never commit
npx auspex check --name ironadamant
npx auspex check https://example.com --expect "Example Domain"
npx auspex-mcp
```

Built for [Pinetree Research's intern challenge](https://x.com/harrychow_/status/2094437473912844480) ([submissions close 30 Sep](https://x.com/harrychow_/status/2099130594076557556)). Thesis: [PITCH.md](PITCH.md).

![Solari cloud Chrome checking ironadamant.com (public check, no login)](examples/auspex-ts/demo/ironadamant.png)

### Auth-gated SaaS (redacted ConsistencyHub)

**ConsistencyHub verified check** — blurred dashboard proving the verification triad stays honest. Blur ≠ blank fail.

![ConsistencyHub dashboard (blur protects PII)](examples/auspex-ts/demo/consistencyhub.png)

**Verification triad:** `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`** (profile-seeded verify passed). See [`demo/consistencyhub-receipt.json`](examples/auspex-ts/demo/consistencyhub-receipt.json) and [RECEIPTS.md](RECEIPTS.md). Schema v1 public receipt: [`demo/ironadamant-receipt.json`](examples/auspex-ts/demo/ironadamant-receipt.json) (`parseReceiptV1`).

Full agent instructions: [AGENTS.md](AGENTS.md) · Package: [examples/auspex-ts](examples/auspex-ts)

## What we shipped

Three primitives: browser check, sandbox verify, named sandbox desktop demo. Login / finalize / profile-status / reap are the auth + hygiene doors.

- **`auspex_check`** — cloud Chrome: goto, optional wait-for (fill/click without a profile, or with `--allow-page-actions`), snapshot, claim check, close. **Verifies by default** (HTTP + OCR) for public marketing pages. **`name=consistencyhub`**, **`profile=consistencyhub`**, or a **profile on consistencyhub.io / onedrive.live.com** defaults to **no** sandbox. `--verify` forces anonymous verify (poisons `ok` on auth-gated pages). `--verify-with-profile` is the dogfood claim recheck (`claimOkProfile`; read that field, not only `ok`). Frozen **schema v1**: `schemaVersion`, `ok`, `reason`, `url`, `expect`, `screenshotPath`.

- **`auspex_login` / `auspex_await_login`** — single-use handoff URL, then wait until Save stored cookies or origins. Empty Save is not success. Soft-warns if cookies/origins exist but sessionStorage is missing.

- **`auspex_finalize_login`** — post-login one-shot: SSO + `--save-profile` to capture sessionStorage. Defaults to ConsistencyHub URL and expect. Same as `check --profile … --sso --save-profile`.

- **`auspex_verify`** — only if you passed `verify=false`. Headless sandbox re-checks PNG + JSON. Integrity `ok` is separate from claim `claimOk`. Kills the VM.

- **`auspex_profile_status`** — `loggedIn` / `loggedOut` / `needsHuman` / **`weakSeed`** / **`emptySave`**. `weakSeed` = cookies/origins but no sessionStorage. `emptySave` = profile not found or empty. Human SSO once; **the agent never types a password.**

- **`auspex_reap`** — list/kill leftover **ledger** sessions after `429`. `--account-wide` wipes all VMs. `--pack-receipts` copies last receipts per URL into `.auspex/pack/`.

- **`auspex_desktop`** — named Solari sandbox Mousepad demo, not the user's Mac. 402 on Free.

### Fail-closed design

- **No password typing:** SSO handoff URL (human signs in once); `--fill` refused on `input[type=password]`; Microsoft/Google walls return `needsHuman`. Desktop `--type` refuses password/OTP-like strings.
- **No logged-in recording by default:** `--record` + `--profile` is forbidden unless `--allow-record-profile` on a public marketing host. Refused for consistencyhub.
- **No page actions with profiles by default:** `--fill` / `--click` with a profile requires `--allow-page-actions`.
- **Schema v1 frozen:** `schemaVersion: 1` on stdout. CLI and MCP are the same contract.
- **`ok` ≠ `claimOk` ≠ `claimOkProfile`:** After `--verify-with-profile`, read `claimOkProfile` — `ok` is not that signal.

## ConsistencyHub recipe (auth-gated example)

Console Save alone is insufficient (sessionStorage not persisted). ConsistencyHub needs `accessToken` in sessionStorage.

```bash
npx auspex login --profile consistencyhub
npx auspex await-login --profile consistencyhub
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
- This fork has no public GitHub Issues tracker (`has_issues` is false)
- Console — [console.getsolari.com](https://console.getsolari.com)
- Docs — [docs.getsolari.com](https://docs.getsolari.com)

---

## Upstream cookbook (unmodified, not the submission)

This repo is a public fork of the Solari cookbook. Directories under [`examples/`](examples/) other than **[auspex-ts](examples/auspex-ts)** (the intern-challenge product) are the original Solari samples, unmodified, with no Auspex CI. Run them from their own folders for raw SDK patterns. One `slr_live_` key works across browsers, sandboxes, and desktops.

Gotchas the samples encode: call `await solari.close()` in TypeScript or the process hangs; recording is per session (`recording: true` at create); Auspex `--record` never puts a presigned `replayUrl` on stdout; sandbox `run("ls -la")` looks for a binary named `ls -la`; `kill()`, not `close()`, ends a VM; `timeoutMs` is a rolling idle window; 429 is not retryable — call `auspex_reap`.

---

MIT licensed.
