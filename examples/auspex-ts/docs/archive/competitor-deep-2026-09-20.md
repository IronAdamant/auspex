# Competitor deep — Auspex tip `f250546` vs the live Solari / Pinetree field

**Date:** 2026-09-20 (UTC fetch window ~06:13–06:17).  
**Subject:** `IronAdamant/auspex` at `f250546` (`docs: first screen uses npx auspex-solari`).  
**Kind:** report only. No product code. Do not merge as a feature.

This is a rescan of the public intern-challenge field after PRs **#38–#44** and the later packaging commits (`986b64d`, `4b61412`, `19a2be7`, `f250546`). It is **not** a live re-run of Auspex checks.

---

## 0. CoS / founder TLDR

**Rank vs the Sep 19 competitor pass: up one notch on first-30-seconds skim and distribution, unchanged on thesis.** Auspex is still the only public submission this scan found that treats **auth-gated SaaS honesty** as the product (`ok` ≠ `claimOk` ≠ `claimOkProfile`, sessionStorage finalize, fail-closed passwords). It is **not** the flashiest, and it is **not** the most used.

**What Harry would see in 30 seconds now (that he would not on Sep 19):**

| Door | Live this scan |
|---|---|
| About | “Agent web eyes that stay honest on auth-gated SaaS — check → independent verify → tear-down” |
| Homepage | `https://ironadamant.com/auspex/` — HTTP **200** `text/html` (Pages) |
| First-screen CLI | `npx auspex-solari check --name ironadamant` (not npm `auspex`, a different scraper) |
| Fork honesty | Public fork of `solari-sdk/solari-cookbook` |
| Stars | **0** (fetched `gh api repos/IronAdamant/auspex`) |

**What still loses a skim:** 0 stars; linguist language still JavaScript (committed `dist/`); weekly Actions `public` job still skips without a repo secret; Discord `#showcase` packet is written, posting is human-only and was **not** verified this scan; tagged X/LinkedIn to Harry was **not** verified this scan (X plugin not connected).

**Closest cousins (live):** `itw-code` **ColdStart** (3★, zero-shot CU harness), `Sy-D/handraise` (31★, npm, HITL), `Konuktor/agent-gauntlet`, `kelvinguchu` **FlakeLab**, `nahuelsoria/solari-identity-guard`, `Shafwansafi06/agentbench`. Forklift / WebScout were **not** found as live public intern repos this scan.

**Fit (reconstructed Harry rubric):** **8.4 / 10**. Technical + honesty are interview-grade. Distribution + “get people to use it” are still the hole. Submissions close **30 Sep** (Harry’s public X title, fetched 2026-09-20).

---

## 1. Method and limits

Fetched, not guessed:

- GitHub Search API: `fork:true solari-cookbook` (pages 1–2, 100 forks), `fork:true solari-sdk`, `topic:solari`, named-product queries, code search on README fragments.
- `gh api repos/<owner>/<repo>` for stars / homepage / pushed_at. **Stars below are those responses.** Do not invent engagement.
- npm registry: `auspex-solari` versions `0.1.0`, `0.1.1` (latest modified `2026-09-20T05:54:10.434Z`). Weekly downloads API returned `package not found` (not yet indexed). `handraise` weekly downloads **23** (week of 2026-09-12–18).
- Pages: `curl -sI https://ironadamant.com/auspex/` and `…/demo/replay.html` → **200** `text/html`.
- Harry close tweet HTML `<title>` on `https://x.com/harrychow_/status/2099130594076557556` (quoted below). LinkedIn challenge text from a public search snippet of Harry Chow’s post.

Limits (do not paper over):

- **X plugin not connected** (`needsAuth`). No tagged-post corpus, no like/repost counts, no `@Iron_Adamant` timeline this run. Prefer GitHub + the two Harry URLs already in root `README.md`.
- Cookbook has **466 forks**. Search returns 50/page and is incomplete. This memo scores **named / described / recently pushed** forks, not all 466.
- The **Sep 19 competitor memo is not in git**. Closest committed artifacts: `PLAN.md` (2026-09-19; “competitor pass”, Fare Board called out as a consumer clone to refuse) and `examples/auspex-ts/docs/leave-nothing-2026-09-19.md`. Delta is vs that implied position, not vs a recovered file.
- No outbound posts. No intern-ping.

