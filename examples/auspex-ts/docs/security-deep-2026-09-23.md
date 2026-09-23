# Security deep pass — 2026-09-23 (post-#57 door chooser)

**Auditor:** Cursor cloud agent (read-only + one public `auspex check`).  
**Tip:** `d4332b6139233dffa559e528600beb1a385973cc` (`Merge pull request #57`, door.html chooser, one paste field, claim wording).  
**Ask:** make Auspex as secure as possible **while remaining usable** for non-tech humans and AI agents. Rank P0–P3. Memo-first; no drive-by hardening in this run.  
**This session did not mint a login** (that would put a live VNC JWT in agent logs).

## Method

| Step | Result |
|---|---|
| Read tip sources | `docs/{door,phone,desktop}.html`, `src/handoff-doors.ts`, `src/operator-session.ts`, `src/profiles.ts`, `src/tool-schema.ts`, `src/page-actions.ts`, `src/desktop.ts`, `src/login-trace.ts`, `src/profile-persist.ts`, `src/fail-closed.ts`, `SECURITY.md`, operator/door tests |
| Live fetch | `https://ironadamant.com/auspex/{door,phone,desktop}.html` **byte-identical** to tip (`last-modified` 2026-09-23 04:24:09 GMT). Hosted via GitHub Pages → Fastly → Cloudflare. |
| Live check | `npx auspex check https://ironadamant.com/auspex/door.html --expect "Auspex login" --no-verify` → `ok=true`, `reason=matched`. Locked-without-hash copy is honest. Screenshot under artifacts only (not committed; live `sessionId` omitted here). |
| Deps | `npm ci` in `examples/auspex-ts`: **`found 0 vulnerabilities`**. `@puppeteer/browsers@3.2.2 overridden` → `modern-tar`; **no `extract-zip`**. |
| Not done | No login mint, no password typed, no loopback listener started, no exploit PoC, no product patch. |

---

## Executive summary (CoS)

#57 made the **human door honest** (chooser, one paste field, “keys go into remote Chrome,” “not a live-session takeover,” wipe ≠ Solari key). The **fail-closed agent line** still holds: no username/password/key fields on CLI/MCP; password/OTP refuse; record+profile gates; excerpt fence; `claimOkProfile` not folded into `ok`.

There is **no new P0** that is both remotely exploitable without a minted URL or a local MCP process **and** trivial/safe to ship without a product call. The remaining risk is mostly **capability URLs in agent channels**, **Solari key on the marketing origin**, and a **documented loopback overwrite** whose impact is stronger than “DoS.”

**Verdict:** **Good enough for the challenge** if the bar is *agent never types passwords; one mint → Phone|Desktop → one paste; honest receipts*. **Not** good enough if the bar is *capability tokens never appear in agent logs* or *the Solari key never rests on ironadamant.com*.

---

## Ranked table

