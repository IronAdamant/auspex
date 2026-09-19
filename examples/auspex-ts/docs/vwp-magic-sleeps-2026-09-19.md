# VWP magic sleeps / timeout honesty — 2026-09-19

**Auditor:** Grok (Cursor cloud agent). Small product fix + tests.  
**Tip read:** `6891564` (merge #41 memo) on `origin/main`. Code path after #40 `1e57185`.  
**Ask:** root-cause the verify-with-profile (VWP) 2s/3s sleeps; measure vs 90s / host 300s; rank options; ship a clean honesty fix if one exists. Overlay/mobile CDP keyboard bridge out of scope. Schema v1 required keys unchanged. Do not fold `claimOkProfile` into `ok`.

---

## Verdict

**Small fix shipped.** Honesty of timeout semantics, not a sleep-ms tune.

The 2s + optional 3s settles stay. They were never CI-flaky. The poison was the **90s race discarding integrity + `anonymousClaimSkipped`** when the second browser ran long, and the **`checkThenVerify` catch inventing an anonymous-claim miss**.

---

## 1. Full path

`checkThenVerify` → live `runCheck` → `verifyReceipt` (`raceWithTimeout(..., VERIFY_OVERALL_MS=90_000)`):

1. Sandbox create / upload / `python3` assert (`SANDBOX_ASSERT_TIMEOUT_MS=60_000`) / kill.
2. If VWP: `skipAnonymousClaim` so assert returns `claimOk=false` + `anonymousClaimSkipped`.
3. Then `defaultProfileClaimCheck` (second Solari Chrome):
   - `launchBrowser` (own signal before this PR).
   - `gotoWithSessionRestore` (45s goto; optional second 45s after sessionStorage hydrate).
   - optional `networkidle` 20s (swallowed).
   - **magic sleep 2s**, sample `innerText`.
   - if empty or `< 50` chars: **magic sleep 3s**, sample again.
   - `haystackMatches` → `claimOkProfile`.

`agentReceiptOk` / `overlayVerifyReason`:

| Signal | Writer | VWP (anonymous skipped) |
|---|---|---|
| `ok` | `agentReceiptOk` | `protocolOk` + `reason===matched` + **`verify.ok` only** |
| `claimOk` | `assert_receipt.py` | `false` + `anonymousClaimSkipped` |
| `claimOkProfile` | profile claim | **never read** by `ok` / reason overlay |

If `anonymousClaimSkipped` is **missing**, overlay treats `claimOk=false` + a `timeout` error as `reason: network`, and `ok` requires `verify.ok && claimOk`.

`raceWithTimeout` flips `cancelled` / aborts its controller and `Promise.race`s. Inner work is not cancelled. A 90s win used to **throw away** a finished assert result.

---

## 2. Budget

`CHECK_THEN_VERIFY_WORST_MS` = 120s check + 15s close + 90s verify = **225s** ≤ Grok `tool_timeout_sec` 300s. Host 300s is not the tight constraint. The 90s envelope is.

Worst-case **inside** 90s if profile claim is unbounded:

| Step | Cap |
|---|---|
| sandbox assert | 60s |
| create / upload / kill | unbounded except the 90s race |
| chromium.connect | 45s (`CHROMIUM_CONNECT_TIMEOUT_MS`) |
| goto (+ optional re-goto) | 45s or 90s |
| networkidle | 20s |
| sleeps | 2s + optional 3s |

After a 60s assert, ~29s remain (`90_000 - 60_000 - 750` buffer). Sleeps are 5s of that remainder. They become the pass/poison knife-edge only when work without sleeps is already just under the leftover: e.g. elapsed 70s, remaining 20s, launch+goto+idle 16s, +2s settle = 18s pass, +3s retry = 21s **outer race wins**.

Dogfood 2026-09-18 finished in time. Not CI-flaky (CI mocks `profileClaimCheck` / `verify`).

Hung `chromium.connect` is supposed to be 45s; if Solari ignores that timeout, a leaked second browser can sit until the host 300s tool timeout. `finally` still closes the client.

---

## 3. Options ranked

1. **Preserve timeout honesty (shipped).** After assert, bound profile claim to the remaining 90s (minus 750ms) and return integrity + `claimOkProfile=false` instead of throwing. On `checkThenVerify` catch (timeout before assert finishes), set `anonymousClaimSkipped` when VWP was requested so overlay stays `matched` and `ok` follows `verify.ok` (false). Pass the verify abort signal into the second browser; make the 2s/3s sleeps abortable. Does not fold `claimOkProfile` into `ok`. Does not launch when remaining ≤ 0.
2. **Replace sleeps with expect-text poll / selector / mutation.** Better settle, same envelope. Changes live timing; not needed to stop poison. Later, if someone already opens this file for SPA flake.
3. **Share abort only.** Stops leftover work after 90s but still discards the assert result unless (1) is done. Shipped as part of (1).
4. **Docs-only.** Would leave the catch lie (`reason: network` on a VWP envelope miss). Rejected; the code fix is small and tested.
5. **Fold `claimOkProfile` into `ok`.** Forbidden. Auth-gated SaaS cannot treat the second browser as live match or anonymous fetch.

---

## 4. What shipped

- `profileClaimBudgetMs` / `attachProfileClaim`: remaining-time bound + linked abort.
- `defaultProfileClaimCheck` uses caller `signal`; `abortableSleep` for the same 2s/3s.
- `checkThenVerify` catch: VWP → `anonymousClaimSkipped` + `claimOkProfile=false`; persist manifest.
- Tests: budget math, abortable sleep / link, hung claim keeps integrity, skip when remainder gone, signal wiring, VWP vs non-VWP catch overlay.
- AGENTS (root + package): one sentence on VWP timeout honesty.

Sleep milliseconds unchanged. Fail-closed untouched. Schema v1 required keys unchanged.

---

## Residuals (not this PR)

- Replace 2s/3s with an expect-text poll if live CH starts missing late SPA text.
- Hung connect that ignores Playwright’s 45s timeout (host 300s residual).
- Never fold `claimOkProfile` into `ok`.
