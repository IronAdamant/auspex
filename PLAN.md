# Auspex — fix-everything plan (usability + completeness)

**Status:** plan only. Do not execute until the next prompt says go.  
**HEAD this plan was written against:** `7a537d6` (`main`, public `IronAdamant/auspex`).  
**Date:** 2026-09-19.  
**Owner of execution:** next Grok session, with worktree-isolated sub-agents as listed in §8.  
**Human-only step:** Discord `#showcase` post (Aron posts; agent prepares the packet).

This is the runbook for making Auspex easy to watch, easy to run, and complete against every leftover called out in the intern review, competitor pass, and deferred-items memos. Needle is irrelevant: **every item ships**.

---

## 0. How to run this in the next prompt

Paste something like:

> Execute `PLAN.md` from the repo root. Work the workstreams in order. Use worktree-isolated sub-agents for independent PRs. Merge to `main` as each stream goes green so Harry always opens current HEAD. Do not skip items. Stop only for Discord `#showcase` (I post) and any live Solari 402/429.

Do **not** start from unmerged `origin/cursor/*`. Branch from current `origin/main`.

---

## 1. Goal

Make Auspex:

1. **Watchable without clone or API key** (GitHub Pages + existing jsDelivr replay + receipts).
2. **Trivial after clone** (`npm install` → `npx auspex check --name ironadamant` with a key).
3. **Usable on someone else’s SaaS**, not only ConsistencyHub.
4. **MCP-startable** with `npx auspex-mcp` from the repo root (no absolute-path ritual as the primary door).
5. **Honest and complete** on every deferred nit, leftover cookbook skim, and missing artifact.

**Showcase:** Aron already has a personal Discord and `#showcase` exists. Agent prepares the watch URL, copy, and screenshots. Aron posts.

---

## 2. Hard constraints (never violate)

| Constraint | Why |
|---|---|
| Receipt **schema v1 frozen** | Required keys only: `schemaVersion`, `ok`, `reason`, `url`, `expect`, `screenshotPath`. Extra keys stay optional. |
| **Do not fold `claimOkProfile` into `ok`** | Auth-gated thesis. Read the triad. |
| Never type passwords / OTP | `needsHuman`; desktop `--type` stay fail-closed. |
| Never `--record` a logged-in ConsistencyHub (or dashboard) session | Existing refuse. |
| Never commit `SOLARI_API_KEY`, `.env`, `.auspex/` | Public repo. |
| Do not file a `solari-sdk/solari-cookbook` GitHub issue | Empty form screenshot was not a Harry DM. |
| Desktop is **not** the user’s Mac | Named Solari sandbox desktop. |
| Keep the GitHub **fork** of `solari-sdk/solari-cookbook` | Harry asks “is this a public fork of the original repo?” |
| Tests drive shipped code | No hardcoded expected values, no reimplementation of the unit under test. |
| `npm test --prefix examples/auspex-ts` stays green | Plus `npx tsc --noEmit`, `npm run build:mcp`, `git diff --exit-code -- dist/`. |
| `npx auspex --help` twice still lists **check / verify / desktop / reap** | Exit 0. |

---

## 3. What “easy” means (acceptance for a stranger)

A person with **no clone** can:

- Open a Pages URL (or jsDelivr fallback) and **watch** the ironadamant rrweb.
- See the CH triad (`ok` / `claimOk` / `claimOkProfile`) as JSON + blurred PNG, with “not a blank fail” in one sentence.
- Copy one command if they have a Solari key.

A person **with clone + key** can:

```bash
git clone https://github.com/IronAdamant/auspex.git
cd auspex
npm install
export SOLARI_API_KEY=slr_live_…   # console.getsolari.com
npx auspex check --name ironadamant
```

A person checking **their** logged-in app can follow a generic recipe (`--profile`, `--url`, `--expect`) without ConsistencyHub being the default in the first screen.

An MCP host can start:

```bash
npx auspex-mcp
```

