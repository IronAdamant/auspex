# Auspex

Agents often say a page loaded when it is still a login screen. Auspex opens the site in Solari cloud Chrome (a browser Solari runs in their cloud, not on your computer), checks the claim (the words you asked it to find), then checks again on a second machine. Auspex is the login-truth gate before reliable agent labor: it proves a claim about the logged-in state, so an agent does not start real work while the page is still a login screen. It is not a demo of acting while logged in.

## For Reviewers

If you only have a minute, watch with no clone and no API key: https://ironadamant.com/auspex/ — the landing opens on the blurred redacted demo and the three results. The player lower on the page is the stripped Microsoft wall, not logged-in proof. The Pages landing has a short Agent door card beside the phone login door.

The command people paste first, `npx auspex-solari check --name ironadamant`, is the ironadamant one-liner. It is a **measured public check**: Auspex opens a public page (no login) and checks that a known sentence is there. It does **not** prove logged-in honesty. To talk to Auspex from Cursor, the matching server command is `npx -p auspex-solari auspex-mcp`.

**Auth-gated evidence** (proof about a site that asks you to sign in) is the redacted demo: a redacted auth-gated SaaS demo, receipt [`consistencyhub-receipt.json`](examples/auspex-ts/demo/consistencyhub-receipt.json). The blur hides personal data. The skim under the blur names the dual pack. That pack is two published pieces from the same Microsoft sign-in: a ConsistencyHub blur plus its receipt, and an OneDrive receipt with no picture. Read that pack as two truths, below.

The recipe for a stranger’s own site is `login --url <https>` (Auspex names the saved login from the site address; override `--profile <yours>` to pick a different name). We do not claim Alice-vs-Bob wrong-account detection: a saved login can still be the wrong Microsoft user and still match the words you asked for. Auspex never types passwords. Never `--record` a logged-in session.

