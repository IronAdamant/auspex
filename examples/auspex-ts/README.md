# Auspex

Web eyes for **coding agents**. An agent calls Auspex; Solari boots a **throwaway Chrome in their cloud** (not on your Mac); the agent gets JSON + a PNG; the session is killed. You do not sit in that browser.

This is not Browser Use, not local Playwright, and not a tab in your Chrome. Humans only see the receipt (stdout, screenshot, optional replay) and, if a login is needed, a **single-use login-handoff URL** to sign in and Save once.

Use it when a live page, JS paint, a login, or an audit still is the point. Do not use it to scrape at scale.

## How this was built

Grok 4.6 in Grok Build wrote the CLI, MCP server, and Solari wiring. I pointed it at the intern challenge, the cookbook, and my own sites (ironadamant.com, Checkpoint, ConsistencyHub). AI used: the Solari SDK, not a stub; Microsoft/Google SSO click-through after a real console profile save; Grok MCP handshake (Content-Length + absolute `node`). I ran the live checks, saved the Solari profile, and wrote the public post. Private research notes never left this machine.

Public receipt of a **`--record`** check on a JS page (ironadamant.com, not a login):

- Still: [demo/ironadamant.png](demo/ironadamant.png)
- JSON + `sessionId`: [demo/receipt.json](demo/receipt.json)
- 60-second watch: [demo/replay.html](demo/replay.html) (rrweb of that Solari session). After clone, open that file locally, or via [jsDelivr](https://cdn.jsdelivr.net/gh/IronAdamant/auspex@main/examples/auspex-ts/demo/replay.html).
- Same recording in **your** Solari org: [console](https://console.getsolari.com) → Sessions → that `sessionId` → Replay.

`--record` does not put a presigned replay URL on the JSON receipt. It does poll until replay is ready (`replayReady`) and may write `replay.ndjson` next to the receipt. Do not `--record` a logged-in ConsistencyHub session (recordings capture input).

![Solari cloud Chrome checking ironadamant.com](demo/ironadamant.png)

**Auspex MCP is the product** (`auspex_check`, `auspex_verify`, `auspex_desktop`, `auspex_reap`, login/profiles). Official Solari MCP is **optional and gated**: `dist/solari-mcp.mjs` starts `@solarisdk/mcp` only when `SOLARI_API_KEY` is set. No key → process exits so hosts do not list empty `solari_*` tools.

## Run

```bash
cd examples/auspex-ts
npm install
# Persist the key for CLI *and* MCP hosts (this file is gitignored).
printf 'SOLARI_API_KEY=%s\n' "$SOLARI_API_KEY" > .env
npx tsx src/cli.ts check https://ironadamant.com --expect "One office job."
npx tsx src/cli.ts verify
npm run public-check   # ironadamant.com + checkpointprojects.com; skips if no key
```

Always close the browser session (the CLI does this in `finally`) and **kill** the sandbox VM (`verify` does this in `finally`; `close()` is not teardown). Never commit `.env`, the API key, or `.auspex/` run artifacts.

### Commands

```
npx tsx src/cli.ts check <url> --expect <string> [--selector <css>] [--profile <name>] [--stealth] [--proxy <cc|smart>] [--proxy-sticky <id>] [--captcha] [--record] [--allow-record-profile] [--sso] [--sso-provider microsoft|google|auto] [--wait-for <css>] [--fill <css> --value <text>] [--click <css>] [--save-profile] [--verify]
npx tsx src/cli.ts verify [runDir]
npx tsx src/cli.ts desktop [--open <app>] [--type <text>] [--click <x,y>] [--expect <string>]
npx tsx src/cli.ts reap [--dry-run] [--session <id>] [--vm <id>]
npx tsx src/cli.ts login --profile <name> [--url <hint>] [--wait]
npx tsx src/cli.ts await-login --profile <name> [--since-version <n>] [--timeout-ms <n>]
npx tsx src/cli.ts profiles
```

`login` creates or reuses a named Solari profile and prints a **login-handoff `url`**. Open that URL (single-use; the agent never handles the password), sign in, Save. Then `await-login --profile <name>` (or `login --wait`). A Save that stores **0 cookies and 0 origins** is not success. Console Save also misses **sessionStorage** (ConsistencyHub keeps `accessToken` there), so after Microsoft login prefer `check --profile <name> --sso --save-profile`. Then `check --profile <name>` in a new session. Login does not hold an Auspex check session open.

`--stealth` / `--proxy` / `--captcha` need Starter or higher (402 FeatureRequiresPlan on Free — not retryable). Proxy and captcha imply stealth. `--profile` applies the saved storage state onto a new Playwright context (Solari's default context is not visible over `chromium.connect`). Empty seeds fail closed unless `--sso`. `--save-profile` persists cookies, localStorage, and sessionStorage via `POST /profiles/:id/save` and refuses an empty overwrite or a public `/landing` session. `--sso` clicks **Sign in with Microsoft**, then Google, then a generic Sign in with … button (`--sso-provider` pins a vendor). `record`+`profile` is forbidden unless `--allow-record-profile`.

`--wait-for`, `--fill`+`--value`, and `--click` run after goto/SSO and before extract. `ok` is protocol success (page loaded, not leftover auth, screenshot written). `matched` is the expect substring. CLI exit 0 requires both.

**429 ConcurrencyLimitExceeded is not retryable.** Call `auspex_reap` (or `solari_browser_close` / `solari_kill` if that MCP started) to free leftover sessions, then retry.

**Browser then sandbox:** `check` writes `.auspex/runs/<stamp>/{manifest.json,screenshot.png}` (PNG scaled under 2 MiB so verify can upload it). `verify` (or `check … --verify`) boots a **headless** Solari microVM, uploads that receipt, independently re-checks `expect` (HTTP fetch + optional Tesseract OCR of the PNG — not `manifest.ok`), and **kills** the VM. Integrity (`ok`/`errors`) is separate from claim (`claimOk`/`claimErrors`). `--verify` on check is one-shot — do not also run `verify`. Optional `[runDir]`; default is the latest run.

Stdout for `check` is JSON: `title`, `finalUrl`, `ok`, `expect`, `matched`, `excerpt`, `screenshotPath`, `sessionId`, `networkIdle`, optional `replayReady` / action fields. Files land in `.auspex/runs/<timestamp>/`. `--record` does not put a presigned replay URL on the receipt. Refresh the public demo with `npx tsx scripts/save-demo-receipt.ts`.

`desktop` defaults to opening Mousepad and clicking **320,300** (the editor). Screen-center 640,360 misses that window. `--expect` checks the process list. `streamUrl` is the live VNC; Auspex still kills after the shot.

## MCP

Auspex tools first. Rebuild with `npm run build:mcp` after changing `src/`.

**Cursor** — `.cursor/mcp.json` in this repo is the drop-in (same shape as [mcp.cursor.example.json](mcp.cursor.example.json)). Restart Cursor. That plus `npm run public-check` is the loop: MCP tools for agents, weekly public pages for CI.

**Claude Desktop** — merge [mcp.claude.example.json](mcp.claude.example.json) into `claude_desktop_config.json` with an absolute path.

**Claude Desktop** — merge [mcp.claude.example.json](mcp.claude.example.json) into `claude_desktop_config.json` with an absolute path.

**npx (stdio):** from this directory, `npx tsx src/mcp.ts`.

**Grok** — copy both tables from [grok.mcp.example.toml](grok.mcp.example.toml) into `~/.grok/config.toml`. Commands are **absolute `node` + absolute paths** under `dist/`. Dual Content-Length transport is Grok-specific.

Tools:

- `auspex_check` — JSON + JPEG attach (optional `verify=true` is one-shot check-then-sandbox; `saveProfile` persists a non-empty seed)
- `auspex_verify` — headless VM independently audits expect, then **kill**
- `auspex_reap` — 429 recovery: close leftover browsers, kill holding VMs
- `auspex_login` / `auspex_await_login` / `auspex_profiles`
- `auspex_desktop` — Mousepad computer-use, screenshot, **kill**. ASCII log **and** JSON. `streamUrl` for VNC.

The weekly public loop (Checkpoint + ironadamant.com `One office job.`): `npm run public-check`. GitHub Actions `public` job runs Mondays and on `workflow_dispatch`; it skips with exit 0 when `SOLARI_API_KEY` is unset. Do not `--record` a logged-in ConsistencyHub session.

Live: ironadamant.com (`One office job.`), checkpointprojects.com (`Checkpoint`), consistencyhub.io (`Document Editor` + saved `--profile`).

See [AGENTS.md](AGENTS.md) and [DEMO.md](DEMO.md).
