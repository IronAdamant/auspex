# Auspex

Web eyes for coding agents. Open a live URL in a Solari cloud browser, snapshot evidence, check a claim, close the session.

Use this when local Playwright is not enough: the page is live, JS-painted, behind a login, or you need a replay receipt. Do not use it to scrape at scale.

Solari is the remote Chrome. Auspex is the closed-loop tool. Browser only.

Do **not** add Solari’s 27-tool MCP (`npx @solarisdk/mcp` / `https://mcp.getsolari.com/mcp`) by default. That keeps sessions open and exposes sandboxes and desktops. Auspex always closes a check session.

## Run

```bash
cd examples/auspex-ts
npm install
export SOLARI_API_KEY=slr_live_...   # https://console.getsolari.com
npx tsx src/cli.ts check https://ironadamant.com --expect "Build it."
```

Always close the session (the CLI does this in `finally`). Never commit `.env`, the API key, or `.auspex/` run artifacts.

### Commands

```
npx tsx src/cli.ts check <url> --expect <string> [--selector <css>] [--profile <name>] [--stealth] [--record]
npx tsx src/cli.ts login --profile <name> [--url <hint>]
npx tsx src/cli.ts profiles
```

`login` creates or reuses a named Solari profile and prints the console Profiles editor. Log in there (2FA/captcha), hit Save. Then `check --profile <name>`. Login does not hold an Auspex check session open.

`--stealth` and recording need Starter or higher. `--profile` reuses cookies and **saves** them on the way out of `check`.

Stdout for `check` is JSON: `title`, `finalUrl`, `ok`, `expect`, `matched`, `excerpt`, `screenshotPath`, `sessionId`, `replayUrl`. Files land in `.auspex/runs/<timestamp>/`. Replay URLs expire in minutes — do not commit them.

## MCP (Grok)

```bash
npx tsx src/mcp.ts
```

Tools: `auspex_check` (JSON + PNG), `auspex_login`, `auspex_profiles`.

Copy [grok.mcp.example.toml](grok.mcp.example.toml) into `~/.grok/config.toml`. Put `SOLARI_API_KEY` in the environment that launches Grok (or the local `env` table — never commit a live key). `tool_timeout_sec` is 180 because a cloud launch is slow. Restart Grok so the tools appear.

See [AGENTS.md](AGENTS.md) and [DEMO.md](DEMO.md).