from the repo root (tsx path via existing `bin/auspex-mcp.mjs`). Grok absolute-`node` + `dist/mcp.mjs` remains a documented **fallback**, not the only door.

---

## 4. Inventory (everything this plan fixes)

IDs are stable. Do not drop an ID.

### Usability / stranger door

| ID | Item | Why it is broken today | Fix |
|---|---|---|---|
| U1 | GitHub Pages off (`has_pages: false`) | Competitors have a click URL. Homepage is a tree path. | Enable Pages from `docs/showcase/` (or `examples/auspex-ts/demo/` wrapped by a small `index.html`). Set repo `homepage` to that URL. |
| U2 | jsDelivr replay buried | Replay **already works**: `https://cdn.jsdelivr.net/gh/IronAdamant/auspex@main/examples/auspex-ts/demo/replay.html`. Root README does not lead with it. | Hero link: Watch (Pages) · jsDelivr fallback · CH receipt. |
| U3 | No “For Reviewers” box | Harry at fork 200 will not read AGENTS.md. | 8-line table at top of root `README.md`: watch, triad, clone command, MCP, what not to do. |
| U4 | Discord `#showcase` unused | Team queue + public proof of need. | Packet in `docs/showcase/DISCORD.md`. Aron posts. |
| U5 | Clone still needs esbuild platform binary | Local `npx auspex --help` died on nested `tsx` `@esbuild/darwin-arm64`. CI is green. | Document `npm install` from root; add a postinstall or help that prints `NotInstalled` / missing-esbuild recovery; ensure lockfile optional deps install on macOS/linux CI. |
| U6 | MCP absolute-path ritual is the documented Grok door | `grok.mcp.example.toml` requires absolute node + `dist/mcp.mjs`. Root `bin/auspex-mcp.mjs` already spawns tsx. | Primary docs: `npx auspex-mcp`. Keep Grok absolute example as fallback. Smoke: spawn help/initialize if possible without a live Solari check. |
| U7 | First-screen recipe is ConsistencyHub-only **and** `finalize-login` always uses CH expect | `runFinalizeLogin` always `resolveSavedCheck("consistencyhub")`. `--url` can override navigation but **`expect` stays `"Document Editor"`**. CLI/MCP have no `--expect` on finalize. A second SaaS will mismatch after a successful SSO save. | Resolve via `savedCheckForProfile(profile)`. Unknown profile: require `--url` **and** `--expect` (fail closed). `--profile consistencyhub` still supplies CH. Default `ssoProvider` to `auto`. |
| U8 | Auth-gated anonymous skip is two hostnames | `fail-closed.ts` `AUTH_GATED_ANONYMOUS_VERIFY_HOSTS = consistencyhub.io, onedrive.live.com`. Any other logged-in host default-verifies and poisons `ok`. | Skip anonymous verify when a **profile is attached**, unless the URL is public marketing (ironadamant / checkpoint). `--verify` still forces anonymous. `--verify-with-profile` unchanged. |
| U9 | Desktop is Mousepad billed as a product door | `MOUSEPAD_CLICK` is an “old layout guess”; Free plan 402s. Help must still list `desktop`. | **Demote, do not delete.** First screen: check → verify → tear-down. Desktop one line: named sandbox demo, not the Mac, 402 on Free. Keep CLI/MCP/tests. Optional committed demo receipt only if a live 200 exists; never fake `ok`. |
| U10 | Easy any-host not first | Hero is `--name ironadamant` only. | Quick start fence: `npx auspex check https://example.com --expect "Example Domain"` then saved names. |
| U11 | `tsx` / `esbuild` are **devDependencies** | `bin/run.mjs` only finds local `tsx`. `npm ci --omit=dev` cannot `--help`. Nested esbuild platform binary already bit this machine. | Move `tsx` (and `esbuild` if MCP rebuild is a door) to `dependencies`, **or** compile `cli` to `dist/cli.mjs` and point bins at `node dist/…`. Test: `npm ci --omit=dev` then `node bin/auspex.mjs --help` exits 0. |
| U12 | GitHub Issues disabled; weekly `public` job skips without secret | Fork default `has_issues: false`. Actions `public`/`live` exit 0 if no repo secret. | **Done (Issues on).** Hero still must not imply weekly live coverage unless the secret is set. |

