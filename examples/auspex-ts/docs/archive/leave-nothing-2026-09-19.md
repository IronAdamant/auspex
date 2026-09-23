# Leave-nothing honesty pass — 2026-09-19

Exhaustive re-read of every listed surface on `main` tip `ff156ad` (post-#38), then docs/contract/description fixes plus a narrow fail-soft. Schema v1 required keys unchanged. Fail-closed not weakened.

## What was checked

| Surface | Verdict |
|---|---|
| `src/fail-closed.ts` `shouldVerifyCheck` | **Fixed.** Was name-keyed only. Now also skips anonymous verify for `profile=consistencyhub` and profile + consistencyhub.io / onedrive.live.com. Public marketing still verifies. |
| `src/cli.ts` USAGE + `parseArgv` | **Fixed.** Flattened `--verify` ≡ `--verify-with-profile`; omitted desktop `--type` fail-closed; did not pass `profile`/`url` into `shouldVerifyCheck`. |
| `src/mcp-tools.ts` descriptions + `executeAuspexCheck` | **Fixed.** Same flatten; await-login omitted sessionStorage warn; desktop omitted `--type`; did not pass `profile`/`url`. |
| `src/tool-schema.ts` `verify` / `verifyWithProfile` | **Fixed.** Flattened; VWP described as “instead of claimOk” / “uploads to sandbox”. |
| `src/contract.ts` | **Noted.** `verify` JSON still maps to `--no-verify` (USAGE also has `--verify`). Comment added. Not a runtime lie. |
| `src/check-reason.ts` / `agent-receipt.ts` | **Clean.** One `ok` (agent success); `protocolOk` optional; VWP fold-gap documented (`ok` ≠ `claimOkProfile`). |
| `src/check.ts` `runFinalizeLogin` | **Clean.** Defaults to CH URL/expect; same function as `--sso --save-profile`. |
| `src/sandbox.ts` VWP | **Clean (deferred).** Client closed in try/finally. Magic sleeps / second browser / `ok` does not fold `claimOkProfile` — documented, not rewritten. |
| `src/profile-status.ts` / `profile-persist.ts` | **Clean (deferred).** `emptySave` live; CH await-login forwards origin. `looksLikeAppProfile` + inspect-without-URL still origin-gated — deferred. |
| `src/page-actions.ts` / `desktop.ts` / `text.ts` / `http-url.ts` | **Clean.** Password fill dual check; desktop `--type` refuse; excerpt fence sanitize; loopback refuse. |
| `src/launch-options.ts` / `tool-schema.ts` record gates | **Clean (deferred).** Four fail-closed copies still exist; Zod superRefine still misses record+allow+fill/click. Runtime holds. |
| `src/device-emulation.ts` / `qr-gen.ts` | **Clean (deferred).** Zero unit tests; `--mobile` duplicates iPhone 13 Pro; docs already say best-effort. |
| `src/saved-checks.ts` / `auspex.yml` | **Clean.** Three saved checks; CH is profile-only. |
| `src/assert_receipt.py` | **Clean (deferred).** Independent PNG + fetch/OCR; `--skip-anonymous-claim` first-class. Origin allowlist still tautological except checkpoint `www`. |
| Remaining `src/*.ts` (receipt, solari, sso, reap, profiles, lock, storage, content, png-fit, timeout, tui, banner, progress, errors, ledger, replay, paths, schema-version, stdio, mcp, solari-mcp-gate, cli-json, receipt-diff/pack/schema) | **Clean** for honesty/contract. No new runtime lies. |
| `tests/**` | **Extended.** Honesty gates + ad-hoc auth skip. Existing #38 gates kept. |
| `scripts/public-check.ts` | **Clean.** Public marketing only; no CH profile. Uses `runCheck` (live, no sandbox) — weekly smoke, not the agent door. |
| `scripts/save-demo-receipt.ts` | **Fixed.** Would have written a live `sessionId` into the public demo receipt. Now always writes the synthetic placeholder. |
| `demo/receipt.json` / `consistencyhub-receipt.json` | **Clean.** Synthetic / omitted live ids. CH demo triad honest. |
| Package `README.md` | **Fixed.** Taught pre-#38 `ok` = protocol; omitted finalize / VWP / CH default / mobile-device; duplicate Claude Desktop; thin MCP list. |
| Root `README.md` shipped list | **Fixed.** Behind the recipe: no finalize, no CH skip, no `weakSeed`/`emptySave`, flattened triad. |
| `PITCH.md` | **Fixed.** “After anonymous verify” for VWP. |
| `SECURITY.md` | **Fixed.** Rotting `232/235` count. Override story still true. |
| `RECEIPTS.md` / `DEMO.md` | **Fixed.** RECEIPTS default-verify sentence + OneDrive gotcha; DEMO taught `verify` after a default public check. |
| Root + package `AGENTS.md` | **Fixed.** Flattened `verify=true` ≡ VWP; package desktop omitted `--type`; root `profileSeed` omitted `sessionStorage`. |
| `.cursor/rules/auspex.mdc` | **Fixed.** Same skim lies as the old shipped list. |
| `AUSPEX_CONTRACT` / USAGE / MCP schema | **Fixed** descriptions. Contract field table unchanged (v1). |
| `dist/mcp.mjs` | **Rebuilt** after src changes. |
| CI `.github/workflows/auspex-ts.yml` | **Clean.** test + tsc + build:mcp + dist diff; public job is live smoke. |
| `package.json` / lock | **Clean.** `@puppeteer/browsers` override; no `extract-zip` in the lock. |
| MCP examples / grok toml / `.env.example` | **Clean.** No contract lies. |

## What was fixed (map → files)

| Fix | Files |
|---|---|
| `ok` is agent success (not protocol) | `examples/auspex-ts/README.md` |
| Finalize-login / VWP / CH default / mobile-device / MCP list / status enums | `examples/auspex-ts/README.md`, `README.md` |
| VWP does not run after anonymous claim | `PITCH.md` |
| SECURITY count no longer hard-coded | `examples/auspex-ts/SECURITY.md` |
| `verify=true` ≠ `verifyWithProfile` | `AGENTS.md`, `examples/auspex-ts/AGENTS.md`, `src/cli.ts` USAGE, `src/mcp-tools.ts` `CHECK_DESCRIPTION`, `src/tool-schema.ts` |
| Desktop `--type` fail-closed on every agent door | package `AGENTS.md`, USAGE, `DESKTOP_DESCRIPTION`, root shipped list, cursor rule |
| Await-login MCP blurb names sessionStorage / finalize-login | `src/mcp-tools.ts` |
| `profileSeed` documents `sessionStorage?` | root `AGENTS.md` |
| Cursor rule matches #38 + this fail-soft | `.cursor/rules/auspex.mdc` |
| RECEIPTS / DEMO default-verify honesty | `RECEIPTS.md`, `examples/auspex-ts/DEMO.md` |
| Duplicate Claude Desktop paragraph | package `README.md` |
| Ad-hoc auth-host fail-soft (tested) | `src/fail-closed.ts`, `src/cli.ts`, `src/mcp-tools.ts` |
| Demo refresh no longer commits a live `sessionId` | `scripts/save-demo-receipt.ts`, `tests/demo.test.ts` |
| Regression needles | `tests/agents-sync.test.ts`, `tests/fail-closed.test.ts`, `tests/cli-help.test.ts`, `tests/mcp-check-verify.test.ts`, `tests/mcp-schema.test.ts`, `tests/dist.test.ts` |

## Security residuals (re-confirmed true)

- Excerpt fence sanitize before early return (`text.ts`)
- Password fill: selector deny-list **and** runtime `input.type === "password"`
- Desktop `--type` refuse (OTP / keyword / complexity / vendor prefixes)
- `extract-zip` absent from lock; `@puppeteer/browsers` override holds
- Demo `sessionId` scrub (now also in the refresh script)
- Record + profile / CH refuse / SSO / saveProfile / dashboard landing (runtime)

## What remains deferred (not this PR)

Do not start a cleanup PR for these unless a later feature already touches the file.

- `looksLikeAppProfile` kebab heuristic (two copies)
- Four fail-closed copies (tool-schema runtime + Zod superRefine + page-actions + launch-options). Zod still misses record+allow+fill/click.
- VWP magic sleeps / second browser / `CHECK_THEN_VERIFY_WORST_MS` budget
- `ok` does not fold `claimOkProfile === false` (documented: read the triad)
- Inspect-without-URL cannot count sessionStorage (CH live path is fine)
- Device/QR unit tests; `--mobile` duplicates `iphone-13-pro`; `listDevices()` unused
- `assert_receipt.py` origin allowlist tautology / `www.` replace
- SessionStorage hydrate naming soup; two `runDir` stampers; unused `asAgentJson` / `completeMicrosoftSso`
- `AUSPEX_CONTRACT` maps `verify` → `--no-verify` only (USAGE has both)
- `finalize-login` always defaults URL/expect to ConsistencyHub (documented)

## Tests

`npm test` must be green. Dist rebuilt (`npm run build:mcp`). No secrets / `.auspex/` committed.