**Issues** is on. The weekly public job still skips if the secret is unset. Do not remove it. Repo `SOLARI_API_KEY` is **present** (masked). Observed: [Actions 35605123361](https://github.com/IronAdamant/auspex/actions/runs/35605123361) (2026-09-21) ironadamant + checkpoint `ok: true`.

### Two truths about Save

Save is the button on the phone login door. It asks Solari to store what the remote browser can see. A picture of a logged-in app and a saved login are two different things.

**The app on the remote screen is not a saved login you can reuse.** A site that signs you in through Microsoft or Google — often MSAL, the in-tab Microsoft session — can show the logged-in app while Save still stores only those sign-in cookies. Auspex stops on that jar on purpose. The stop is honest. Login worked. A stranger’s site uses `login --url https://…` (Auspex names the saved login from the address). The human taps Save. The agent runs `await-login --save-editor`. Finalize only when that save holds the app’s own session. Status `idp-only-save`, kind `app-visible`: do not finalize, and do not open login again to finish Microsoft. ConsistencyHub and OneDrive in the table are worked receipts of a finished save, not those steps.

| | What happened, in everyday words | What you should do |
| --- | --- | --- |
| **Truth A** | Someone finished signing in, and Auspex kept a complete saved login. Later, a separate check loaded that saved login and the expected words were on the page. The dual pack shows `claimOkProfile` true on both hosts (ConsistencyHub and OneDrive). | A later independent check can reuse that saved login. This pair is evidence, not the recipe a stranger should copy for a new site. |
| **Truth B** | Save returned 200, so Solari said the save call succeeded. The app is already on the remote picture, so the screen looks logged in. The cookie jar (the cookies that Save actually stored) is still only Microsoft or Google sign-in cookies. In-tab session storage is 0, so the app’s own in-tab session token was not stored. Solari handoff Save stores cookies and local storage. It cannot read the in-tab session token. The picture is not a saved login. That is not Auspex broken. | Do not finalize. Do not mint login again to finish Microsoft. Mint means opening a fresh login door. The status name for this case, once: `idp-only-save`, kind `app-visible`. |

`sign-in-wall` is the other kind of `idp-only-save`. You are still on the Microsoft or Google page. Finish that sign-in, land on the app, then Save. That one mints again (open login again). `app-visible` does not.

If the cookie jar already includes the app host (the app’s own site, not only Microsoft or Google) and Save could not refresh in-tab session storage, that case is not Truth B. A cookie-strong or local-storage-auth jar (app-origin cookies, or allowlisted localStorage auth key names) goes to `auspex_check` with verify-with-profile. Do not finalize to invent sessionStorage. Any other app-host jar still runs finalize-login now.

Three results come back. They are separate. Read each one on its own.

- `ok` — The browser Auspex just opened found the words you asked for, and the second check passed when it ran.
- `claimOk` — A second machine with no saved login also saw those words.
- `claimOkProfile` — A second browser that reused the saved login also saw those words. After `--verify-with-profile`, **`claimOkProfile` is the reuse gate**. `ok` alone is not enough to treat the profile as reusable.

## Login door

**Phone page** — Auspex login, then `phone.html`, then remote Chrome on a Google New Tab. The same page is the door on a phone or a computer. It has a real text field because Solari’s remote view will not open the phone keyboard ([Solari cookbook #80](https://github.com/solari-sdk/solari-cookbook/issues/80)). You type or paste there (a password manager works). Clear empties the whole field. That field is the Auspex seed door: the place a human types so the remote browser can receive the keys. It is not a same-session takeover and it does not type into the page for the agent.

![Phone login door: Auspex phone page to remote Chrome on Google New Tab](examples/auspex-ts/demo/door-phone.gif)

This page is a seed/handoff door (you type or paste off-site, into the Auspex door, and the keys go to remote Chrome), not a same-session VNC takeover, and not a full logged-in SaaS walkthrough. Show as bullets is off by default so a password manager can paste into the text field. It is not the Mousepad sandbox demo (`auspex desktop`).

## 30-second public proof

**Public check** (no login). It does **not** prove logged-in honesty.

```bash
export SOLARI_API_KEY=slr_live_…   # https://console.getsolari.com — env only, never commit
npx auspex-solari check --name ironadamant
npx -p auspex-solari auspex-mcp
```

**Install `auspex-solari` (not npm `auspex`). Repo is `IronAdamant/auspex`.**

npm `auspex` is a different scraper. `auspex-solari` **0.1.4 is published** (latest). Agents do not `npm publish`.

After a git clone, run `npm install && npm run build:mcp` in `examples/auspex-ts`, or MCP (the agent connection) fail-closes with reason `DistMissing` (the server files were not built; not an empty silent server). Published `npx -p auspex-solari auspex-mcp` includes `dist/`.

## Pick your path

| Door | Open this |
| --- | --- |
| **Watch** (no clone, no API key) | [Landing](https://ironadamant.com/auspex/) · [replay player (rrweb)](https://ironadamant.com/auspex/demo/replay.html) (Microsoft login wall; emails and passwords stripped) |
| **Auth-gated evidence** | Redacted demo [receipt](examples/auspex-ts/demo/consistencyhub-receipt.json) · [RECEIPTS.md](RECEIPTS.md) |
| **Public check** | `npx auspex-solari check --name ironadamant` — does **not** prove logged-in honesty |
| **Any site** | `npx auspex-solari check https://example.com --expect "Example Domain"` |
| **Microsoft login — human** | 1. `npx auspex-solari login --url <https>` (override `--profile <yours>`). 2. Open `handoff.url` (`phone.html`; `handoff.mobileUrl` is the same page) on a phone or a computer. 3. You sign in on that door and tap Save. The human does this part. The agent does not type the password. |
| **Microsoft login — agent** | After that Save, the agent runs `await-login --save-editor` (wait until Save has stored cookies). Finalize (`auspex_finalize_login`, open the app again and save the in-tab session) only when that save holds the app’s own session. Status `idp-only-save`, kind `app-visible`: do not finalize. Saved-check names supply URL and expect; unknown profiles require `--url` and `--expect`. [Frozen door sequence](AGENTS.md#frozen-agent-door-sequence). Never `--record`. |
| **MCP** | `npx -p auspex-solari auspex-mcp` — Cursor config below |
| **Hands-off job** | One command runs the whole path (open the door, wait for Save, finalize, then check): `npx auspex-solari job --url <https> --expect "<unique logged-in text>"`, then `job-status` |
| **Do not** | Type passwords · `--record` a logged-in session · commit `SOLARI_API_KEY`, `.env`, or `.auspex/` |

Anonymous verify (the second check with no saved login) is skipped for any attached profile on a non-public-marketing URL. Login, finalize, profile-status, reap, and trace are the auth + hygiene doors: sign in, finish saving the login, see whether that saved login is still good, clean up leftover cloud browsers, and read the login trace. The named Solari sandbox Mousepad demo (Mousepad, a text editor, inside Solari’s cloud desktop) is not your computer (402 on Free: the free Solari plan answers HTTP 402 and will not start that desktop).

Save is not sessionStorage. Pressing Save does not, by itself, copy the tab’s session storage. Solari editor Save stores cookies and localStorage. Auspex does not invent sessionStorage on that Save. `weakSeed` is cookies or site data with a counted `sessionStorage === 0`, or a stale fold, when the jar has no app-origin cookies and no allowlisted localStorage auth key names. App-origin cookies or those key names are a cookie Save: run `check --verify-with-profile` and read `claimOkProfile`. `solariSaveReady` is not that gate. IdP hosts alone stay refused. `emptySave` means the profile is missing. `--verify-with-profile` is refused on `weakSeed`, `emptySave`, and a dead fold (that saved copy can no longer be used, so there is no second browser). `ok` ≠ `claimOk` ≠ `claimOkProfile`.

Login trace writes one post-handoff row (one redacted note after the login door is ready). Check rows are not written. Never tokens, passwords, or session ids. If mint is silent (opening login produces no door), read `npx auspex-solari trace` before minting again.

## MCP

The agent connection is a local program: `npx -p auspex-solari auspex-mcp`. Put `SOLARI_API_KEY` in `env`. No clone. The published package already includes the server files.

There is no Auspex web address for a cloud connector. Claude.ai custom connectors need a remote HTTP MCP server. This repo does not publish one. Solari's hosted browser MCP is a different product from this login-truth gate.

A login wait (`await-login`) can run for about 30 minutes while a person signs in. A tool timeout of about 300 seconds ends before that wait. For a hands-off run, use `auspex_job`, then `auspex_job_status` (CLI: `npx auspex-solari job`, then `job-status`). A single public check fits in a few minutes.

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

`startup_timeout_sec` is 120 because the first `npx` download can be slow. `tool_timeout_sec` is 1800 seconds (30 minutes), the same cap as `await-login`. The previous example used 300. That covers one check and ends during the login wait. Prefer `auspex_job` when the host will not hold a tool call that long.

### Other hosts

Qwen Code, Kimi Code, DeepSeek Harness, and OpenHands can start this same local program. Paste cards: [docs/HOSTS.md](docs/HOSTS.md). Following the English door and the three results is up to the model. This page does not claim Doubao, MarsCode, or a GLM IDE as an Auspex host.

Contributors who cloned the repo still run `npm install && npm run build:mcp` in `examples/auspex-ts`. Clone Cursor file: [mcp.cursor.example.json](examples/auspex-ts/mcp.cursor.example.json). Notes: [package README](examples/auspex-ts/README.md#mcp).

## When a check refuses

- The words you asked for showed up on a public login or marketing page, so the profile was not saved. `expectMatchedPublicLanding`. Use the real app URL and text that only the logged-in app shows.
- The live site moved to a different host than the one minted into the door (the website on screen is not the website the login door was opened for). `hostChanged`. Mint login again. Leave the old profile alone.
- The remote typing window expired and the profile has no cookies. `stream-expired`. Mint again. If save returned 200 but could not refresh in-tab session storage, and the cookie jar already includes the app host: a cookie-strong or local-storage-auth jar (app-origin cookies, or allowlisted localStorage auth key names) goes to `auspex_check` with verify-with-profile. Do not finalize to invent sessionStorage. Any other app-host jar runs finalize-login now. An IdP-only cookie jar (only Microsoft or Google sign-in cookies) with the app already on screen is Truth B above: do not finalize.
- Solari HTTP status codes are a separate list from a logged-out page. See [AGENTS.md](AGENTS.md#blame-solari-vs-auspex).
- A stealth browser (a harder-to-detect Chrome) applies only when a check opens a session (`auspex check --stealth`). Login mint cannot request it. The cold login handoff (the first remote Chrome opened for sign-in) and the profile editor ignore a stealth body (same handoff, no 402). Do not add `auspex login --stealth`.

## Logged-in evidence

Blurred dashboard from a real logged-in app. The blur hides personal data. The name in the file path is a worked example, not the recipe for every site.

![Redacted auth-gated SaaS demo (blur protects PII)](examples/auspex-ts/demo/consistencyhub.png)

On that receipt: `ok=true` (the live check passed), `claimOk=false` (the anonymous second machine was skipped), `claimOkProfile=true` (the saved login saw the words you asked for). OneDrive is a receipt only (no raw screenshot). That pair is Truth A. Truth B is in [For Reviewers](#for-reviewers): a dashboard already on screen with an IdP-only cookie jar is `idp-only-save` / `app-visible`. Do not finalize that cookie jar.

## Worked example (dogfood)

Evidence only — not the first command. Dogfood here means the founder’s own worked example, kept so others can see a real sign-in. Use the published package. This named check is the worked example for one host. A stranger’s own site uses `login --url` above.

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
- Receipts: [RECEIPTS.md](RECEIPTS.md) · thesis: [PITCH.md](PITCH.md)
- Apply path (Harry Chow, LinkedIn 2026-08-31): fork the cookbook, ship a real Solari use case, make the repo public, and tag @harrychow_ @getsolari on LinkedIn or X. The tagged post is founder-only.
- Console — [console.getsolari.com](https://console.getsolari.com) · Docs — [docs.getsolari.com](https://docs.getsolari.com)

## Upstream cookbook

This repo is a public fork of the Solari cookbook. The submission is [examples/auspex-ts](examples/auspex-ts). Other folders under [`examples/`](examples/) are the original Solari samples. In those TypeScript samples, call `await solari.close()` or the process hangs.

MIT licensed.