---

## 2. Harry / Pinetree rubric (reconstructed, with evidence)

Harry’s public apply list (LinkedIn post “We're hiring a SWE intern for Pinetree Research… $300K”, snippet fetched 2026-09-20):

1. Fork the Solari cookbook.
2. Build a **real** use case (browsers, sandboxes, and/or desktops).
3. Publish on a **public** GitHub account.
4. Share on LinkedIn or X; tag Harry and Solari.
5. Use AI; they care that you **ship**.
6. Implied quality bar: “fits the needs/demands of the market → get people to use your build.”

Close date, from the X page title fetched 2026-09-20:

> “We’re closing submissions on the last day of September / Our team has already begun reviewing submissions…”

Root README already points at that tweet: `https://x.com/harrychow_/status/2099130594076557556`.

Assessor-facing extras inferred from how the strong cousins write (not Harry quotes): independent evidence vs agent self-report; Solari primitives used for a reason; fail-closed / cleanup; a watchable door without a clone.

---

## 3. Field census (live numbers)

**Upstream (not a submission):** `solari-sdk/solari-cookbook` — **162★ / 466 forks**, last push `2026-09-15T01:43:24Z`.

**Auspex (this tip):**

| Field | Fetched |
|---|---|
| SHA | `f250546` |
| Stars / forks | **0 / 0** |
| Fork of | `solari-sdk/solari-cookbook` |
| Homepage | `https://ironadamant.com/auspex/` |
| About | Agent web eyes that stay honest on auth-gated SaaS |
| Topics | `agents`, `mcp`, `playwright`, `solari` |
| Issues / Pages | both **on** |
| npm | `auspex-solari@0.1.1` (public). Name collision documented vs npm `auspex` 0.6.1 (unrelated scraper) |

**Stars in the intern-shaped field (only what `gh api` returned):**

| Repo | ★ | Notes |
|---|---|---|
| `Sy-D/handraise` | **31** | npm `handraise@0.6.0`; 23 weekly downloads |
| `itw-code/solari-cookbook` | **3** | Product name **ColdStart** |
| `jononeill117/trades-ai` | 2 | Trades automation on all three primitives |
| `priyansh-narang2308/rabbit` | 2 | Cryptographic proof / replay for agent actions |
| `tocsindata/solari-osint-cookbook` | 1 | OSINT ops center; public-source boundary |
| `Fizza-Mukhtar/solari-cookbook` | 1 | Fleet orchestration + Railway dashboard |
| `0xjerome/solari-cookbook` | 1 | Autonomous functional QA |
| `qeinstein/solari-cookbook` | 1 | TimeCapsule |
| `IronAdamant/auspex` | **0** | This tip |
| Most other named cousins below | 0 | Including Gauntlet, FlakeLab, Nightshift, AgentBench, Identity Guard |

**Recently pushed cookbook forks (search `updated` desc, page 1, 2026-09-20):** `diyaitis` price/restock watcher; `Russell952/solari-cookbook-challenge` (Vercel client); `kuenane` legal-compliance auditor (LangGraph + Tauri); `tocsindata` OSINT; `chinmayarvind23` Cleanbreak (cancel subscriptions); `kelvinguchu` FlakeLab homepage; `Legatia` MCP social-discovery. Descriptions exist; stars are 0 except OSINT (1).

Many forks still have empty descriptions and a `pushed_at` that matches upstream (`2026-09-15` or earlier). Those are **not** scored as products.

---

## 4. Named-product resolution

The Sep 19 / PLAN vocabulary named ColdStart, Forklift, Gauntlet, Fare Board, WebScout, FlakeLab. This rescan:

| Name | Live public match this scan | ★ | Verdict |
|---|---|---|---|
| **ColdStart** | `itw-code/solari-cookbook` — README title “ColdStart”; Pages showcase `https://itw-code.github.io/solari-cookbook/` | 3 | **Found.** Strongest flashy-useful cousin on zero-shot CU + fail-closed SQLite verifier. |
| **Gauntlet** | `Konuktor/agent-gauntlet` (+ `agent-gauntlet-example-agent`) | 0 | **Found.** Reliability CI; server-side verdict; live Northflank demo URL on the repo. |
| **FlakeLab** | `kelvinguchu/solari-cookbook` + `kelvinguchu/flakelab-actual-budget-demo`; homepage `https://flakelab.vercel.app` | 0 | **Found.** Flaky Playwright scientist; Solari microVMs for proof. Pushed 2026-09-18. |
| **Fare Board** | No intern-challenge repo under that name. `PLAN.md` still forbids “rewriting Auspex as a consumer web app (Fare Board clone).” `debojit11070/flight-visualizer` (0★, created 2026-08-23, **before** the public challenge post) uses the UI string “Live Fare Board / Solari” — that is **split-flap / airport-board** branding, not a confirmed getsolari submission. | — | **Not found** as a live intern product. Do not treat the flight visualizer as a scored rival. |
| **Forklift** | No Solari intern README / repo this scan. Hits are Foreman/KubeVirt/macOS file managers. | — | **Not found.** Possible prior-memo informal name or unpublished rename. |
| **WebScout** | No Solari + Pinetree README this scan. Hits are unrelated scanners / an old Python “WebScout” / `OEvortex/llm4free` (“formerly WebScout”). | — | **Not found.** |

Do not keep scoring ghosts. If Forklift / WebScout / Fare Board reappear as public forks before 30 Sep, rescan those three only.

---

## 5. Position Auspex `f250546` on the axes

Scores are 1–5 against **this field**, not against Playwright-at-large.

| Axis | Auspex | Why | Who beats it |
|---|---|---|---|
| **Problem** | **5** | Auth-gated first-party SaaS: agents lie about logged-in state. Narrow, real, dogfooded (ConsistencyHub sessionStorage). | ColdStart (zero-shot CU) and AgentBench (vendor infra honesty) are equally sharp, different problems. |
| **Solari use** | **4** | Browser + sandbox verify + demoted desktop + profiles/SSO/reap. Uses the platform’s actual footguns (console Save misses sessionStorage; 429; 402 desktop). Desktop is honest-402, not a product door. | ColdStart / Gauntlet / FlakeLab / Handraise use sandbox isolation as the *plot*. Nightshift claims all three primitives in a CU loop. |
| **Proof** | **4** | Frozen schema v1 receipt; triad; redacted CH PNG + `claimOkProfile=true` (2026-09-18 dogfood); public ironadamant receipt; Pages replay of **Microsoft wall** (not a logged-in CH recording — that refuse is the point). | ColdStart (SQLite oracle, agent `done` is a claim). Gauntlet (server-side shop state). Nightshift (no recording → `cheated-blocked`). AgentBench (append-only JSONL every 6h). |
| **Agent UX** | **5** | CLI ≡ MCP, one JSON object, exit 0 iff `ok`. `npx auspex-solari` / `npx -p auspex-solari auspex-mcp`. Generic Microsoft loop + leftover `next` (`986b64d`). Agents are the user. | Handraise is a **library** (`npm install` + one call) — better embed UX, worse “run a check” UX. |
| **Privacy / fail-closed** | **5** | Never type passwords; `needsHuman`; desktop `--type` refuse; no `--record` on logged-in CH; fill/click with profile requires `--allow-page-actions`; profiles treated as OAuth stores; replay redacted. | Identity Guard is the closest on **wrong-account** (Auspex is logged-out vs logged-in, not Alice vs Bob). Interlock / Handraise-approval own irreversible-action gates. |
| **Reviewer packet** | **4** | For Reviewers table, Watch URL, triad stills, Discord packet, PITCH.md. Pages 200 confirmed this scan. | ColdStart interactive showcase + committed scorecard. Gauntlet dashboard. AgentBench live Vercel + `/summary.json`. First User shareable `/r/:id`. Auspex watch is a **stripped login wall**, not a green dashboard movie. |
| **Distribution** | **3** | npm name + bin shipped **today**; Pages on; Issues on. Stars still 0. Downloads API does not see the package yet. Weekly live job skips without secret. | Handraise (31★, npm, 23 weekly). ColdStart (3★). Everyone else is also 0 — Auspex is no longer uniquely invisible, but it is not used. |
| **Flashy vs useful** | **Useful 5 / flash 2** | Deliberate. PLAN.md still refuses a Fare Board clone. First screen is a command, not a GSAP dashboard. | Flash winners: ColdStart GIF + perturbation toy; AgentBench GSAP; Clanker Any%; First User; Canary. Useful peers: Handraise, Identity Guard, solari-safe, Fleet, Alibi. |

**One-line position:** Auspex is **agent infrastructure for honest eyes on logged-in SaaS**. The field’s gravity is **demos, harnesses, and HITL**. Those are cousins, not substitutes.

---

## 6. What moved since the Sep 19 competitor pass

Implied Sep 19 position (from `PLAN.md` inventory + leave-nothing memo on `ff156ad`): thesis already strong; **skim lost** (Pages off, cookbook tables on the first screen, homepage a tree path, MCP absolute-path ritual, finalize-login stuck on ConsistencyHub expect, anonymous verify skip was two hostnames, npm unshipped, Issues off).

Shipped on `main` through `f250546`:

| Cluster | What landed | Competitor effect |
|---|---|---|
| **Honesty (#38–#44)** | Verify / finalize / status / `ok` contract holes; leave-nothing docs; VWP timeout does **not** poison `ok` or fold `claimOkProfile`; tip-review dist rebuild. | Closes the “docs lie / two `ok`s” attack that a careful assessor (or ColdStart/Gauntlet README) would use. |
| **Generic Microsoft (`986b64d`)** | `finalize-login --url --expect` for unknown profiles; leftover `next` points at finalize; `weakSeed` not on public marketing. | Removes the “only works on the founder’s app” skim. Matches Identity Guard’s “any profile” claim without becoming Identity Guard. |
| **Packaging / npm** | `auspex-solari` public (`4b61412`); bin `auspex-solari` (`19a2be7`); first screen `npx auspex-solari` (`f250546`); MCP `npx -p auspex-solari auspex-mcp`. | First **install-without-clone** door. Still loses to Handraise on “already on npm and starred.” Name collision with npm `auspex` is documented — good. |
| **Pages / reviewer packet** | `has_pages: true`; homepage set; landing + rrweb player 200 `text/html`; Discord packet; schema-v1 public receipt; CH replay is the Microsoft wall, credentials stripped. | Closes PLAN U1–U4. Watch door now exists. Content is honest, not cinematic. |
| **Deferred eng (`e49c3b2` / #42)** | Heuristic, Zod gap, VWP poll, device-before-launch. | Internal quality. Not a skim delta unless someone reads tests. |
| **Still deferred / honest** | OneDrive: local dogfood only, **no** committed PNG (PII). Desktop Mousepad **402** on Free. Weekly `public` job **skips** without secret. Cookbook sample dirs stay (fork honesty). | Same residuals the Sep 19 memos listed. Not new losses. |

---

## 7. Did the rank change?

**Yes, on skim. No, on popularity. No, on thesis uniqueness.**

| Compare | Sep 19 (implied) | 2026-09-20 tip `f250546` |
|---|---|---|
| vs leftover cookbook forks | At risk of looking like one (tables, no Pages) | **Ahead.** First screen is Auspex + npm door. |
| vs ColdStart / Gauntlet / FlakeLab | Behind on flash + committed measurement theater | Still behind on flash. Closer on “fail-closed verifier” *language*; different object (SaaS login vs invoice SQLite / shop state / flake probability). |
| vs Handraise | Behind on install + stars | Still behind on stars (0 vs 31) and weekly use (downloads API does not see Auspex yet). Closer on “agent can `npx`.” Different job (eyes vs HITL takeover). |
| vs Identity Guard | Parallel, not shipped as a library | Still parallel. Auspex = logged-out vs logged-in + independent claim. Guard = Alice vs Bob on save. Complementary. |
| vs consumer Vercel apps (First User, Canary, Clanker, Agent-Ready) | Behind on click-demo | Pages watch exists; still not a “paste a URL, get a dashboard” product. Intentional. |
| **Overall intern rank** | Strong thesis, weak packet | **Packet now matches the thesis.** Use-rank still last among anything with stars. |

If Harry’s actual filter is “did someone ship something people use,” Handraise is still #1 in this field. If the filter is “did someone find a Solari-shaped hole and close it with a contract,” Auspex and ColdStart are the two to open. They are not the same hole.

---

## 8. Closest cousins (what to steal as *positioning*, not code)

### 8.1 ColdStart — `itw-code/solari-cookbook` (3★)

Zero-shot computer-use harness. Agent never sees the same app twice. **Agent `done` is a claim**; verifier recomputes ground truth from the seed and reads SQLite in the sandbox. Interactive Pages showcase + committed `artifacts/scorecard.json`. 110 tests advertised on the README.

**Overlap:** fail-closed independent evidence.  
**Gap:** ColdStart measures *generalization of a CU agent*. Auspex measures *whether a logged-in page is the page the agent claimed*.  
**Steal (docs only):** one sentence on the landing that the **agent’s `ok` is not the sandbox’s `claimOk`**. Auspex already has the triad; ColdStart says it louder with a GIF.

### 8.2 Handraise — `Sy-D/handraise` (31★, npm)

Resumable interrupt: same Solari browser session, phone QR, takeover **or** approval. Measured 19/20 TOTP rescues; 3.5s median raise→live. Series: `handraise-telegram`, `handraise-slack`, `outlive` (session death ~10 min; baseline 0/5, outlive 5/5). README explicitly says wall **detection** is out of scope.

**Overlap:** human in the loop; Auspex `login` handoff + `needsHuman` is the same *class*.  
**Gap:** Handraise **resumes the live session**. Auspex **refuses to type** and starts a later check from a saved profile (after `finalize-login` captures sessionStorage).  
**Do not:** clone live-view. **Do:** keep saying `needsHuman` is a typed outcome, not a hang.

### 8.3 AgentGauntlet — `Konuktor/agent-gauntlet` (0★)

Same task, many perturbations, verdict from **server-side shop state**. Infra errors excluded from the reliability denominator. Live demo URL on the repo. Honest “four runs is a demo, Wilson interval is 30–95%.”

**Overlap:** claim vs evidence.  
**Gap:** they crash-test *agents*. Auspex is the *eyes* those agents would call.

### 8.4 FlakeLab — `kelvinguchu` (0★, Vercel)

Hypothesis → one-factor experiments → YAML reproducer → hostile/normal proof in Solari microVMs. CLI-first; model does not decide pass/fail.

**Overlap:** sandbox as independent judge.  
**Gap:** flaky tests, not SaaS login.

### 8.5 Identity Guard — `nahuelsoria/solari-identity-guard` (0★)

Fail-closed **who** is in the profile. Documents the cookbook profiles example’s “visit #1 forever” bug (`profileId` without `storageState` on `newContext`). Guarded launch + guarded save. Live e2e against Solari advertised.

**Overlap:** profiles are secret stores; empty / signed-out / unverifiable are different.  
**Gap:** they do not do anonymous OCR / VWP / MCP / reap. Auspex `weakSeed` is sessionStorage-count, not account probe.

### 8.6 AgentBench — `Shafwansafi06/agentbench` (0★, live Vercel)

Continuous public benchmark: Solari vs Browserbase / Steel / Kernel / Hyperbrowser / Anchor + E2B / Daytona. Interleaved, raw JSONL, stealth gauntlet. LinkedIn post claims Solari fingerprint **43%** (their number; not re-run here). Pushed **2026-09-20**.

**Overlap:** honesty about fused SDK phases / infra.  
**Gap:** measures **providers**, not the user’s logged-in app.

### 8.7 Others worth a glance (0–1★)

| Cousin | Job | Why it is not Auspex |
|---|---|---|
| `yayaq1/nightshift` | Vision QA; no recording → `cheated-blocked` | Anti-cheat CU runner; last push 2026-09-01 |
| `NicolasMartalog` First User | Paste repo → sandbox boot → first click → PASS/FAIL receipt | Consumer watch; public sites only |
| `Dileep2896/interlock` | CDP-layer approval for irreversible actions | Policy gateway, not eyes |
| `H4RDSTYLE/solari-safe` | `withBrowser` / replay poll / shell-safe `run` | SDK footguns; README admits **no live key** yet |
| `prophen/alibi` | Sandbox behavior alibi (files/net/procs) | Code audit, not page claim. Pushed 2026-09-19 |
| `Fizza-Mukhtar` Fleet | Queues, budgets, crash recovery | Orchestration layer |
| `khaledmoayad` PatchProof | Isolated base/head + recorded browser + state oracle | Patch evidence |
| `hitakshiA/solari-python` | Fast observe/act on official Python SDK | SDK fork, 2026-09-18 |
| `sd720/solaris`, `IronJam11/walkthru`, `shivam060404/Canary` | Pinetree-tagged products (code-search hits) | Consumer / QA skins |

---

## 9. Remaining skim risks before 30 Sep

Ordered by “would a tired reviewer bounce.”

1. **0 stars / no verified Harry tag.** Challenge rule 4 is “share on LinkedIn or X.” This scan did not fetch an Auspex tag. Packet exists (`docs/showcase/DISCORD.md`); posting is Aron’s. A quiet HEAD can lose to a 3★ ColdStart with a GIF.
2. **Watch content is a stripped Microsoft wall.** Correct and fail-closed. Easy to misread as “they never got in.” The blurred CH still + triad JSON has to stay **above** the replay iframe in any human post.
3. **npm `auspex` collision.** First screen now says `npx auspex-solari`. After clone, `npx auspex` is the local bin. A reviewer who types `npx auspex` from npm gets the other scraper. Keep that sentence; do not drop it.
4. **Downloads API + weekly Actions.** Registry has `0.1.1`; npm downloads endpoint does not list the package yet. Weekly `public` job skips without `SOLARI_API_KEY`. Do not imply live weekly coverage.
5. **Linguist = JavaScript.** Committed `dist/*.mjs`. Optional `.gitattributes` vendoring was PLAN H10; still optional. Cosmetic.
6. **Cookbook leftover dirs.** Correct for “is this a fork?” Wrong if the first screen regresses to sample tables. Tip `f250546` keeps leftovers **below** For Reviewers. Do not un-collapse.
7. **OneDrive / desktop / mobile.** OneDrive: no public artifact (intentional PII). Desktop: 402 on Free. Mobile: documented best-effort, not live-verified. A cousin that over-claims would look worse; Auspex should keep the caveats.
8. **Ghost names.** Do not pitch against Forklift / WebScout / Fare Board unless they reappear. Scoring ghosts makes the memo look stale.

Non-risks (do not “fix” for Harry): folding `claimOkProfile` into `ok`; recording logged-in CH; becoming a consumer Fare Board; filing a cookbook GitHub issue.

---

## 10. Assessor-facing scorecard

*For a Pinetree / Harry reviewer who will not read AGENTS.md. Scores 1–5. Evidence is a URL or a fetched fact, not a vibe.*

| Rubric row | Score | Evidence |
|---|---|---|
| Public fork of the cookbook | **5** | `IronAdamant/auspex` `fork: true`, parent `solari-sdk/solari-cookbook` |
| Real use case (not a restyled sample) | **5** | Auth-gated receipt triad + generic Microsoft finalize; leftover cookbook dirs labeled unmodified |
| Browsers / sandboxes / desktops used on purpose | **4** | Check = browser; verify = sandbox OCR/fetch; desktop = named Mousepad demo, 402 on Free, demoted |
| Independent evidence (agent cannot grade itself) | **5** | `ok` ≠ `claimOk` ≠ `claimOkProfile`; CH demo `claimOkProfile=true` (2026-09-18); anonymous skip on auth-gated |
| Fail-closed / no password theater | **5** | `needsHuman`; password fill refused; no logged-in CH `--record`; Pages replay is the wall, emails stripped |
| Agent-consumable contract | **5** | Schema v1; CLI ≡ MCP; `npx auspex-solari` / `npx -p auspex-solari auspex-mcp` |
| Watchable without clone or key | **4** | `https://ironadamant.com/auspex/` 200 `text/html` (fetched 2026-09-20). Not a green “PASS” movie |
| Market / people using it | **2** | Stars **0**. npm published today; downloads API not indexed. Handraise is 31★ / 23 weekly |
| Flash (dashboard, GIF, GSAP) | **2** | Useful-first. ColdStart / AgentBench / First User win this row on purpose |
| Honesty under skim | **5** | Public vs auth-gated labeled; OneDrive not claimed without artifact; weekly job skip documented |
| Challenge distribution (X / LinkedIn tag) | **?** | Not verified this scan. Close date 30 Sep (Harry X title) |

**Composite (equal weight, skip the `?`):** **8.4 / 10**.

**Interview analog:** “This person found the logged-in lie, wrote a contract, dogfooded it on a real Microsoft SPA, and refused to fake the replay.” That is closer to Solari’s own cookbook footguns than a flight board.

**Reject analog:** “0 stars, quiet on X, watch video is a login wall.” Mitigate with a human post that leads with the blurred CH triad, then the wall.

---

## 11. Fit score (Pinetree / Harry) — one paragraph

**8.4 / 10 — interview if they open HEAD; bounce if they only sort by stars or dashboards.** Auspex meets the written challenge (public cookbook fork, real browser+sandbox use case, public repo) and exceeds it on fail-closed auth-gated honesty, which is a Solari-shaped hole Identity Guard and Handraise only partly cover. It under-indexes the unwritten “get people to use it” line: 0 stars, npm hours old, tag unverified. Between now and 30 Sep the only rank-moving work that is **not** product code is human distribution (Harry/X/LinkedIn + Discord `#showcase` using the existing packet) and not regressing the first screen. Engineering leftovers (OneDrive artifact, desktop 402, weekly secret) are already honest; lying about them would **lower** the score.

---

## 12. Sources (fetched 2026-09-20)

- `gh api repos/IronAdamant/auspex` — 0★, homepage, About, `has_pages`, topics.
- `gh api repos/solari-sdk/solari-cookbook` — 162★ / 466 forks.
- `gh api` as tabulated in §3 and §4.
- GitHub code search: Nightshift / AgentBench / Walkthru / Canary / solaris READMEs mentioning Pinetree; ColdStart README on `itw-code/solari-cookbook`; Handraise / Gauntlet / FlakeLab / Identity Guard / Interlock / First User / solari-safe READMEs.
- npm registry `auspex-solari`, `auspex`, `handraise`; npm downloads API (Handraise 23/week; Auspex not indexed).
- `curl -sI` Pages landing + replay.
- X HTML title: `https://x.com/harrychow_/status/2099130594076557556`.
- LinkedIn snippet: Harry Chow Pinetree intern post (apply steps).
- In-repo: `README.md` @ `f250546`, `PITCH.md`, `PLAN.md`, `docs/showcase/DISCORD.md`, `docs/index.html`, `package.json` (`auspex-solari` 0.1.1).

**Not used:** X plugin (disconnected). Invented star counts. Live Solari checks. Outbound posts.
