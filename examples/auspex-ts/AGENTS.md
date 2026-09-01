# Auspex — for agents

Use Auspex when you need **evidence from a live web page**: open the URL in a Solari cloud browser, snapshot text + PNG, check a claim, keep a recording.

Do **not** use it for pages you can already curl, for generic research crawls, or as a wrap of Solari’s 27-tool MCP (`solari_browser_*`, sandbox, desktop).

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
npx tsx src/cli.ts check <url> --expect <string> [--selector <css>] [--profile <name>] [--stealth] [--record]
npx tsx src/cli.ts login --profile <name> [--url <hint>]
npx tsx src/cli.ts profiles
```