| Pri | Issue | Fix | Usability cost |
|---|---|---|---|
| — | No remote unauthenticated password-to-agent or RCE on the door JS | — | — |
| **P1** | Minted hash still carries unused `t` (editor/save token), `h` (Solari handoff URL), `p` (profile id), `saved`/`plist`. Agent JSON, QR, SMS `oneLiner`, and browser history all get them. Door pages only read `v`,`n`,`exp`,`u`,`k`. | Stop putting unused params in `handoffHash`. Keep `v`,`n`,`exp`,`u`,`k`. | **None / shorter URLs.** Does not touch one-mint chooser or paste. |
| **P1** | VNC JWT (`v`) is in every labeled URL the agent is told to show (~5 min). Inherent to “show the human a link.” Anyone with the chat/MCP/QR/SMS is the typist. | Keep `v` in the hash (required). Do not also put `t`/`h`. Traces already strip JWT-like strings. Do not mint in a public PR transcript. | Removing `v` from agent JSON **breaks** Phone\|Desktop. Do not do that. |
| **P1** | `localStorage.auspex.solariKey` on **ironadamant.com** (marketing origin). Same origin as first-party `main.js` / `navigation.js` and an origin-wide `/sw.js` (default scope `/`). Marketing XSS or a bad SW update can read the key. 30-minute profile wipe does **not** clear it. | Do not store the key on the marketing origin. Prefer `SOLARI_API_KEY` env. If a browser stash is required, use a dedicated origin or session-only. | Key box on desktop.html is a fallback for humans without env. Env-first is already the documented path. Hides the box when `k=1` (mint already does this). |
| **P1** | Loopback `POST http://127.0.0.1:17321/auspex-operator-key` with `Access-Control-Allow-Origin: *`. Any local page can **overwrite** the operator key while MCP is running. Next `auspex login` then mints on the attacker’s Solari account; the human types into attacker-controlled VNC. SECURITY.md understates this as substitution/DoS. GET does not return the key. CLI does **not** start the listener (MCP does). | Origin allowlist (`https://ironadamant.com`) + one-time nonce from mint, or drop loopback and keep env-only. | Allowlist preserves desktop Save from the real door. Dropping loopback means CLI-only users keep using env / `.auspex/operator-key` by hand. **Do not** add a password field to MCP. |
| **P1** | Phone VNC **disconnect does not lock or clear** `#ime`. Desktop disconnect does. Password can sit in a still-enabled text field after the remote Chrome dies. | Same `lockUi` + `clearLocalSecrets` on phone disconnect as desktop. | Must remint after drop — already the copy. **Does not** hurt password-manager paste. |
| **P2** | No CSP, no `X-Frame-Options` / `frame-ancestors`, no HSTS on Pages responses. Door/phone/desktop can be iframed. Clickjacking the IME or the Solari-key box is the realistic case. | Meta (or Pages) `Content-Security-Policy: default-src 'self'; connect-src 'self' wss://api.getsolari.com http://127.0.0.1:17321; frame-ancestors 'none'` on the three door files. Watch page may keep `frame-ancestors 'self'` so `demo/replay.html` still embeds. | **None** for paste/chooser if `connect-src` lists the VNC WS (and loopback only on desktop). Tight `script-src` must allow the inline boot script or move it to a file. |
| **P2** | `#ime` is `type=text` + `autocomplete=off`. Needed so the phone keyboard opens and password managers can paste. Residual: shoulder-surf until Paste/Save/lock; browser may offer to **save the site password as an ironadamant.com login**. | Keep `type=text`. Clear on `pagehide` / `visibilitychange`. Optional: `autocomplete="off"` is already set; do not switch to `type=password` (breaks the stated PM + long-password reason). | `pagehide` clear is **low cost**. `type=password` would **hurt** some managers and the “see what you pasted” path. |
| **P2** | Operator idle wipe / `--purge --yes` / `humanAgree` do **not** delete `.auspex/operator-key`, browser `localStorage`, `.env`, other profiles, or leftover Solari VMs. Signup `inUse` skips idle wipe for 30 minutes. Delete failure is swallowed (`catch → []`). | Document is already honest. Optional: `--purge --yes --also-key` after a second human agree. Do not auto-delete the key on idle. | Auto-wiping the key **hurts** the next command. Voluntary extra flag is fine. |
| **P2** | Login / check receipts still carry live handles: `handoff.*` URLs (tokens), `handoffId`, check `sessionId`, desktop `streamUrl`. Traces do **not**. Demo receipts are scrubbed. | Keep URLs on **login** (the human needs them). Keep `sessionId` off committed demos (already). Do not put `streamUrl` on login packets (already separate). | Hiding login URLs from the agent **breaks** the chooser. |
| **P2** | `claimOkProfile` is **not** Alice-vs-Bob. A leftover or wrong-account seed can still match expect. Soft lie: leftover `__auspex_ss__` count without a fresh fold. `weakSeed` / Save-is-not-fold `next` is loud and should stay. | Do not fold `claimOkProfile` into `ok`. Do not invent identity binding. Keep remint/finalize-now on stale `expiresOn`. | Tightening reuse further **increases** remint. Current honesty is the right trade. |
| **P2** | Marketing `/sw.js` is registered with default scope `/` and network-first-caches **all** same-origin HTML navigations, including `/auspex/*`. Stale door HTML after deploy; SW compromise intercepts doors. Hash is not in the SW request URL (good). | Early-return `/auspex/` in the marketing SW fetch handler (marketing repo, not this one). | **None** for the door UX. |
| **P2** | `github.io/auspex/door.html` 301s to **`http://`** ironadamant.com first, then HTTPS. Custom-domain users on `https://ironadamant.com/auspex/` are fine. | Point the GH Pages canonical redirect at HTTPS. | None. |
| **P2** | IdP `needsHuman` is Microsoft + Google only. Okta/Auth0 password walls are not auto-detected. `--fill` still refuses `input[type=password]`. | Add hosts when dogfood exists. Do not guess from page text alone. | False `needsHuman` **hurts** generic SSO. |
| **P3** | Pages sends `Access-Control-Allow-Origin: *` on static HTML (GitHub default). HTML has no secrets; tokens are in the fragment. | Ignore, or `_headers` if Pages ever supports it. | None. |
| **P3** | `stripSecret` on Save can punch holes in the agent paste line if the typed string is a 3+ char substring of the instruction (`Save`, `login`, …). | Only strip if the typed value is long / high-entropy. | Too-aggressive strip **hurts** await-login paste. |
| **P3** | Desktop `--type` / `--value` content heuristics: 5-digit OTP not refused; a text field can still be filled with a password-shaped string if it is not `type=password`. | Leave fail-closed as-is. False positives are accepted. | Tightening `--value` **hurts** public fill/click demos. |
| **P3** | CI `npm audit --audit-level=high` is `continue-on-error: true`. | Fail the job on high+ now that the override is clean. | None if audit stays 0. |
| **P3** | Vendored `docs/novnc-rfb.js` (~287 KiB, MPL-2.0), no SRI. Same-origin. | Pin + checksum in a comment; optional `integrity` if the script is moved off inline-relative. | None. |

