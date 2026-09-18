# Auspex — for agents

Canonical any-host instructions: [AGENTS.md](../../AGENTS.md) at the repository root. Receipt field list (schema v1 frozen): [Receipt schema v1](../../AGENTS.md#receipt-schema-v1-frozen). This copy stays next to the package so a host that only opens `examples/auspex-ts` still has the contract.

Use Auspex when you need **evidence from a live web page**. You drive a **Solari cloud Chrome** (its own remote instance, not the human’s local browser). Snapshot text + PNG, check a claim, close. The human does not watch that window.

Do **not** use it for pages you can already curl, for generic research crawls, or instead of Browser Use when the job is “click around in the user’s already-open Chrome.”

For **ironadamant.com**, **checkpointprojects.com**, and **consistencyhub.io**, prefer saved checks (`name=ironadamant|checkpoint|consistencyhub`) over reconstructing flags.

If this session has **`solari__*`** / **`solari_*`** tools (official Solari MCP), you may use them for ad-hoc cloud browser / sandbox / desktop. Prefer Auspex for check → verify → tear-down. For 429 leftovers call **`auspex_reap`** (works even when Solari MCP did not start). If `solari_*` are missing, do not invent them.

## Tools

- `auspex_check` — launch → goto → optional wait-for (fill/click only without a profile, or with `allowPageActions`) → assert → screenshot (≤2 MiB) → close. **Verifies by default** (headless sandbox HTTP fetch + OCR). Returns a parseable **schema v1** receipt (required: `schemaVersion`, `ok`, `reason` (`matched` / `loggedOut` / `needsHuman` / `mismatch` / `network` / `recordedLoggedIn`), `url`, `expect`, `screenshotPath`; extra keys optional). See root AGENTS.md. JSON plus a downscaled JPEG attach. Pass **`verify=false`** to skip the sandbox. Do **not** also call `auspex_verify` after a default check. `loggedOut` / `needsHuman` skip verify and are not retried. `needsHuman` omits the screenshot/MCP image and strips digit runs from excerpt. Saved checks: **`name=ironadamant`** (expect `One office job.`), **`name=checkpoint`** (expect `Checkpoint`), **`name=consistencyhub`** (`profile=consistencyhub`, expect `Document Editor`, no sso, no record, no fill/click unless `allowPageActions`).
- `auspex_login` — create/reuse a named profile and return a **single-use login-handoff URL**. Show `url` to the human; they sign in (agent never handles the password). Do not ping the user. Then call `auspex_await_login` (a version bump with 0 cookies is **not** success). Then pass `profile` to `auspex_check`.
- `auspex_await_login` — wait until Save stored cookies or origins. Empty Save is not success.
- `auspex_profiles` — list names/ids, version, and whether storage is populated.
- `auspex_profile_status` — `loggedIn` vs `loggedOut` vs `needsHuman`. Live probe never uses `--sso` or `--record`. Re-seed is human SSO once. Never type a Microsoft or Google password/OTP. Path `/` is `loggedOut` unless expect matched. If ConsistencyHub is logged out, report `loggedOut` and skip.
- `auspex_verify` — only if you already ran `auspex_check` **with `verify=false`**. Uploads the on-disk PNG + JSON, asserts **integrity `ok`** vs **claim `claimOk`** (fetch/OCR of expect — not JSON echo), kills the VM.
- `auspex_reap` — list leftover browser sessions (Auspex live ledger) and kill those ledger ids. Use after **429**. Default does not wipe every VM on the key; pass `accountWide`. `dryRun` lists only. `packReceipts` copies last receipts per URL into `.auspex/pack` for a PR attach.
- `auspex_desktop` — named Solari sandbox desktop demo: wait for X11, open Mousepad by default. **Not the user's Mac.** Wait/expect/`ok` share one process haystack. `windowOk` only if a real window list exists. `clicked` only if verified. Tool text is the ASCII log **plus** JSON. `streamUrl` is live VNC.

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
- Profiles must be **saved** after login. Attaching a profile does not auto-save. `auspex_await_login` / `login --wait` only succeed when Save stored cookies or origins. Treat profiles like passwords.
- **Profile save defaults**: `--save-profile` captures cookies, localStorage, and sessionStorage but **omits indexedDB by default** to stay under Solari's 1 MiB limit. SessionStorage is preserved (ConsistencyHub and other Microsoft OAuth SPAs need `accessToken` in sessionStorage). Cookies alone may not restore app sessions; prefer `check --profile <name> --sso --save-profile` after human completes IdP sign-in once.

## CLI

From the **repository root**: `npx auspex <command>` or `npx auspex-mcp`. Same contract from this directory: `npx tsx src/cli.ts …`. Stdout is one JSON object; exit 0 only when `ok` is true.

```
npx auspex check [--name <ironadamant|checkpoint|consistencyhub>] [<url>] [--expect <string>] [--selector <css>] [--profile <name>] [--stealth] [--proxy <cc|smart>] [--proxy-sticky <id>] [--captcha] [--record] [--allow-record-profile] [--allow-page-actions] [--sso] [--sso-provider microsoft|google|auto] [--wait-for <css>] [--fill <css> --value <text>] [--click <css>] [--save-profile] [--verify|--no-verify] [--verify-with-profile]
npx auspex login --profile <name> [--url <hint>] [--wait]
npx auspex await-login --profile <name> [--since-version <n>] [--timeout-ms <n>]
npx auspex profiles
npx auspex profile-status [--profile <name>] [--name <saved>] [--url <hint>]
npx auspex verify [runDir]
npx auspex desktop [--open <app>] [--type <text>] [--click <x,y>] [--expect <string>]
npx auspex reap [--dry-run] [--session <id>] [--vm <id>] [--pack-receipts] [--account-wide]
npx auspex mcp
```

`--sso` clicks Microsoft, then Google, then a generic Sign in with … button. Use with `--profile`. `--sso-provider` pins a vendor. Agents must never type passwords: `--fill` / `fill` is refused on `input[type=password]` selectors, and Microsoft and Google password/OTP walls return `needsHuman: true`. `--profile` applies the saved Playwright storage state onto a new context **before first navigation** (`chromium.connect` does not expose Solari's default context). Empty seeds (0 cookies and 0 origins) fail closed unless `--sso`. `--save-profile` writes cookies, localStorage, and sessionStorage via `POST /profiles/:id/save` and **refuses an empty overwrite, a public /landing session, or a save with no bytes for the page origin**. A later `--profile` check that lands on `/landing`, `/login`, or `/` without a matched expect is `ok: false` with `reason: loggedOut`. `record`+`profile` is forbidden unless `--allow-record-profile` on a public marketing host. `--allow-record-profile` is refused for consistencyhub. Never `--record` with `--sso`, `--save-profile`, or a dashboard landing. `fill`/`click` with a profile requires `--allow-page-actions`. `--verify-with-profile` runs an additional profile-seeded browser check to verify the claim with the attached profile; adds `claimOkProfile` and `claimErrorsProfile` to the verify result.
