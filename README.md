# Auspex

**Evidence from a live web page, for AI agents, without guessing.**

An agent says "the dashboard shows X". Was it looking at the real app, a login screen, or its own guess? Auspex opens the page in [Solari](https://getsolari.com) cloud Chrome, checks for the exact words you asked for, saves a screenshot and a JSON receipt. On a public page, a second machine then checks the same claim. For sites behind a login, a human signs in once through a phone-friendly door and the agent never sees the password. Add `--verify-with-profile` and a second, fresh browser using only the saved login checks again; Auspex does not call that login reusable until it passes.

CLI and MCP, same contract. Works with Claude Code, Cursor, Grok and other MCP hosts.

Built around real Solari limits, each with a named failure and a recovery step instead of a silent retry: no phone keyboard in the remote view ([cookbook #80](https://github.com/solari-sdk/solari-cookbook/issues/80)), SDK retries that strip the HTTP status ([#56](https://github.com/solari-sdk/solari-cookbook/issues/56)), 18 concurrent browsers where 20 are advertised ([#57](https://github.com/solari-sdk/solari-cookbook/issues/57)), no session listing ([#61](https://github.com/solari-sdk/solari-cookbook/issues/61)), and sessions that look alive after they end ([#25](https://github.com/solari-sdk/solari-cookbook/issues/25)).

## For Reviewers

- **Watch, no install:** https://ironadamant.com/auspex/ (blurred logged-in demo and the three results).
- **Run the tests, no API key:** clone, then `npm install && npm test`.
- **One live check (needs `SOLARI_API_KEY`):** `npx auspex-solari check --name ironadamant`. This is a public check with no login, so it does not prove the logged-in path.
- **Logged-in evidence:** the redacted receipt [`consistencyhub-receipt.json`](examples/auspex-ts/demo/consistencyhub-receipt.json), and the live test of eight apps [below](#tested-on-live-apps).
- **Your own site:** `npx auspex-solari login --url https://your.app` names a saved login after the site; a human signs in and taps Save.
- **CI:** Issues are on. The weekly live job skips if the key is unset; repo secret `SOLARI_API_KEY` is **present** (run [35605123361](https://github.com/IronAdamant/auspex/actions/runs/35605123361): `ok: true`). Every push also installs the packed package and runs it end to end.

We do not claim Alice-vs-Bob wrong-account detection: a saved login can be the wrong account and still show the words you asked for. Auspex never types passwords, and never records a logged-in session.

## Three results

Each receipt keeps three answers apart:

- `ok`: the live browser found your words (and the second check passed, when it ran).
- `claimOk`: a second machine with no login also saw them.
- `claimOkProfile`: a second fresh browser using the saved login also saw them. This is the reuse gate: `ok` alone is not enough to treat the profile as reusable.

## Tested on live apps

In one session (2026-09-28), a human signed in once per site through the phone door and an AI agent (Claude Code over MCP) did the rest. Real accounts, read-only apart from a few menu clicks.

| Backend / sign-in | Kind of app | Saved login confirmed by a second browser |
| --- | --- | --- |
| Appwrite | Class-booking platform | Yes |
| Supabase | Audio transcription SaaS | Yes |
| AWS | Language-learning app | Yes |
| Cloudflare + Clerk | Collaborative whiteboard | Yes |
| Postgres | Customer-support inbox | Yes |
| MySQL | Managed database console | Yes |
| MongoDB (Parse) | Backend-as-a-service dashboard | Yes |
| Azure + Microsoft sign-in | ConsistencyHub (our own SaaS) | Yes, after one extra step |

Eight of eight, on a laptop and on a phone. When a login was not really saved, Auspex said so instead of guessing: an empty saved login, a Microsoft app that came back logged out, and a Microsoft password screen it stopped at rather than typed into.

The next day (2026-09-29) the same eight apps plus Canva (Google sign-in) ran again through the one-command `connect`, with Claude Code as the agent: eight of nine confirmed. Canva is not confirmed because it shows every cloud browser a Cloudflare bot check, and Auspex says that instead of guessing. Every attempt, including the Solari errors along the way: [RECEIPTS.md](RECEIPTS.md#one-command-run-with-connect-2026-09-29).

Before pointing an agent at your own app: opening a logged-in page still runs the site's own behaviour (a chat app showed the account online; an app can write to its storage on load), and canvas apps can draw after the page looks finished.

## Install

```bash
export SOLARI_API_KEY=slr_live_…   # https://console.getsolari.com. Keep it in the environment; never commit it.
npx auspex-solari check https://example.com --expect "Example Domain"
npx -p auspex-solari auspex-mcp     # the MCP server
```

The npm package is **`auspex-solari`** (npm `auspex` is a different project). `auspex-solari` **0.1.14 is published**. From a clone: `npm install && npm run build:mcp`, then `npx auspex …`.

## Login door

**Shortest path: `connect`.** One command does the whole login and confirms it:

```bash
npx auspex-solari connect https://your.app --expect "Words only shown when logged in"
```

It prints the door link (and a QR code in a wide terminal) and shows the time left. You sign in, then press **Enter** in the terminal. It saves the login, runs the extra finalize step only when an app needs it, and checks with a fresh browser that uses only the saved login. It ends with one sentence. It says "Logged in" only when that second browser saw your words; otherwise it names what happened (the sign-in window closed, a Solari error, a bot check, only the Microsoft or Google sign-in was saved). An AI agent can run the same command: it waits for the human to tap Save on the phone page, then the agent runs `npx auspex-solari connect --save <profile>`. From a clone the same command is `npx auspex connect`.

The step-by-step path below is what `connect` runs for you.

For a site behind a login, `npx auspex-solari login --url https://your.app` prints a link to the door, `phone.html`. Open it on a phone or a computer, tap the field you want in the remote browser, type in the box at the bottom (it opens the phone keyboard), sign in, then **tap Save** and paste the line it copies into your AI chat. The agent then collects the login with `await-login --save-editor`.

![Phone login door: Solari remote Chrome, countdown, and Clear](examples/auspex-ts/demo/door-phone.gif)

It is a seed/handoff door for typing off-site, not a same-session VNC takeover of the agent's browser. The typing window lasts about five minutes (Solari's limit), so save as soon as the app appears. The saved login itself lasts much longer. Passwords go only to the remote browser and the site; they never reach the agent, the chat, or ironadamant.com.

## Two truths about Save

1. **A saved login is ready to reuse only when a later check proves it.** A second fresh browser opens the app with the saved login and sees your words.
2. **What is on screen can be ahead of what was saved.** Some apps (especially Microsoft sign-in) show the app while Save captured only the sign-in provider's cookies. Auspex reports that instead of pretending, and the next step is one extra command, not a new login.

## What one check can do

One check can fill one field and click one control. A later check starts a new browser, so a form opened in the first check is not still open.

`--allow-page-actions` does not raise that ceiling. A dialog, a typed field, and a submit are three steps. Stage the page, then have a person finish it. One click is one click.

A saved login is ready to reuse only when a later check sees the logged-in page. The short version is [Two truths about Save](#two-truths-about-save). The full rules are in [AGENTS.md](AGENTS.md).

## MCP

Local program, key in `env`:

```json
{
  "mcpServers": {
    "auspex": {
      "command": "npx",
      "args": ["-p", "auspex-solari", "auspex-mcp"],
      "env": { "SOLARI_API_KEY": "slr_live_…" }
    }
  }
}
```

Claude Code: `claude mcp add --transport stdio auspex --env SOLARI_API_KEY=slr_live_… -- npx -p auspex-solari auspex-mcp`. Grok, Qwen Code, Kimi Code, DeepSeek Harness, OpenHands: [docs/HOSTS.md](docs/HOSTS.md). A sign-in wait can outlast a host's tool timeout; agents use `auspex_job` then `auspex_job_status`.

## Worked example (dogfood)

ConsistencyHub (Microsoft sign-in), end to end:

```bash
npx auspex-solari login --profile consistencyhub
npx auspex-solari await-login --profile consistencyhub --save-editor
npx auspex-solari finalize-login --profile consistencyhub
npx auspex-solari check --name consistencyhub --verify-with-profile
```

## For AI agents

Everything an agent needs is in [AGENTS.md](AGENTS.md): every status and what to do next, the receipt schema, the login steps ([frozen door sequence](AGENTS.md#frozen-agent-door-sequence)), and the safety rules. [llms.txt](llms.txt) is the short card. Agents: read those, not this page.

## Links

- [AGENTS.md](AGENTS.md) (agent contract) · [llms.txt](llms.txt) (quick card) · [CLAUDE.md](CLAUDE.md)
- [RECEIPTS.md](RECEIPTS.md) · [CHANGELOG.md](CHANGELOG.md) · [docs/REVIEWER-5MIN.md](docs/REVIEWER-5MIN.md) · [docs/ops-runbook.md](docs/ops-runbook.md) · [docs/HOSTS.md](docs/HOSTS.md)
- Solari: [console](https://console.getsolari.com) · [docs](https://docs.getsolari.com)

This repo is a fork of the Solari cookbook; Auspex lives in [examples/auspex-ts](examples/auspex-ts), and the other folders under `examples/` are the original Solari samples. MIT licensed.