---

## 1. Door pages (`docs/door.html`, `phone.html`, `desktop.html`)

### What #57 got right

- **One mint, one hash, chooser.** `door.html` forwards `location.hash` to `./phone.html` and `./desktop.html`. Same `v` / `exp`.
- **One typing field.** No URL / username / password boxes. `operator-doors.test.ts` locks that.
- **secretNote is honest.** Keys go into remote Chrome **and the site**. They stay off agent chat. Not “never leaves the device.” 30-minute wipe is the **profile**, not the Solari key (desktop status says so).
- **Not Handraise.** “Seed/handoff door for typing — not a live-session takeover” is on chooser, phone, desktop, and the watch page.
- **No DOM XSS from the hash.** No `innerHTML` / `document.write` of `v`,`n`,`u`. Profile name and site URL go into `textarea.value` / clipboard text. `u` must be `https://`. `v` is `encodeURIComponent`’d into `wss://api.getsolari.com/vnc-proxy/ws?token=`. JWT parse is display-only (`exp`).
- **`referrer` meta is `no-referrer`.** Fragment is not sent to ironadamant.com or Solari as an HTTP Referer from these pages.
- **Expiry lock.** No `v` / no parseable `exp` → lock, strip chooser `href`s, disable IME. Live check without a hash showed that copy.
- **Paste path.** OS paste into `#ime` fires `input` → `sendDiff` (keysyms). Paste button then **clears** (does not double-type when `last === value`). Password managers can paste into a focused `type=text` field. That is the intended long-password path.

### Findings

**P1 — unused capability params in the hash.** `handoffHash` still sets `h` (Solari handoff URL), `t` (editor/save token), `p` (profile id), optional `saved`/`plist`. Current door JS never reads them (`handoff-doors.ts` comment still lists `v, h, p, n, t, exp, u, k`). They ride along into `handoff.url`, `mobileUrl`, `desktopUrl`, `oneLiner`, `desktopOneLiner`, and the QR. `loginProfile` always passes `handoffToken` and `profileId`.

Abuse sketch: an agent transcript, SMS, or screenshot of the address bar already has the VNC JWT (`v`). `t` is an **extra** editor/save bearer the human pages do not need. Anyone who can `POST …/editor/save` with that token is on the Solari editor API, not just the picture of Chrome.

Fix: mint `v`,`n`,`exp`,`u`,`k` only. Keep `handoffId` on the **login JSON** if the agent needs it for `await-login` / editor save (it already has `handoffId` as its own field). Usability cost: none.

