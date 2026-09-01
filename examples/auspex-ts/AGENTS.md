# Auspex — for agents

Use Auspex when you need **evidence from a live web page**. You drive a **Solari cloud Chrome** (its own remote instance, not the human’s local browser). Snapshot text + PNG, check a claim, close. The human does not watch that window.

Do **not** use it for pages you can already curl, for generic research crawls, as a wrap of Solari’s 27-tool MCP (`solari_browser_*`, sandbox, desktop), or instead of Browser Use when the job is “click around in the user’s already-open Chrome.”

## Tools

- `auspex_check` — one shot: launch → goto → assert → screenshot → close. Returns JSON plus a PNG.
- `auspex_login` — create/reuse a named profile. Tell the human to open Console → Profiles → Open editor → Save. Then pass `profile` to `auspex_check`.
- `auspex_profiles` — list names/ids.

## Rules

- Always let Auspex **close** the Solari check session. A leaked session burns concurrency until you kill it.
- Never commit `SOLARI_API_KEY`, `.env`, or `.auspex/` artifacts.
- Prefer `auspex_check` over driving raw CDP.
- `--record` / `record: true` after close: poll for `replayUrl`. First poll often 404s. The URL expires quickly.
- Stealth requires a Starter plan. Free will 402.
- Profiles must be **saved** after a check. Attaching a profile does not auto-save. Treat profiles like passwords.

## CLI

```
npx tsx src/cli.ts check <url> --expect <string> [--selector <css>] [--profile <name>] [--stealth] [--record] [--sso]
npx tsx src/cli.ts login --profile <name> [--url <hint>]
npx tsx src/cli.ts profiles
```

`--sso` is for Microsoft login cards (e.g. ConsistencyHub): click Sign in with Microsoft, then the signed-in account. Use with `--profile`.
