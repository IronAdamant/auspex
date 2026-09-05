# Auspex — for agents

Use Auspex when you need **evidence from a live web page**. You drive a **Solari cloud Chrome** (its own remote instance, not the human’s local browser). Snapshot text + PNG, check a claim, close. The human does not watch that window.

Do **not** use it for pages you can already curl, for generic research crawls, or instead of Browser Use when the job is “click around in the user’s already-open Chrome.”

If this session has **`solari__*`** / **`solari_*`** tools (official Solari MCP), you may use them for ad-hoc cloud browser / sandbox / desktop. Prefer Auspex for check → verify → tear-down. Always `solari_browser_close` / `solari_kill`. If those tools are missing, Solari MCP did not start (no `SOLARI_API_KEY`) — do not invent them.

## Tools

- `auspex_check` — one shot: launch → goto → assert → screenshot → close. Returns JSON plus a downscaled JPEG attach (on-disk shot stays full-page PNG). Set **`verify=true`** to audit that receipt in a headless sandbox in the **same** call, then kill the VM. Do **not** also call `auspex_verify` after `verify=true` (that would boot a second sandbox).
- `auspex_login` — create/reuse a named profile and return a **single-use login-handoff URL**. Show `url` to the human; they sign in (agent never handles the password). Then pass `profile` to `auspex_check`.
- `auspex_profiles` — list names/ids.
- `auspex_verify` — only if you already ran `auspex_check` **without** `verify=true`. Uploads the on-disk PNG + JSON, asserts **integrity `ok`** vs **claim `claimOk`**, kills the VM. A missed expect can still be a valid receipt (`ok` true, `claimOk` false).
- `auspex_desktop` — boot a Solari GUI desktop, one computer-use action (default click center; optional `open` / `type`), screenshot, kill. Tool text is the ASCII log **plus** structured JSON. No VNC.

## Rules

- Always let Auspex **close** the Solari check session. A leaked session burns concurrency until you kill it.
- **402 FeatureRequiresPlan** (stealth, proxy, captcha, desktops on a plan that lacks them) is **not retryable**. Drop the gated option or upgrade. `stealth` on check is Starter+.
- **429 ConcurrencyLimitExceeded** is **not retryable**. Call `solari_browser_close` / `solari_kill` (or wait for Auspex teardown) to free leftover sessions, then retry. Do not only use the Solari console. Do not retry create while the slot is held.
- `record` + `profile` is forbidden unless `allowRecordProfile` (recordings capture input).
- Never commit `SOLARI_API_KEY`, `.env`, or `.auspex/` artifacts.
- Prefer `auspex_check` over driving raw CDP.
- `--record` / `record: true` records for Solari console Replay via `sessionId`. Do not put a presigned `replayUrl` on success JSON. Public demo is `demo/ironadamant.png` + `demo/receipt.json` (`sessionId`) + `demo/replay.html`. Refresh with `npx tsx scripts/save-demo-receipt.ts`. Never record a logged-in ConsistencyHub session.
- Profiles must be **saved** after login. Attaching a profile does not auto-save. Treat profiles like passwords.

## CLI

```
npx tsx src/cli.ts check <url> --expect <string> [--selector <css>] [--profile <name>] [--stealth] [--record] [--allow-record-profile] [--sso] [--verify]
npx tsx src/cli.ts login --profile <name> [--url <hint>]
npx tsx src/cli.ts profiles
npx tsx src/cli.ts verify [runDir]
npx tsx src/cli.ts desktop [--open <app>] [--type <text>] [--click <x,y>]
```

`--sso` is for Microsoft login cards (e.g. ConsistencyHub): click Sign in with Microsoft, then the signed-in account. Use with `--profile`.
