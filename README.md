# Auspex

Agent-only **web eyes** on [Solari](https://getsolari.com) cloud Chrome, plus a sandbox receipt audit and a named sandbox desktop demo.

This is a public fork of the Solari cookbook built for Pinetree Research’s intern challenge: a coding agent launches a throwaway cloud browser, snapshots a live page, independently verifies the claim in a headless VM, and tears everything down. You never sit in that browser.

## What we shipped for the intern challenge

- **`auspex_check`** — cloud Chrome: goto, optional click/fill/wait-for, optional stealth/proxy/captcha, snapshot, claim check, close. Verifies by default (HTTP + OCR). `--record` waits for replay (no presigned URL on JSON). Saved checks: `--name ironadamant` / `checkpoint` / `consistencyhub`.
- **`auspex_verify`** — only if you passed `verify=false`. Headless sandbox re-checks the PNG + JSON. Integrity (`ok`) is separate from **claim** (`claimOk`), which re-fetches the URL / OCRs the PNG instead of echoing `manifest.ok`.
- **`auspex_desktop`** — named sandbox desktop demo: wait for X11, open Mousepad. Not the user's Mac. Wait/expect/`ok` share one process haystack. Coordinate clicks are unverified and not default. `streamUrl` is the live VNC.
- **`auspex_profile_status`** — `loggedIn` / `loggedOut` / `needsHuman`. Human SSO once; the agent never types a password.
- **`auspex_reap`** — list/kill leftover sessions and VMs after `429 ConcurrencyLimitExceeded`. `packReceipts` copies last receipts for a PR attach.
- **MCP first** — Cursor, Claude, and Grok configs. Auspex tools are the product; official Solari MCP is an optional gated sibling (`SOLARI_API_KEY` or it does not start).

```bash
git clone https://github.com/IronAdamant/auspex.git
cd auspex
npm install
export SOLARI_API_KEY=slr_live_…   # console.getsolari.com — env only, never commit
npx auspex check --name ironadamant
npx auspex check --name checkpoint
npx auspex mcp
```

![Solari cloud Chrome checking ironadamant.com](examples/auspex-ts/demo/ironadamant.png)

Receipt: [PNG](examples/auspex-ts/demo/ironadamant.png), [sessionId JSON](examples/auspex-ts/demo/receipt.json), [rrweb replay](examples/auspex-ts/demo/replay.html) (open the HTML after clone, or via [jsDelivr](https://cdn.jsdelivr.net/gh/IronAdamant/auspex@main/examples/auspex-ts/demo/replay.html)).

Full agent notes: [AGENTS.md](AGENTS.md) (any host) · [examples/auspex-ts](examples/auspex-ts).

## MCP (Cursor / Claude / Grok)

Auspex is the check → verify → kill loop. `.cursor/mcp.json` is committed. Weekly public pages: `npx auspex check --name ironadamant` and `--name checkpoint`, or from `examples/auspex-ts`, `npm run public-check`. The GitHub Actions `public` job is Monday + `workflow_dispatch` and skips without env `SOLARI_API_KEY`. A **repo** secret named `SOLARI_API_KEY` is required for that job to run; this repository does not add the secret, and missing it does not fail pull requests.

```bash
npx auspex-mcp
# or: npx tsx src/mcp.ts   # from examples/auspex-ts
```

Official `@solarisdk/mcp` (33 tools) is **optional**. `dist/solari-mcp.mjs` exits unless `SOLARI_API_KEY` is set so hosts do not list empty `solari_*` tools. Prefer `auspex_reap` for 429 recovery.

## Examples

| Example | What it shows |
| --- | --- |
| **[auspex-ts](examples/auspex-ts)** | The intern-challenge product: check, verify, desktop, login profiles, MCP |
| [auspex-ts](examples/auspex-ts) `verify` | Headless VM independently audits a cloud-browser receipt, then kill |
| [auspex-ts](examples/auspex-ts) `desktop` | Named sandbox demo (open Mousepad + process evidence), screenshot, kill |

### Upstream cookbook (unmodified Solari samples)

These are the original cookbook programs. They are not the intern submission; they have no Auspex CI.

#### Cloud browser

| Example | Language | What it shows |
| --- | --- | --- |
| [browser-quickstart-ts](examples/browser-quickstart-ts) | TypeScript | Launch a browser, open a page, read it |
| [browser-quickstart-py](examples/browser-quickstart-py) | Python | Launch a browser, open a page, read it |
| [browser-stealth-proxy-ts](examples/browser-stealth-proxy-ts) | TypeScript | Stealth mode + residential proxy egress |
| [browser-profiles-ts](examples/browser-profiles-ts) | TypeScript | Log in once, reuse the session forever |
| [browser-session-recording-py](examples/browser-session-recording-py) | Python | Record a session, download the replay |

#### Sandbox

| Example | Language | What it shows |
| --- | --- | --- |
| [sandbox-quickstart-ts](examples/sandbox-quickstart-ts) | TypeScript | Run a command, write and read files |
| [sandbox-code-interpreter-py](examples/sandbox-code-interpreter-py) | Python | Stateful Python kernel for agent loops |
| [sandbox-port-preview-ts](examples/sandbox-port-preview-ts) | TypeScript | Expose a server in the VM on a public URL |

#### Desktop

| Example | Language | What it shows |
| --- | --- | --- |
| [auspex-ts](examples/auspex-ts) `desktop` | TypeScript | Mousepad sandbox demo, `streamUrl`, process expect, kill |
| [desktop-computer-use-py](examples/desktop-computer-use-py) | Python | Upstream screenshot/click/type sample (center-click warning) |

## Running an upstream example

Each cookbook directory is still self-contained.

```bash
git clone https://github.com/IronAdamant/auspex.git
cd auspex
npm install
export SOLARI_API_KEY=slr_live_...   # grab one at console.getsolari.com
npx auspex check https://example.com --expect "Example Domain"
```

One `slr_live_` key works across browsers, sandboxes, and desktops.

## Which product do I want?

- **Cloud browser** — a *web page*: scraping, testing, filling forms. Adds stealth, managed proxies, captcha solving, profiles, and session recording.
- **Sandbox** — *run code*: an LLM's Python, an untrusted build. Headless microVM.
- **Desktop** — a *screen*: computer-use agents, GUI apps. A sandbox plus X11 and a live VNC stream.

## Gotchas the examples encode

- **TypeScript: call `await solari.close()`.** The browser client keeps a loopback proxy open. Skip the close and the process hangs.
- **Recording is per session.** Pass `recording: true` at create; poll ~30s after release. Auspex `--record` sets `replayReady` and may write `replay.ndjson` — it never puts a presigned `replayUrl` on stdout.
- **Sandbox commands are not shell-interpreted.** `run("ls -la")` looks for a binary named `ls -la`.
- **`kill()`, not `close()`, ends a VM.**
- **`timeoutMs` is a rolling idle window**, not a hard deadline.
- **429 is not retryable.** Call `auspex_reap` (or official `solari_kill`) to free leftover sessions.

## Links

- Docs — [docs.getsolari.com](https://docs.getsolari.com)
- Console — [console.getsolari.com](https://console.getsolari.com)
- Changelog — [changelog.getsolari.com](https://changelog.getsolari.com)

MIT licensed.