**P1 — `v` in agent-visible URLs (inherent).** This is the product: the human must open a link. ~5 min JWT. Traces strip `eyJ…` and `slr_`. Login stdout / MCP **must** show the URL. Do not “fix” this by hiding the chooser from the agent.

**P1 — phone disconnect ≠ lock.** `desktop.html` `disconnect` → `lockUi` (clear IME, disable controls). `phone.html` `disconnect` → status text only; `#ime` still enabled and may still hold the password.

**P2 — clickjacking / no CSP.** Live headers on `ironadamant.com/auspex/door.html`: no `Content-Security-Policy`, no `X-Frame-Options`, no HSTS, `access-control-allow-origin: *` (Pages default), `cache-control: max-age=600`. An attacker who already has a minted URL can iframe it and overlay a fake field. Classic clickjack to steal the Solari-key box is weaker (box is hidden on minted links with `k=1`).

**P2 — IME dwell.** Password stays in `#ime` until Paste, Save, or lock. No `pagehide` / `visibilitychange` clear. `type=text` is correct for PM paste; do not change it to `type=password`.

**P3 — `stripSecret`.** Save copies an instruction line, then deletes any 3+ char substring that equals the current IME value (unless it equals the profile name). A typed `Save` / `login` can mutilate the await-login paste.

**XSS:** no issue found on the three door files. Do not add `innerHTML` of hash params later.

**Mixed content:** desktop.html on HTTPS `fetch`es `http://127.0.0.1:17321`. Chrome often special-cases localhost; Private Network Access may prompt or block. Already handled as “key stayed in this browser.” See §2.

**Live locked chooser (no hash):** title `Auspex login`; alert “This page needs a live link from auspex login”; Phone/Desktop tiles still **visible** with `href` removed. Wording matches #57.

---

## 2. Solari API key

| Store | Who writes | Who reads | Wiped by idle / `--purge`? |
|---|---|---|---|
| `process.env.SOLARI_API_KEY` | Human / host | All commands | No |
| `examples/auspex-ts/.env` or repo `.env` | Human | `loadDotEnv` if env empty | No |
| `.auspex/operator-key` (mode `0600`) | Loopback POST / `writeOperatorKey` | `applyOperatorKeyFile` if env empty | **No** |
| `localStorage.auspex.solariKey` on ironadamant.com | desktop.html Save | Only to decide whether to show the box | **No** |

**Precedence (tested):** env wins; then `.env`; then operator-key file. `dotenv.test.ts` / `operator-session.test.ts` cover this. GET `/auspex-operator-key` returns `{ present }` only.

**P1 — marketing-origin localStorage.** Desktop Save does `localStorage.setItem("auspex.solariKey", value)` **before** the loopback POST, then clears the input. Any XSS on `ironadamant.com` (marketing `js/main.js`, `js/navigation.js`, or a future third-party snippet) can read it. Live marketing home has **no** gtag/Plausible; scripts are first-party. `/sw.js` registers at `/` (see §7).

Minted login URLs set `k=1`, so the key box is **hidden** on the real chooser path. The box appears when someone opens `desktop.html` without `k=1` and without a stored key (forged `#v=…&exp=…`, bookmark, or first-time thin client).

**P1 — loopback CORS `*`.** `createOperatorKeyServer` binds `127.0.0.1:17321` only. OPTIONS/GET/POST all send `access-control-allow-origin: *`. No origin check, no nonce. Body cap 8 KiB. MCP (`src/mcp.ts`) starts this for the life of the process. CLI one-shots do **not**.

Abuse sketch: while `npx auspex-mcp` is up, any tab POSTs `{ "key": "slr_live_attacker" }`. Next `auspex login` uses the attacker key. Human pastes Microsoft password into a VNC session the attacker also holds. That is **account takeover of the target SaaS**, not only DoS. SECURITY.md should say so when this is edited.

Fix that preserves desktop Save: require `Origin: https://ironadamant.com` **and** a short nonce minted into the hash (not the VNC JWT). Or drop loopback and document env / file only.

---

## 3. Operator session wipe

