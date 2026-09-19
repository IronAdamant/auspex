# Deferred-items check — 2026-09-19 (post-#40)

**Auditor:** Grok (Cursor cloud agent). Report only — no product code.  
**Tip:** `1e57185` (`Merge pull request #40`, 2026-09-19). Re-read on GitHub `main` after fetch, not the stale VM checkout (`ff156ad` / #38).  
**Baseline:** leave-nothing #40 (`da47c72`) + closed report-only #39 at `ff156ad`.  
**Ask:** the six deferred items from #40 / dig #39. Do not start a cleanup PR. Do not change the `ok ≠ claimOk ≠ claimOkProfile` thesis.  
**This session:** read the symbols on `1e57185`. Did **not** run live Solari. Did **not** change product behavior.

CoS / founder cut: **still ship-with-nits. No new P0. No P1 one-file burn.** The six leftovers are the same P2 spaghetti #39 already ranked. #40 made the *docs doors* honest and narrowed the ad-hoc auth-host verify skip. It did **not** rewrite these six.

---

## Executive verdict

| Item | Risk today | #40 / #38 | Verdict |
|---|---|---|---|
| 1. `looksLikeAppProfile` kebab / slug heuristic | False `weakSeed` on a live logged-out cookie-only slug profile. Inspect-only path is **dead in production**. | Unchanged | **leave** |
| 2. Fail-closed gates copied four ways | None. Runtime holds. Zod gap is unused on the MCP door. | Unchanged (descriptions only) | **leave** |
| 3. VWP / profile-claim magic sleeps | Live Solari only. Inside the **90s** verify envelope, not CI. Timeout poisons `ok` and can leave a second browser until `finally`. | #38 closed the client. Sleeps untouched. | **real eng later** |
| 4. Fold `claimOkProfile` into `ok` | Thesis tension only. Folding would lie on auth-gated SaaS. | #40 documented “read the triad.” Code unchanged. | **leave** |
| 5. Device / QR zero unit tests | Advertised + wired, best-effort. Not dead. Unknown `--device` throws **after** launch (slot released). | #35 shipped + honesty. #40 advertised more. Tests still zero. | **leave** (tests later if the table grows) |
| 6. Origin-allowlist tautology | Still deferred. Named-host lines are dead given the first `www.` strip. No integrity hole on the three marketing hosts. | Unchanged since #33 | **leave** |

No product cleanup in this PR. Do not merge this as a fix.

---

## 1. `looksLikeAppProfile` (kebab / overly broad heuristic)

### What the code does

Two copies of the same predicate:

```ts
/^[a-z0-9]+(-[a-z0-9]+)*$/.test(profileLc) && profileLc.length > 3
```

| Site | Symbol / lines |
|---|---|
| `src/profile-status.ts` | `looksLikeAppProfile` at **118–121** (inspect-only early `weakSeed`) and **210–226** (live logged-out → `weakSeed`) |
| `src/profile-persist.ts` | `awaitNext` **193–196** (soft-warn on completed Save) |

It is **not** kebab-only. The hyphen group is optional (`(-[a-z0-9]+)*`). After `toLowerCase()`, any `[a-z0-9]` slug longer than 3 characters matches: `consistencyhub`, `ironadamant`, `checkpoint`, `other-profile`, `test`. Rejects `abc` (length 3), `ab`, `my_profile`, `foo.bar`.

`isConsistencyHub` (`profileLc === "consistencyhub"`) is redundant for that name — the slug regex already matches.

`sessionStorage` is only counted when an **origin** is passed (`seedFromStorageState` in `profile-persist.ts` **57–65**; `originStoreCounts` in `profile-storage.ts` **104–114**). No origin → `sessionStorage` stays `undefined` → `hasNoSessionStorage` is false.

Production wiring:

- `waitForProfileSave` forwards `https://consistencyhub.io` **only** when the name is `consistencyhub` (`profile-persist.ts` **229–238**). Other names inspect with `origin === undefined`.
- `profileStatus` inspects only when there is **no URL** (`!willLive`, **104–112**). That branch always passes `undefined` origin. The inspect-only `weakSeed` return (**121–135**) is therefore **dead in production** unless `deps.inspectSeed` is injected (unit tests).
- ConsistencyHub status is fine: `savedCheckForProfile("consistencyhub")` supplies a URL → one live check → `weakSeed` from `profileSeed` (`check.ts` **230** always passes `originOf(opts.url)`).

The live-path copy **does** fire: logged-out + cookies/origins + `sessionStorage === 0` + slug name → `reason: "weakSeed"` and a “run `--sso --save-profile`” skipReason instead of `loggedOut`.

Tests pin CH, not the heuristic:

- `profile-status.test.ts` uses `profile: "consistencyhub"` (`isConsistencyHub`).
- `profile-persist.test.ts` “does not warn for non-consistencyhub” (**155–176**) passes because the mock **omits** `sessionStorage: 0`. Same landmine #39 named.

### Real risk today

**None that burns a slot on the saved-check door.** CH await-login warning is `isConsistencyHub` + forwarded origin. CH status is the live path.

Residual: a cookie-only app whose profile is a slug (`ironadamant`, `other-profile`) and whose live probe lands logged-out with `sessionStorage === 0` is labeled `weakSeed`. The agent may spend a **finalize-login / `--sso --save-profile`** session that cannot help. That is extra Solari, not a leak, and not a contract lie on CH.

If a later PR counts sessionStorage without an origin, **every** slug profile becomes `weakSeed`. Do not “fix” inspect-without-URL by dropping the origin gate and leaving this regex.

### #40 / #38

**Unchanged.** #38 made `emptySave` / one-session status / CH origin-forward live. #40 did not touch these files.

### Verdict

**leave.** Deleting the regex and keying `weakSeed` on `isConsistencyHub` plus an explicit origin list is **real eng later**, only when someone already touches `profile-status.ts` / `profile-persist.ts`. Do not extract a helper for sport.

---

## 2. Fail-closed gates copied four ways

### What the code does

Same policy, four implementations (as #39 P2-5; `fail-closed.ts` header **6–14** points at the first three plus `sso.ts`):

| # | File | Symbol | What it actually refuses |
|---|---|---|---|
| 1 | `src/tool-schema.ts` | `assertRecordProfileAllowed` **46–71**, `assertRecordNotLoggedIn` **73–86** | CH record / `allowRecordProfile`; record+profile without allow; allow only on public marketing host; **record+profile+allow+fill/click**; record+sso/saveProfile; dashboard landing |
| 2 | `src/tool-schema.ts` | `auspexCheckInputSchema.superRefine` **210–246** | Same family, **except** record+profile+`allowRecordProfile`+fill/click. MCP **must not** use this schema (`mcp-schema.test.ts` forbids `inputSchema: auspexCheckInputSchema`). |
| 3 | `src/page-actions.ts` | `assertPageActionsAllowed` **66–74**, `assertFillPair` / `assertNotPasswordSelector` | fill/click+profile without `allowPageActions`; password selector |
| 4 | `src/launch-options.ts` | `sessionCreateFromCheck` **36–40** | `recording` stays off when a `profileId` is set unless the URL is a public marketing host |

Callers of (1)+(3): `runCheck` (`check.ts` **179–181**), `executeAuspexCheck` (`mcp-tools.ts` **89–91**), CLI `parseArgv` (`cli.ts` **203–224**, plus a duplicate record+sso/dashboard check). Password fill is also refused at **runtime** (`input.type === "password"`, `page-actions.ts` **91–101**). Desktop `--type` is a fifth, separate fail-closed (`desktop.ts`) — not this item.

Confirmed Zod gap (`haystack.test.ts` **66–72**):  
`record + profile=demo + allowRecordProfile` on `https://ironadamant.com` **parses**. Adding `fill` / `click` still parses. Runtime `assertRecordProfileAllowed` throws (`security-guards.test.ts` “P2: record+profile+fill/click…”, **198–236**).

### Real risk today

**None.** Production MCP never runs superRefine. CLI / `runCheck` / `executeAuspexCheck` all hit the runtime asserts. A Zod-only test can go green for a combo the process refuses — that is test drift, not an agent driving a logged-in record+fill.

### #40 / #38

**Unchanged** as copies. #40 only rewrote `verify` / `verifyWithProfile` **descriptions** on the same file. #33/#31 added the runtime fill/click+record refuse. #38 did not consolidate.

### Verdict

**leave.** One `assertCheckOpts` + generate-or-delete the Zod clone is **real eng later** when the next record/fill feature already opens `tool-schema.ts`. Do not do it as sport. Do not weaken runtime to match Zod.

---

## 3. VWP / profile-claim magic sleeps

### What the code does

`defaultProfileClaimCheck` (`sandbox.ts` **111–180**):

1. `createClient()` + `launchBrowser` (second Solari Chrome; ledger `rememberLive`).
2. `pageForSession(browser)` — **no** `--mobile` / `--device`.
3. `gotoWithSessionRestore` (goto timeout **45s**, `solari.ts` `GOTO_TIMEOUT_MS`).
4. `waitForLoadState("networkidle", { timeout: 20_000 })` — optional, catch swallowed.
5. **Magic sleep 2000ms** (`sandbox.ts` **144**).
6. If `innerText` empty or `< 50` chars: **magic sleep 3000ms** and re-read (**146–148**).
7. `haystackMatches` → `claimOk` / `claimErrors`.
8. `try/finally` closes the client (#38). `ReadyRelease` + `forgetLive` on the success and error paths.

This runs **inside** `verifyReceipt`’s `raceWithTimeout(..., VERIFY_OVERALL_MS)` (**16**, **238**, **246–319**). `VERIFY_OVERALL_MS = 90_000`. Profile claim is **after** sandbox create + upload + `python3` assert (`SANDBOX_ASSERT_TIMEOUT_MS = 60_000`) + kill.

`CHECK_THEN_VERIFY_WORST_MS` = `OVERALL_TIMEOUT_MS` (120s) + `CLOSE_TIMEOUT_MS` (15s) + `VERIFY_OVERALL_MS` (90s) = **225s** (`sandbox.ts` **18**). Grok example `tool_timeout_sec = 300` (`grok.mcp.example.toml` **14**). `budget.test.ts` only asserts 225s ≤ 300s. It does **not** model the second browser.

The profile claim uses `new AbortController().signal` (**120**), **not** the verify-race signal. `raceWithTimeout` (`timeout.ts` **91–114**) flips `cancelled` / aborts its own controller and `Promise.race`s; the inner work is not cancelled. A 90s win leaves `defaultProfileClaimCheck` running until goto/sleeps finish or throw, then `finally` closes.

### Real risk today

**Live Solari only. Not CI.** Unit tests mock `profileClaimCheck` / `verify` (`lifecycle.test.ts`, `mcp-check-verify.test.ts`). The 2s/3s sleeps never run in `npm test`.

Budget: 45s goto + 20s idle + 5s sleeps can still sit on top of a slow sandbox assert. If the **90s** envelope loses, `checkThenVerify` catch (**391–401**) returns `verify.ok=false`, `claimOk=false`, **no** `anonymousClaimSkipped`. `agentReceiptOk` then requires `verify.ok && claimOk` → **`ok=false`** even though the live check matched. That is a poisoned VWP receipt, not a silent pass. The second browser should still close; a hung `chromium.connect` can hold a slot until the host 300s tool timeout.

Dogfood 2026-09-18 finished in time. #38 closed the `createClient()` leak. This is flake + slot-hold on a slow day, not a contract lie.

### #40 / #38

#38: client `try/finally` — **better**. Sleeps / second browser / 90s envelope — **unchanged**. #40: documented, not rewritten.

### Verdict

**real eng later.** Not a one-file fix. A later VWP touch should (1) put profile claim on the verify abort signal, (2) keep it inside 90s **or** give it its own budget that still fits 300s, (3) replace the 2s/3s sleeps with `waitFor` / networkidle already present. Do not add more sleeps. Do not run this in CI.

---

## 4. Folding `claimOkProfile` into `ok` (thesis)

### What the code does

Three booleans, three writers:

| Signal | Writer | VWP (anonymous skipped) |
|---|---|---|
| `ok` | `agentReceiptOk` (`check-reason.ts` **49–61**) | `protocolOk` + `reason===matched` + **`verify.ok` only** |
| `claimOk` | sandbox `assert_receipt.py` | `false` + `anonymousClaimSkipped` |
| `claimOkProfile` | `defaultProfileClaimCheck` / `verifyReceipt` **301–306** | `true`/`false`; **never read** by `agentReceiptOk` or `overlayVerifyReason` |

`overlayVerifyReason` (**35–47**): if `anonymousClaimSkipped`, reason stays `matched` even when `claimOkProfile === false` **or** integrity `verify.ok === false`. `ok` still tracks integrity (`agentReceiptOk` returns `verify.ok` on skip). An integrity fail can print `reason: matched` + `ok: false`. Harry-skim nit, not a fold.

Schema v1 required keys unchanged. `claimOkProfile` is optional extra (`AGENTS.md` verify table). Goldens / CH demo receipt keep the triad: `ok=true`, `claimOk=false`, `claimOkProfile=true`.

### Real risk today

An agent that only reads `ok` after `--verify-with-profile` can miss a failed profile claim. That is **documented** on AGENTS, PITCH, USAGE, MCP `CHECK_DESCRIPTION`, and `tool-schema.ts` `verifyWithProfile`. Folding `claimOkProfile === false` into `ok` would re-create the OneDrive / ad-hoc-auth poison: live matched, profile SPA slow or logged-out, `ok=false`, agent retries, Solari burned. Auth-gated SaaS **cannot** treat the second browser as the same signal as live match or anonymous fetch.

There is no strong reason to change the thesis.

### #40 / #38

#38 made `ok` agent success and skipped anonymous claim on VWP. #40 **better**: stopped flattening `--verify` ≡ VWP and said “read `claimOkProfile`; do not treat `ok` as the triad.” Code fold-gap **unchanged** (correct).

### Verdict

**leave.** Do not fold. If reviewers keep tripping, **docs-only** (one sentence on the receipt `next` when `claimOkProfile === false`) — not this PR.

---

## 5. Device / QR — dead, best-effort, or advertised? Tests missing vs needed?

### What the code does

**Advertised and wired. Best-effort. Not dead.**

| Surface | Symbol | Behavior |
|---|---|---|
| `src/device-emulation.ts` | `DEVICES` **14–50**, `parseDeviceOptions` **57–84**, `listDevices` **86–88** | Five hand-copied descriptors. `--device` unknown → throw (`Available: …`). `--mobile` is a **sixth copy** of iPhone 13 Pro (390×844, iOS 15 UA) — not `DEVICES["iphone-13-pro"]`. `listDevices()` unused. |
| `src/check.ts` | **234–235** | `parseDeviceOptions` → `pageForSession(browser, deviceContextOptions)` **after** `launchBrowser`. |
| `src/solari.ts` | `pageForSession` **299–320** | If `browser.contexts()[0]` exists, **`contextOptions` are dropped**. Comment: Solari `chromium.connect` leaves `contexts()` empty, so `newContext` applies viewport/UA. If Solari ever exposes a default context, `--mobile` silently no-ops. |
| `src/qr-gen.ts` | `generateQRCode` **9–18** | `qrcode` `toFile` → `<runDir>/handoff-qr.png`. |
| CLI / MCP login | `cli.ts` **443–447**, `mcp-tools.ts` **138–140** | After a successful handoff, QR is written onto `handoff.qrPath`. No try/catch — a `qrcode` throw fails the whole login (handoff URL already minted; remint). `qrcode` is a package dependency (`package.json`). |
| Docs / schema | USAGE, both AGENTS, package README, `tool-schema.ts` **199–206**, MCP login description | `--mobile` / `--device` / `qrPath` / `openOnPhone` / `oneLiner`. Honesty: “best-effort; depends on Solari cloud Chrome; not verified against live Solari.” |

`defaultProfileClaimCheck` does **not** pass device options (desktop Chrome claim). Fine.

### Tests missing vs tests needed

**Missing:** zero unit tests import `parseDeviceOptions` or `generateQRCode` (`tests/` grep is empty).

**Present (needles only):** `agents-sync.test.ts` greps `--mobile`, `--device`, `qrPath` in AGENTS/USAGE; `mcp-schema.test.ts` greps login `qrPath`.

**Needed later, not now:**

- Cheap: `parseDeviceOptions({ device: "iphone-13-pro" })` equals `{ mobile: true }`; unknown name throws; `listDevices()` lists five keys. Do this **only** if someone extends the table.
- QR: `generateQRCode` writes a PNG under a temp run dir. Optional; not a contract.
- Live Solari viewport honor: **cannot** be a unit test. Docs already refuse that claim.

Unknown `--device` throws **after** session create (`check.ts` order: launch **212** → closer **216** → parseDevice **234**). The closer still releases. One wasted slot on a typo, not a leak. Zod `device` is a free string (`tool-schema.ts` **203–206**), so MCP ListTools will not catch it.

### Real risk today

**None / Harry skim.** An agent that believes `--mobile` is verified live is already contradicted by AGENTS. Default-context drop is the only silent no-op, and it is Solari-dependent (same disclaimer).

### #40 / #38

#35 shipped the feature + honesty. #40 advertised mobile/device on README / shipped list. **Tests still zero.** Unchanged as engineering.

### Verdict

**leave.** Not dead code. Tests missing ≠ tests needed for ship. Add units when the device table changes. Do not claim live Solari honors viewport.

---

## 6. Origin-allowlist tautology (`assert_receipt.py`)

### What the code does

`validate_url_origin` (`src/assert_receipt.py` **170–195**), called from `main` when both `url` and `finalUrl` are set (**260–263**). Integrity (`ok`), not claim.

Allowed-redirect lambdas (**183–188**):

1. `r.replace("www.", "") == f.replace("www.", "")` — **any** host pair that matches after the first `www.` substring is stripped.
2. `ironadamant.com → ironadamant.com` — dead given (1); also allows scheme-only change (http↔https) because the check is hostname-only, which (1) already allows.
3. `checkpointprojects.com → checkpointprojects.com | www.checkpointprojects.com` — dead given (1).
4. `consistencyhub.io → consistencyhub.io` — dead given (1).

So the named-host list is tautological. The **real** policy is (1): www-flip (and scheme-flip) on every host, not a three-host allowlist.

`str.replace("www.", "")` is not prefix-anchored. `notwww.example.com` becomes `not.example.com`. Exotic, not a marketing-host hole.

No unit test calls `validate_url_origin` (`tests/` grep empty). PNG + fetch/OCR + `--skip-anonymous-claim` remain first-class and tested via `receipt.test.ts` / embedded Python.

### Real risk today

**None** for ironadamant / checkpoint / consistencyhub. A weird third-party host whose labels contain `www.` could theoretically pass a hostname pair that is not a www-flip. That is not an agent burn and not a Solari-slot issue.

### #40 / #38

**Unchanged** since #33 added origin validation. #40 listed it deferred. Still deferred.

### Verdict

**leave.** Deleting lambdas 2–4 or prefix-anchoring `www.` is **docs-only / real eng later** if anyone already edits `assert_receipt.py`. Do not open a PR for it.

---

## Confirmations the founder asked for

### Device / QR

| Question | Answer |
|---|---|
| Dead code? | **No.** Login writes `handoff.qrPath`. Check applies `parseDeviceOptions` to `newContext` when Solari has no default context. |
| Best-effort? | **Yes.** Documented. Not verified against live Solari. |
| Advertised? | **Yes.** CLI, MCP schema, both AGENTS, README. |
| Tests missing vs needed? | **Missing.** Needles only. Units are cheap and optional until the table grows. Live honor is not unit-testable. |

### Magic sleeps

| Question | Answer |
|---|---|
| Inside the 90s budget? | **Yes.** `VERIFY_OVERALL_MS = 90_000` wraps sandbox **and** profile claim. Host 300s is not the tight constraint. |
| Flaky in CI? | **No.** CI never calls `defaultProfileClaimCheck`. |
| Live Solari only? | **Yes.** Timeout → `ok=false` (verify catch drops `anonymousClaimSkipped`). Second browser should `finally` close; hung connect can hold a slot until 300s. |

### Thesis

`ok ≠ claimOk ≠ claimOkProfile` still holds on the saved-check + VWP door. #40’s fail-soft (`shouldVerifyCheck` also skips anonymous verify for `profile=consistencyhub` or a profile on `consistencyhub.io` / `onedrive.live.com`) reduced the **ad-hoc** poison #39 called P2-1. Other ad-hoc auth hosts still default-verify. `--verify` is still anonymous. Do not fold `claimOkProfile` into `ok`.

---

## What #40 actually changed vs these six

#40 (`da47c72`) touched docs, descriptions, `shouldVerifyCheck` fail-soft, demo `sessionId` scrub. It did **not** edit `profile-status.ts`, `profile-persist.ts`, `sandbox.ts` sleeps, `device-emulation.ts`, `qr-gen.ts`, `assert_receipt.py`, `check-reason.ts`, or the four fail-closed bodies.

#38 closed the contract holes (shared verify policy, finalize-login MCP, `emptySave`, CH origin-forward, one `ok`, VWP client close, one-session status). The six leftovers were already P2 then.

---

## Suggested later order (Grok-only, not this PR)

Do not start a cleanup PR unless a later feature already opens the file.

1. **VWP budget / abort** (item 3) — only if a live VWP starts timing out or leaking a second browser. Wire the verify signal; keep 90s honest.
2. **`looksLikeAppProfile`** (item 1) — only with inspect-origin work. Delete the regex; do not count SS without origin.
3. **Fail-closed one assert** (item 2) — only with the next record/fill change. Keep runtime stricter than Zod.
4. **Device units** (item 5) — only if the device table grows. Still do not claim live Solari.
5. **Origin lambdas** (item 6) — only if `assert_receipt.py` is already open.
6. **Never** fold `claimOkProfile` into `ok` without a new optional signal and an auth-gated dogfood receipt that stays honest.

---

## Method

- Fetched `origin/main` to `1e57185`. Branched `cursor/deferred-items-check-dc1b`.
- Read #40 body + deferred list, #39 report (closed, not merged), leave-nothing checklist on main.
- Re-read: `profile-status.ts`, `profile-persist.ts`, `profile-storage.ts`, `fail-closed.ts`, `tool-schema.ts`, `page-actions.ts`, `launch-options.ts`, `check.ts` launch/device slice, `sandbox.ts` VWP + `checkThenVerify`, `check-reason.ts`, `agent-receipt.ts`, `timeout.ts` `raceWithTimeout`, `solari.ts` `pageForSession` / timeouts, `device-emulation.ts`, `qr-gen.ts`, `assert_receipt.py` `validate_url_origin`, CLI/MCP login QR, `grok.mcp.example.toml`, tests: `profile-status`, `profile-persist`, `security-guards`, `haystack`, `fail-closed`, `agent-receipt`, `lifecycle`, `budget`, `agents-sync`, `receipt`.
- Did not change product code. Did not run live Solari.
