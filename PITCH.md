# Auspex — agent web eyes that stay honest on auth-gated SaaS

**`ok` ≠ `claimOk` ≠ `claimOkProfile`.** Those three receipt booleans are not interchangeable. After `--verify-with-profile`, **`claimOkProfile` is the profile-reuse gate** — `ok` alone is not enough to treat the profile as reusable. We do **not** claim Alice-vs-Bob wrong-account detection — a seeded profile that is still the wrong Microsoft user can still match expect.

## The problem: agents lie about logged-in state

Agents scraping first-party SaaS repeatedly hit the same failure mode:
1. Scrape a page with Playwright/Puppeteer on the local machine
2. Return `ok: true` / "content extracted" when they see *any* HTML
3. Confuse the logged-out landing page with the logged-in dashboard
4. Never notice they're stuck on `/landing` or `/login` because the text *looks* like success

The agent thinks it's logged in. The human wastes hours debugging. The SaaS remains untouched.

**Root cause:** no independent verification. The same browser that fetched the page is the only source of truth.

## Why Solari (not local Playwright): isolation + SSO handoff + honest verification

**Throwaway cloud Chrome**
- Solari spins up a fresh Chrome instance in the cloud
- Agent drives it via CDP (same API as Playwright)
- Session is killed after every check — no state leakage across runs

