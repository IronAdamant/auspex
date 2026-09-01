# Auspex

Web eyes for **coding agents**. An agent calls Auspex; Solari boots a **throwaway Chrome in their cloud** (not on your Mac); the agent gets JSON + a PNG; the session is killed. You do not sit in that browser.

This is not Browser Use, not local Playwright, and not a tab in your Chrome. Humans only see the receipt (stdout, screenshot, optional replay) and, if a login is needed, the Solari **console profile editor** to Save cookies once.

Use it when a live page, JS paint, a login, or an audit still is the point. Do not use it to scrape at scale.

![Solari cloud Chrome checking ironadamant.com](demo/ironadamant.png)

Do **not** add Solari’s 27-tool MCP (`npx @solarisdk/mcp` / `https://mcp.getsolari.com/mcp`) by default. That keeps sessions open and exposes sandboxes and desktops. Auspex always closes a check session.

## Run

```bash
cd examples/auspex-ts
npm install
# Persist the key for CLI *and* Grok (this file is gitignored). `export` in another terminal does not reach Grok.
printf 'SOLARI_API_KEY=%s\n' "$SOLARI_API_KEY" > .env
npx tsx src/cli.ts check https://ironadamant.com --expect "Build it."
```

Always close the session (the CLI does this in `finally`). Never commit `.env`, the API key, or `.auspex/` run artifacts.

### Commands

```
npx tsx src/cli.ts check <url> --expect <string> [--selector <css>] [--profile <name>] [--stealth] [--record] [--sso]
npx tsx src/cli.ts login --profile <name> [--url <hint>]
npx tsx src/cli.ts profiles
```

`login` creates or reuses a named Solari profile and prints the console Profiles editor. Log in there (2FA/captcha), hit Save. Then `check --profile <name>`. Login does not hold an Auspex check session open.

`--stealth` and recording need Starter or higher. `--profile` loads the Solari profile into the page context (cookies are not on the default context). `--sso` clicks **Sign in with Microsoft** and the signed-in account picker. Checks do not overwrite the profile.

Stdout for `check` is JSON: `title`, `finalUrl`, `ok`, `expect`, `matched`, `excerpt`, `screenshotPath`, `sessionId`, `replayUrl`. Files land in `.auspex/runs/<timestamp>/`. Replay URLs expire in minutes — do not commit them.

## MCP (Grok)

```bash
npx tsx src/mcp.ts
```

Tools: `auspex_check` (JSON + PNG), `auspex_login`, `auspex_profiles`.

Grok starts Auspex from `[mcp_servers.auspex]` in `~/.grok/config.toml` (see [grok.mcp.example.toml](grok.mcp.example.toml)). The command is **absolute `node` + absolute `…/examples/auspex-ts/dist/mcp.mjs`**. Grok does not reliably apply `cwd`, so a relative `dist/mcp.mjs` is resolved from the repo root and the handshake dies. Run `npm run build:mcp` after changing `src/`. `tsx` is too slow/cold for Grok’s handshake. Stdio accepts Grok’s `Content-Length` framing. The server reads `SOLARI_API_KEY` from **this directory’s `.env`**. Restart Grok after config changes so `auspex_check` appears. `tool_timeout_sec` is 180.

See [AGENTS.md](AGENTS.md) and [DEMO.md](DEMO.md).
