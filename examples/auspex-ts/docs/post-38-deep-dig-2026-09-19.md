# Post-#38 deep dig — 2026-09-19

**Auditor:** Grok (Cursor cloud agent). Report only — no product code.  
**Tip:** `ff156ad` (`Merge pull request #38`, 2026-09-19). Re-read on GitHub `main`, not the #38 PR body.  
**Baseline:** Claude-era audit at `29d4312` (report-only #37, closed after #38). Attached copy: `uploads/claude-era-quality-audit-2026-09-19.md`.  
**Scope:** `examples/auspex-ts` `src/` + `tests/` + `dist/mcp.mjs`, root + package `AGENTS.md`, `SECURITY.md`, `README.md` / `PITCH.md` / `RECEIPTS.md` / `DEMO.md`, `package-lock.json`, CI workflow.  
**This session:** `npm test` → **249 pass, 0 fail, 3 skipped**. `tsc --noEmit` green. `npm run build:mcp` then `git diff --exit-code -- dist/` empty. `npm audit --audit-level=high` → 0. `extract-zip` absent from the lock. `@puppeteer/browsers@3.2.2 overridden`. Did **not** run live Solari.

This is a CoS/founder cut list: did #38 actually close the contract holes, and what still burns an agent or a Solari slot.

---

## Executive verdict: **ship-with-nits**

Not blocked. Not clean.

Every Claude-era **P0** and **P1** holds on `main` with code + tests. CLI and MCP now share `shouldVerifyCheck`. `auspex_finalize_login` is a real MCP tool. `emptySave` is returned. Live await-login forwards the ConsistencyHub origin. Receipt `ok` is agent success on stdout, MCP, and `manifest.json`. The verify-with-profile client is closed. Default profile-status is one session. AGENTS needles for the #38 facts match.

What remains is **not a product regression from #38**. It is leftover spaghetti plus **stale marketing doors** (package `README.md` still teaches pre-#38 `ok` = protocol success; root README “What we shipped” still omits `finalize-login` and the CH verify default). Those are Harry-skim lies, not agent-runtime lies. Fix as a docs-only pass if the intern packet goes out before another code PR. Do not hold features on them.

No new P0 from #38. No cleanup required before the founder moves on.

---

## Confirmed #38 fixes

Do not trust the PR body. Re-read below.

| #38 claim | Holds? | Evidence |
|---|---|---|
| **P0-1** Shared `shouldVerifyCheck`; CH defaults off on CLI **and** MCP | **Yes** | `fail-closed.ts` `shouldVerifyCheck`: `verify===false` wins, else `verify===true` or `verifyWithProfile` enables, else `name===consistencyhub` (case-insensitive) skips, else verify. CLI `parseArgv` (`cli.ts`) and MCP `executeAuspexCheck` (`mcp-tools.ts`) both call it. Tests: `fail-closed.test.ts` (policy table), `cli-help.test.ts` (`verifyAfter === false` for `--name consistencyhub`; VWP / `--verify` enable), `mcp-check-verify.test.ts` (CH without `verify` must not call `checkThenVerify`; ironadamant still does). Dist embeds `shouldVerifyCheck`. |
| **P0-2** `auspex_finalize_login` registered + on the contract | **Yes** | `registerAuspexTools` registers it; handler calls `runFinalizeLogin` (`check.ts`: SSO microsoft + `saveProfile`, CH url/expect). `AUSPEX_CONTRACT` has the `finalize-login` / `auspex_finalize_login` row. Tests: `any-host.test.ts` (command + tool lists), `mcp-schema.test.ts` (ListTools), `dist.test.ts`, `agents-sync.test.ts`. Same function as `check --profile … --sso --save-profile`. |
| **P1-1** `emptySave` is live | **Yes** | `profileStatus` returns `emptySave` for missing row, `populated===false`, or empty-seed live errors (`/0 cookies|empty Save|profile not found/`). Tests: `profile-status.test.ts`. MCP `PROFILE_STATUS_DESCRIPTION` and both AGENTS files name the enum. |
| **P1-2** Live await-login forwards inspect origin | **Yes for CH** | `bindInspectProfileSeed` forwards `(id, origin)`. `liveAwaitLogin` uses it. `waitForProfileSave` hardcodes `https://consistencyhub.io` for the `consistencyhub` name. Tests: `profile-persist.test.ts` (binder + origin, not mock-only; warning text includes `--sso --save-profile`). **PR body overclaimed** “`seedFromStorageState` always counts sessionStorage” — it still only counts when `origin` is passed (`sessionStorage` stays `undefined` otherwise). The live CH path works because origin is supplied. |
| **P1-3** One `ok` (agent success); `protocolOk` optional | **Yes** | `runCheck` sets `ok: agentReceiptOk({ protocolOk, reason })` and `protocolOk` separately. `persistAgentManifest` writes `toAgentReceipt` (same as stdout/MCP). `checkThenVerify` rewrites the manifest after verify. Tests: `agent-receipt.test.ts` (mismatch + `protocolOk: true` → disk `ok: false`), `lifecycle.test.ts` (verify overlay rewrites manifest). Schema v1 required keys unchanged; `protocolOk` is extra/optional. |
| **P1-4** VWP `createClient()` closed | **Yes** | `sandbox.ts` `checkThenVerify`: `try/finally` + `solari.close()`. Test is a **source gate** (`lifecycle.test.ts` greps the slice). Not a behavioral close-count test. Code is correct. |
| **P1-5** profile-status one session by default | **Yes** | Production: inspect only when `!willLive` (no URL). Otherwise one `runCheck`. `weakSeed` from inspect (no URL + injected/production seed) or from live `profileSeed` when `sessionStorage === 0`. Tests: `profile-status.test.ts` (URL path does not inject `inspectSeed`; live `profileSeed` derives `weakSeed`). |
| **P1-6** Root ↔ package AGENTS sync | **Needles yes; copies still two novels** | `agents-sync.test.ts` greps both files + `USAGE` + `mcp-tools.ts` for `--mobile`, `--device`, `weakSeed`, `emptySave`, handoff packet fields, `auspex_finalize_login`, CH `verify=false`. Contract facts are present on both doors. The files are **not** identical: package omits the receipt-schema table and MCP-hosts block (points at root); package desktop blurb still omits `--type` fail-closed; root desktop blurb has it. |

**#38 half-fix / overclaim to remember:** `seedFromStorageState` is still origin-gated. Inspect-without-URL in production therefore still cannot emit `weakSeed` (no origin → `sessionStorage` undefined → warning predicate false). For ConsistencyHub this is moot: the saved check always supplies a URL, so status takes the live path.

---

## Remaining ranked issues

### P0 — none

No contract lie that will make an agent following AGENTS/MCP do the wrong thing on the saved-check door. The two P0s from #37 are closed.

### P1 — none that block shipping

The closest things are **docs doors that still teach the old contract**. They are Harry-skim risk, not runtime. Ranked as P2-docs below so they do not get a fake “must patch code” label.

### P2 — still matters for agents / Solari ops

#### P2-docs-1. Package README still teaches pre-#38 `ok`

`examples/auspex-ts/README.md`:

- “`ok` is protocol success (page loaded, not leftover auth, screenshot written).” That is the **old** `CheckResult.ok`. After #38, `ok` is agent success; `protocolOk` is the protocol bit.
- Commands one-liner **omits** `finalize-login`, `--verify-with-profile`, `--mobile`, `--device`.
- MCP tools list **omits** `auspex_finalize_login`.
- `profile-status` described as `loggedIn` / `loggedOut` / `needsHuman` only.
- Check “verifies by default” with **no** CH skip.
- Duplicate “Claude Desktop” paragraph.

An agent that opens the package README (common: host rooted at `examples/auspex-ts`) gets a different `ok` than stdout. AGENTS + `USAGE` + MCP descriptions are correct. This is the worst remaining **lie**, and it is docs.

#### P2-docs-2. Root README “What we shipped” is behind the recipe above it

Root `README.md` recipe (login → await-login → finalize-login → check → VWP) is honest and matches dogfood.

The **shipped-tools** list under it still says `auspex_check` “Verifies by default” with no CH exception, lists `profile-status` without `weakSeed` / `emptySave`, and **does not mention `auspex_finalize_login`**. Harry reads that list.

`PITCH.md` §3 still says profile-seeded recheck happens “After anonymous verify.” Production VWP **skips** the anonymous claim (`skipAnonymousClaim` + `assert_receipt.py --skip-anonymous-claim`). Integrity still runs (sandbox VM still boots). The sentence is the old #20 shape.

`SECURITY.md` still says “232/235 pass”. This session: 249/252, 3 skipped. Counts rot.

`RECEIPTS.md` / `DEMO.md` / both AGENTS recipe blocks are honest about console Save vs `finalize-login` / `--sso --save-profile`.

#### P2-1. `shouldVerifyCheck` is **name-keyed only**

```ts
if (opts.name?.trim().toLowerCase() === "consistencyhub") return false
```

`--name consistencyhub` / `name=consistencyhub` skips. Reconstructing flags does not:

```bash
npx auspex check https://consistencyhub.io --expect "Document Editor" --profile consistencyhub
npx auspex check https://onedrive.live.com/ --expect "My files" --profile consistencyhub
```

Both default-verify (anonymous). Live can match; anonymous fetch sees login; `overlayVerifyReason` → `mismatch`; `ok=false`; sandbox burned.

AGENTS OneDrive gotcha already says this. The P0 fix did **not** key off `profile` or host. Saved-check door is safe. Ad-hoc door is the same trap it was on 29d4312.

`--verify` / `verify=true` on CH is **not** the dogfood path. It enables **anonymous** verify and will poison `ok` the same way. MCP `CHECK_DESCRIPTION` and both AGENTS tools blurbs flatten “pass `verify=true` **or** `verifyWithProfile`” as equivalent. They are not.

`shouldVerifyCheck({ verify: false, verifyWithProfile: true })` is `false` (`verify=false` wins). Tested. `--no-verify --verify-with-profile` silently drops the profile claim.

#### P2-2. VWP `ok` does not fold `claimOkProfile`

Documented (`ok` requires only `verify.ok` when `anonymousClaimSkipped`). Still true:

- `overlayVerifyReason`: if `anonymousClaimSkipped`, reason stays `matched` even when `claimOkProfile === false` **or** integrity `verify.ok === false`.
- `agentReceiptOk`: if `anonymousClaimSkipped`, returns `verify.ok` only.

Python skip path is honest: `audit_claim(..., skip_all=True)` returns `["anonymous claim skipped"]`, sets `anonymousClaimSkipped: true`, `claimOk: false`, `ok` = integrity only. `parseAssertStdout` also detects the skip string. Dogfood (`ok=true`, `claimOkProfile=true`) is the happy path. A failed profile claim still prints `reason: matched` / `ok: true` if the PNG decoded.

An agent that only reads `ok` after `--verify-with-profile` can miss a failed profile claim. Read `claimOkProfile`. Do not treat `ok` as the triad.

VWP still spends a **sandbox** (integrity) plus a **second browser** (profile claim). It is not free. CH default (no flag) spends neither.

#### P2-3. `looksLikeAppProfile` is still a Claude heuristic

Duplicated in `profile-status.ts` and `profile-persist.ts`:

```ts
/^[a-z0-9]+(-[a-z0-9]+)*$/.test(profileLc) && profileLc.length > 3
```

Matches `ironadamant`, `other-profile`, `consistencyhub`. `waitForProfileSave` “does not warn for non-consistencyhub profiles” still passes because the mock **omits** `sessionStorage: 0`. If inspect ever counts sessionStorage for all names, every kebab profile becomes `weakSeed`. Same landmine as #37.

#### P2-4. Inspect-without-URL still cannot see sessionStorage

Production `profileStatus` inspect path (`!willLive`) calls `inspectProfileSeed(solari, row.id, url ? origin : undefined)`. `url` is falsy on that branch, so origin is always `undefined`, so `seedFromStorageState` omits `sessionStorage`. The inspect-only `weakSeed` return is **dead in production** unless `deps.inspectSeed` is injected (unit tests).

CH is fine: `savedCheckForProfile("consistencyhub")` supplies a URL → one live session → `weakSeed` from `profileSeed`. Ad-hoc profiles without `--url` / `--name` will not get the warning from inspect.

#### P2-5. Fail-closed record/fill still lives in four places

Same policy, still copied:

1. `tool-schema.ts` `assertRecordProfileAllowed` / `assertRecordNotLoggedIn` (runtime; **includes** record+profile+allow+fill/click)
2. `auspexCheckInputSchema.superRefine` (tests only; MCP must not use it — `mcp-schema.test.ts` forbids it). **Still misses** record+profile+`allowRecordProfile`+fill/click.
3. `page-actions.ts` `assertPageActionsAllowed` / `assertFillPair`
4. `launch-options.ts` `sessionCreateFromCheck` drops `recording` unless URL is a public marketing host

CLI `parseArgv` + `runCheck` + MCP handler each call (1)+(3). A Zod-only test can go green for a combo the runtime refuses. Not a new hole from #38.

#### P2-6. Profile-seeded claim check is still a second browser with magic sleeps

`defaultProfileClaimCheck` (`sandbox.ts`): new session, `goto`, networkidle, `sleep(2000)`, if text `< 50` chars `sleep(3000)`. `new AbortController().signal` aborts nothing. `CHECK_THEN_VERIFY_WORST_MS` is check + close + 90s verify; profile claim runs **inside** that 90s **after** a sandbox assert that can take 60s. 45s goto + 20s idle + 5s sleeps can still blow a host `tool_timeout_sec`.

#38 did not touch this. Dogfood happened to finish in time.

#### P2-7. Device + QR still have zero unit tests

`device-emulation.ts` (5 hand-copied blobs; `--mobile` is a sixth copy of iPhone 13 Pro, not `DEVICES["iphone-13-pro"]`). `qr-gen.ts` (18-line `toFile` wrapper). `listDevices()` unused. Zod `device` is a free string; unknown names throw only inside `runCheck`.

`pageForSession`: if Solari ever exposes `contexts()[0]`, `contextOptions` (viewport/UA) are **silently dropped**. Docs already say best-effort / not verified against live Solari. Honest, still untested.

#### P2-8. MCP `auspex_await_login` ListTools blurb is thinner than AGENTS

Handler description: wait for cookies/origins; empty-save is not success. **No** sessionStorage / weak-seed sentence. The JSON result still has `next` with the warning when origin was forwarded. An MCP-only agent that never reads `next` will treat console Save as done.

`finalize-login` ListTools blurb is adequate. Recipe works on MCP now (the #37 P0-2 hole).

#### P2-9. `finalize-login` always uses the ConsistencyHub saved check

`runFinalizeLogin` ignores the profile’s own host: url/expect default to `resolveSavedCheck("consistencyhub")`. Fine for the dogfood profile. `finalize-login --profile other-app` still hits consistencyhub.io unless `--url` is passed, and still expects `Document Editor`. Same as documenting “defaults to ConsistencyHub URL and expect.” Do not reuse the helper as a generic sessionStorage capture.

`needsHuman` is **identical** for `finalize-login` and `check --profile … --sso --save-profile` — one function. `completeSso` clicks Microsoft (pinned), then picker / “Signed in” tile; password/OTP walls return `needsHuman` and never type. If already on the dashboard (no Microsoft button), SSO is a no-op and save-profile runs if the URL is persistable. If stuck on `/landing` with no SSO click, save is refused (`PUBLIC_PROFILE_SAVE_ERROR`) → `protocolOk` false → `ok` false. Honest.

#### P2-10. Docs are still a multiply-maintained novel

Surfaces: root `AGENTS.md`, package `AGENTS.md`, `cli.ts` `USAGE`, `mcp-tools.ts` `*_DESCRIPTION`, `tool-schema.ts` essays, `README.md` (root + package), `PITCH.md`, `RECEIPTS.md`, `DEMO.md`, `SECURITY.md`.

`agents-sync.test.ts` is a **needle grep**, not a contract table. It will not catch “`ok` is protocol success” in the package README. `cli.ts` is 525 LOC (house rule 600). Next feature still wants `parseArgv` split from `main`.

### P3 — noise (do not start a PR for these)

- `listDevices()` unused. `asAgentJson()` unused. `completeMicrosoftSso` `@deprecated` wrapper.
- SessionStorage hydrate naming soup still: `SESSION_STORAGE_PREFIX`, `foldSessionStorage`, `hydrateSessionStorageInMemory`, `hydrateSessionStorageSource`, `installSessionStorageRestore`, `hydrateSessionStorage`. Works; #38 did not consolidate (correct).
- Login result still has top-level `url` / `handoffId` / `expiresAt` **and** `handoff: HandoffPacket`. CLI/MCP still stamp `qrPath` after `loginInstructions`.
- Two run-directory stampers: `check.ts` `runDir()` (full ISO) vs `paths.ts` `ensureRunDir()` (slice off millis). Login QR and check shots cannot share a folder.
- Desktop `--type` regex farm unchanged. Fine as fail-closed.
- `assert_receipt.py` `validate_url_origin` still tautological except checkpoint `www`. `r.replace("www.", "")` still mutates `notwww.example.com`.
- Hand-rolled YAML parser for three saved checks.
- `--mobile` duplicates `DEVICES["iphone-13-pro"]`.
- `.env` line parser still copied in `solari.ts` / `solari-mcp-gate.ts`.
- Trailing whitespace-only lines in `check.ts` / `profile-status.ts` / `profile-persist.ts` / `sandbox.ts`.
- Root AGENTS optional-keys table still documents `profileSeed` as `{ cookies, origins }` (no `sessionStorage`). Extra keys allowed; not a schema break.
- `AUSPEX_CONTRACT` maps `verify` → `--no-verify` only (not also `--verify`). Parity test still passes because USAGE contains `--no-verify`.
- Package AGENTS desktop tool omits `--type` fail-closed (root has it).

#38 **did** drop the unused `asFiniteNumber` / `originStoreCounts` imports from `profile-status.ts`. One P3 from #37 is gone.

---

## Auth-gated thesis (ok ≠ claimOk ≠ claimOkProfile)

Holds on the **saved-check + VWP** door. Code:

| Signal | Who sets it | CH `--name consistencyhub` (default) | CH + `--verify-with-profile` | Ad-hoc auth URL (default verify) |
|---|---|---|---|---|
| `ok` | `agentReceiptOk` | live match only (no verify) | live match **and** integrity `verify.ok` (anonymous claim skipped) | live match **and** `claimOk` — usually **false** |
| `claimOk` | sandbox fetch/OCR | omitted (`verify` absent) | `false` + `anonymousClaimSkipped` | `false` (login page) |
| `claimOkProfile` | second profile browser | omitted | `true`/`false`; **not** folded into `ok` | omitted unless VWP |

`shouldVerifyAfterCheck` still skips the sandbox on `loggedOut` / `needsHuman` / `recordedLoggedIn`. `checkThenVerify` returns `verify.skipped`. Not retried. Holds.

Paths that can still **poison `ok`** or **burn a sandbox**:

1. Ad-hoc auth URL without `--no-verify` / `--verify-with-profile` (documented).
2. `verify=true` / `--verify` on CH without VWP (docs flatten this as “verify ConsistencyHub”).
3. VWP integrity failure → `ok=false` even if live matched (correct).
4. VWP profile-claim failure → `ok` can stay `true` (documented fold-gap).

CH default no longer burns a sandbox. That was the P0.

---

## Fail-closed / security residuals

No new holes from #38. The #33/#31/#34 set still holds.

| Gate | Status |
|---|---|
| Password fill — selector deny-list **and** runtime `input.type === "password"` | Holds (`page-actions.ts`) |
| Desktop `--type` refuse (OTP / keyword / complexity / vendor prefixes) | Holds (`desktop.ts`); regex farm unchanged |
| `record`+`profile` / CH refuse / `record`+sso/saveProfile / dashboard landing | Holds (runtime). Zod superRefine still incomplete on fill/click+record+allow |
| `fill`/`click`+profile requires `allowPageActions` | Holds |
| Excerpt fence sanitize before early return | Holds (`text.ts`) |
| Loopback / metadata / IPv4-mapped IPv6 refuse | Holds (`http-url.ts`) |
| Demo `sessionId` scrub | Holds (`demo/receipt.json` synthetic id; CH demo omits live ids) |
| extract-zip override | Holds. Lock has `modern-tar`, **no** `extract-zip`. `npm audit --audit-level=high` → 0. Keep until Solari pins 3.x |
| Profile lock (`ProfileBusy`) | Holds |
| `SECURITY.md` honesty | Override story is true. Test-count line is stale (232/235 vs 249). Not a CVE lie |

---

## Dogfood / operator (2026-09-19 AEST)

Founder note: console Save left CH on `/landing` until `check … --sso --save-profile` refreshed the seed; then VWP passed.

**Code and the canonical docs make that recipe honest.** Console Save is not sufficient. The warning path for CH await-login now actually fires (P1-2). `finalize-login` is the same capture as `--sso --save-profile`. After a good seed, `--name consistencyhub` defaults to no-verify; `--verify-with-profile` is the claim recheck.

| Step | CLI | MCP | Notes |
|---|---|---|---|
| 1. Handoff | `login --profile consistencyhub` | `auspex_login` | Packet: `url`, `openOnPhone`, `oneLiner`, `qrPath`. Do not ping. |
| 2. Wait | `await-login --profile consistencyhub` | `auspex_await_login` | `completed` with cookies is **not** a logged-in app. CH `next` should warn if `sessionStorage===0`. |
| 3. Capture SS | `finalize-login --profile consistencyhub` **or** `check --profile consistencyhub --sso --save-profile` | `auspex_finalize_login` **or** `auspex_check` with those flags | Same function. `needsHuman` if Microsoft/Google password/OTP. Never type. Landing + failed SSO → save refused → `ok=false`. |
| 4. Reuse | `check --name consistencyhub` | `auspex_check` `name=consistencyhub` | Default **no** sandbox. |
| 5. Claim | `check --name consistencyhub --verify-with-profile` | `auspex_check` `name=consistencyhub` `verifyWithProfile=true` | Integrity sandbox + profile browser. Read `claimOkProfile`, not only `ok`. |

**MCP gap for the working recipe:** none. #37 P0-2 is closed. Remaining MCP nits: await-login description omits the weak-seed sentence; `CHECK_DESCRIPTION` flattens `verify=true` vs VWP.

`needsHuman` does **not** differ between finalize-login and `--sso --save-profile`.

---

## CI / dist / schema

| Check | Result |
|---|---|
| Schema v1 required keys frozen | `schemaVersion`, `ok`, `reason`, `url`, `expect`, `screenshotPath`. Goldens under `tests/golden/receipt-v1/`. `parseReceiptV1` allows extra keys. #38 did not add required fields. `protocolOk` is optional extra. |
| Tests that catch CH MCP verify regression | **Present:** `mcp-check-verify.test.ts` (no `checkThenVerify` without `verify` / VWP), `fail-closed.test.ts` (`shouldVerifyCheck` table), `cli-help.test.ts` (`verifyAfter`), `agents-sync.test.ts` (CH `verify=false` needles), `dist.test.ts` (`shouldVerifyCheck` + `auspex_finalize_login` in `dist/mcp.mjs`). |
| Dist vs src on `main` | Dist contains the #38 symbols. Rebuilt this session; `git diff --exit-code -- dist/` empty. CI: `npm test`, `tsc --noEmit`, `build:mcp`, `git diff --exit-code -- dist/`. |
| This session | 249 pass / 0 fail / 3 skipped. Typecheck green. Audit 0 high. |

---

## Safe to move on vs must-know before Harry skim

### Safe to move on (product)

- Ship `main` at `ff156ad`. The P0/P1 contract holes from #37 are closed in code.
- Agents following **AGENTS + MCP ListTools + USAGE** will skip anonymous verify on `--name consistencyhub`, can call `auspex_finalize_login`, get `emptySave`, get the CH weak-seed warning after console Save, and see the same `ok` on disk and stdout.
- Fail-closed security set is intact. extract-zip stays gone.
- Schema v1 freeze intact. CH MCP verify regression tests exist.
- Do **not** start a cleanup PR for looksLikeAppProfile / four-way fail-closed / magic sleeps / device tests / hydrate names unless a later feature already touches that file.

### Must-know before Harry skim (docs, not a merge blocker)

If the intern packet / public README is what Harry reads first:

1. **Package README still says `ok` is protocol success** and omits finalize-login / CH verify default / VWP. Root README recipe is right; the “What we shipped” list is not.
2. **`ok` after `--verify-with-profile` is not `claimOkProfile`.** Read the triad. Demo receipt (`demo/consistencyhub-receipt.json`) is the honest shape: `ok=true`, `claimOk=false`, `anonymousClaimSkipped`, `claimOkProfile=true`.
3. **`--verify` on ConsistencyHub is not the dogfood path.** It is anonymous verify. Dogfood is `--verify-with-profile` (or `--no-verify` for smoke).
4. **Ad-hoc auth URLs still default-verify** and will print `ok=false` on a live match. Use `--name consistencyhub` or `--no-verify` / `--verify-with-profile`.
5. **Console Save is still insufficient.** The code now warns. The capture step is finalize-login / `--sso --save-profile`. That matches the 2026-09-19 ops note.

A docs-only follow-up (README ×2, PITCH one sentence, SECURITY count) is enough for skim. Do not wait on it to move on.

---

## Suggested Grok-only fix order (if anything is touched later)

Not this PR. Do not merge login/profile/storage into one file.

1. **Docs skim (30 minutes, no product behavior):** package README `ok` / finalize-login / CH default / VWP; root README “What we shipped”; PITCH VWP “after anonymous”; SECURITY count; MCP await-login one sentence; stop flattening `verify=true` ≡ `verifyWithProfile` in AGENTS + `CHECK_DESCRIPTION`.
2. **Only if a CH/OneDrive agent still poisons `ok`:** extend `shouldVerifyCheck` to treat `profile===consistencyhub` (or auth-gated saved-check host) like `name===consistencyhub`. Add a test that ad-hoc CH URL + profile skips anonymous verify. Do not silently skip verify for every kebab profile.
3. **Only if VWP `ok` confuses reviewers:** fold `claimOkProfile === false` into overlay (`mismatch`) **or** keep schema v1 reasons and teach “read `claimOkProfile`.” Do not add a required key.
4. **P2 gate consolidation** when next touching record/fill: one `assertCheckOpts`; delete or generate the Zod superRefine clone; delete `looksLikeAppProfile`; pass origin into inspect-without-URL (CH origin or the probe URL).
5. **Device/QR unit tests only** if anyone extends the device table. Do not claim live Solari honors viewport.
6. **P3 sweep** last: unused exports, dotenv helper, two `runDir`s, trailing whitespace. Split `parseArgv` from `main` when `cli.ts` would exceed 600.

---

## Looks solid (do not “clean up”)

- Receipt schema v1 freeze + goldens.
- Excerpt fence + sanitize.
- Password fill dual check; desktop `--type` fail-closed; loopback refuse.
- Session ledger + reap; ProfileBusy; extract-zip override.
- `shouldVerifyAfterCheck` skip on `loggedOut` / `needsHuman` / `recordedLoggedIn`.
- Independent `assert_receipt.py` (PNG + fetch/OCR; skip-anonymous is a first-class flag + JSON field).
- `gotoWithSessionRestore` shared by live check and profile claim.
- Mobile honesty sentence.
- SSO never types; Microsoft + Google walls → `needsHuman`.
- Console-Save-is-insufficient sentence, now backed by a live warning on the CH await-login path.

---

## Method notes

- Checked out / fetched GitHub `main` at `ff156ad`. Compared to #37 tip `29d4312` and #38 body (`0978633`).
- Read `fail-closed.ts`, `contract.ts`, `check-reason.ts`, `agent-receipt.ts`, `check.ts` (`runCheck` / `runFinalizeLogin`), `sandbox.ts` (VWP close + profile claim + `checkThenVerify`), `mcp-tools.ts`, `cli.ts`, `profile-status.ts`, `profile-persist.ts`, `sso.ts`, `page-actions.ts`, `tool-schema.ts`, `launch-options.ts`, `http-url.ts`, `text.ts`, `device-emulation.ts`, `profiles.ts`, `receipt-schema.ts`, `assert_receipt.py`, both AGENTS files, SECURITY, READMEs, PITCH, RECEIPTS, DEMO, CI workflow, lockfile.
- Read the tests that pin the #38 claims: `fail-closed`, `mcp-check-verify`, `cli-help`, `agents-sync`, `any-host`, `mcp-schema`, `dist`, `profile-status`, `profile-persist`, `agent-receipt`, `lifecycle`, `receipt-schema`.
- Did not change product behavior. Did not run live Solari. Dogfood rows in this report are the founder’s 2026-09-19 AEST receipts, confirmed against the code paths those commands hit.
