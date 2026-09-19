# Claude-era quality audit — 2026-09-19

**Auditor:** Grok (Cursor cloud agent). Audit only — no product code in this PR.  
**Tip:** `29d4312` (`Merge pull request #35`, 2026-09-19).  
**Scope:** `examples/auspex-ts` (`src/`, `tests/`, `AGENTS.md`, `SECURITY.md`, `package.json`) plus root `AGENTS.md` / `SECURITY.md` where they contradict the package. Compared login / profile / check / solari / text / device-emulation / qr-gen, and CLI vs MCP.  
**Window:** merged PRs **#19–#35** (login/SSO resilience → extract-zip override → mobile handoff). Closed unmerged #22/#36 ignored.

This is a CoS/founder cut list, not a rewrite plan. Rank is “what burns an agent or a Solari slot first,” not line-count.

---

## How to read the ranks

| Rank | Means |
|---|---|
| **P0** | Contract lie. Agents following AGENTS/MCP will do the wrong thing or spend a VM they were told not to. |
| **P1** | Advertised behavior is dead, dual-ok, or leaks a session. Fix before more features. |
| **P2** | Spaghetti, drive-by overbuild, missing tests. Safe to batch. |
| **P3** | Dead exports, copy-paste, stale counts. Sweep later. |

---

## PR map (#19–#35)

| PR | Title (short) | What landed | Debt smell |
|---|---|---|---|
| #19 | Login/SSO resilience P0s | Handoff hang guidance, retry rules | Docs-heavy; recipe started growing |
| #20 | P0+P1 caveats + profile-seeded claim + thesis | `claimOkProfile`, `--verify-with-profile` | New verify path + magic sleeps |
| #21 | `--verify-with-profile` = explicit verify for CH | CLI `verifyAfter` special-case | **MCP never got the same default** |
| #23–#24 | `claimOk` honesty when anonymous skipped | Overlay / `anonymousClaimSkipped` | Dual `ok` got harder |
| #26–#29, #32 | claimOkProfile / dogfood / operator docs | Date labels, “verified 2026-09-18” | Same paragraph patched 5 times in 3 files |
| #30–#31 | CH demo + desktop `--type` fail-closed | Redacted demo; password-like regex farm | Over-fitted keyword lists |
| #33 | Fence breakout, demo scrub, record+fill/click, origin check | Real security + a tautological allowlist | Triple-copied fail-closed |
| #34 | `@puppeteer/browsers` override | extract-zip gone from lock | **Looks solid** |
| #35 | Handoff packet, status enums, `--mobile`/`--device` | QR, `weakSeed`/`emptySave`, device table | Enum documented, then behavior reverted to pass tests; **no new unit tests** for QR/device |

Drive-by pattern: each agent added a type, a USAGE paragraph, an AGENTS paragraph, and a Zod description — then left the other door (CLI or MCP) or the live wiring half-done.

---

## P0 — contract lies

### P0-1. MCP `auspex_check` still verifies ConsistencyHub anonymously

**Docs** (root + package `AGENTS.md`, CLI `USAGE`, CLI tests): `--name consistencyhub` **defaults to `verify=false`**. Anonymous sandbox fetch cannot see the editor.

**CLI does that** (`examples/auspex-ts/src/cli.ts`):

```182:184:examples/auspex-ts/src/cli.ts
        if (name.trim().toLowerCase() === "consistencyhub" && !noVerify && !verifyFlag && !verifyWithProfile) {
          verifyAfter = false
        }
```

Covered by `tests/cli-help.test.ts` (`verifyAfter === false`).

**MCP does not** (`examples/auspex-ts/src/mcp-tools.ts`):

```75:82:examples/auspex-ts/src/mcp-tools.ts
        const { verify, name, ...rest } = merged
        const opts = { ...rest, url, expect, onProgress }
        // ...
        const shouldVerify = verify !== false
        if (shouldVerify) {
          const both = await checkThenVerify(opts)
```

