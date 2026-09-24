# Auspex

Agents often say a page loaded when it is still a login screen. Auspex opens the site in Solari cloud Chrome (a browser Solari runs in their cloud, not on your computer), checks the claim, then checks again on a second machine.

Three results come back. They are separate.

- `ok` means the live browser matched the claim, and the second check passed when it ran.
- `claimOk` means an anonymous second machine saw the claim, with no saved login.
- `claimOkProfile` means a second browser that reused the saved login saw the claim. After `--verify-with-profile`, this is the signal that the saved login is worth reusing. `ok` alone is not enough.

We do not claim Alice-vs-Bob wrong-account detection. Auspex never types passwords. Never `--record` a logged-in session.

## Login doors (Phone and Desktop)

**Phone** — Auspex login, then the Phone door, then remote Chrome on a Google New Tab. The phone page has a real text field because Solari’s remote view will not open the phone keyboard — you type or paste there (a password manager works).

![Phone login door: Auspex chooser to remote Chrome on Google New Tab](examples/auspex-ts/demo/door-phone.gif)

**Desktop** — Auspex login, then the Desktop door, then remote Chrome on a Google New Tab.

![Desktop login door: Auspex chooser to remote Chrome on Google New Tab](examples/auspex-ts/demo/door-desktop.gif)

These are handoff doors (you type or paste off-site). They are not a same-session remote desktop takeover. They are not a full logged-in SaaS walkthrough.

## 30-second public proof

This checks a public page. It does **not** prove logged-in honesty.

```bash
export SOLARI_API_KEY=slr_live_…   # https://console.getsolari.com — env only, never commit
npx auspex-solari check --name ironadamant
```

**Install `auspex-solari` (not npm `auspex`). Repo is `IronAdamant/auspex`.**

npm `auspex` is a different scraper. `auspex-solari` **0.1.3 is published** (latest). Agents do not `npm publish`.

## Pick your path

| Door | Open this |
| --- | --- |
| **Watch** (no clone, no API key) | [Landing](https://ironadamant.com/auspex/) · [rrweb player](https://ironadamant.com/auspex/demo/replay.html) (Microsoft login wall; emails and passwords stripped) |
| **Logged-in evidence** | Blurred dashboard below · [receipt](examples/auspex-ts/demo/consistencyhub-receipt.json) · [RECEIPTS.md](RECEIPTS.md) |
| **Public check** | `npx auspex-solari check --name ironadamant` — does **not** prove logged-in honesty |
| **Any site** | `npx auspex-solari check https://example.com --expect "Example Domain"` |
| **Microsoft login** | 1. `npx auspex-solari login --url <https>` (profile name comes from the host). 2. Open `handoff.url` (Phone: `handoff.mobileUrl`, Desktop: `handoff.desktopUrl`). 3. You sign in and tap Save. 4. `await-login --save-editor`, then `finalize-login`. [Door sequence](AGENTS.md#frozen-agent-door-sequence). Never `--record`. |
| **MCP** | `npx -p auspex-solari auspex-mcp` — paste the Cursor config below |
| **Hands-off job** | `npx auspex-solari job --url <https> --expect "<unique logged-in text>"`, then `job-status` |
| **Issues** | On. Weekly public check: [Actions 35605123361](https://github.com/IronAdamant/auspex/actions/runs/35605123361) (2026-09-21) ironadamant + checkpoint `ok: true`. |
| **Do not** | Type passwords · `--record` a logged-in session · commit `SOLARI_API_KEY`, `.env`, or `.auspex/` |

## MCP

Cursor, using the published package (this build already includes the server files). Put `SOLARI_API_KEY` in `env`.

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

After a git clone, run `npm install && npm run build:mcp` in `examples/auspex-ts`, or MCP fail-closes with reason `DistMissing` (not an empty silent server). Published `npx -p auspex-solari auspex-mcp` includes `dist/`.

Claude and Grok configs: [package README](examples/auspex-ts/README.md#mcp).

## When a check refuses

- The claim appeared on a public login or marketing page, so the profile was not saved (`expectMatchedPublicLanding`). Use the real app URL and text that only the logged-in app shows.
- The live site moved to a different host than the one minted into the door (`hostChanged`). Mint login again. Leave the old profile alone.
- The remote typing window expired and the profile has no cookies (`stream-expired`). Mint again. If save returned 200 but could not refresh in-tab session storage, run finalize-login now.
- Cookies exist but in-tab session storage is empty or stale, or there is no saved profile (`weakSeed`, `emptySave`). Skip `--verify-with-profile` on that seed.
- Solari HTTP status codes are a separate list from a logged-out page. See [AGENTS.md](AGENTS.md#blame-solari-vs-auspex).

If login mint is silent, read `npx auspex-solari trace` before minting again. Deep contract: [AGENTS.md](AGENTS.md).

## Logged-in evidence

Blurred dashboard from a real logged-in app. The blur hides personal data. The name in the file path is a worked example, not the recipe for every site.

![Redacted auth-gated SaaS demo (blur protects PII)](examples/auspex-ts/demo/consistencyhub.png)

On that receipt: `ok=true` (the live check passed), `claimOk=false` (the anonymous second machine was skipped), `claimOkProfile=true` (the saved login saw the claim). Commands: [package README](examples/auspex-ts/README.md#worked-example-dogfood). OneDrive is a receipt only (no raw screenshot).

## Links

Auspex is check and verify honesty on Solari, not a second Solari SDK tutorial.

- Reviewer skim: [docs/REVIEWER-5MIN.md](docs/REVIEWER-5MIN.md)
- Agent contract: [AGENTS.md](AGENTS.md) · quick card: [llms.txt](llms.txt)
- Receipts: [RECEIPTS.md](RECEIPTS.md) · thesis: [PITCH.md](PITCH.md)
- Apply path (Harry Chow, LinkedIn 2026-08-31): fork the cookbook, ship a real Solari use case, make the repo public, and tag @harrychow_ @getsolari on LinkedIn or X. The tagged post is founder-only.
- Console — [console.getsolari.com](https://console.getsolari.com) · Docs — [docs.getsolari.com](https://docs.getsolari.com)

## Upstream cookbook

This repo is a public fork of the Solari cookbook. The submission is [examples/auspex-ts](examples/auspex-ts). Other folders under [`examples/`](examples/) are the original Solari samples. In those TypeScript samples, call `await solari.close()` or the process hangs.

MIT licensed.
