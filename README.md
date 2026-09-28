# Auspex

Auspex checks a live web page in Solari cloud Chrome (a browser Solari runs in their cloud, not on your computer). It looks for the words you asked for, then checks again on a second machine. It tells you whether the page is really logged in, so an agent does not start work on a login screen. It does not click around while you are logged in.

**The 30-second version**

- **Problem:** an AI agent says "the dashboard shows X", but it was looking at a login page, a stale tab, or its own guess.
- **Auspex:** one call opens the page in Solari cloud Chrome, checks for the exact words, saves a screenshot and a JSON receipt, then confirms on a second Solari machine. CLI and MCP, same contract.
- **Logged-in sites:** a human signs in once through a phone-friendly door (Solari's remote view cannot open a phone keyboard, [cookbook #80](https://github.com/solari-sdk/solari-cookbook/issues/80)). The agent never sees the password, and Auspex refuses to call a login saved until a fresh browser proves it.
- **Built around real Solari limits:** status-stripping SDK retries ([#56](https://github.com/solari-sdk/solari-cookbook/issues/56)), the 18-vs-20 concurrency cap ([#57](https://github.com/solari-sdk/solari-cookbook/issues/57)), no session listing ([#61](https://github.com/solari-sdk/solari-cookbook/issues/61)), and sessions that look alive after they end ([#25](https://github.com/solari-sdk/solari-cookbook/issues/25)). Each one has a named failure and a recovery step instead of a silent retry.

## For Reviewers

Watch with no clone and no API key: https://ironadamant.com/auspex/ — the landing opens on the blurred redacted demo and the three results. The player lower on the page is the stripped Microsoft wall, not logged-in proof. The Pages landing has a short Agent door card beside the phone login door.

After a clone, `npm install && npm test` shows fail-closed rules with no `SOLARI_API_KEY`.

The command people paste first, `npx auspex-solari check --name ironadamant`, is a **measured public check**: a public page, no login. It does **not** prove logged-in honesty. From Cursor: `npx -p auspex-solari auspex-mcp`.

**Auth-gated evidence** is a redacted auth-gated SaaS demo, receipt [`consistencyhub-receipt.json`](examples/auspex-ts/demo/consistencyhub-receipt.json). The blur hides personal data. That file is evidence from one finished sign-in, not the steps for your site.

Your site: `login --url <https>` (Auspex names the saved login from the site address; override `--profile <yours>`). We do not claim Alice-vs-Bob wrong-account detection: a saved login can still be the wrong Microsoft user and still match the words you asked for. Auspex never types passwords. Never `--record` a logged-in session.

**Issues** is on. The weekly public job still skips if the secret is unset. Do not remove it. Repo `SOLARI_API_KEY` is **present** (masked). Observed: [Actions 35605123361](https://github.com/IronAdamant/auspex/actions/runs/35605123361) (2026-09-21) ironadamant + checkpoint `ok: true`.

### Three results

Read each one on its own.

- `ok` — The browser Auspex just opened found the words you asked for, and the second check passed when it ran.
- `claimOk` — A second machine with no saved login also saw those words.
- `claimOkProfile` — A second browser that reused the saved login also saw those words. After `--verify-with-profile`, **`claimOkProfile` is the reuse gate**. `ok` alone is not enough to treat the profile as reusable.

## Login door

One page: `phone.html`. That page is the login door on a phone or a computer.

`npx auspex-solari login --url <https>` prints `handoff.url`. `handoff.mobileUrl` is the same page. Open it, click the remote field you mean to fill, then type in the box at the bottom. The box is a real text field because Solari’s remote view will not open the phone keyboard ([Solari cookbook #80](https://github.com/solari-sdk/solari-cookbook/issues/80)). A password manager can paste into it. **Clear** empties the whole field at once. Enter sends Enter and clears the box. Then tap Save.

![Phone login door on a computer: Solari remote Chrome, countdown, and Clear](examples/auspex-ts/demo/door-phone.gif)

This page is Solari's remote Chrome. Sign in on the site there. Saved login data stays on Solari — not on this phone or desktop, and not in Auspex. It is not a same-session VNC takeover. Show as bullets is off by default so a password manager can paste into the text field. It is not the Mousepad sandbox demo (`auspex desktop`).

## Two truths about Save

Save stores what the remote browser can hand back. The picture on screen can already show the app.

| | What happened | What you should do |
| --- | --- | --- |
| **The save is complete** | A later check loaded that saved login and the expected words were on the page. | A later check can reuse it. The published receipts are evidence, not the steps for a new site. |
| **The picture is ahead of the save** | Save returned 200. The screen looks logged in. The cookies are still only Microsoft or Google. In-tab session storage is 0. | Do not finalize. Do not open login again to finish Microsoft. Status: `idp-only-save`, kind `app-visible`. |

`sign-in-wall` is the other kind of `idp-only-save`. You are still on the Microsoft or Google page. Finish that sign-in, land on the app, then Save. That one opens login again. `app-visible` does not.

If the cookie jar already includes the app’s own site, a cookie-strong or local-storage-auth jar (app-origin cookies, or allowlisted localStorage auth key names) goes to `auspex_check` with verify-with-profile. Do not finalize to invent sessionStorage. Any other app-host jar still runs finalize-login now.

## Install

**Install `auspex-solari` (not npm `auspex`). Repo is `IronAdamant/auspex`.**

```bash
export SOLARI_API_KEY=slr_live_…   # https://console.getsolari.com — env only, never commit
npx auspex-solari check --name ironadamant
npx -p auspex-solari auspex-mcp
```

npm `auspex` is a different scraper. `auspex-solari` **0.1.11 is published**. Agents do not `npm publish`.

Local state (screenshots, receipts, saved-login handles, jobs) lives in `~/.auspex` for an npm install, or `examples/auspex-ts/.auspex` in a clone. Receipts show it as `~/.auspex/…` (never your username). Set `AUSPEX_HOME` to move it.

After a git clone, run `npm install && npm run build:mcp` in `examples/auspex-ts`, or MCP fail-closes with reason `DistMissing` (the server files were not built). Published `npx -p auspex-solari auspex-mcp` includes `dist/`.

## Pick your path

| Door | Open this |
| --- | --- |
| **Watch** (no clone, no API key) | [Landing](https://ironadamant.com/auspex/) · [replay player](https://ironadamant.com/auspex/demo/replay.html) (Microsoft login wall; emails and passwords stripped) |
| **Solari up?** | `npx auspex-solari solari-health` — does Solari answer with this key right now? It lists profiles and stops. It does not log you in, and it does not say your app is logged in. |
| **Public check** | `npx auspex-solari check --name ironadamant` — does **not** prove logged-in honesty |
| **Any page** | `npx auspex-solari check https://example.com --expect "Example Domain"` |
| **Your site — human** | 1. `npx auspex-solari login --url <https>` (override `--profile <yours>`). 2. Open `handoff.url` (`phone.html`). 3. Sign in and tap Save before the countdown hits zero. The agent does not type the password. |
| **Your site — agent** | After that Save, `await-login --save-editor`. The clipboard line is not the jar. If an await is already running, the paste signals it; do not kill it. Then `auspex_finalize_login` only when that save holds the app’s own session. Status `idp-only-save`, kind `app-visible`: do not finalize. Saved-check names supply URL and expect; unknown profiles require `--url` and `--expect`. [Frozen door sequence](AGENTS.md#frozen-agent-door-sequence). Never `--record`. |
| **MCP** | `npx -p auspex-solari auspex-mcp` — Cursor config below |
| **Hands-off job** | `npx auspex-solari job --url <https> --expect "<unique logged-in text>"`, then `job-status` |
| **Sweep (agent reports)** | Human signs in once. Then `npx auspex-solari sweep --plan plan.json`: every listed page, read-only, each **pass / fail / could not tell** with a screenshot, one `report.md`. Could-not-tell is never a pass. A sign-in wall stops the sweep and names the one human step. |
| **Do not** | Type passwords · `--record` a logged-in session · commit `SOLARI_API_KEY`, `.env`, or `.auspex/` |

Anonymous verify (the second check with no saved login) is skipped for any attached profile on a non-public-marketing URL. Login, finalize, profile-status, solari-health, reap, and trace are the auth + hygiene doors. `solari-health` only checks that Solari itself answers. `profile-status` is the check for a saved login. The named Solari sandbox Mousepad demo is not your computer (402 on Free: the free Solari plan answers HTTP 402 and will not start that desktop).

Save is not sessionStorage. `weakSeed` is cookies or site data with a counted `sessionStorage === 0`, or a stale fold, when the jar has no app-origin cookies and no allowlisted localStorage auth key names. App-origin cookies or those key names: run `check --verify-with-profile` and read `claimOkProfile`. `solariSaveReady` is not that gate. `emptySave` means the profile is missing. `--verify-with-profile` is refused on `weakSeed`, `emptySave`, and a dead fold. `ok` ≠ `claimOk` ≠ `claimOkProfile`.

Login trace writes one post-handoff row (one redacted note after the login door is ready). Check rows are not written. Never tokens, passwords, or session ids. If opening login produces no door, read `npx auspex-solari trace` before minting again.

## MCP

The agent connection is a local program: `npx -p auspex-solari auspex-mcp`. Put `SOLARI_API_KEY` in `env`. No clone. The published package already includes the server files.

There is no Auspex web address for a cloud connector. Claude.ai custom connectors need a remote HTTP MCP server. This repo does not publish one. Solari's hosted browser MCP is a different product.

A login wait (`await-login`) can run for about 30 minutes. A tool timeout of about 300 seconds ends first. For a hands-off run, use `auspex_job`, then `auspex_job_status`. A public check fits in a few minutes.

### Cursor

```json
{
  "mcpServers": {
    "auspex": {
      "command": "npx",
      "args": ["-p", "auspex-solari", "auspex-mcp"],
      "env": {
        "SOLARI_API_KEY": "slr_live_…"
      }
    }
  }
}
```

### Claude

Same JSON for Claude Desktop (`claude_desktop_config.json`) and a Claude Code project file (`.mcp.json`). File: [mcp.claude.example.json](examples/auspex-ts/mcp.claude.example.json).

```bash
claude mcp add --transport stdio auspex --env SOLARI_API_KEY=slr_live_… -- npx -p auspex-solari auspex-mcp
```

Claude Code reads [CLAUDE.md](CLAUDE.md), which points at [AGENTS.md](AGENTS.md) and [llms.txt](llms.txt).

### Grok Build

Copy into `~/.grok/config.toml` or a project `.grok/config.toml`. Grok expands `${SOLARI_API_KEY}` from your environment. Full file: [grok.mcp.example.toml](examples/auspex-ts/grok.mcp.example.toml).

```toml
[mcp_servers.auspex]
command = "npx"
args = ["-p", "auspex-solari", "auspex-mcp"]
env = { SOLARI_API_KEY = "${SOLARI_API_KEY}" }
enabled = true
startup_timeout_sec = 120
tool_timeout_sec = 1800
```

`startup_timeout_sec` is 120 because the first `npx` download can be slow. `tool_timeout_sec` is 1800 seconds (30 minutes), the same cap as `await-login`. Prefer `auspex_job` when the host will not hold a tool call that long.

### Other hosts

Qwen Code, Kimi Code, DeepSeek Harness, and OpenHands can start this same local program. Paste cards: [docs/HOSTS.md](docs/HOSTS.md). This page does not claim Doubao, MarsCode, or a GLM IDE as an Auspex host.

Contributors who cloned the repo still run `npm install && npm run build:mcp` in `examples/auspex-ts`. Clone Cursor file: [mcp.cursor.example.json](examples/auspex-ts/mcp.cursor.example.json). Notes: [package README](examples/auspex-ts/README.md#mcp).

## What one check can do

One check can fill one field and click one control. A later check starts a new browser, so a form opened in the first check is not still open.

`--allow-page-actions` does not raise that ceiling. A dialog, a typed field, and a submit are three steps. Stage the page, then have a person finish it. One click is one click.

A saved login is ready to reuse only when a later check sees the logged-in page. The short version is [Two truths about Save](#two-truths-about-save). The full rules are in [AGENTS.md](AGENTS.md).

## When a check refuses

- The words you asked for showed up on a public login or marketing page, so the profile was not saved. `expectMatchedPublicLanding`. Use the real app URL and text that only the logged-in app shows.
- The live site moved to a different host than the one minted into the door. `hostChanged`. Mint login again. Leave the old profile alone.
- The remote typing window expired and the profile has no cookies. `stream-expired`. Mint again. If save returned 200 but could not refresh in-tab session storage, and the cookie jar already includes the app host: a cookie-strong or local-storage-auth jar goes to `auspex_check` with verify-with-profile. Do not finalize to invent sessionStorage. Any other app-host jar runs finalize-login now. An IdP-only cookie jar with the app already on screen is the second row in [Two truths about Save](#two-truths-about-save): do not finalize.
- Solari HTTP status codes are a separate list from a logged-out page. See [AGENTS.md](AGENTS.md#blame-solari-vs-auspex).
- A stealth browser applies only when a check opens a session (`auspex check --stealth`). Login mint cannot request it. Do not add `auspex login --stealth`.

## Tested on live apps

In one live session (2026-09-28), a human signed in once per site through the phone door, and an AI agent (Claude Code over MCP) did the rest: collect the Save, run the check, and confirm the saved login from a second fresh browser (`claimOkProfile`). Real accounts, real sites, read-only apart from a few menu clicks.

| Backend / auth | Kind of app | Saved login confirmed on a second browser |
| --- | --- | --- |
| Appwrite | Class-booking platform | Yes |
| Supabase | Audio transcription SaaS | Yes |
| AWS | Language-learning app | Yes |
| Cloudflare + Clerk sign-in | Collaborative whiteboard | Yes |
| Postgres | Customer-support inbox | Yes |
| MySQL | Managed database console | Yes |
| MongoDB (Parse) | Backend-as-a-service dashboard | Yes |
| Azure + Microsoft sign-in (MSAL) | ConsistencyHub (our own SaaS) | Yes, after finalize-login |

Eight of eight reached a verified saved login, on a laptop and on a phone. Where a login was not really saved, Auspex said so instead of guessing: an empty saved profile, a Microsoft app that landed logged out despite a promising Save, and a Microsoft password wall it stopped at rather than typed into. The session also found and fixed Auspex bugs in the door (Clear, the Save paste, honest "Copied", stale page cache) and in checks (late client-side redirects, missed clicks without a screenshot, keys in receipt excerpts).

Two things worth knowing before you point an agent at your own app:

- **Read-only is not side-effect-free.** Opening a logged-in app runs the site's own load behaviour: a live-chat app showed the account online while the check was open, and an app can write to the user's storage on load.
- **Canvas and live-sync apps can draw after the page looks settled.** Pass `waitFor` with the app's main element.

## Logged-in evidence

Blurred dashboard from a real logged-in app. The blur hides personal data. The name in the file path is a worked example, not the recipe for every site.

![Redacted auth-gated SaaS demo (blur protects personal data)](examples/auspex-ts/demo/consistencyhub.png)

On that receipt: `ok=true`, `claimOk=false` (the anonymous second machine was skipped), `claimOkProfile=true`. OneDrive is a receipt only (no raw screenshot). That pair is a finished save. The second row above is the other case: a dashboard already on screen with an IdP-only cookie jar is `idp-only-save` / `app-visible`. Do not finalize that cookie jar.

## Worked example (dogfood)

Evidence only — not the first command. Use the published package. This named check is one host. Your site uses `login --url` above.

```bash
npx auspex-solari login --profile consistencyhub
npx auspex-solari await-login --profile consistencyhub --save-editor
npx auspex-solari finalize-login --profile consistencyhub
npx auspex-solari check --name consistencyhub --verify-with-profile
```

Full fence: [package README](examples/auspex-ts/README.md#worked-example-dogfood).

## Links

Auspex is check and verify honesty on Solari, not a second Solari SDK tutorial. Deep contract: [AGENTS.md](AGENTS.md).

- Reviewer skim: [docs/REVIEWER-5MIN.md](docs/REVIEWER-5MIN.md)
- Ops runbook: [docs/ops-runbook.md](docs/ops-runbook.md)
- Agent contract: [AGENTS.md](AGENTS.md) · Claude Code pointer: [CLAUDE.md](CLAUDE.md) · quick card: [llms.txt](llms.txt)
- Host paste cards: [docs/HOSTS.md](docs/HOSTS.md)
- Receipts: [RECEIPTS.md](RECEIPTS.md)
- Apply path (Harry Chow, LinkedIn 2026-08-31): fork the cookbook, ship a real Solari use case, make the repo public, and tag @harrychow_ @getsolari on LinkedIn or X. The tagged post is founder-only.
- Console — [console.getsolari.com](https://console.getsolari.com) · Docs — [docs.getsolari.com](https://docs.getsolari.com)

## Upstream cookbook

This repo is a public fork of the Solari cookbook. The submission is [examples/auspex-ts](examples/auspex-ts). Other folders under [`examples/`](examples/) are the original Solari samples. In those TypeScript samples, call `await solari.close()` or the process hangs.

MIT licensed.