**SSO handoff**
- Human signs into Microsoft/Google/etc in a Solari-hosted Chromium card
- Agent never handles passwords or OTP
- Phone `phone.html` is a seed/handoff door for off-site typing (native text field + Save paste), **not** a same-session VNC takeover. Solari’s remote view will not open a phone keyboard ([cookbook #80](https://github.com/solari-sdk/solari-cookbook/issues/80)). The Auspex field is the workaround. The agent never sees the password.
- Frozen agent door (not Handraise live-view takeover): mint `login --url` → human login in the door → human Save → `await-login --save-editor` → `finalize-login` (unique expect) → later `check` / optional `--verify-with-profile`. `ok` ≠ `claimOk` ≠ `claimOkProfile`. Fail-closed: `expectMatchedPublicLanding`, `hostChanged` remint, `stream-expired`. Five-minute skim: [docs/REVIEWER-5MIN.md](docs/REVIEWER-5MIN.md). See [AGENTS.md](AGENTS.md#frozen-agent-door-sequence). Solari `402`/`429`/`502` are not `loggedOut`/`needsHuman`.
- Cookies + sessionStorage saved to a named profile, reusable across checks

**Concurrency + reap**
- Multiple agents can run checks in parallel without stepping on each other
- Leaked sessions (429 errors) are reaped via `auspex_reap` — no manual console cleanup

## Mechanism: check → independent anonymous verify → optional profile-seeded recheck → kill

### 1. Check (live browser with profile)
```bash
npx auspex-solari check --profile app-example --expect "Workspace ready"
```
- Launch Solari browser WITH the saved profile (cookies + sessionStorage)
- Navigate to URL
- Screenshot + extract text
- `matched: true` if the expect hits on word boundaries (case-sensitive). `Dashboard` does not match `One Dashboard`. A hit on a public or landing URL during save is `reason: expectMatchedPublicLanding` (`matched` false, profile not saved)

### 2. Independent anonymous verify (optional, runs by default for public checks)
- Upload screenshot + manifest to a **fresh headless Solari sandbox** (no profile)
- Python script fetches the URL anonymously (no cookies) + runs OCR on screenshot
- `claimOk: true` only if expect found via **independent** fetch or OCR
- **Integrity check:** PNG must decode, URL not on IdP, etc.

**Key:** `ok` ≠ `claimOk` ≠ `claimOkProfile`. These are distinct signals:
- `matched: true` — live browser with profile saw the expect
- `claimOk: true` — anonymous sandbox also saw it (via fetch or OCR)
- Verify is **skipped** for auth-gated SaaS by default (e.g., ConsistencyHub)
- When verify runs and live matched but anonymous verify fails → `reason: mismatch`, `ok: false`
- When verify is skipped → `ok` depends only on `matched` + protocol success

### 3. Profile-seeded claim recheck (optional, additive)
```bash
npx auspex-solari check --profile app-example --expect "Workspace ready" --verify-with-profile
```
- **Skips** anonymous claim (integrity still runs: PNG decode, URL not leftover IdP). Production does **not** run anonymous fetch/OCR first.
- Launches a **second** Solari browser WITH the profile
- Navigate to `finalUrl` and check if expect is in page text
- Adds `claimOkProfile: true/false` to receipt (distinct from anonymous `claimOk`, which stays `false` + `anonymousClaimSkipped`)
- `ok` requires only integrity `verify.ok` when anonymous claim is skipped — **`claimOkProfile` is the reuse gate**; `ok` alone is not enough to treat the profile as reusable. Save is not sessionStorage. `--verify-with-profile` is refused on `weakSeed`, `emptySave`, and a dead fold.
- Use for auth-gated SaaS where anonymous fetch can't see the UI. `--verify` (anonymous) is **not** this path and will poison `ok`.

**Never:** overwrite `claimOk` silently. Both fields stay honest.

### 4. Kill
- Browser session released
- Sandbox VM killed
- No leftover state

## Worked example (dogfood): redacted auth-gated SaaS

Evidence that the generic `login --url` / `--profile <yours>` recipe works on a real Microsoft OAuth SPA. ConsistencyHub / OneDrive are **not** the default recipe.

**ConsistencyHub** is a Microsoft OAuth SPA that stores `accessToken` in sessionStorage. Cookies alone won't restore the session.

### The dogfood pain (before Auspex fixes)
1. Human completes Microsoft + OneDrive consent in Solari handoff → clicks **Save**
2. `await-login` reports `status: completed` (78 cookies, 5 origins) → looks good!
3. `check --name consistencyhub` → `reason: loggedOut`, lands on `/landing` → wtf?
4. Root cause: Solari console Save only persists cookies + localStorage, **not sessionStorage**

### The fix (after P0/P1 implementation)
1. Human completes Microsoft + OneDrive in handoff → clicks **Save** (78 cookies)
2. `await-login` → `status: completed` with a **Warning: no counted sessionStorage. Run finalize-login...**
3. Agent runs `finalize-login --profile consistencyhub` (unknown profiles need `--url` and `--expect`)
   - Agent clicks SSO, human completes any remaining IdP
   - Auspex captures cookies + localStorage + **sessionStorage** (slim, <1 MiB)
4. Later: `check --name consistencyhub` → `matched: true`, verify skipped by default (auth-gated)
5. Optional: `check --name consistencyhub --verify-with-profile` → emits `claimOkProfile: true` (profile-seeded claim verify passed; verified 2026-09-18 AEST after finalize-login sessionStorage fix PR #27)

### Never types passwords
- SSO is agent-initiated (clicks the button), human-completed (types password/OTP in handoff)
- `--fill` refuses `input[type=password]` selectors
- Microsoft/Google password/OTP walls → `needsHuman: true`, agent stops

## One-liner wedge

**Auspex = agent web-eyes that stay honest on auth-gated first-party SaaS.** Primitives are check / verify / desktop; login, finalize-login, profile-status, and reap are the auth + hygiene doors.

- **Check:** live browser with profile → `matched`
- **Verify:** anonymous sandbox fetch/OCR → `claimOk` (integrity + claim)
- **Optional:** profile-seeded browser recheck → `claimOkProfile`
- **Kill:** no leftover state

Schema v1 receipt is parseable JSON: `schemaVersion`, `ok`, `reason`, `url`, `expect`, `screenshotPath`, plus optional `verify` / `claimOkProfile`. CLI and MCP share the same contract. Exit 0 only when `ok` is true.

## Why it matters (beyond the $300k intern checklist)

Pinetree/Solari is a path into the AI field far beyond demo polish. Real agents need:
- Honest verification (not "I saw some HTML")
- Auth-gated SaaS access (not just public marketing pages)
- Reusable sessions without password leakage
- Fail-closed on IdP walls (never type OTP)

Auspex is the wedge: agents that can **repeatedly** check first-party SaaS dashboards, extract real data, and stay honest about what they saw — because the verification is independent, the profile is saved once and reused many times, and the receipt distinguishes `matched` from `claimOk` from `claimOkProfile`.

The thesis: **agents need honest eyes, not just scraping**.