### Honesty / artifacts

| ID | Item | Fix |
|---|---|---|
| H1 | Ironadamant `demo/receipt.json` is a marketing summary, not schema v1 | Add `demo/ironadamant-receipt.json` as schema v1 (synthetic sessionId). Keep marketing summary **or** rename it `demo/ironadamant-marketing.json` and point RECEIPTS.md at both. |
| H2 | OneDrive VWP claimed without artifact | Either commit a **redacted** OneDrive receipt/PNG (same rules as CH) **or** remove the live-verified claim from RECEIPTS/AGENTS until an artifact exists. Prefer the artifact if a live run is available; else strip the claim. |
| H3 | LICENSE copyright still “Pinetree Research” only | Keep MIT + original Pinetree line (fork). Add `Copyright (c) 2026 Iron Adamant` (or Aron Amos) for Auspex original work. |
| H4 | Slogan “Three primitives only” vs extra commands | One sentence: primitives = check / verify / desktop; login/finalize/profile-status/reap are the auth + hygiene doors. Align README, AGENTS, PITCH. |
| H5 | `#41` deferred memo still describes pre-#42 VWP poison | Banner at top of `deferred-check-2026-09-19.md`: superseded for VWP timeout by `vwp-magic-sleeps-2026-09-19.md` / #42. |
| H6 | Root README still carries full cookbook tables | Keep leftovers labeled. Move the long cookbook table **below** For Reviewers + Auspex quick start, or to `examples/README.md`. First screen is Auspex. |
| H7 | Overlay: `reason: matched` when `anonymousClaimSkipped` even if `verify.ok` is false | Pinned in `agent-receipt.test.ts` (`ok: false`, `reason: "matched"`). Optionally overlay `reason` to `network` when integrity fails, **or** set `next` when `ok === false && reason === "matched"`. Do **not** fold `claimOkProfile` into `ok`. |
| H8 | Slogan is auth-gated; hero command is a public page | First 20 lines must label “public check (no login)” vs CH triad. Do not imply `--name ironadamant` proves logged-in honesty. |
| H9 | CH demo `profileSeed` omits `sessionStorage` | The recipe exists to capture SS. Public JSON shows cookies/origins only. Add `sessionStorage` count **or** an explicit omit note. Do not invent a count. |
| H10 | GitHub language = JavaScript because committed `dist/*.mjs` | Optional `.gitattributes` linguist-vendoring `examples/auspex-ts/dist/**`. |

### Deferred engineering (leave-nothing + deferred-check + VWP)

| ID | Item | Fix |
|---|---|---|
| E1 | `looksLikeAppProfile` kebab heuristic (two copies: `profile-status.ts`, `profile-persist.ts`) | Narrow to known app profiles / explicit opt-in / sessionStorage-missing **and** host in an auth-gated list. Tests: cookie-only slug that is not CH must not become `weakSeed` just because of kebab. |
| E2 | Fail-closed copied four ways; Zod misses record+allow+fill/click | Single source of truth for record+profile+fill/click. Zod `superRefine` matches runtime. Tests on both CLI parse and schema. |
| E3 | VWP 2s/3s magic sleeps | Replace settle sleeps with expect-text poll / `waitFor` already on the page, still abortable, still inside 90s envelope. Keep `PROFILE_CLAIM_SETTLE_MS` only as poll timeout cap. Tests: abort, budget, hung claim, skip when remainder gone. |
| E4 | `--device` / `--mobile` / QR: advertised, ~zero unit tests; `--mobile` duplicates `iphone-13-pro`; `listDevices()` unused | Tests for `DEVICES`, unknown device **before** launch (fail closed, no slot burn), `--mobile` alias documented, `listDevices` used in `--help` or error. QR: unit test of `generateQRCode` to a temp file. |
| E5 | `assert_receipt.py` origin allowlist tautology / `www.` strip | Fix the allowlist so it actually constrains origin. Tests. |
| E6 | SessionStorage hydrate naming soup; two `runDir` stampers; unused `asAgentJson` / `completeMicrosoftSso` | One stamper; delete or use dead symbols. No behavior change except less drift. |
| E7 | `AUSPEX_CONTRACT` maps `verify` → `--no-verify` only | Contract comment + test: JSON `verify: false` is `--no-verify`; `verify: true` is anonymous; `verifyWithProfile` is the third door. |
| E8 | Inspect-without-URL cannot count sessionStorage | If inspect path stays, document it. If cheap, count origins/cookies only and never claim sessionStorage. Test. |
| E9 | Cookbook leftover dirs (9 samples) | Stay in tree (fork honesty). Per-dir README already says unmodified. Root first screen must not look like the cookbook. Optional: `examples/README.md` index. Do **not** delete the fork samples unless a later decision says so — Harry asked for a fork. |

