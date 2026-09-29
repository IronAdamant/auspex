# Public Receipts

Committed demo evidence from the Auspex check → verify → teardown workflow.

**Why this matters:** Agents need honest eyes on auth-gated SaaS, not just public marketing pages. Auspex verifies claims independently (`ok` ≠ `claimOk` ≠ `claimOkProfile`) and never types passwords. The **default recipe** is `login --url <https>` (derives `--profile` from the host; override `--profile <yours>`) plus *their* URL and expect. ConsistencyHub / OneDrive below are a **worked example (dogfood)** — evidence that auth-gated verify works, not the recipe a stranger should copy for their own host. Eight more receipt-only files are from the live test on 2026-09-28 (Appwrite, Supabase, AWS, Cloudflare + Clerk, Postgres, MySQL, MongoDB / Parse, and ConsistencyHub on Microsoft MSAL). All eight passed: `ok=true` and **`claimOkProfile=true`**. The earlier Lorari receipt (2026-09-27, `ok=false` with `claimOkProfile` true) is superseded by a clean pass.

## Default recipe (any host)

```bash
npx auspex profile-status --profile app-example --url https://app.example --expect "Workspace ready"
npx auspex login --url https://app.example
# derives --profile app-example; override with --profile <yours>
npx auspex await-login --profile app-example --save-editor
npx auspex finalize-login --profile app-example --url https://app.example --expect "Workspace ready"
npx auspex check --profile app-example --url https://app.example --expect "Workspace ready"
# optional: --verify-with-profile — read claimOkProfile; do not fold it into ok
```

Do not invent that any host works without dogfood. The generic path is the recipe; the named check below is the verified example. Expect must be unique to the logged-in app and absent from public marketing copy. `Dashboard` does not match the capitalized phrase `One Dashboard` (Socialaize-style). A text hit on a public or landing URL during finalize is `expectMatchedPublicLanding` (`ok` false, `matched` false, profile not saved).

## Understanding Verification Signals

Three distinct booleans in the receipt, each telling you something different:

