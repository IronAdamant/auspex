# Auspex

Agent-only web eyes: cloud browser check → independent sandbox verify → tear-down. Built for [Pinetree Research's intern challenge](https://jobs.getsolari.com).

**5-second pitch:** Coding agents launch a throwaway [Solari](https://getsolari.com) cloud Chrome, snapshot a live page (with optional stealth/proxy/captcha), verify the claim in a separate headless VM, and kill everything. Frozen receipt schema. Fail-closed by design. You never sit in that browser.

```bash
git clone https://github.com/IronAdamant/auspex.git
cd auspex
npm install
export SOLARI_API_KEY=slr_live_…   # console.getsolari.com — env only, never commit
npx auspex check --name ironadamant
```

![Solari cloud Chrome checking ironadamant.com](examples/auspex-ts/demo/ironadamant.png)

**Public receipts:** [RECEIPTS.md](RECEIPTS.md) — live evidence, demo artifacts, and honesty notes on marketing summary vs. schema v1.

Full agent instructions: [AGENTS.md](AGENTS.md) · Package: [examples/auspex-ts](examples/auspex-ts)

## What we shipped for the intern challenge

Three primitives only: browser check, sandbox verify, named sandbox desktop demo.

- **`auspex_check`** — cloud Chrome: goto, optional wait-for (fill/click without a profile, or with `--allow-page-actions`), optional stealth/proxy/captcha, snapshot, claim check, close. **Verifies by default** (HTTP + OCR in headless VM). Saved checks: `--name ironadamant` / `checkpoint` / `consistencyhub`. Returns frozen **schema v1** receipt: `schemaVersion`, `ok`, `reason`, `url`, `expect`, `screenshotPath` (required); `diff`, `verify`, optional fields.

- **`auspex_verify`** — only if you passed `verify=false` to skip default verify. Headless sandbox independently re-checks the PNG + JSON. **Integrity `ok` is separate from claim `claimOk`:** verify re-fetches the URL and OCRs the PNG instead of echoing `manifest.ok`. Kills the VM.

- **`auspex_profile_status`** — `loggedIn` / `loggedOut` / `needsHuman`. Human SSO once; **the agent never types a password.** Microsoft and Google password/OTP walls return `needsHuman: true`. `--fill` is refused on `input[type=password]` selectors.

- **`auspex_reap`** — list/kill leftover **ledger** sessions after `429 ConcurrencyLimitExceeded`. Default lists ledger ids only (does not wipe every VM on the key). `--account-wide` wipes all VMs. `--pack-receipts` copies last receipts per URL into `.auspex/pack/` for a PR attach.

- **`auspex_desktop`** — named Solari sandbox desktop demo: wait for X11, open Mousepad by default. **Not the user's Mac.** Wait/expect/`ok` share one process haystack. Coordinate clicks are unverified and not default. `streamUrl` is the live VNC.

### Fail-closed design

- **No password typing:** SSO handoff URL (human signs in once); `--fill` refused on `input[type=password]`; Microsoft/Google walls return `needsHuman`.
- **No logged-in recording by default:** `--record` + `--profile` is forbidden unless `--allow-record-profile` on a public marketing host (ironadamant.com, checkpointprojects.com). Refused for consistencyhub.
- **No page actions with profiles by default:** `--fill` / `--click` with a profile (including `--name consistencyhub`) requires `--allow-page-actions`. Public checks without a profile may still fill/click.
- **Schema v1 frozen:** `schemaVersion: 1` on stdout. CLI and MCP are the same contract: every MCP tool is a CLI command; every flag is a JSON field.
- **`ok` ≠ `claimOk`:** The agent sees `ok` (matched + verify passed). Verify sees `claimOk` (re-fetch + OCR, not JSON echo).

## MCP first (Cursor / Claude / Grok)

`.cursor/mcp.json` is committed. Auspex tools are the product; official Solari MCP (33 tools) is an optional gated sibling.

```bash
npx auspex-mcp
# or: npx tsx src/mcp.ts   # from examples/auspex-ts
```

Official `@solarisdk/mcp` exits unless `SOLARI_API_KEY` is set so hosts do not list empty `solari_*` tools. Prefer `auspex_reap` for 429 recovery.

Weekly public checks: `npx auspex check --name ironadamant` and `--name checkpoint`, or from `examples/auspex-ts`, `npm run public-check`. The GitHub Actions `public` job is Monday + `workflow_dispatch` and skips without env `SOLARI_API_KEY`. A **repo** secret named `SOLARI_API_KEY` is required for that job to run; this repository does not add the secret, and missing it does not fail pull requests.

## Links

- Pitch (hiring managers): [PITCH.md](PITCH.md)
- Agent instructions (any host): [AGENTS.md](AGENTS.md)
- Console — [console.getsolari.com](https://console.getsolari.com)
- Docs — [docs.getsolari.com](https://docs.getsolari.com)

---

## Upstream cookbook (unmodified Solari samples, not the submission)

The examples below are the original Solari cookbook programs. They are **not the intern submission**; they have no Auspex CI and demonstrate raw SDK usage patterns.

### Intern submission product

| Example | What it shows |
| --- | --- |
| **[auspex-ts](examples/auspex-ts)** | The intern-challenge product: check, verify, desktop, login profiles, MCP |

### Cloud browser (upstream samples)

| Example | Language | What it shows |
| --- | --- | --- |
| [browser-quickstart-ts](examples/browser-quickstart-ts) | TypeScript | Launch a browser, open a page, read it |
| [browser-quickstart-py](examples/browser-quickstart-py) | Python | Launch a browser, open a page, read it |
| [browser-stealth-proxy-ts](examples/browser-stealth-proxy-ts) | TypeScript | Stealth mode + residential proxy egress |
| [browser-profiles-ts](examples/browser-profiles-ts) | TypeScript | Log in once, reuse the session forever |
| [browser-session-recording-py](examples/browser-session-recording-py) | Python | Record a session, download the replay |

### Sandbox (upstream samples)

| Example | Language | What it shows |
| --- | --- | --- |
| [sandbox-quickstart-ts](examples/sandbox-quickstart-ts) | TypeScript | Run a command, write and read files |
| [sandbox-code-interpreter-py](examples/sandbox-code-interpreter-py) | Python | Stateful Python kernel for agent loops |
| [sandbox-port-preview-ts](examples/sandbox-port-preview-ts) | TypeScript | Expose a server in the VM on a public URL |

### Desktop (upstream samples)

| Example | Language | What it shows |
| --- | --- | --- |
| [auspex-ts](examples/auspex-ts) `desktop` | TypeScript | Mousepad sandbox demo, `streamUrl`, process expect, kill |
| [desktop-computer-use-py](examples/desktop-computer-use-py) | Python | Upstream screenshot/click/type sample (center-click warning) |

### Running an upstream example

Each cookbook directory is still self-contained.

```bash
cd examples/browser-quickstart-ts   # or any other example
npm install
export SOLARI_API_KEY=slr_live_...   # grab one at console.getsolari.com
npm start
```

One `slr_live_` key works across browsers, sandboxes, and desktops.

### Which Solari product do I want?

- **Cloud browser** — a *web page*: scraping, testing, filling forms. Adds stealth, managed proxies, captcha solving, profiles, and session recording.
- **Sandbox** — *run code*: an LLM's Python, an untrusted build. Headless microVM.
- **Desktop** — a *screen*: computer-use agents, GUI apps. A sandbox plus X11 and a live VNC stream.

### Gotchas the examples encode

- **TypeScript: call `await solari.close()`.** The browser client keeps a loopback proxy open. Skip the close and the process hangs.
- **Recording is per session.** Pass `recording: true` at create; poll ~30s after release. Auspex `--record` sets `replayReady` and may write `replay.ndjson` — it never puts a presigned `replayUrl` on stdout.
- **Sandbox commands are not shell-interpreted.** `run("ls -la")` looks for a binary named `ls -la`.
- **`kill()`, not `close()`, ends a VM.**
- **`timeoutMs` is a rolling idle window**, not a hard deadline.
- **429 is not retryable.** Call `auspex_reap` (or official `solari_kill`) to free leftover sessions.

---

MIT licensed.