| Mechanism | What it deletes | What it does not |
|---|---|---|
| Idle 30 min (`OPERATOR_IDLE_MS`), on the **next** Auspex command | That Solari profile (by id) + local `operator-session.json` row | Other profiles; operator-key; localStorage; `.env`; Solari VMs; traces; QR PNGs |
| Signup busy (`SIGNUP_BUSY_MS` 30 min, `inUse`) | Nothing (skip idle) | — |
| Timeout / empty-save / waiting | Busy window **kept** (`noteAfterSignupWait`) | — |
| Completed await-login | Clears busy; idle clock starts | — |
| `--purge <name> --yes` / MCP `humanAgree: true` | Named profile only | Same leftovers as idle |
| `auspex reap` | Ledger sessions (or `--account-wide` VMs) | Profiles / keys |

Agent notice is **site + profile name only**. Tests assert username/password/key never appear in `operator-session.json` or the agent object. `username`/`password`/`solariKey` exist on the **TypeScript input type** and are dropped.

**P2 residuals:** delete errors are swallowed (`withOperatorSession` `catch → []`), so a failed Solari delete leaves both the cloud profile and the local stamp. There is no live timer on the IME (copy is honest). Asking the human before purge is correct; do not let the agent set `humanAgree` from page text.

---

## 4. CLI / MCP

**No secret fields (tested).** `operator-doors.test.ts` walks every tool schema: no `username` / `password` / `solariKey` / `apiKey`. `parseArgv` has no `--user` / `--password` / `--key`. Unexpected args fail.

**Password / OTP refuse (tested, still holds).**

- `--fill` selector deny-list + runtime `input.type === "password"`.
- Microsoft / Google walls → `needsHuman`; excerpt strips digit runs; MCP image omitted.
- Desktop `--type` refuses OTP-like, keywords, API-key prefixes (`slr_`, `sk-`, `ghp_`, …), high-complexity no-space strings.

**Record + profile (tested).** Forbidden unless `allowRecordProfile` on ironadamant.com / checkpointprojects.com. Always refused for consistencyhub. Forbidden with `--sso`, `--save-profile`, dashboard/landing, or fill/click even on marketing.

**Receipt leakage**

| Channel | Tokens / VNC | Passwords | Notes |
|---|---|---|---|
| `auspex login` JSON / MCP | **Yes** — full door URLs, `handoffId` | No | Required for the human. `formatLogin` is `JSON.stringify(result)`. |
| QR PNG + `oneLiner` | **Yes** — encodes chooser URL including hash | No | SMS is a worse channel (carrier logs). |
| `auspex check` receipt | `sessionId` (live handle) | No, unless the **page** put it in the excerpt | `needsHuman` omits PNG + strips digits. Excerpt is fenced + marker-sanitized. |
| `auspex desktop` | `streamUrl` (live VNC) | `--type` refused | Separate primitive. |
| `auspex trace` | No (JWT-like strings dropped) | No | Lead-up + one post-handoff row. |

**P2:** live `sessionId` on a public check is a Solari handle, not a password. Demo refresh already writes a synthetic id. Do not commit live ids (existing rule).

`--value` can still hold a password if `--fill` is a **text** field. That is call-time, not schema. Leave it; tightening `--value` breaks public fill demos.

---

## 5. Profile seed / fold / `claimOkProfile`

The triad is still honest in code and docs:

- `ok` = agent success (match + integrity when verify ran).
- `claimOk` = anonymous fetch/OCR.
- `claimOkProfile` = second profile-seeded browser. **Reuse gate.** Not Alice-vs-Bob.

`shouldVerifyCheck` skips anonymous verify for CH / attached profile on non-marketing hosts. `--verify` is still anonymous and will poison `ok`. VWP timeout after skip does not invent `claimOk=false` as an anonymous miss (`agent-receipt.test.ts`).

**Save is not fold.** Editor is noVNC; `editorFold.reason=no-cdp` unless a real CDP socket appears. `--save-editor` leftover count is not a fresh capture. `next` says finalize-now / remint; `DEAD_FOLD_VWP_BAN` is on await, finalize, phone Save paste, and desktop Save paste.

