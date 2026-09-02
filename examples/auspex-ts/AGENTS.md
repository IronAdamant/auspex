# Auspex — for agents

Use Auspex when you need **evidence from a live web page**. You drive a **Solari cloud Chrome** (its own remote instance, not the human’s local browser). Snapshot text + PNG, check a claim, close. The human does not watch that window.

Do **not** use it for pages you can already curl, for generic research crawls, or instead of Browser Use when the job is “click around in the user’s already-open Chrome.”

If this session has **`solari__*`** tools (official Solari MCP), you may use them for ad-hoc cloud browser / sandbox / desktop. Prefer Auspex for check → verify → tear-down. Always `solari_browser_close` / `solari_kill`. If those tools are missing, Solari MCP did not start (no `SOLARI_API_KEY`) — do not invent them.

## Tools

- `auspex_check` — one shot: launch → goto → assert → screenshot → close. Returns JSON plus a PNG.
- `auspex_login` — create/reuse a named profile. Tell the human to open Console → Profiles → Open editor → Save. Then pass `profile` to `auspex_check`.
- `auspex_profiles` — list names/ids.
- `auspex_verify` — after a check, run the receipt through a headless Solari sandbox (PNG + JSON), then kill the VM. Login stays on the browser profile.

## Rules

- Always let Auspex **close** the Solari check session. A leaked session burns concurrency until you kill it.
- Never commit `SOLARI_API_KEY`, `.env`, or `.auspex/` artifacts.
- Prefer `auspex_check` over driving raw CDP.
- `--record` / `record: true` records for Solari console Replay via `sessionId`. Do not put a presigned `replayUrl` on success JSON. Public demo is `demo/ironadamant.png` + `demo/receipt.json` (`sessionId`) + `demo/replay.html`. Refresh with `npx tsx scripts/save-demo-receipt.ts`. Never record a logged-in ConsistencyHub session.
- Stealth requires a Starter plan. Free will 402.
- Profiles must be **saved** after a check. Attaching a profile does not auto-save. Treat profiles like passwords.

## CLI

```
npx tsx src/cli.ts check <url> --expect <string> [--selector <css>] [--profile <name>] [--stealth] [--record] [--sso]
npx tsx src/cli.ts login --profile <name> [--url <hint>]
npx tsx src/cli.ts profiles
npx tsx src/cli.ts verify [runDir]
```

`--sso` is for Microsoft login cards (e.g. ConsistencyHub): click Sign in with Microsoft, then the signed-in account. Use with `--profile`.
