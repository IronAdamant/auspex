# Auspex — for agents

Use Auspex when you need **evidence from a live web page**. You drive a **Solari cloud Chrome** (its own remote instance, not the human’s local browser). Snapshot text + PNG, check a claim, close. The human does not watch that window.

Do **not** use it for pages you can already curl, for generic research crawls, or instead of Browser Use when the job is “click around in the user’s already-open Chrome.”

If this session has **`solari__*`** / **`solari_*`** tools (official Solari MCP), you may use them for ad-hoc cloud browser / sandbox / desktop. Prefer Auspex for check → verify → tear-down. For 429 leftovers call **`auspex_reap`** (works even when Solari MCP did not start). If `solari_*` are missing, do not invent them.

## Tools

- `auspex_check` — launch → goto → optional wait-for/fill/click → assert → screenshot (≤2 MiB) → close. Returns JSON plus a downscaled JPEG attach. Set **`verify=true`** to audit that receipt in a headless sandbox in the **same** call, then kill the VM. Do **not** also call `auspex_verify` after `verify=true`.
- `auspex_login` — create/reuse a named profile and return a **single-use login-handoff URL**. Show `url` to the human; they sign in (agent never handles the password). Then call `auspex_await_login` (a version bump with 0 cookies is **not** success). Then pass `profile` to `auspex_check`.
- `auspex_await_login` — wait until Save stored cookies or origins. Empty Save is not success.
- `auspex_profiles` — list names/ids, version, and whether storage is populated.
- `auspex_verify` — only if you already ran `auspex_check` **without** `verify=true`. Uploads the on-disk PNG + JSON, asserts **integrity `ok`** vs **claim `claimOk`** (fetch/OCR of expect — not JSON echo), kills the VM.
- `auspex_reap` — list leftover browser sessions (Auspex live ledger) and kill holding sandboxes/desktops. Use after **429**. `dryRun` lists only.
- `auspex_desktop` — boot a Solari GUI desktop, wait for X11, open Mousepad by default, click **inside the editor (320,300)**, optional `type`/`expect`, screenshot, kill. Tool text is the ASCII log **plus** JSON. `streamUrl` is live VNC.

## Rules

- Always let Auspex **close** the Solari check session. A leaked session burns concurrency until you `auspex_reap`.
- **402 FeatureRequiresPlan** (stealth, proxy, captcha, desktops on a plan that lacks them) is **not retryable**. Drop the gated option or upgrade. `proxy`/`captcha` imply stealth.
- **429 ConcurrencyLimitExceeded** is **not retryable**. Call `auspex_reap`, then retry. Do not only use the Solari console. Do not retry create while the slot is held.
- `record` + `profile` is forbidden unless `allowRecordProfile` (recordings capture input).
- Never commit `SOLARI_API_KEY`, `.env`, or `.auspex/` artifacts.
- Prefer `auspex_check` over driving raw CDP.
- `--record` / `record: true` records for Solari console Replay via `sessionId`. Do not put a presigned `replayUrl` on success JSON. Public demo is `demo/ironadamant.png` + `demo/receipt.json` (`sessionId`) + `demo/replay.html`. Refresh with `npx tsx scripts/save-demo-receipt.ts`. Never record a logged-in ConsistencyHub session.
- Profiles must be **saved** after login. Attaching a profile does not auto-save. `auspex_await_login` / `login --wait` only succeed when Save stored cookies or origins. Treat profiles like passwords.

## CLI

```
npx tsx src/cli.ts check <url> --expect <string> [--selector <css>] [--profile <name>] [--stealth] [--proxy <cc|smart>] [--proxy-sticky <id>] [--captcha] [--record] [--allow-record-profile] [--sso] [--sso-provider microsoft|google|auto] [--wait-for <css>] [--fill <css> --value <text>] [--click <css>] [--save-profile] [--verify]
npx tsx src/cli.ts login --profile <name> [--url <hint>] [--wait]
npx tsx src/cli.ts await-login --profile <name> [--since-version <n>] [--timeout-ms <n>]
npx tsx src/cli.ts profiles
npx tsx src/cli.ts verify [runDir]
npx tsx src/cli.ts desktop [--open <app>] [--type <text>] [--click <x,y>] [--expect <string>]
npx tsx src/cli.ts reap [--dry-run] [--session <id>] [--vm <id>]
```

`--sso` clicks Microsoft, then Google, then a generic Sign in with … button. Use with `--profile`. `--sso-provider` pins a vendor. `--profile` applies the saved Playwright storage state onto a new context (`chromium.connect` does not expose Solari's default context). Empty seeds (0 cookies and 0 origins) fail closed unless `--sso`. `--save-profile` writes cookies, localStorage, and sessionStorage via `POST /profiles/:id/save` and **refuses an empty overwrite or a public /landing session**. `record`+`profile` is forbidden unless `--allow-record-profile`.
