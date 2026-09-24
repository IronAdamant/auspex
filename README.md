# Auspex

Agents report a dashboard loaded when the page is still the login screen. Auspex checks that claim on Solari cloud Chrome, then a second machine checks it again.

**`ok` ≠ `claimOk` ≠ `claimOkProfile`.** We do not claim Alice-vs-Bob wrong-account detection. Never types passwords. Never `--record` a logged-in session. After `--verify-with-profile`, **`claimOkProfile` is the reuse gate** — `ok` alone is not enough to treat the profile as reusable.

## Login doors (Phone and Desktop)

Silent screencasts of the Auspex login-door paths: login page → Phone or Desktop chooser → chosen door → remote Chrome opening on a Google New Tab. These are the handoff doors, not a full auth-gated SaaS walk and not the redacted ConsistencyHub dashboard below. Phone and desktop pages are a seed/handoff door for off-site typing, not a same-session VNC takeover. Show as bullets is off by default so a password manager can paste into the text field.

**Phone** — Auspex login, then the Phone door, then remote Chrome on a Google New Tab. The Auspex phone page has a real text field (Solari noVNC will not open the phone keyboard).

![Phone login door: Auspex chooser to remote Chrome on Google New Tab](examples/auspex-ts/demo/door-phone.gif)

**Desktop** — Auspex login, then the Desktop door, then remote Chrome on a Google New Tab.

![Desktop login door: Auspex chooser to remote Chrome on Google New Tab](examples/auspex-ts/demo/door-desktop.gif)

## Pick your path