`name=consistencyhub` with `verify` omitted → anonymous verify → `claimOk: false` → overlay `mismatch` → `ok: false`, plus a sandbox VM.

`CHECK_DESCRIPTION` in the same file still says “Verifies by default” and never mentions the CH skip. `AUSPEX_CONTRACT` maps `verify` only to `--no-verify`, not the CH default.

**Why it is P0:** the product thesis is “CLI and MCP are the same contract.” Agents using MCP (the intended door) will fail a logged-in CH check and burn concurrency. Introduced when #21 taught only `parseArgv`.

**Fix later:** one function `shouldVerifyCheck(opts)` used by CLI and MCP. Add an MCP test that `name=consistencyhub` without `verify` does not call `checkThenVerify`.

---

### P0-2. `auspex_finalize_login` is documented as a tool and is not a tool

Root `AGENTS.md` Tools list: `auspex_finalize_login` / `auspex finalize-login`. Package `AGENTS.md` same. README / RECEIPTS / DEMO / PITCH all teach the CH recipe through it.

**Reality:**

- CLI command exists (`cli.ts` `finalize-login` → `runCheck` with `sso` + `saveProfile`).
- `registerAuspexTools` never registers it.
- `AUSPEX_CONTRACT` / `tests/any-host.test.ts` **explicitly omit** `finalize-login` from the “one contract” list (`check`, `login`, `await-login`, … `reap`). The parity test would fail if someone added the CLI row without an MCP tool — so the agent left it out of the contract and kept it in AGENTS.

**Why it is P0:** an agent that follows AGENTS will call a missing MCP tool mid-login. The recipe is the only documented way to capture sessionStorage after console Save.

**Fix later:** register `auspex_finalize_login` **or** delete it from every Tools list and point at `check --profile … --sso --save-profile`. Update `AUSPEX_CONTRACT` either way. Do not leave a third story.

---

## P1 — advertised behavior dead, dual truths, session burns

### P1-1. `emptySave` is in the type and the docs; production never returns it

`ProfileStatusReason` includes `"emptySave"` (`profile-status.ts`). Root `AGENTS.md` and CLI `USAGE` say: missing/empty profile → `emptySave`.

PR **#35 body** (merged): *“Fixed `profileStatus` to return `loggedOut` (not `emptySave`) for missing/empty profiles.”*

Code + `tests/profile-status.test.ts` still assert `reason === "loggedOut"` for missing/empty. `emptySave` is an unused union member.

**Why it is P1:** #35 sold “machine-readable status enums.” Agents that branch on `emptySave` will never take that branch. Classic Claude: add enum → document → revert behavior to keep old tests green → forget the docs.

**Fix later:** either return `emptySave` and update tests, or delete the member and the AGENTS sentence.

---

### P1-2. Live `await-login` cannot emit the sessionStorage warning AGENTS promises

`waitForProfileSave` *can* warn when `inspect` returns `sessionStorage: 0` and origin is `https://consistencyhub.io`. Tested in `tests/profile-persist.test.ts` with a mock that **requires** that origin.

Production `liveAwaitLogin` drops the origin:

```272:280:examples/auspex-ts/src/profile-persist.ts
      deps: {
        list: async () => /* … */,
        inspect: (id) => inspectProfileSeed(solari, id),
      },
```

`inspectProfileSeed` only counts sessionStorage when `origin` is passed. No origin → `sessionStorage` stays `undefined` → `hasNoSessionStorage` is false → no warning.

AGENTS: *“Soft-warns if profile has cookies/origins but no sessionStorage.”* Dead on the live path. The mock test still passes.

**Fix later:** `inspect: (id, origin) => inspectProfileSeed(solari, id, origin)`. Add a test that the live adapter forwards origin.

---

### P1-3. Two different `ok` values for the same check

