# Tip review — `0aac1a1` (2026-09-20)

**Auditor:** Grok (Cursor cloud agent). Report only — no product code.  
**Previous tip we owned:** `7a537d6` (merge PR #42 — VWP timeout honesty).  
**Tip read:** `0aac1a1` (`fix: First calls and next point at finalize-login after Save`) on `origin/main` after fetch.  
**Delta:** `7a537d6...0aac1a1` = 14 commits / 57 files, all Aron Amos. No open PRs at review start.  
**Ask:** adversarial review of the *new* tip. Do not re-litigate closed #38 / #40 / #42 unless this tip regressed them. Schema v1 freeze / fail-closed not weakened in any suggestion.  
**This session:** read the symbols on `0aac1a1`. HTTP-probed the public watch URLs. Did **not** run live Solari. Did **not** change product behavior.

CoS / founder cut: **ship-with-nits. No P0. No triad / fail-closed / schema-v1 break.** The 14-commit burst executed most of `PLAN.md` (written against `7a537d6`). Residuals are guidance sync, one always-apply Cursor-rule lag, and a retry-shaped VWP overlay — not a poison of `ok` / `claimOk` / `claimOkProfile`.

---

## Executive verdict

**ship-with-nits.**

| Door | Holds? |
|---|---|
| Schema v1 required keys | Yes. No new required field. Extra keys stay optional. |
| `ok` ≠ `claimOk` ≠ `claimOkProfile` | Yes. Not folded. |
| #42 VWP timeout honesty | Yes on the skip flag. Overlay *reason* moved (`matched` → `network` when integrity fails). That is H7, not a claimOk poison. |
| Fail-closed (record / fill / password / CH record) | Held and tightened (Zod now matches runtime on record+profile+fill/click). |
| `extract-zip` | Still absent from the lock. `@puppeteer/browsers` override still `>=3.2.2`. |
| Watch URL | Live `200` + `text/html` on Pages. jsDelivr replay is still `text/plain` and is not the hero. |

Do not merge this PR as a fix. Do not fold `claimOkProfile` into `ok` in any follow-up.

---

## What improved since #42

The founder did not nibble. Relative to `7a537d6` this is a real product cut, not a memo.

### Contract (generic second-user + MCP door)

- **Generic finalize-login.** `resolveFinalizeLoginTarget` (`src/check.ts`) uses `savedCheckForProfile`. Unknown profiles require `--url` **and** `--expect`. Saved `consistencyhub` still supplies `https://consistencyhub.io` / `Document Editor`. `ssoProvider` defaults to `auto` (was hard-coded `microsoft`). CLI, MCP schema, `AUSPEX_CONTRACT`, USAGE, both AGENTS, and root README shipped-bullet agree.
- **Profile verify skip is no longer two hostnames.** `shouldVerifyCheck` skips anonymous verify for any attached profile unless the URL is public marketing (`ironadamant.com` / `checkpointprojects.com`). Leftover profile on a marketing host still verifies. No profile still verifies. `--verify` remains anonymous. `--verify-with-profile` unchanged.
- **`npx auspex-mcp` is the documented door.** Root + package AGENTS, Grok toml, Claude example, README For Reviewers. Fallback remains absolute `node` + `bin/auspex-mcp.mjs` when PATH lacks node. Hero is no longer `dist/mcp.mjs`.
- **First calls / `next` name finalize-login after Save.** Root + package AGENTS first-calls: ironadamant → profile-status → (if loggedIn check; if not: login → await-login → finalize-login → check). Cookie-bearing `loggedOut`, `weakSeed` skipReason, and await-login `next` point at `finalize-login`. `emptySave` names login then await-login and says do not finalize. `needsHuman` still stops for human IdP. Never `--record` on CH. Desktop is not a first call.

### Deferred eng (`e49c3b2`) — each item vs tests

| PLAN id | Shipped? | Tests that pin it |
|---|---|---|
| E1 `looksLikeAppProfile` | **Yes.** Regex deleted. `isWeakSeed` is ConsistencyHub-only (name / profile / `consistencyhub.io`) and requires a *counted* `sessionStorage === 0`. | `profile-status.test.ts` (`isWeakSeed` table; kebab needle absent; cookie-only `ironadamant` → `loggedOut` not `weakSeed`; inspect-without-URL strips the SS count) |
| E2 Zod record+fill/click gap | **Gap closed.** Runtime string extracted to `RECORD_PROFILE_FILL_CLICK_ERROR`; Zod `superRefine` now refuses record+profile+allow+fill/click. Four copies remain (not a single `assertCheckOpts`). | `haystack.test.ts` both with and without `allowPageActions` |
| E3 VWP poll | **Yes.** Mandatory `abortableSleep(SETTLE)` / `RETRY` gone. If expect is already in `innerText`, no sleep. Else poll 150ms slices up to 2s, or 5s when the first sample is empty / `< 50` chars. Abort + 90s envelope from #42 kept. | `receipt.test.ts` source needles: poll constants + `haystackMatches`; **not** `abortableSleep(PROFILE_CLAIM_SETTLE_MS` as a mandatory sleep. Budget / hung-claim / skip-when-remainder-gone tests from #42 still present |
| E4 device before launch | **Yes.** `parseDeviceOptions` is the first line of `runCheck` `work()` — before `launchBrowser` and before `resolveProfileId`. `--mobile` === `DEVICES["iphone-13-pro"]`. `listDevices()` used in USAGE and the unknown-device error. QR `toFile` try/catch so login does not die after handoff mint. | `device-emulation.test.ts` (unknown throw + list; mobile alias; **source-order** parse-before-launch). `qr-gen.test.ts` (PNG magic; missing dir returns `""`) |
| E5 origin allowlist | **Yes.** Prefix-anchored `^www.` strip. Named-host tautology gone. | `assert-receipt-origin.test.ts` (www-flip allowed; `notwww.example.com` → `not.example.com` rejected; scheme-flip allowed) |
| E6 stampers / dead exports | **Yes.** One `ensureRunDir`. `asAgentJson` and `completeMicrosoftSso` deleted. | Compile / import graph. No leftover callers |
| E8 inspect-without-URL | **Yes.** No-URL inspect drops `sessionStorage` from the seed so inspect-only cannot claim a count. | `profile-status.test.ts` “inspect without URL does not claim a sessionStorage count (E8)” → `loggedOut`, `sessionStorage === undefined` |
| H7 overlay `reason: matched` + `ok: false` | **Yes, as `network`.** `overlayVerifyReason`: if `anonymousClaimSkipped`, return `verify.ok ? "matched" : "network"`. | `agent-receipt.test.ts`, `lifecycle.test.ts` updated from #42’s `reason === "matched"` pin |

### Triad + #42 (no poison regression)

Three writers, three meanings — unchanged:

| Signal | Writer | VWP (anonymous skipped) |
|---|---|---|
| `ok` | `agentReceiptOk` | `protocolOk` + `reason === "matched"` + **`verify.ok` only** |
| `claimOk` | `assert_receipt.py` | `false` + `anonymousClaimSkipped` |
| `claimOkProfile` | profile claim | **never read** by `ok` |

A VWP envelope miss still sets `anonymousClaimSkipped` and `claimOkProfile=false`. Overlay does **not** treat that as an anonymous `claimOk` miss (the `if (anonymousClaimSkipped)` branch does not look at `claimOk`). That is the #42 poison that must not return. It did not.

What *did* change: #42 left `reason: matched` with `ok: false` on an integrity miss (the Harry nit in the deferred memo). H7 overlays `network` when `verify.ok === false`. Goldens / CH demo receipt still print `ok=true`, `claimOk=false` + skip, `claimOkProfile=true`.

### Security

- **`replay-redact.ts` is new and wired.** Emails, `login_hint`, MS `i0116`/`i0118`, password/email input values, and rrweb source-5 input text are stripped before the public player. `scripts/save-demo-receipt.ts` runs `assertNoCredentialLeak` on the write path.
- **Watch tape is the Microsoft wall, not a logged-in dashboard.** `demo.test.ts` pins CH + Microsoft + zero leak on `replay.html` / `replay.ndjson`. Demo PNGs stay: public ironadamant still, blurred CH dashboard.
- **Fail-closed not weakened.** Zod got *stricter*. Password fill, desktop `--type`, record+profile+CH, empty-profile overwrite, loopback — untouched.
- **`extract-zip`:** `rg extract-zip examples/auspex-ts/package-lock.json` is empty. Override in `package.json` still `"@puppeteer/browsers": ">=3.2.2"`.

### Reviewer / Harry skim

- **Pages landing is live.** `GET https://ironadamant.com/auspex/` and `/demo/replay.html` → `200` `text/html; charset=utf-8` (probed this session). Landing iframes `demo/replay.html`, labels the tape as CH → Microsoft → empty box, emails/passwords stripped, logged-in dashboard is the blur, “We do not publish that session.”
- **jsDelivr honesty.** `cdn.jsdelivr.net/.../replay.html` is still `text/plain`. DISCORD.md, package README, RECEIPTS, and `agents-sync` refuse to hero it. PLAN.md’s *draft* Discord copy still does (see P2-2).
- **For Reviewers** is the root README first screen: public check ≠ logged-in honesty; watch; any-host `example.com`; `npx auspex-mcp`; Issues on; weekly `public` job skips without a repo secret.
- **Public receipts.** `demo/ironadamant-receipt.json` parses as schema v1 (`parseReceiptV1`). CH demo keeps the triad and an explicit `sessionStorage` omit note. No committed OneDrive PNG/receipt.
- **LICENSE** has both `Pinetree Research` and `Iron Adamant` 2026 lines.
- **Cookbook tables** sit below the fold under “Upstream cookbook (unmodified, not the submission).”
- **Discord packet** exists (`docs/showcase/DISCORD.md`). Agent does not post. Copy matches the live Pages player, not jsDelivr.

### Packaging fit

**Packaging clearly moved.** `tsx` and `esbuild` went from `devDependencies` to `dependencies` in `examples/auspex-ts/package.json` so root `npx auspex` / `npx auspex-mcp` (bin → `tsx src/…`) survive `npm ci --omit=dev` in the package. Root `package.json` is still a thin bin + `postinstall` (`npm install --prefix examples/auspex-ts`). `bin/run.mjs` still fail-closes with parseable `{ ok: false, code: "NotInstalled" }` if tsx is missing. Grok/Claude examples now `command = "npx"` / `args = ["auspex-mcp"]`. In-repo `.cursor/mcp.json` still uses `node bin/auspex-mcp.mjs` (fine when node is on PATH). This is not a published-registry version bump (`private: true`).

---

## Ranked findings

### P0

None.

No leak, no schema-v1 required-key add, no fold of `claimOkProfile` into `ok`, no fail-closed hole, no `extract-zip` return, no watch-URL 404.

---

### P1

None that burns a slot or lies on the saved-check door.

The closest miss is P2-1 (Cursor rule still teaches the *old* two-host skip and “finalize defaults to ConsistencyHub”). Canonical AGENTS.md is correct; the rule itself says it is not the only how-to-run.

---

### P2

#### P2-1 — `.cursor/rules/auspex.mdc` still teaches the pre-`a7ea118` contract

`.cursor/rules/auspex.mdc` (alwaysApply in this repo):

- `auspex_check` still skips verify only for `name=consistencyhub`, `profile=consistencyhub`, “or a profile on consistencyhub.io / onedrive.live.com”.
- `auspex_finalize_login` still “defaults to ConsistencyHub”.

`agents-sync.test.ts` forbids that two-host sentence on **root README** and forbids “Defaults to ConsistencyHub URL and expect” there. It does **not** pin the Cursor rule. An agent that reads the rule and not AGENTS will `--verify` an ad-hoc auth URL (poison `ok`) or call finalize without `--url`/`--expect` on a generic profile (runtime throw, no slot).

**Cut:** one-file rewrite of the two bullets to match AGENTS. Add the same needles to `agents-sync`. Do not change runtime.

#### P2-2 — `PLAN.md` is now a lying source of truth

`PLAN.md` header: “plan only. Do not execute until the next prompt says go.” HEAD it names: `7a537d6`. §6 Discord draft still heroes the jsDelivr `replay.html` URL (the thing 8707210 / DISCORD.md / Pages just made *untrue*). §3 still says a stranger watches “the ironadamant rrweb”; the live player is the CH Microsoft wall.

Harry who opens `PLAN.md` (root file, 384 lines, written as the execute runbook) gets a pre-ship map and a watch URL that dumps source.

**Cut:** banner at top: executed on `0aac1a1`; Discord/watch truth is `docs/showcase/DISCORD.md` + Pages. Do not re-hero jsDelivr. Do not execute §6 as written.

#### P2-3 — `finalizeLoginGuidance` / `checkLoggedOutNext` omit `--url` / `--expect`

`finalizeLoginGuidance` (`profile-persist.ts`):

```text
Run npx auspex finalize-login --profile ${name} (MCP: auspex_finalize_login).
```

That is complete for `consistencyhub` (saved check). It is incomplete for the generic door this tip just shipped. `resolveFinalizeLoginTarget({ profile: "acme" })` throws until both flags are present. Cookie-bearing `loggedOut` on an unknown profile (the U7 second-SaaS path) now *points* at that incomplete command.

Runtime is fail-closed (throw before `runCheck` / launch). No slot burn. Agent has to re-read USAGE.

**Cut:** if `savedCheckForProfile(name)` is missing, append `--url <url> --expect <string>` (or “required unless profile matches a saved check”). Same string from `checkLoggedOutNext` and weakSeed skipReason. Do not default expect to `Document Editor`.

#### P2-4 — `needsHuman.next` still says “await-login or retry check”

`check.ts` `needsHuman` branch was **not** updated in `0aac1a1`. After human IdP + Save it still says call `auspex_await_login` **or retry check**. Console Save is still insufficient for Microsoft OAuth SPAs. The rest of this tip exists to stop that skip.

`needsHuman` correctly does **not** name finalize-login *during* the wall (tests pin that). The hole is the *after Save* clause.

**Cut:** “After human completes sign-in and Save: `await-login` then `finalize-login`. Do not retry check on cookies alone. Never --record.”

#### P2-5 — First-calls / README recipe omit the human Save beat

AGENTS first-calls (both copies) and root README ConsistencyHub recipe are now:

```bash
login → await-login → finalize-login → check
```

RECEIPTS.md still has the human line (`# 1. Human SSO in handoff → Save`). First-calls and the README fence do not. An eager agent can mint a handoff, immediately `await-login` (timeout / empty-save), then `finalize-login` into a Microsoft wall (`needsHuman`) and spend a slot.

This is operational, not a contract lie. The comments `# if loggedIn` / `# if not loggedIn` are not a script, but they sit in the first 20 lines.

**Cut:** one comment between login and await-login: human completes Microsoft + OneDrive consent in the handoff, then Save. Do not intern-ping.

#### P2-6 — `weakSeed` docs are still generic; code is CH-only

`isWeakSeed` is ConsistencyHub-only. AGENTS / README / USAGE still say `weakSeed` = cookies/origins but no sessionStorage (any auth-gated SaaS). A cookie-only `acme` / `ironadamant` is now `loggedOut` + finalize guidance, not `weakSeed`.

Behavior is *more* honest than the kebab heuristic. The enum description lagged.

**Cut:** one sentence on the profile-status door: `weakSeed` is ConsistencyHub (name / profile / host) with a counted `sessionStorage === 0`. Other cookie-only landings are `loggedOut`.

#### P2-7 — VWP integrity miss is now `reason: network` (retry-shaped)

#42 pinned `reason: matched` + `ok: false` + skip flag so overlay would not look like an anonymous miss. H7 changed the pin to `network`. `mayRetryCheck` treats `network` as retryable (`NO_RETRY_REASONS` is only `loggedOut` / `needsHuman`). AGENTS tells agents 502/503/504 are retryable and does not say “do not retry a VWP envelope miss.”

This is **not** a #42 poison regression (skip flag held; `claimOk` not folded; `ok` still follows `verify.ok`). It *is* a slot-burn residual: a slow VWP can now look like “retry the check.”

Any integrity fail (PNG, origin), not only timeout, takes the same `network` branch.

**Cut (docs or `next` only):** when `anonymousClaimSkipped && verify.ok === false`, set `next` to “do not retry; read `claimOkProfile`; `ok` followed integrity.” Do **not** fold `claimOkProfile` into `ok`. Do **not** treat as anonymous `claimOk` failure. Optional later: keep `reason: matched` and explain with `next` instead of `network` if retry burn shows up live.

---

### P3

- **E2 SSOT not done.** Runtime still lives in `tool-schema.ts` asserts + Zod clone + `page-actions.ts` + `launch-options.ts`. MCP still registers `auspexCheckInputObject` (no superRefine) — `mcp-schema.test.ts` still forbids `auspexCheckInputSchema` on the MCP door. Runtime remains the real gate. Leave until the next record/fill feature.
- **`AUSPEX_CONTRACT` still maps JSON `verify` → `--no-verify` only** (comment documents `--verify`). E7 “table lists both” did not land. Not a runtime lie.
- **`isAuthGatedAnonymousVerifyHost` is leftover.** Still exported and tested; `shouldVerifyCheck` no longer uses it. Dead helper, not a second policy.
- **MCP `device` is still a free string.** Unknown names throw in `parseDeviceOptions` before launch (CLI and `runCheck`). ListTools will not catch a typo. Fine.
- **VWP poll has no behavioral unit.** Tests are source needles. CI still mocks `profileClaimCheck`. Do not run live Solari in CI.
- **`overlayVerifyReason` coarseness.** PNG / origin integrity fails become `network`, not a more specific reason. Extra key, not a required-key change.
- **Package README “How this was built”** still mentions “absolute `node`” as history; Run fence still `cd examples/auspex-ts`. Root README is the Harry door and is correct.
- **`vwp-magic-sleeps-2026-09-19.md`** still describes mandatory 2s/3s sleeps as the shipped settle. Poll replaced them. Banner the memo or leave it as #42 history.
- **QR silent swallow.** Login succeeds with empty `qrPath`. Handoff URL remains. Soft-fail is correct; agents that require a QR get no `next`.
- **Unknown `--device` after `createClient()` / `ensureRunDir()`.** No browser slot. Harmless empty run dir.

---

## Reviewer / Harry skim (detail)

Probed 2026-09-20 this session (HTTP only, no Solari):

| URL | Result |
|---|---|
| `https://ironadamant.com/auspex/` | `200` `text/html` |
| `https://ironadamant.com/auspex/demo/replay.html` | `200` `text/html` |
| `https://cdn.jsdelivr.net/gh/IronAdamant/auspex@main/examples/auspex-ts/demo/replay.html` | `200` **`text/plain`** |
| `https://ironadamant.github.io/auspex/` | `301` → `http://ironadamant.com/auspex/` |

Landing copy matches `docs/index.html` on tip (iframe `demo/replay.html`, CH Microsoft wall, blur ≠ blank, no live key). Pages workflow copies the self-contained `replay.html` (events inlined) — it does **not** need `replay.ndjson` on the artifact. `continue-on-error` on `configure-pages` is why a repo without Pages enablement still goes green; this repo’s custom domain is actually serving.

Did **not** drive the rrweb controller in a browser. Honesty claim is: URL 200s as HTML, tape is labeled, credentials stripped in the committed bytes (`assertNoCredentialLeak` on html + ndjson). That is the watch-URL contract. It holds.

PLAN vs reality (IDs from §4): almost every U/H/E item shipped or was honestly narrowed (U8 = any profile, not a growing host list; H2 = claim stripped, no OneDrive artifact; E2 = Zod gap only; E7 = comment only). The file itself was not marked executed. That is P2-2, not a missing feature.

---

## Suggested next cuts

Small, in this order, only if someone already has the file open. No cleanup PR for sport. Schema v1 freeze / fail-closed / triad thesis stay.

1. **Cursor rule + `agents-sync` needles** (P2-1). One file. Highest agent-facing drift in *this* repo.
2. **PLAN.md banner** (P2-2). One paragraph. Stop Harry from posting the jsDelivr dump.
3. **`finalizeLoginGuidance` flags** (P2-3) + **`needsHuman` after-Save sentence** (P2-4) + **first-calls human beat** (P2-5). Same theme as `0aac1a1`; finish the pointer.
4. **`weakSeed` sentence** (P2-6) on AGENTS / USAGE / README profile-status bullet.
5. **VWP miss `next`** (P2-7). Docs or optional `next` only. Do not fold. Do not invent an anonymous miss.
6. **Leave:** four-copy SSOT, contract `--verify` row, `isAuthGated*` helper, Zod `device` enum, poll behavioral test, origin helper deletion.

**Never:** fold `claimOkProfile` into `ok`. Never `--record` a logged-in ConsistencyHub session. Never type a password. Never re-hero jsDelivr `replay.html`.

---

## Method

- Fetched `origin/main` to `0aac1a1`. Branched `cursor/tip-review-0aac1a1-64bc`.
- Confirmed `7a537d6` is the merge-base; 14 commits; 57 files; no open PRs (`Github.list_pull_requests`).
- Read: `check.ts` finalize + next, `fail-closed.ts`, `check-reason.ts`, `profile-persist.ts` / `profile-status.ts`, `sandbox.ts` poll + #42 budget, `tool-schema.ts` Zod + asserts, `device-emulation.ts`, `qr-gen.ts`, `replay-redact.ts`, `assert_receipt.py` origin, `contract.ts`, CLI/MCP/USAGE, both AGENTS, root + package README, RECEIPTS, PITCH, LICENSE, PLAN.md, DISCORD.md, `docs/index.html`, `pages.yml`, `.cursor/rules/auspex.mdc`, `.cursor/mcp.json`, grok/claude examples, package.json + lock, SECURITY.md, demo receipts, `save-demo-receipt.ts`, tests listed above, memos `deferred-check` / `leave-nothing` / `vwp-magic-sleeps`.
- HTTP: Pages landing + replay, jsDelivr content-type, github.io redirect.
- `npm test --prefix examples/auspex-ts` on this tip: **293 tests, 290 pass, 0 fail, 3 skipped** (live Solari opt-in via `AUSPEX_LIVE=1`). `extract-zip` still absent from the lock; `@puppeteer/browsers@3.2.2 overridden`.
- Did not change product code. Did not run live Solari.
