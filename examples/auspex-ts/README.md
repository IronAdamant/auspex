# Auspex (`examples/auspex-ts`)

CLI and MCP for Auspex: an agent calls this package, Solari boots a throwaway cloud Chrome, and the agent gets JSON plus a PNG. The session is closed when the check ends.

Product story: [root README](../../README.md). Behavior and the frozen contract: [AGENTS.md](../../AGENTS.md). Short door card: [llms.txt](../../llms.txt). Grok 4.6 in Grok Build wrote the CLI and MCP against the Solari SDK; the founder ran the live checks. Stills and the watch tape: [DEMO.md](DEMO.md).

## Run

**Install `auspex-solari` (not npm `auspex`). Repo is `IronAdamant/auspex`.** The fence below is the local `auspex` bin after `npm install` in this directory. Without a clone, use `npx auspex-solari`.

```bash
cd examples/auspex-ts
npm install
# Optional: gitignored .env is loaded only if SOLARI_API_KEY is unset. Prefer export.
export SOLARI_API_KEY
npx auspex check https://ironadamant.com --expect "One office job."
npx auspex check --name ironadamant
npx auspex check --name checkpoint
npx auspex login --url https://app.example
# derives --profile app-example; override with --profile <yours>
# if mint is silent, read traceSummary / npx auspex trace before reminting
npx auspex await-login --profile app-example --save-editor
npx auspex finalize-login --profile app-example --url https://app.example --expect "Workspace ready"
npx auspex profile-status --profile app-example --url https://app.example --expect "Workspace ready"
npx auspex check --profile app-example --url https://app.example --expect "Workspace ready"
# optional: --verify-with-profile after a live match; do not treat ok alone as reusable.
npm run public-check   # ironadamant.com + checkpointprojects.com; skips if no key
```

`https://app.example` derives `--profile app-example`. Frozen door sequence (not a same-session takeover): [AGENTS.md](../../AGENTS.md#frozen-agent-door-sequence). Expect must be unique to the logged-in app. A text hit on `/`, `/landing`, `/login`, `/signup`, or `/auth` during finalize is `expectMatchedPublicLanding`. `hostChanged` remints. Never commit `.env`, the API key, or `.auspex/`.

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

Flag behavior, verify defaults, and fail-closed rules are in [AGENTS.md](../../AGENTS.md). Short facts that belong next to the commands:

- `auspex_finalize_login` is `finalize-login`. Unknown profiles need `--url` and `--expect`. Saved-check names may omit them.
- `weakSeed` is cookies/origins with a counted `sessionStorage === 0`, or a stale fold. `emptySave` means the profile is missing or empty.
- Show as bullets is off by default so a password manager can paste into the text field.
- `desktop` is a named Solari sandbox demo (default Mousepad). Not the user's Mac. 402 on Free.
- `--stealth` is on `check` only (`POST /sessions`). `login` has no `--stealth`: the cold login handoff and the profile editor ignore a stealth body (same handoff, no 402). Do not add `auspex login --stealth`.
- Login trace: one post-handoff row after the handoff is ready. Check rows are not written. Never tokens, passwords, or session ids.
- **429** is not retryable. Call `auspex_reap`, then retry.

## MCP

After a git clone, run `npm install && npm run build:mcp` in this directory (do not commit `dist/`). If `dist/mcp.mjs` is missing, MCP fail-closes with reason `DistMissing` (not an empty silent server). From this directory without `dist/`: `npx tsx src/mcp.ts`.

**Published package** — `npx -p auspex-solari auspex-mcp` already includes `dist/`. Paste-ready Cursor `mcp.json` (command `npx`, args `-p`, `auspex-solari`, `auspex-mcp`, `SOLARI_API_KEY` in `env`) is on the [root README](../../README.md#mcp).

**Cursor (this clone)** — repo [`.cursor/mcp.json`](../../.cursor/mcp.json) matches [mcp.cursor.example.json](mcp.cursor.example.json). After `npm install && npm run build:mcp`, restart Cursor.

**Claude Desktop** — merge [mcp.claude.example.json](mcp.claude.example.json) into `claude_desktop_config.json` with an absolute path (same clone build).

**Grok** — copy [grok.mcp.example.toml](grok.mcp.example.toml) into `~/.grok/config.toml`. If PATH lacks node, pin absolute `node` plus `bin/auspex-mcp.mjs`.

Tool list: [AGENTS.md](../../AGENTS.md#tools).

## Worked example (dogfood)

ConsistencyHub and OneDrive are **evidence that auth-gated SaaS works** — not the default recipe. The Run fence above is the recipe. `--name consistencyhub` is the verified example.

```bash
npx auspex login --profile consistencyhub
npx auspex await-login --profile consistencyhub --save-editor
npx auspex finalize-login --profile consistencyhub
npx auspex profile-status --name consistencyhub
npx auspex check --name consistencyhub --verify-with-profile
```

**Verified 2026-09-18:** `ok=true`, `claimOkProfile=true` on `demo/consistencyhub-receipt.json`. Do not fold `claimOkProfile` into `ok`. OneDrive is receipt-only (`demo/onedrive-receipt.json`) — no raw OneDrive PNG.