- **`ok`** — Agent success: did the live browser match **and** did verify pass (when it ran)?
- **`verify.claimOk`** — Anonymous sandbox claim: did an unauthenticated HTTP fetch of the page text see the expect string? (OCR of the screenshot is added only where Tesseract is installed; Solari's base sandbox does not have it.)
- **`verify.claimOkProfile`** — Profile-seeded sandbox claim: did a second Solari browser with the profile see the expect string in page text?

**For public marketing pages:** `ok=true` requires `claimOk=true` (anonymous verify is the right signal).

**For auth-gated SaaS:** Anonymous verify cannot see logged-in UI. Either skip verify entirely (`--no-verify`), or use `--verify-with-profile` to get `claimOkProfile` — that field is the reuse gate; `ok` alone is not enough to treat the profile as reusable. `name=consistencyhub`, `profile=consistencyhub`, or any attached profile on a non-public-marketing URL skip anonymous verify by default. Public marketing still verifies even with a leftover profile. No profile still verifies. `--verify` on auth-gated paths is still anonymous.

## Worked example (dogfood)

Verified 2026-09-18 AEST after PR #27 (gotoWithSessionRestore) + ConsistencyHub profile reseed v20. Committed redacted demo artifacts from 2026-09-19 AEST re-seed. This named check is evidence — not the default recipe.

### ConsistencyHub
```bash
npx auspex check --name consistencyhub --verify-with-profile
```
**Result:** ✅ `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`**

### Dual pack (same Microsoft seed)
Published redacted receipts — evidence, not the default recipe. Strangers still use `login --url <https>` plus *their* URL and expect.

#### Two truths

The artifact table is **Truth A** only. It does not mean Save always yields a reusable login. `ok` ≠ `claimOk` ≠ `claimOkProfile`.

**Skim:** the app on the remote screen is not a reusable saved login. An IdP sign-in, especially MSAL, can show the app while Save stores only Microsoft or Google cookies (`idp-only-save`, kind `app-visible`). Do not finalize. That stop is honest. Login worked. Strangers: `login --url https://…` (profile from the host), Save, `await-login --save-editor`, and finalize only when the jar is the app session. ConsistencyHub and OneDrive below are receipts, not that path.

| | What you see | What to do |
| --- | --- | --- |
| **Truth A — finished seed** | Finalize captured the app session. The ConsistencyHub blur + receipt and the OneDrive receipt-only pack both show `claimOkProfile` true. | A later `--verify-with-profile` can reuse that seed. Evidence, not the default recipe. |
| **Truth B — picture is not the jar** | `editorSave` returned 200. The live host is already the app. The jar is still IdP-only: Microsoft or Google sign-in cookies, in-tab session storage 0. Status `idp-only-save`, kind `app-visible`. | Do not finalize. Solari handoff Save stores cookies and local storage. It cannot read the in-tab session token. That is not Auspex broken, and it is not a reason to mint again to finish Microsoft. That receipt has no next step. |

`sign-in-wall` is still on the Microsoft or Google page. Finish that sign-in, land on the app, then Save. That one mints again. If the jar already includes the app host and Save could not refresh in-tab session storage, finalize now. That case is not Truth B.

The first two rows are the Microsoft pair from 2026-09-18. The next eight are the 2026-09-28 live test, receipt-only, with no screenshot. They are evidence, not the default recipe.

| Host | Artifact | Triad |
| --- | --- | --- |
| ConsistencyHub | [receipt](examples/auspex-ts/demo/consistencyhub-receipt.json) + [blurred PNG](examples/auspex-ts/demo/consistencyhub.png) | `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`** |
| OneDrive | [receipt-only](examples/auspex-ts/demo/onedrive-receipt.json) — **no raw PNG** (PII) | `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`** |
| Lorari (Appwrite) | [receipt-only](examples/auspex-ts/demo/lorari-receipt.json) — **no PNG** | `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`** |
| Good Tape (Supabase) | [receipt-only](examples/auspex-ts/demo/goodtape-receipt.json) — **no PNG** | `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`** |
| Clozemaster (AWS) | [receipt-only](examples/auspex-ts/demo/clozemaster-receipt.json) — **no PNG** | `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`** |
| tldraw (Cloudflare + Clerk) | [receipt-only](examples/auspex-ts/demo/tldraw-receipt.json) — **no PNG** | `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`** |
| Chatwoot (Postgres) | [receipt-only](examples/auspex-ts/demo/chatwoot-receipt.json) — **no PNG** | `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`** |
| MariaDB Cloud (MySQL) | [receipt-only](examples/auspex-ts/demo/mariadb-receipt.json) — **no PNG** | `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`** |
| Back4App (MongoDB / Parse) | [receipt-only](examples/auspex-ts/demo/back4app-receipt.json) — **no PNG** | `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`** |
| ConsistencyHub (Microsoft MSAL, 2026-09-28) | [receipt-only](examples/auspex-ts/demo/consistencyhub-msal-receipt.json) — **no PNG** | `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`** after finalize-login |
| hostChanged remint | [golden](examples/auspex-ts/demo/host-changed-receipt.json) — synthetic hosts | `ok=false`, `reason=hostChanged`, `nextCall` remints `auspex_login` |

Pack manifest: [`examples/auspex-ts/demo/dogfood-pack.json`](examples/auspex-ts/demo/dogfood-pack.json). Optional silent mint sample (redacted, no tokens): [`login-trace-sample.jsonl`](examples/auspex-ts/demo/login-trace-sample.jsonl).

```bash
npx auspex check https://onedrive.live.com/ --expect "My files" \
  --profile consistencyhub --verify-with-profile
```

**Key insight:** The same Microsoft profile seed can `claimOkProfile` on ConsistencyHub and on OneDrive. That is worked evidence, not a recipe to copy for a new host. The 2026-09-28 live test adds eight separate sign-ins across eight stacks, all with `ok=true` and `claimOkProfile=true`. Profile-seeded verification is meant to see logged-in content that anonymous fetch cannot. Do not fold `claimOkProfile` into `ok`.

## ConsistencyHub (optional named recipe)

**Problem:** Console Save alone is insufficient for Microsoft OAuth SPAs like ConsistencyHub. Cookies without sessionStorage → lands on `/landing`.

**Golden path:**
```bash
# 1. Human SSO in handoff → Save
npx auspex login --profile consistencyhub

# 2. Wait for Save (warns if no sessionStorage)
npx auspex await-login --profile consistencyhub --save-editor

# 3. Agent captures sessionStorage
npx auspex finalize-login --profile consistencyhub

# 4. Later: reuse profile (verify skipped by default for auth-gated)
npx auspex check --name consistencyhub

# 5. Optional: profile-seeded claim recheck
npx auspex check --name consistencyhub --verify-with-profile
```

**Why finalize-login?** It runs SSO + `--save-profile` in one step to capture sessionStorage. Console Save alone does not persist sessionStorage, which is required for Microsoft OAuth SPAs.

**Verified outcome:** After reseed v20, `check --name consistencyhub --verify-with-profile` → `ok=true`, `claimOkProfile=true`.

## OneDrive (Microsoft cookie reuse — evidence)

**Use case:** Check OneDrive or other Microsoft hosts that accept the same cookie seed, using the ConsistencyHub profile. Published **receipt-only** redacted schema-v1 receipt: [`demo/onedrive-receipt.json`](examples/auspex-ts/demo/onedrive-receipt.json). **No raw OneDrive PNG** (account identity / file names / storage amounts stay off the public repo). Still evidence, not the default recipe.

**Smoke test (skip verify):**
```bash
npx auspex check https://onedrive.live.com/ --expect "My files" \
  --profile consistencyhub --no-verify
```

**Claim verification (profile-seeded):**
```bash
npx auspex check https://onedrive.live.com/ --expect "My files" \
  --profile consistencyhub --verify-with-profile
```

**⚠️ Gotcha:** `--verify` on an auth-gated URL still runs **anonymous** verify and will print `ok=false` on a live match. Named `consistencyhub`, `profile=consistencyhub`, and any attached profile on a non-public-marketing URL now **skip** anonymous verify by default. Public marketing still verifies even with a leftover profile. No profile still verifies. Use `--no-verify` for smoke tests or `--verify-with-profile` for claim verification — not `--verify`.

## Ironadamant.com Check (Public Marketing)

**Claim:** "One office job." appears on [ironadamant.com](https://ironadamant.com)

**Saved check:** `npx auspex check --name ironadamant`

**Demo artifacts (committed):**

- **[Screenshot](examples/auspex-ts/demo/ironadamant.png)** — PNG from cloud Chrome (337 KB)
- **[Schema v1 receipt](examples/auspex-ts/demo/ironadamant-receipt.json)** — Frozen agent contract (`parseReceiptV1`). Synthetic `sessionId`. No `replayUrl`.
- **[Marketing summary](examples/auspex-ts/demo/receipt.json)** — Human-oriented JSON with `sessionId` and verify flags; **not** schema v1
- **[Replay HTML stub](examples/auspex-ts/demo/replay.html)** — committed stub; generate the rrweb player with `npm run generate:replay` from `replay.ndjson` (emails and passwords stripped). Pages serves the player at [ironadamant.com/auspex/demo/replay.html](https://ironadamant.com/auspex/demo/replay.html)
- **[Replay NDJSON](examples/auspex-ts/demo/replay.ndjson)** — Raw recording data ([view via jsDelivr](https://cdn.jsdelivr.net/gh/IronAdamant/auspex@main/examples/auspex-ts/demo/replay.ndjson))

**Result:** ✅ Claim matched. Sandbox verify passed (`claimOk=true`, `verifyOk=true`).

**Public marketing pages** use anonymous verify by default — the right signal because no auth is needed.

## Redacted auth-gated SaaS demo (ConsistencyHub path)

**Claim:** "Document Editor" appears on [consistencyhub.io](https://consistencyhub.io) dashboard (auth-gated)

**Saved check:** `npx auspex check --name consistencyhub --verify-with-profile`

**Demo artifacts (committed, redacted for public repo):**

- **[Screenshot](examples/auspex-ts/demo/consistencyhub.png)** — Blurred auth-gated dashboard PNG (106 KB). **Note:** Not a blank fail — UI is intentionally obscured to protect PII/project names while proving the live check matched.
- **[Receipt JSON](examples/auspex-ts/demo/consistencyhub-receipt.json)** — Redacted schema-v1-shaped receipt from live 2026-09-19 AEST run. SessionId/sandbox ids omitted. Excerpt/title redacted. **Triad remains honest:** `ok=true`, `claimOk=false` (anonymous claim skipped), **`claimOkProfile=true`**.

**Result:** ✅ Claim matched. Profile-seeded sandbox verify passed (`ok=true`, `claimOkProfile=true`).

**Auth-gated SaaS pages** require `--verify-with-profile` to run profile-seeded claim verification. Anonymous verify cannot see logged-in UI (would fail with `claimOk=false`). The blur proves the page is not blank; the schema-v1 triad proves the verification signals remain honest.

## Redacted OneDrive receipt (same Microsoft seed)

**Claim:** "My files" appears on [onedrive.live.com](https://onedrive.live.com/) (auth-gated)

**Ad-hoc check:** `npx auspex check https://onedrive.live.com/ --expect "My files" --profile consistencyhub --verify-with-profile`

**Demo artifact (committed, redacted, receipt-only):**

- **[Receipt JSON](examples/auspex-ts/demo/onedrive-receipt.json)** — Redacted schema-v1-shaped receipt from a live 2026-09-18 AEST profile-seeded OneDrive check (same Microsoft seed as ConsistencyHub). SessionId/sandbox ids omitted. Account identity, file names, and storage amounts omitted. **No public PNG.** **Triad remains honest:** `ok=true`, `claimOk=false` (anonymous claim skipped), **`claimOkProfile=true`**.

**Result:** ✅ Same seed can `claimOkProfile` on ConsistencyHub and OneDrive. Evidence, not the default recipe.

## Other sign-in receipts (receipt-only)

Live test on 2026-09-28, driven end to end by Claude Code over the Auspex MCP server. A human signed in once per site through the phone door (laptop and phone). Each file is redacted: no screenshot, no session id, no cookie host list, no page text, and account or file IDs masked in URLs. Every row shows `ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`** from a second fresh Solari browser seeded only with the saved login. They are evidence, not the default recipe.

- **[Lorari](examples/auspex-ts/demo/lorari-receipt.json)** (Appwrite, class booking) — expect `Your Bookings` on `https://app.lorari.com/member/`. Supersedes the 2026-09-27 receipt, which showed `ok=false` while `claimOkProfile` held.
- **[Good Tape](examples/auspex-ts/demo/goodtape-receipt.json)** (Supabase, transcription) — expect `You have no tapes.` on `https://app.goodtape.io/tapes/new`
- **[Clozemaster](examples/auspex-ts/demo/clozemaster-receipt.json)** (AWS, language learning) — expect `READY FOR REVIEW` on `https://www.clozemaster.com/l/spa-eng`
- **[tldraw](examples/auspex-ts/demo/tldraw-receipt.json)** (Cloudflare + Clerk, whiteboard) — expect `My workspace` on a file page (`/f/<file>`)
- **[Chatwoot](examples/auspex-ts/demo/chatwoot-receipt.json)** (Postgres, support inbox) — expect `All Conversations` on `/app/accounts/<account>/dashboard`
- **[MariaDB Cloud](examples/auspex-ts/demo/mariadb-receipt.json)** (MySQL, database console) — expect `Create New Service` on `https://cloud.mariadb.com/dashboard`
- **[Back4App](examples/auspex-ts/demo/back4app-receipt.json)** (MongoDB / Parse, backend dashboard) — expect `New Backend` on `https://dashboard.back4app.com/apps`
- **[ConsistencyHub](examples/auspex-ts/demo/consistencyhub-msal-receipt.json)** (Azure + Microsoft MSAL) — expect `Document Editor` on `https://consistencyhub.io`, after `finalize-login` captured the MSAL session. The first door that day landed logged out and the finalize stopped at a Microsoft sign-in wall (`needsHuman`); the second door ("Stay signed in: Yes") passed.

## One-command run with `connect` (2026-09-29)

Receipt: [`connect-run-2026-09-29.json`](examples/auspex-ts/demo/connect-run-2026-09-29.json). Claude Code ran `auspex connect <url> --expect <words>` as the agent. A human signed in on the phone door and tapped Save, then the agent ran `connect --save <profile>`. `connect` runs the usual chain (save, finalize when needed, `check --verify-with-profile`) and ends with one sentence. It says "Logged in" only when `claimOkProfile` is true.

**8 of 9 confirmed.** Canva could not be confirmed.

| App | Sign-in | Result | Attempts |
| --- | --- | --- | --- |
| Lorari | Appwrite | Pass | 2. The first was the terminal run where the phone's Save button was tapped instead of Enter. |
| Good Tape | Supabase | Pass | 1 |
| Clozemaster | AWS | Pass | 1 |
| MariaDB Cloud | MySQL | Pass | 1 |
| Back4App | MongoDB (Parse) | Pass | 1 |
| Chatwoot | Postgres | Pass | 3. Solari editor/save returned 502, then the phone lost its connection during a password switch. |
| tldraw | Cloudflare + Clerk | Pass | 1 |
| ConsistencyHub | Azure + Microsoft (MSAL) | Pass | 3. The first save skipped finalize and checked logged out. The second got a Solari 409. The third passed after the one-time finalize fallback. |
| Canva | Google | Not confirmed | 4. Cloudflare showed every fresh cloud browser a bot check ("Just a moment..."). Two tries hit Solari 409s. The fourth saved fine (30 app-origin cookies), and its check retry hit the same bot check. |

Each pass is `ok=true`, `claimOk=false` (anonymous skipped) and **`claimOkProfile=true`** from a second fresh Solari browser seeded only with the saved login.

Canva is not a pass. Its save looked strong (29 app-origin cookies), but the checking browser never reached Canva, so there is nothing to confirm. Auspex reports that as `botWall`, not `loggedOut`, and does not solve bot checks.

What the run changed in the code:
- `connect` works for agents (`connect --save`).
- The phone Save text names `connect`.
- Finalize runs once when a ready-looking save checks logged out (Microsoft MSAL).
- Solari 502 and 409 are named instead of blamed on the clock.
- Bot checks are reported as `botWall`.
- `connect` stops when Solari gives no phone door.

## Published 0.1.19 on a real sign-in (2026-09-30)

Receipt: [`connect-run-2026-09-30-lorari.json`](examples/auspex-ts/demo/connect-run-2026-09-30-lorari.json). After a day of bug fixes (0.1.16 to 0.1.19), the published package ran from an empty folder (`npx -y auspex-solari@0.1.19 connect https://app.lorari.com/member/ --expect "Your Bookings"`), with Claude Code as the agent. A human signed in on the phone door and tapped Save; the agent ran `connect --save app-lorari-com`.

```
✓ Logged in to app.lorari.com. A second browser, using only the saved login, saw "Your Bookings".
```

`ok=true`, `claimOk=false` (anonymous skipped), **`claimOkProfile=true`**. The save was cookie-strong, so finalize was skipped. No sessions were left open.

## Important Notes

### Marketing Summary vs. Schema v1

Two committed ironadamant JSON files:

- [`demo/receipt.json`](examples/auspex-ts/demo/receipt.json) — **public marketing summary** (`sessionId`, `claimOk`, `verifyOk`, replay note). **Not** the schema v1 CLI/MCP stdout contract.
- [`demo/ironadamant-receipt.json`](examples/auspex-ts/demo/ironadamant-receipt.json) — **schema v1** public-check receipt (`parseReceiptV1`). Required keys: `schemaVersion`, `ok`, `reason`, `url`, `expect`, `screenshotPath`. Synthetic `sessionId`. No `replayUrl`.

Agents receive schema v1 on stdout when they call `auspex_check` or use the MCP tool.

### Schema v1 Receipt (Agent Contract)

The actual agent contract is **[Receipt schema v1](AGENTS.md#receipt-schema-v1-frozen)** in AGENTS.md.

**Required fields:**
- `schemaVersion` (frozen at `1`)
- `ok` (boolean)
- `reason` (`matched` / `loggedOut` / `needsHuman` / `mismatch` / `network` / `recordedLoggedIn` / `expectMatchedPublicLanding` / `hostChanged` / `stream-expired`)
- `url`
- `expect`
- `screenshotPath`

**Optional fields:** `title`, `finalUrl`, `matched`, `excerpt`, `sessionId`, `networkIdle`, `replayReady`, `waitedFor`, `filled`, `clicked`, `needsHuman`, `diff`, `verify`, `profileSeed`, `profileSaved`

For golden examples of actual schema v1 receipts, see the committed receipts in `examples/auspex-ts/tests/golden/receipt-v1/` or run `npx auspex check --name ironadamant` yourself.

## Replay Access

**Console Replay:** View in [Solari console](https://console.getsolari.com) → Sessions → search for the `sessionId` → Replay tab.

**Presigned URLs:** Auspex does not return or commit presigned replay URLs. Use the console or open the HTML file locally.

## Verification Deep Dive

Auspex defaults to **anonymous sandbox verification** for public marketing pages (`--verify` is default, not `--no-verify`). **`name=consistencyhub`**, **`profile=consistencyhub`**, or **any attached profile on a non-public-marketing URL** defaults to **no** sandbox. Public marketing still verifies with a leftover profile. No profile still verifies. `--verify` on auth-gated paths is anonymous and will poison `ok`. `--verify-with-profile` is the dogfood claim recheck. Here's how anonymous verify works when it runs:

1. Re-fetches the target URL over HTTP (no cookies/auth) and reads the page text (not the tab title, scripts, or styles)
2. Also OCRs the screenshot when Tesseract is installed. Solari's base sandbox does not have it, so in practice the fetch decides.
3. Passes when either finds the expect string (the same case-sensitive, word-bounded match as the live check)
4. Writes `verify.claimOk` and, from the screenshot and URL integrity checks, `verify.ok`
5. Tears down the VM

This is **claim verification**, not just echo — the sandbox independently fetches the page and checks the expect string, rather than parroting the browser session's `matched` value.

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

The [`public` job](https://github.com/IronAdamant/auspex/actions/workflows/auspex-ts.yml) is Monday + `workflow_dispatch`. Repo secret `SOLARI_API_KEY` is **present** (masked in logs). Observed live success: [Actions run 36638435165](https://github.com/IronAdamant/auspex/actions/runs/36638435165) (2026-09-29, `workflow_dispatch`) — ironadamant `One office job.` and checkpoint `Checkpoint` both `ok: true`; the same run's daily `live` job also passed the example.com check and the published-package smoke. The step still skips with exit 0 if that secret were unset (PRs not blocked). Do not remove the secret. The workflow does not commit artifacts. Demo PNG/receipt/replay files in this repo are manually committed when refreshed. Issues is on.

## Fail-closed: hostChanged

When the live remote https host diverges from the minted door URL, await/finalize/`--save-profile` fail closed. `claimOkProfile` is not granted. Remint `auspex_login --profile <suggestedProfile> --url <suggestedUrl>`. Golden: [`examples/auspex-ts/demo/host-changed-receipt.json`](examples/auspex-ts/demo/host-changed-receipt.json). The typing field is not a site picker.