### Coverage vs HEAD inventory (P1–P25)

Sub-agent inventory IDs mapped so none are dropped. User overrode “park deferred eng.”

| Inventory | Plan ID | Workstream |
|---|---|---|
| P1 Pages off | U1 | W1 |
| P2 jsDelivr buried | U2 | W1 |
| P3 homepage tree path | U1 | W1 |
| P4 any-host not first | U10 | W1, W5 |
| P5 slogan vs public command | H8 | W1 |
| P6 finalize-login CH expect forever | U7 | W5 |
| P7 two-host verify skip | U8 | W6 |
| P8 MCP absolute paths | U6 | W4 |
| P9 tsx/esbuild devDeps | U11 | W4 |
| P10 desktop Mousepad billed as product | U9 | W7 |
| P11 cookbook README skim | H6 | W1 |
| P12 kebab `looksLikeAppProfile` | E1 | W10 |
| P13 four fail-closed copies | E2 | W11 |
| P14 VWP magic sleeps | E3 | W12 |
| P15 device/QR untested, unknown after launch | E4 | W13 |
| P16 OneDrive claim no artifact | H2 | W8 |
| P17 marketing receipt not v1 | H1 | W2 |
| P18 LICENSE Pinetree-only | H3 | W9 |
| P19 stale #41 memo | H5 | W9 |
| P20 overlay `reason: matched` vs `verify.ok` | H7 | W12 |
| P21 `assert_receipt.py` tautology | E5 | W14 |
| P22 stampers / dead exports | E6 | W14 |
| P23 contract `verify` → `--no-verify` only | E7 | W5, W14 |
| P24 issues off / weekly live skip | U12 | W16 |
| P25 CH `profileSeed` omits sessionStorage | H9 | W17 |
| linguist `dist/` | H10 | W18 |
| Discord `#showcase` | U4 | W3 |
| Slogan vs extra commands | H4 | W9 |
| Nested esbuild hole | U5 | W4 |

**Explicit non-fix (still listed so nobody “fixes” it by accident):**

| ID | Item | Action |
|---|---|---|
| X1 | Fold `claimOkProfile` into `ok` | **Forbidden.** Document only. |

---

## 5. Workstreams (ordered PRs)

Merge each to `main` when green. Harry opens HEAD. Small PRs beat one giant dump.

Parallelism: items in the same wave may use **worktree-isolated** sub-agents. Waves are barriers.

### Wave A — stranger door (do first; showcase unblocks)

**W1 — Showcase site + README front door** (U1, U2, U3, U10, H6, H8)