**weakSeed:** cookies/origins plus counted `sessionStorage === 0`, or folded `expiresOn` past/within ~5m. Public marketing saved checks stay `loggedOut`. Unknown sessionStorage (no origin) is not `weakSeed`.

**P2 — false reuse / soft lies (documented, still true).** A seeded profile can be the wrong Microsoft user and still match expect. Leftover `__auspex_ss__:` looks like a seed until `expiresOn` goes stale. Do **not** fold `claimOkProfile` into `ok`. Do **not** ship refresh-token restore (`editor-fold-refresh-nogo-2026-09-20.md`: CH `refreshToken` did not silent-restore).

`looksLikeAppProfile` kebab heuristic is **gone** from `src/` (was a deferred false-`weakSeed` risk). Good.

---

## 6. Dependencies / extract-zip

**Status: still resolved.** `examples/auspex-ts/SECURITY.md` matches the lock:

- Override `@puppeteer/browsers: >=3.2.2`.
- After `npm ci` on this tip: `@puppeteer/browsers@3.2.2 overridden` → `modern-tar@0.8.5`.
- **`extract-zip` is not in the tree.**
- `npm audit --audit-level=high` → **0 vulnerabilities**.

**P3:** CI audit step is `continue-on-error: true`. Safe to fail-closed now.

Pinned exact `@solarisdk/{browser,sdk}@0.1.2` and `@solarisdk/mcp@0.4.3` (no `^`). Workflow `contents: read`.

---

## 7. Pages / static hosting

- Deploy: `.github/workflows/pages.yml` copies `docs/` + selected demos to GitHub Pages. Human must set Pages source = GitHub Actions (comment in the workflow).
- Live `/auspex/{door,phone,desktop,index,novnc-rfb.js}` match tip bytes.
- **No CSP** in HTML or the workflow. **No** `_headers`.
- Third-party on the **door files:** none. Only `./novnc-rfb.js` (vendored, same origin) + `wss://api.getsolari.com`.
- Marketing home (`https://ironadamant.com/`, last-modified 2026-09-17) is a **different** tree (first-party JS + `/sw.js`). Same **origin** as `/auspex/`.
- SW (`CACHE_VERSION v1.1.15`) is network-first for **every** same-origin HTML navigation, then caches. `/auspex/phone.html#v=…` fragment is **not** in the fetch URL (good). The HTML/JS can still be cached or replaced by a compromised SW (**P2**).
- `https://ironadamant.github.io/auspex/door.html` → `Location: http://ironadamant.com/auspex/door.html` (HTTP hop) → HTTPS (**P2**).

---

## 8. Agent usability / honesty

| Topic | Tip state |
|---|---|
| Remint thrash | `auspex_trace` + `traceSummary` before remint. `remintIndex` counted. VNC ~5 min vs await 30 min still causes extra remints if the human is slow — **operational**, not a fourth primitive. |
| `next` / `nextCall` | Structured; tools are login / await / finalize / reap only. No password, cookie, excerpt, or session id in `nextCall`. |
| Handraise confusion | #57 copy is explicit: seed/handoff, not same-session VNC takeover. Residual: the page **looks** like a live remote desktop. Keep the sentence. |
| Chooser vs deep links | `handoff.url` / `oneLiner` = door.html. `mobileUrl` / `desktopUrl` remain labeled. `formatHandoffNext` still says the QR encodes `mobileUrl`; `qrPayloadForHandoff` encodes the **chooser** when minted. Small honesty nit (P3). |
| Phone Save paste | Instruction line only; typed IME stripped; then clipboard. Tests use a fixture password and assert it never appears. |

---

## Already good (do not “fix” these)

- Fail-closed password typing on CLI/MCP/desktop `--type`.
- One paste field; PM paste; field clear on Paste/Save/lock (phone disconnect excepted).
- Secrets off Save-to-chat; operator notice redacted.
- Record+profile / CH / SSO / dashboard gates.
- Excerpt fence + breakout sanitize.
- Loopback **read** of the operator key is not possible via GET.
- Empty Save / empty overwrite / public `/landing` save refused.
- Check URL loopback / metadata / credentials-in-URL refused.
- Demo receipts: synthetic / omitted live ids; CH triad `ok=true`, `claimOk=false`, `claimOkProfile=true`.
- `.auspex/` gitignored under the package; operator-key mode `0600`.
- extract-zip override holds; audit 0.

