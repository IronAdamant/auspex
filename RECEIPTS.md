# Public Receipts

Committed demo evidence from the Auspex check → verify → teardown workflow.

**Why this matters ([PITCH.md](PITCH.md)):** Agents need honest eyes on auth-gated SaaS, not just public marketing pages. Auspex verifies claims independently (`ok` ≠ `claimOk` ≠ `claimOkProfile`) and never types passwords.

## Understanding Verification Signals

Three distinct booleans in the receipt, each telling you something different:

- **`ok`** — Agent success: did the live browser match **and** did verify pass (when it ran)?
- **`verify.claimOk`** — Anonymous sandbox claim: did an unauthenticated HTTP fetch + OCR see the expect string?
- **`verify.claimOkProfile`** — Profile-seeded sandbox claim: did a second Solari browser with the profile see the expect string in page text?

**For public marketing pages:** `ok=true` requires `claimOk=true` (anonymous verify is the right signal).

**For auth-gated SaaS:** Anonymous verify cannot see logged-in UI. Either skip verify entirely (`--no-verify`), or use `--verify-with-profile` to get `claimOkProfile` as the right signal. Ad-hoc auth URLs with default verify → `ok=false` even when the live check matched (anonymous fetch fails).

## Verified Dogfood (2026-09-18 AEST)

After PR #27 (gotoWithSessionRestore) + ConsistencyHub profile reseed v20:

### ConsistencyHub
```bash
npx auspex check --name consistencyhub --verify-with-profile
```
**Result:** ✅ `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`**

### OneDrive (Same Microsoft Profile)
```bash
npx auspex check https://onedrive.live.com/ --expect "My files" \
  --profile consistencyhub --verify-with-profile
```
**Result:** ✅ `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`**  
**Live page title:** "Home - OneDrive"

**Key insight:** The ConsistencyHub profile seed (Microsoft cookies + sessionStorage) works for both ConsistencyHub and OneDrive. Profile-seeded verification sees the logged-in content that anonymous fetch cannot.

## ConsistencyHub (Auth-Gated SaaS Golden Path)

**Problem:** Console Save alone is insufficient for Microsoft OAuth SPAs like ConsistencyHub. Cookies without sessionStorage → lands on `/landing`.

**Golden path:**
```bash
# 1. Human SSO in handoff → Save
npx auspex login --profile consistencyhub

# 2. Wait for Save (warns if no sessionStorage)
npx auspex await-login --profile consistencyhub

# 3. Agent captures sessionStorage
npx auspex finalize-login --profile consistencyhub

# 4. Later: reuse profile (verify skipped by default for auth-gated)
npx auspex check --name consistencyhub

# 5. Optional: profile-seeded claim recheck
npx auspex check --name consistencyhub --verify-with-profile
```

**Why finalize-login?** It runs SSO + `--save-profile` in one step to capture sessionStorage. Console Save alone does not persist sessionStorage, which is required for Microsoft OAuth SPAs.

**Verified outcome:** After reseed v20, `check --name consistencyhub --verify-with-profile` → `ok=true`, `claimOkProfile=true`.

## OneDrive (Microsoft Cookie Reuse Recipe)

**Use case:** Check OneDrive (verified) or other Microsoft hosts that accept the same cookie seed, using the ConsistencyHub profile.

**Smoke test (skip verify):**
```bash
npx auspex check https://onedrive.live.com/ --expect "My files" \
  --profile consistencyhub --no-verify
```
**Result:** `ok=true`, `reason=matched` — browser sees logged-in UI, no verify ran.

**Claim verification (profile-seeded):**
```bash
npx auspex check https://onedrive.live.com/ --expect "My files" \
  --profile consistencyhub --verify-with-profile
```
**Result:** `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`** — sandbox reuses profile cookies, sees logged-in UI.

**⚠️ Gotcha:** Ad-hoc auth URLs with **default verify** (no flag) run **anonymous** verify. Live check matches, but `ok=false` because anonymous fetch/OCR cannot see the logged-in page. Named `consistencyhub` defaults verify off; positional OneDrive URL does not. Either use `--no-verify` for smoke tests or `--verify-with-profile` for claim verification.

## Ironadamant.com Check (Public Marketing)