- Add `docs/index.html` + `docs/.nojekyll`. Landing embeds/links existing `replay.html` (do not duplicate the huge blob). Copy demo PNG/JSON/replay in a Pages workflow; do **not** publish the whole cookbook tree as `/`.
- Human: Settings → Pages → Source **GitHub Actions**. **URL caveat:** `https://ironadamant.github.io/auspex/` has bounced toward `ironadamant.com/auspex` (404). After enable, only set repo `homepage` to a URL that **200s and plays**. Until then, hero the live jsDelivr URL.
- Root `README.md` first screen: For Reviewers table, Watch link, public-check vs auth-gated labeled, clone command, MCP. Cookbook tables collapsed or moved down. Do not imply `--name ironadamant` proves logged-in honesty.
- Tests: `agents-sync` needles for jsDelivr (and Pages if live), `For Reviewers`, first 80 lines. HTML exists. No secrets.

**W2 — Schema-v1 public receipt + marketing split** (H1)

- `demo/ironadamant-receipt.json` schema v1, synthetic sessionId.
- Rename or relabel marketing `demo/receipt.json`.
- RECEIPTS.md points at both.
- Tests: golden/schema parse of the new file.

**W3 — Discord `#showcase` packet** (U4)

- `docs/showcase/DISCORD.md`: final post text (below), links, “do not paste keys”, “do not unredact CH”.
- Agent does not post. Aron posts after W1 is live on `main` (so the Pages URL is real).

### Wave B — easy to run

**W4 — Install + CLI + MCP doors** (U5, U6, U11)

- Root `npm install` / postinstall remains the path.
- Move `tsx` (and `esbuild` if MCP rebuild is a door) to **`dependencies`**, or ship `dist/cli.mjs` and point `bin/` at `node dist/…`. Nested `@esbuild/<platform>` must install (this Mac already failed once).
- Docs: `npx auspex --help` and `npx auspex-mcp` from repo root. Grok/Claude examples: `command = "npx"`, `args = ["auspex-mcp"]`, `cwd` = clone. Absolute `node` + `dist/mcp.mjs` is a **footnote**, not the hero.
- Tests: `npm ci --omit=dev` then `node bin/auspex.mjs --help` exits 0; grok example hero stanza has `npx` / `auspex-mcp`; `git diff --exit-code dist/` after `build:mcp`.

**W5 — Generic second-user recipe** (U7, U10, E7)

- README / AGENTS / DEMO: public check → your URL → your profile. CH under `<details>` as an example.
- `runFinalizeLogin` today **always** uses expect `"Document Editor"` even if `--url` is some other host. Fix: `savedCheckForProfile(profile)`; else require `--url` **and** `--expect`. Add CLI/MCP `expect` (optional field, not a new receipt required key). `ssoProvider` default `auto`.
- Tests: `runFinalizeLogin({ profile: "myapp" })` throws; CH profile still supplies saved url/expect (mock `runCheck`); generic url+expect passed through with `sso: true`, `saveProfile: true`. MCP description no longer “defaults to ConsistencyHub” as the only path.

**W6 — Auth-gated skip is profile-based** (U8)

- `shouldVerifyCheck`: if `profile` is set and URL is **not** public marketing → skip anonymous verify (same as CH today).
- Public marketing still verifies even with a leftover profile.
- `--verify` still anonymous; `--verify-with-profile` unchanged.
- Tests: profile+unknown-host skips; ironadamant still verifies; explicit `--verify` still runs; MCP description matches.

### Wave C — surfaces and honesty

**W7 — Desktop honesty** (U9)

- **Demote, do not delete.** First screen: check → verify → tear-down. Desktop: one line (named sandbox Mousepad demo, not the Mac, 402 on Free). `--help` still lists `desktop`.
- Do not add more `--open` apps to look complete.
- Optional committed `demo/desktop.png` + receipt **only** if a live run returns 200. On 402: no fake `ok: true`. Tests: `cli-help` still matches `desktop`; agents-sync needle that README calls it a demo.

**W8 — OneDrive artifact or claim strip** (H2)

- Prefer redacted receipt+PNG from a real `--verify-with-profile` run.
- Else delete the “verified live” sentence from RECEIPTS/AGENTS.
- Tests: docs grep consistency.