`runCheck` sets `CheckResult.ok` as **protocol** success (got a URL, PNG exists, not loggedOut/needsHuman/recordedLoggedIn). **Mismatch can be `ok: true`.** That object is written to `.auspex/runs/…/manifest.json`.

Stdout/MCP JSON goes through `toAgentReceipt` → `agentReceiptOk` (`check-reason.ts`): `ok` is false unless `reason === "matched"` (and verify, when it ran).

Agents that read the on-disk manifest (or teach “`ok` means the claim held”) will disagree with CLI exit / MCP receipt.

**Fix later:** write the agent receipt to `manifest.json`, or rename `CheckResult.ok` to `protocolOk` everywhere. Do not leave both named `ok`.

---

### P1-4. `--verify-with-profile` leaks a Solari client

```370:376:examples/auspex-ts/src/sandbox.ts
    if (verifyWithProfile && opts.profile) {
      if (!deps?.verify) {
        const solari = createClient()
        profileId = await resolveProfileId(solari, opts.profile)
      } else {
        profileId = opts.profile
      }
    }
```

Every other `createClient()` is in `try/finally` with `solari.close()`. This one is not. If the SDK starts a local proxy on construct, it leaks. #20/#21 era.

**Fix later:** resolve the id from the check client, or `try/finally close`.

---

### P1-5. `inspectProfileSeed` spends a browser session to count cookies

`inspectProfileSeed` → `solari.sessions.create({ profileId })` → read `storageState` → release.

Production `profileStatus` (no `inspectSeed` dep) does that **and then** `runCheck` (second session). One status probe can take two concurrency slots. After 429 the docs say “reap then retry,” but status itself can cause the 429.

#35 isolation fix (`6e66b45`) only injected `inspectSeed` in **unit** tests so CI would not hit live Solari. Production cost unchanged.

**Fix later:** if Solari can GET profile storage without `sessions.create`, use that. Otherwise document “status = 2 slots” and skip inspect when a live check will run anyway.

---

### P1-6. AGENTS copies have already drifted (same week)

| Fact | Root `AGENTS.md` | Package `examples/auspex-ts/AGENTS.md` |
|---|---|---|
| `--mobile` / `--device` on the CLI one-liner | yes | **missing** |
| `profile-status` `weakSeed` / `emptySave` | yes | tool blurb is only `loggedIn` / `loggedOut` / `needsHuman` |
| Handoff packet (`openOnPhone`, `oneLiner`, `qrPath`) | yes | login tool still says “Show `url`” |
| `finalize-login` as MCP tool | yes | yes (both wrong — see P0-2) |

MCP `LOGIN_DESCRIPTION` / `PROFILE_STATUS_DESCRIPTION` match the **package** (stale) copy. `tests/mcp-schema.test.ts` asserts `loggedIn\|loggedOut\|needsHuman` only — the incomplete description is test-blessed.

Root vs package is supposed to be the same contract for hosts that only open `examples/auspex-ts`.

**Fix later:** one source (root AGENTS or a generated snippet). Fail CI if the CLI one-liner, `USAGE`, and MCP descriptions disagree on command/flag names.

---

## P2 — spaghetti, overbuild, missing tests

### P2-1. Fail-closed record/fill rules live in four places

Same policy (record+profile, record+sso/saveProfile, CH refuse, fill/click+profile, fill+value pair):

1. `tool-schema.ts` `assertRecordProfileAllowed` / `assertRecordNotLoggedIn`
2. `auspexCheckInputSchema.superRefine` (tests only; MCP must not use it — `mcp-schema.test.ts` forbids it)
3. `page-actions.ts` `assertPageActionsAllowed` / `assertFillPair`
4. `launch-options.ts` `sessionCreateFromCheck` silently drops `recording` unless the URL is a public marketing host

CLI `parseArgv` calls (1)+(3); `runCheck` calls them again; MCP handler calls them again.