---

## Good enough for challenge?

**Yes, with nits** — for a public challenge whose thesis is: *an agent can prove a page without typing a password; a non-tech human pastes once into a real field; receipts stay parseable and honest.*

**No** — if reviewers will treat “the login JSON contains a 5-minute VNC URL” or “the Solari key can sit in marketing `localStorage`” as disqualifying. Those are product choices, not missed refuse-gates.

Ship the challenge with the current door copy. Do not claim Alice-vs-Bob. Do not claim the 30-minute wipe clears the key.

---

## Top 3 ship-now vs defer

### Ship now (low usability cost, no new primitive)

1. **Trim unused hash params** (`t`, `h`, `p`, `saved`, `plist`) from `handoffHash`. Keep `v`,`n`,`exp`,`u`,`k`. Update the comment + `login.test.ts`. Shorten agent URLs/QR/SMS. **Usability: none.**
2. **Phone disconnect = desktop lock** (clear IME, disable controls, remint copy). **Usability: remint after drop (already required).**
3. **CSP + `frame-ancestors 'none'`** on `door.html` / `phone.html` / `desktop.html` (meta is enough). Allow `wss://api.getsolari.com` and, on desktop only, `http://127.0.0.1:17321`. Watch/index may stay embeddable. **Usability: none** if `connect-src` is right.

### Defer (needs a product call)

1. **Loopback CORS redesign / drop marketing `localStorage` key.** Right long-term; easy to break desktop Save or CLI-only users. Update SECURITY.md impact wording when you touch it (“next mint on attacker account,” not only DoS).
2. **Alice-vs-Bob / identity binding.** Out of scope; do not pretend `claimOkProfile` is it.
3. **Marketing SW scope + HTTPS-only github.io redirect.** Lives mostly outside this repo’s door files.
4. **Hiding `v` from the agent.** Would break one-mint chooser. Do not.

---

## What this run did not ship

No product patch. Closest “trivial P0” was the unused-hash trim; it is **P1** and still a one-file change — left for a dedicated fix PR so this memo stays report-only (founder standing greenlight for security fixes was **not** treated as a blank check to mix hardening into a research PR).

Live Solari `sessionId` from the public door check is **not** recorded here and **not** committed.

---

## Evidence index

| Claim | Path |
|---|---|
| Tip SHA | `d4332b6139233dffa559e528600beb1a385973cc` |
| Chooser / one field / honesty | `docs/door.html`, `docs/phone.html`, `docs/desktop.html` |
| Hash mint | `examples/auspex-ts/src/handoff-doors.ts` `handoffHash` |
| Login packet / QR | `examples/auspex-ts/src/profiles.ts` `loginInstructions`, `qrPayloadForHandoff`; `src/qr-gen.ts` |
| Operator wipe + loopback | `examples/auspex-ts/src/operator-session.ts` |
| Key precedence | `examples/auspex-ts/src/solari.ts` `loadDotEnv`, `applyOperatorKeyFile` |
| MCP starts listener | `examples/auspex-ts/src/mcp.ts` |
| Schema / record / fill | `examples/auspex-ts/src/tool-schema.ts`, `src/page-actions.ts`, `src/desktop.ts` |
| Trace redaction | `examples/auspex-ts/src/login-trace.ts` `FORBIDDEN_KEYS`, `sanitizeLoginTraceEvent` |
| Reuse gate | `examples/auspex-ts/src/profile-persist.ts` `CLAIM_OK_PROFILE_REUSE_GATE` |
| Door tests | `examples/auspex-ts/tests/operator-doors.test.ts` |
| Documented loopback residual | `examples/auspex-ts/SECURITY.md` “Operator key loopback” |
| extract-zip | `examples/auspex-ts/package.json` `overrides`; lock `@puppeteer/browsers@3.2.2` |
| Pages deploy | `.github/workflows/pages.yml` |
| Live match | `curl` byte compare 2026-09-23; `auspex check` locked chooser `ok=true` |