**W9 — LICENSE + slogan + memo banner** (H3, H4, H5)

- Dual copyright line.
- Primitives vs doors sentence.
- Deferred memo supersession banner.

### Wave D — deferred engineering (all of it; user overrode “park”)

One sub-agent recommended parking E1–E9 until a later feature touched those files. **This plan does not park them.** Aron asked that every item ship.

**W10 — Profile heuristic** (E1, E8) — Delete kebab regex. `weakSeed` only for CH / explicit auth-gated origin with missing sessionStorage. Test: profile `ironadamant` cookie-only logged-out → `loggedOut` not `weakSeed`.

**W11 — Fail-closed single source + Zod gap** (E2) — One `assertCheckOpts` for CLI + MCP + `runCheck`. Zod either matches runtime or is not the MCP door. Do not weaken runtime.

**W12 — VWP expect-text poll, no magic sleeps** (E3, H7) — Poll for expect / `waitFor`; keep abort + 90s envelope. Overlay: if `verify.ok === false`, do not leave `reason: matched` unexplained (`next` or `network`). Never fold `claimOkProfile` into `ok`.

**W13 — Device / QR** (E4) — Unknown `--device` **before** `launchBrowser`. `--mobile` === `DEVICES["iphone-13-pro"]`. `listDevices` in error/`--help`. QR `toFile` try/catch so login does not die after handoff mint. Units: `device-emulation.test.ts`, `qr-gen.test.ts`.

**W14 — Hygiene** (E5, E6, E7) — `assert_receipt.py` prefix-anchor `www.`; one `ensureRunDir`; delete unused `asAgentJson` / `completeMicrosoftSso`; contract table lists `--verify` and `--no-verify`.

**W16 — Issues + weekly live honesty** (U12)

**W17 — CH demo `profileSeed.sessionStorage`** (H9)

**W18 — Linguist vendoring of `dist/`** (H10) — optional, same PR as W1 if cheap.

### Wave E — triple-check and showcase

**W15 — Triple-check on `main` after merge**

See §7. Fix anything that failed. Then Aron posts `#showcase` if not posted after W1.

---

## 6. Discord `#showcase` post (draft)

Aron posts from the personal Discord, nickname **Iron Adamant**. Do not include API keys, session ids, unredacted dashboards, or promo codes.

```
Auspex — agent web eyes that stay honest on auth-gated SaaS.

Watch (no clone, no key):
https://cdn.jsdelivr.net/gh/IronAdamant/auspex@main/examples/auspex-ts/demo/replay.html
(Pages, once it 200s: <PAGES_URL>)

What you’re seeing: Solari cloud Chrome checking ironadamant.com, then an independent sandbox verify. Auth-gated dogfood (ConsistencyHub) keeps the triad honest: ok=true, claimOk=false (anonymous skipped), claimOkProfile=true. Blur ≠ blank fail.

Repo (cookbook fork, current HEAD): https://github.com/IronAdamant/auspex

Try it:
git clone https://github.com/IronAdamant/auspex.git && cd auspex && npm install
export SOLARI_API_KEY=slr_live_…   # console.getsolari.com
npx auspex check --name ironadamant

MCP: npx auspex-mcp
```

Replace `<PAGES_URL>` after W1. If Pages lags, ship the jsDelivr URL alone rather than waiting.

---

## 7. Triple-check (must all pass before calling the plan done)

Run from repo root after the last merge. Record output.