**Claim:** "One office job." appears on [ironadamant.com](https://ironadamant.com)

**Saved check:** `npx auspex check --name ironadamant`

**Demo artifacts (committed from 2026-09-19 AEST re-seed):**

- **[Screenshot](examples/auspex-ts/demo/ironadamant.png)** — PNG from cloud Chrome (337 KB)
- **[Receipt JSON](examples/auspex-ts/demo/receipt.json)** — Marketing summary with `sessionId` and verify flags
- **[Replay HTML](examples/auspex-ts/demo/replay.html)** — rrweb recording ([view via jsDelivr](https://cdn.jsdelivr.net/gh/IronAdamant/auspex@main/examples/auspex-ts/demo/replay.html))
- **[Replay NDJSON](examples/auspex-ts/demo/replay.ndjson)** — Raw recording data ([view via jsDelivr](https://cdn.jsdelivr.net/gh/IronAdamant/auspex@main/examples/auspex-ts/demo/replay.ndjson))

**Result:** ✅ Claim matched. Sandbox verify passed (`claimOk=true`, `verifyOk=true`).

**Public marketing pages** use anonymous verify by default — the right signal because no auth is needed.

## Important Notes

### Marketing Summary vs. Schema v1

The committed `demo/receipt.json` is a **public marketing summary** that includes:
- `sessionId` for Solari console replay lookup
- Verify outcome flags (`claimOk`, `verifyOk`)
- Human-readable note about replay URLs

**This is NOT the schema v1 CLI/MCP stdout contract.** Agents receive a different, parseable receipt on stdout when they call `auspex_check` or use the MCP tool.

### Schema v1 Receipt (Agent Contract)

The actual agent contract is **[Receipt schema v1](AGENTS.md#receipt-schema-v1-frozen)** in AGENTS.md.

**Required fields:**
- `schemaVersion` (frozen at `1`)
- `ok` (boolean)
- `reason` (`matched` / `loggedOut` / `needsHuman` / `mismatch` / `network` / `recordedLoggedIn`)
- `url`
- `expect`
- `screenshotPath`

**Optional fields:** `title`, `finalUrl`, `matched`, `excerpt`, `sessionId`, `networkIdle`, `replayReady`, `waitedFor`, `filled`, `clicked`, `needsHuman`, `diff`, `verify`, `profileSeed`, `profileSaved`

For golden examples of actual schema v1 receipts, see the committed receipts in `examples/auspex-ts/tests/golden/receipt-v1/` or run `npx auspex check --name ironadamant` yourself.

## Replay Access

**Console Replay:** View in [Solari console](https://console.getsolari.com) → Sessions → search for the `sessionId` → Replay tab.

**Presigned URLs:** Auspex does not return or commit presigned replay URLs. Use the console or open the HTML file locally.

## Verification Deep Dive

Auspex defaults to **anonymous sandbox verification** (`--verify` is default, not `--no-verify`). Here's how it works:

1. Re-fetches the target URL via HTTP (no cookies/auth)
2. OCRs the committed PNG
3. Confirms the expect string appears in both
4. Writes `verify.claimOk: true` and `verify.ok: true`
5. Tears down the VM

This is **claim verification**, not just echo — the sandbox independently checks the expect string against live HTTP and OCR, rather than parroting the browser session's `matched` value.

### Anonymous vs. Profile-Seeded Verify

**Anonymous verify** (default): Works for public pages. Fails for auth-gated SaaS (fetch sees login page, not logged-in UI).

**Profile-seeded verify** (`--verify-with-profile`): Launches a second Solari browser with the profile seed and extracts page text to verify the expect string. Returns `verify.claimOkProfile` (anonymous claim is skipped). Use for auth-gated SaaS.

**No verify** (`--no-verify`): Skip verification entirely. Smoke test only — trust the live browser, no sandbox claim check.

## Running It Yourself

```bash
git clone https://github.com/IronAdamant/auspex.git
cd auspex
npm install
export SOLARI_API_KEY=slr_live_...   # grab one at console.getsolari.com
npx auspex check --name ironadamant
```

The saved check is configured for ironadamant.com with the expect string "One office job." — no URL or flags needed.

## Weekly GitHub Actions Checks

The [`public` job](https://github.com/IronAdamant/auspex/actions/workflows/auspex-ts.yml) in GitHub Actions runs weekly (Mondays + `workflow_dispatch`) to verify the saved checks still work against live sites. **The workflow does not commit artifacts** — it only runs the checks to ensure they pass. The demo PNG/receipt/replay files in this repo are manually committed when refreshed.