For Reviewers: the ironadamant one-liner is a **measured public check (no login)**. It does not prove logged-in honesty. Auth-gated evidence is the redacted demo receipt (`ok` / `claimOk` / `claimOkProfile`) — a redacted auth-gated SaaS demo, not the recipe. Generic recipe: `login --url <https>` (derives `--profile` from the host; override `--profile <yours>`). Frozen door sequence: [AGENTS.md](AGENTS.md#frozen-agent-door-sequence).

| Door | Open this |
| --- | --- |
| **Watch** (no clone, no key) | [Landing](https://ironadamant.com/auspex/) · [rrweb player](https://ironadamant.com/auspex/demo/replay.html) (auth-gated Microsoft wall, emails/passwords stripped) |
| **Auth-gated evidence** | Redacted SaaS [receipt](examples/auspex-ts/demo/consistencyhub-receipt.json) + receipt-only OneDrive — [RECEIPTS.md](RECEIPTS.md) |
| **Public check (no login)** | `npx auspex-solari check --name ironadamant` |
| **Any host** | `npx auspex-solari check https://example.com --expect "Example Domain"` |
| **Any Microsoft-gated host** | `npx auspex-solari login --url <https>` (derives `--profile`; override `--profile <yours>`). Chooser `handoff.url`. Phone: `handoff.mobileUrl`. Desktop: `handoff.desktopUrl`. tap Save, then `await-login --save-editor`, `auspex_finalize_login`. Saved-check names supply URL and expect; unknown profiles require `--url` and `--expect`. Never `--record`. |
| **MCP** | `npx -p auspex-solari auspex-mcp` |
| **Autonomous agents (job)** | `npx auspex-solari job --url <https> --expect "<unique>"` then `job-status` / resume `--job-id` |
| **Issues** | On. Weekly `public` job is Monday + `workflow_dispatch`. Repo `SOLARI_API_KEY` is **present** (masked). Observed: [Actions 35605123361](https://github.com/IronAdamant/auspex/actions/runs/35605123361) (Mon 2026-09-21) ironadamant + checkpoint `ok: true`. Still skips if that secret were unset. Do not remove it. |
| **Do not** | Type passwords · `--record` a logged-in session · commit `SOLARI_API_KEY` / `.env` / `.auspex/` |

**Install `auspex-solari` (not npm `auspex`). Repo is `IronAdamant/auspex`.**

```bash
export SOLARI_API_KEY=slr_live_…   # console.getsolari.com — env only, never commit
npx auspex-solari check --name ironadamant
npx auspex-solari check https://example.com --expect "Example Domain"
npx -p auspex-solari auspex-mcp
```

npm `auspex` is a different scraper. After a clone: `npm install && npm run build:mcp` (`dist/` is gitignored), then `npx auspex` and `npx auspex-mcp`. `auspex-solari` **0.1.3 is published** on npm (latest). Agents do not `npm publish`.

## Fail-closed

- `expectMatchedPublicLanding` — expect hit on `/`, `/landing`, `/login`, `/signup`, or `/auth` during save. Use a real app URL and a better expect.
- `hostChanged` — live https host diverged from the minted door URL. Remint `auspex_login`. Do not save into the old jar.
- `stream-expired` — VNC JWT past and the profile has no cookies. Remint. `editorSave` 200 with a fold that cannot refresh sessionStorage is finalize-login now, not a remint.
- `weakSeed` / `emptySave` — cookies/origins with a counted `sessionStorage === 0` (or a stale fold), or the profile is missing. Do not `--verify-with-profile` on a dead fold.
- Solari HTTP `402` / `429` / `413` are not retryable (`429` → `auspex_reap`). `502`–`504` retry once. Those are not `loggedOut` / `needsHuman`. Matrix: [AGENTS.md](AGENTS.md#blame-solari-vs-auspex).
- Three primitives, plus login / finalize / profile-status / reap / trace as the auth + hygiene doors. The named Solari sandbox Mousepad demo is not the user's Mac (402 on Free). any attached profile on a non-public-marketing URL skips anonymous verify. Login trace writes one post-handoff row. Check rows are not written. Never tokens.

## Auth-gated evidence

**Redacted auth-gated SaaS demo** — blurred dashboard. Blur ≠ blank fail. The name in the demo path is dogfood evidence, not the recipe.

![Redacted auth-gated SaaS demo (blur protects PII)](examples/auspex-ts/demo/consistencyhub.png)

Verification triad: `ok=true`, `claimOk=false` (anonymous skipped), `claimOkProfile=true`. Full fence: [package README](examples/auspex-ts/README.md#worked-example-dogfood). Receipts: [RECEIPTS.md](RECEIPTS.md).

## Worked example (dogfood)

Evidence only — not the first fence. `npx auspex-solari login` for that saved-check host, plus await / finalize / check, lives in the [package README](examples/auspex-ts/README.md#worked-example-dogfood). OneDrive is receipt-only (no raw PNG).

## Links

- Reviewer skim: [docs/REVIEWER-5MIN.md](docs/REVIEWER-5MIN.md)
- Agent contract: [AGENTS.md](AGENTS.md) · quick card: [llms.txt](llms.txt)
- Receipts: [RECEIPTS.md](RECEIPTS.md) · thesis: [PITCH.md](PITCH.md)
- Official apply path (Harry Chow, LinkedIn 2026-08-31): fork cookbook → real Solari use case → public GitHub → **tag @harrychow_ @getsolari on LinkedIn or X**. Discord is Solari setup help, not a substitute. The tagged post itself is founder-only.
- Console — [console.getsolari.com](https://console.getsolari.com) · Docs — [docs.getsolari.com](https://docs.getsolari.com)

## Upstream cookbook (unmodified, not the submission)

This repo is a public fork of the Solari cookbook. GitHub's behind count is other cookbook examples added upstream after this fork. The submission is [examples/auspex-ts](examples/auspex-ts). Directories under [`examples/`](examples/) other than **[auspex-ts](examples/auspex-ts)** are the original Solari samples, unmodified, with no Auspex CI. One `slr_live_` key works across browsers, sandboxes, and desktops. Call `await solari.close()` in TypeScript or the process hangs. 429 is not retryable — call `auspex_reap`.

MIT licensed.