`superRefine` is **not** a full clone: it misses record+profile+allowRecordProfile+**fill/click** (present in `assertRecordProfileAllowed`). Tests that only `safeParse` the Zod schema can go green for a combo the runtime refuses.

#13/#14/#33 kept adding a layer instead of one gate.

**Fix later:** one `assertCheckOpts(opts)` module. Zod descriptions stay for ListTools. Delete the superRefine duplicate or generate it from the same table.

---

### P2-2. `looksLikeAppProfile` is a Claude heuristic

Duplicated in `profile-status.ts` and `profile-persist.ts`:

```ts
/^[a-z0-9]+(-[a-z0-9]+)*$/.test(profileLc) && profileLc.length > 3
```

Matches almost every real profile name (`ironadamant`, `other-profile`, `consistencyhub`). `tests/profile-persist.test.ts` still says *“does not warn for non-consistencyhub profiles”* — it only passes because the mock omits `sessionStorage: 0`. If inspect ever counts sessionStorage for all names, that test flips and every kebab profile becomes `weakSeed`.

**Fix later:** warn only for `consistencyhub` (or a saved-check flag `needsSessionStorage`). Delete the regex.

---

### P2-3. PR #35 shipped device + QR with zero unit tests

New files:

- `src/device-emulation.ts` (88 LOC, 5 hand-copied device blobs; `--mobile` is a sixth copy of iPhone 13 Pro)
- `src/qr-gen.ts` (18 LOC wrapper around `qrcode.toFile`)

No `tests/device-emulation.test.ts`, no `tests/qr-gen.test.ts`. `--device` is a free string in Zod; unknown names throw only inside `runCheck` / `parseDeviceOptions`. `listDevices()` is unused.

`pageForSession` (`solari.ts`) applies `contextOptions` **only when `contexts()[0]` is missing**. If Solari ever exposes a default context, `--mobile` / `--device` are silently dropped. Docs already say “best-effort / not verified against live Solari” — honest, and also untested even as a unit of option mapping.

**Fix later:** table-driven tests for `parseDeviceOptions`; reuse `DEVICES["iphone-13-pro"]` for `--mobile`; enum the device names in Zod; apply viewport on the page if context already exists, or fail closed.

---

### P2-4. Two run-directory stampers