1. `git fetch && git log -1 --oneline` — on `main`, not a leftover cursor branch.
2. `npx auspex --help` (twice). Exit 0. Text includes `check`, `verify`, `desktop`, `reap`.
3. `npx auspex-mcp` starts (or prints a parseable not-installed JSON) without hanging >5s on missing tsx.
4. `npm test --prefix examples/auspex-ts` — 0 fail.
5. `npx tsc --noEmit --prefix examples/auspex-ts` (or package script).
6. `npm run build:mcp --prefix examples/auspex-ts && git diff --exit-code -- examples/auspex-ts/dist/`
7. `git grep -n 'slr_live_[A-Za-z0-9]' -- ':!.env.example' ':!**/tests/**'` — no live keys. `.env` gitignored.
8. Open Pages URL **and** jsDelivr replay in a browser. Replay plays. CH PNG is blurred with overlay. Schema-v1 ironadamant receipt exists.
9. Root README first screen: Watch link, For Reviewers, clone command, **no** cookbook table above the fold.
10. `shouldVerifyCheck({ profile: "myapp", url: "https://example-app.example/app" }) === false` and ironadamant still verifies (unit tests, not live).
11. `finalize-login` without url on a non-CH profile errors or requires flags (unit).
12. Device unknown fails **before** launch (unit).
13. Desktop `--type` still refuses OTP-like strings (existing tests).
14. Discord packet `docs/showcase/DISCORD.md` matches live URLs.
15. LICENSE has both copyright lines.
16. No claim of live OneDrive unless `demo/` has the artifact.
17. Optional live: `npx auspex check --name ironadamant` if `SOLARI_API_KEY` is set. On 429: `npx auspex reap` then stop (do not retry create). On 402: drop gated flags.
18. `npm ci --omit=dev` (in a throwaway dir or CI job) then `node bin/auspex.mjs --help` exits 0.
19. CH demo JSON has `profileSeed.sessionStorage` or an explicit omit note.
20. GitHub Issues tab exists **or** README says there is no public issue tracker.
21. First 20 lines of README distinguish public check vs auth-gated triad.

If any check fails, fix on a follow-up PR. Do not declare done.

---

## 8. Sub-agent map for the execution session

| Wave | Sub-agent | Isolation | Owns |
|---|---|---|---|
| A | `showcase-pages` | worktree | W1 |
| A | `receipts-split` | worktree | W2 |
| A | `discord-packet` | none (docs only) | W3 |
| B | `doors-cli-mcp` | worktree | W4 |
| B | `generic-recipe` | worktree | W5 |
| B | `verify-skip-policy` | worktree | W6 |
| C | `desktop-evidence` | worktree | W7 |
| C | `onedrive-or-strip` | worktree | W8 |
| C | `docs-license-slogan` | worktree | W9 |
| D | `heuristic` | worktree | W10 |
| D | `fail-closed-ssot` | worktree | W11 |
| D | `vwp-poll` | worktree | W12 |
| D | `device-qr` | worktree | W13 |
| D | `hygiene-py-stamper` | worktree | W14 |
| E | `issues-and-ci-honesty` | none | W16 |
| E | `ch-ss-count` | worktree | W17 |
| A | `linguist-dist` | fold into W1 | W18 |
| E | `triple-check` | none | W15, browser verify of Pages/replay |

Orchestrator merges in wave order. Do not merge D before A if A is still the skim Harry would see — **A then B then C then D** on `main`.

Parent does: fetch/pull, PR merge order, live 429/402 handling, tell Aron when `#showcase` copy is ready.

---

## 9. Out of scope (still listed)

- Re-tagging `@getsolari` (optional; 1 Sep already dual-tagged; Harry opens HEAD).
- Filing a cookbook GitHub issue.
- Live ConsistencyHub login from an agent.
- Spending stealth/proxy/captcha/desktop if the plan 402s — document skip, do not fake success.
- Rewriting Auspex as a consumer web app (Fare Board clone). This stays agent infra.
- Treating `Grok research/` (gitignored, 2026-09-01) as current.

---

## 10. Done when

Every ID in §4 is either shipped on `main` or explicitly X1 (forbidden).  
§7 triple-check is green.  
`docs/showcase/DISCORD.md` is ready and Aron has been told to post in `#showcase`.

---

## 11. Next prompt

Aron: run the execute line in §0.  
This file is the source of truth. If HEAD has moved past `7a537d6`, re-read `main` then execute anyway — do not wait for a new plan unless a constraint in §2 would break.