`check.ts` `runDir()`: full ISO stamp (`replace /[:.]/g`).  
`paths.ts` `ensureRunDir()` (#35, for QR): same replace then `.slice(0, -5)` (drops millis/`Z`).

Login QR and check screenshots cannot share a run folder. `check.ts` still re-exports `packageRoot` from `paths.ts` but did not move `runDir()`.

**Fix later:** one `ensureRunDir()`.

---

### P2-5. Profile-seeded claim check is a second browser with magic sleeps

`defaultProfileClaimCheck` (`sandbox.ts`): new session, `goto`, networkidle, **`sleep(2000)`**, if text `< 50` chars **`sleep(3000)`** again. Uses `new AbortController().signal` that nothing aborts.

`CHECK_THEN_VERIFY_WORST_MS` (`budget.test.ts`) is `check + close + 90s verify`. Profile claim runs **inside** that 90s **after** sandbox assert (up to 60s). 45s goto + 20s idle + 5s sleeps can blow the host `tool_timeout_sec` that the budget test thinks is safe.

**Fix later:** reuse `runCheck` (or `gotoWithSessionRestore` + `extractPage`) with a shared timeout; delete the fixed sleeps.

---

### P2-6. `overlayVerifyReason` ignores `claimOkProfile`

When anonymous claim is skipped, reason stays `matched` if integrity `ok` — even if `claimOkProfile === false`. Documented for #24 honesty, but an agent that only reads `reason` will not see a failed profile claim.

**Fix later:** if `verifyWithProfile` and `claimOkProfile === false`, overlay `mismatch` (or a new optional reason; do not break schema v1 required set).

---

### P2-7. Docs and descriptions are a multiply-maintained novel

Surfaces that must stay aligned: root `AGENTS.md`, package `AGENTS.md`, `cli.ts` `USAGE` (~35 lines), `mcp-tools.ts` `*_DESCRIPTION` walls, `tool-schema.ts` FAIL-CLOSED essays, `README.md`, `PITCH.md`, `RECEIPTS.md`, `DEMO.md`, `SECURITY.md`.

#26/#28/#29/#32 were almost entirely “fix the last agent’s sentence.” `mcp-schema.test.ts` greps descriptions for `/FAIL-CLOSED/` and `/consistencyhub/` — that rewards **longer** copy, not a single contract table.

`fail-closed.ts` is only skip-verify / no-retry. The comment says “grep fail-closed across the codebase.” That is an index, not a module.

**Fix later:** contract table in `contract.ts` generates USAGE + MCP descriptions. AGENTS keeps policy, not a second CLI dump.

---

### P2-8. Desktop `--type` regex farm (#31)

`assertNotPasswordLikeText` (`desktop.ts`) is ~60 lines of OTP / keyword / complexity / `sk-` / `slr_` / `ghp_` / Slack patterns. Tests in `security-guards.test.ts` encode the farm. False positives are declared acceptable.

Fine as fail-closed. Smell: another agent will add “one more pattern” forever. Prefer: refuse if `--type` looks like a secret **or** length+entropy without spaces; keep vendor prefixes in one list.

---

### P2-9. `assert_receipt.py` origin allowlist (#33) is mostly a no-op

`validate_url_origin`: if origins differ, allow www-strip, then three lambdas that only fire when hosts are **already equal** (`ironadamant.com` → `ironadamant.com`, same for CH). Only useful extra is `checkpointprojects.com` → `www.checkpointprojects.com`.

`r.replace("www.", "")` also mutates `notwww.example.com`. Integrity can fail a legitimate IdP-return or marketing redirect that is not on the list.

**Fix later:** same-registrable-domain, or drop the tautologies and document “origin must match unless www.”

---

### P2-10. Hand-rolled YAML + sessionStorage-in-localStorage

`parseSavedChecksYaml` is a 4-space indent parser. Fine for three shipped checks; fragile if anyone adds a fourth key.

`SESSION_STORAGE_PREFIX = "__auspex_ss__:"` folded into Playwright `localStorage` because Solari save does not persist sessionStorage. Necessary hack; the hydrate path is now `installSessionStorageRestore` + `hydrateSessionStorage` + `hydrateSessionStorageSource` + `hydrateSessionStorageInMemory` + `foldSessionStorage`. Five names for one idea. #5/#27 made it work; later PRs did not consolidate.

---

### P2-11. Login result shape is duplicated

`LoginResult` still has top-level `url` / `handoffId` / `expiresAt` **and** `handoff: HandoffPacket`. CLI/MCP mutate `result.handoff.qrPath` after `loginInstructions` (which already accepts `qrPath` but callers pass nothing). Two ways to print the same URL.

---

## P3 — dead code and nits

- `listDevices()` — unused (`device-emulation.ts`).
- `asAgentJson()` — unused (`cli-json.ts`).
- `completeMicrosoftSso` — `@deprecated` wrapper (`sso.ts`).
- `asFiniteNumber` / `originStoreCounts` imported in `profile-status.ts` and unused.
- `.env` line parser copied in `solari.ts` `readSolariKeyFromFile` and `solari-mcp-gate.ts` `solariKeyReady`.
- `--mobile` duplicates `DEVICES["iphone-13-pro"]` instead of referencing it.
- `SECURITY.md` still says “232/235 pass”; #35 claimed 237. Counts rot.
- `qr-gen.ts` is an 18-line file for one `toFile` call (over-split).
- Trailing whitespace-only lines in `check.ts` / `profile-status.ts` / `profile-persist.ts` / `sandbox.ts` (empty-line-with-spaces).
- `device` in MCP schema is an unconstrained string; CLI does not validate at parse time.
- `HandoffPacket.openOnPhone` is a constant English sentence, not a capability.
- Python `host_is` / `auth_integrity_errors` duplicate TS `hostIs` / `stillOnAuth` (acceptable for the sandbox; note it when one side changes).

---

## Looks solid

These should **not** be “cleaned up” for sport. They are the product.

- **Receipt schema v1 frozen** — required key list, golden JSON under `tests/golden/receipt-v1/`, `parseReceiptV1` allows extra keys. Do not add required fields.
- **Excerpt fence + sanitize** (`text.ts`, #33) — `<<<AUSPEX_UNTRUSTED_PAGE_TEXT` / close marker stripped before fence. Right threat model.
- **Password fill** — selector deny-list **and** runtime `input.type === "password"` (`page-actions.ts`).
- **Loopback / metadata URL refuse** (`http-url.ts`) — IPv4-mapped IPv6, `127.1`, link-local. Real SSRF hygiene.
- **Session ledger + reap** — 429 story is implemented, not just documented.
- **extract-zip / #34** — `overrides["@puppeteer/browsers"] >= 3.2.2`; lock has `modern-tar`, **no** `extract-zip`; `npm audit --audit-level=high` → 0. Keep the override until Solari pins 3.x themselves.
- **Profile lock** (`ProfileBusy`) — concurrent `--save-profile` fail-closed.
- **Haystack match** — normalize whitespace once; CLI and `assert_receipt.py` agree on the idea.
- **`shouldVerifyAfterCheck`** — `loggedOut` / `needsHuman` / `recordedLoggedIn` skip the second VM. Correct.
- **Independent `assert_receipt.py`** — PNG decode + fetch/OCR; does not trust `manifest.ok`. Keep Python in the sandbox.
- **Mobile honesty** (#35) — “best-effort, not verified against live Solari” is the right sentence. Do not upgrade it to “works” without a live receipt.
- **SSO never types** — `describeAuthWall` / `needsHuman`; Microsoft + Google hosts. Directionally right even if picker CSS is brittle.
- **`gotoWithSessionRestore`** shared by live check and profile claim — the good part of #27.

---

## Suggested later cuts (not this PR)

Order if a Grok agent is allowed to touch code:

1. **P0-1 + P0-2** — one `shouldVerifyCheck`; either ship or un-document `finalize-login` on MCP; extend `AUSPEX_CONTRACT` + `any-host` test so this cannot regress.
2. **P1-1 + P1-2 + P1-6** — status enums match code; live inspect forwards origin; AGENTS/USAGE/MCP descriptions generated or CI-diffed.
3. **P1-3 + P1-4 + P1-5** — one `ok`; close the leaked client; stop double-session status.
4. **P2 gate consolidation** — single `assertCheckOpts`; delete Zod superRefine clone; `looksLikeAppProfile` out.
5. **P2-3 tests** — device/QR unit tests only; do not expand the device table until Solari is proven to honor viewport.
6. **P3 sweep** — unused exports, dotenv helper, SECURITY counts.

Do **not** merge login/profile/storage into one file. The split (persist / storage / status / lock) is readable. The problem is **policy copied across doors**, not folder count.

`cli.ts` is 530 LOC (near the 600 LOC house rule). Next feature will break it. Split `parseArgv` from `main` when touching P0, not before.

---

## Method notes

- Read every `examples/auspex-ts/src/*.ts` listed in the inventory (47 files, ~7k LOC) and the tests that pin CLI/MCP/CH verify/status.
- Compared `registerAuspexTools` vs `parseArgv` vs `AUSPEX_CONTRACT` vs both AGENTS files vs `USAGE`.
- Pulled GitHub PR metadata for #19–#35 (titles, merge dates, #35 body).
- Did not run live Solari checks. Did not change product code. `npm audit --audit-level=high` in `examples/auspex-ts` reported 0 (override holds).
