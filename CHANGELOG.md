# Changelog

The npm package is `auspex-solari`. **Do not npm publish from an agent.** Founder publishes.

## 0.1.16 — 2026-09-30

npm `auspex-solari@0.1.16` (latest). Agents do not `npm publish`. Founder publishes this release.

Fixes from a wide review. Each has a test that fails on 0.1.15.

- **A 429 or 502 no longer ends the process.** When Solari refused to create a browser during a check with a timeout, the error was reported, but a cleanup promise also rejected unhandled and Node exited, taking the MCP server with it. Same fix in sandbox verify and desktop.
- **`profile-status` reports a bot check as `botWall`**, with no `nextCall`. It used to say `loggedOut` (or `weakSeed`) and point at finalize-login, which cannot get past a bot check.
- **`sweep` reports a bot check as could-not-tell**, not a fail, and no longer flags it as a regression.
- **The session ledger keeps every id under parallel calls.** Updates run one at a time and write atomically, so `reap` can find every browser this machine opened.
- **An unreadable idle timestamp no longer deletes a saved login.** It counts as used now; the operator state file is written atomically.
- **A failed job's `nextCall` makes progress.** It used to resume the same job id, which returns the same failure. Now it is a new job, or one check retry when the save already happened.
- **`connect` survives a failed Save signal and a closed terminal** (Ctrl-D) instead of crashing or waiting forever.
- **Cookie inventory on short `.ai` / `.io` names.** A login cookie on a parent domain (`.x.ai` for `grok.x.ai`) is the app's own, not third-party. Receipt fields only.
- Lockfile: `fast-uri` security update (npm audit). README: the second browser is the default only on public pages, and a Save that holds only the Microsoft or Google sign-in stops with no extra step.

## 0.1.15 — 2026-09-30

npm `auspex-solari@0.1.15`. Agents do not `npm publish`. Founder publishes this release.

- **README rewritten in plain language** for non-technical readers, with the 31-second demo and the phone-door recording playing inline (GIFs that link to sharper videos). Commands and MCP setup move under "For developers"; the last line points AI agents to AGENTS.md.
- **`await-login` names a refused save.** When Solari refuses the save (409) while the phone stream still has time left, `next` says Solari refused it instead of blaming the clock, and the receipt and trace carry `tokenStatus`, `editorSaveStatus`, and `streamLeftSec`. Status stays `stream-expired` (frozen enum).
- **Phone door: wait for the app, and "Copied" until the save is real.** The countdown tells the human to wait for the app before Save, the line after the tap says Copied (not Saved), and a link that runs out after the tap no longer claims Solari saved. The calm "Saved" finish stays for a real close after Save. (Live on GitHub Pages already.)
- The landing page plays both recordings and notes the 2026-09-29 one-command run (8 of 9; Canva stopped by a bot check).

## 0.1.14 — 2026-09-29

npm `auspex-solari@0.1.14`. Agents do not `npm publish`. Founder publishes this release.

- **A two-line Save line, and "saved" is enough.** The copied line is now "I tapped Save … for profile X" plus the one command to run (`connect --save X`, or `await-login --save-editor`). In an agent chat the human can just say "saved"; in a terminal running `connect`, Enter is Save. `connect`'s agent-mode instruction says so. No relay or third-party service.
- **Phone door: a calm finish after Save.** The countdown reads "Saved · link ends in m:ss", and when Solari closes the remote Chrome for the save (or the timer runs out) the page shows "Saved. Your agent takes it from here" instead of a reconnect spinner, "Save now", and "expired". Before Save, a dropped stream still reconnects.
- **Phone door: the Microsoft/Google banner is gone.** It could not tell when the human had reached the app (the stream never carries the page URL), so it stayed up on the logged-in app and after Save.
- **`await-login` keeps a successful save when the jar read hiccups.** A Solari error reading the saved login after an editor/save 200 used to discard the 200 and say remint; the read is retried once after 5 s, and a second miss is `JarReadAfterSave` (run `profile-status`). Exhausted SDK errors name the call (for example `POST /sessions`).
- **`connect` prints the receipt path with `~`** instead of the home folder, so pasted output does not name the account.
- **AGENTS.md is about 40% shorter** (9,209 → 5,661 words), with a "Which command" table, one copy of each rule, and Solari 409/502, no-phone-door, and `botWall` rows. `CLAUDE.md` loads it again with `@AGENTS.md`.

## 0.1.13 — 2026-09-29

npm `auspex-solari@0.1.13`. Agents do not `npm publish`. Founder publishes this release.

- **`connect`: one command for the whole login.** `npx auspex-solari connect <https> --expect <words>` shows the phone door link, takes Enter (terminal) or `connect --save <profile>` (agent) as Save, finalizes only when needed, runs `check --verify-with-profile`, and ends in one plain sentence. It says "Logged in" only when `claimOkProfile` is true. Without a terminal the wait ends with Solari's typing window. It stops at once when Solari mints no phone door. CLI only; MCP hosts keep `auspex_job`.
- **Microsoft MSAL finalize fallback in `job`.** When finalize was skipped because the save looked ready and a fresh browser lands logged out, finalize runs once and the check repeats. Never twice; `--skip-finalize` opts out.
- **Honest failure names.** A failed Solari editor/save keeps its status on the job (`editorSave`); `connect` names a 502 as Solari's side and a 409 as "not savable" instead of "no Save" or the clock. A Cloudflare-style bot check sets the optional receipt key `botWall` instead of `loggedOut` (frozen `reason` values unchanged) and never triggers the finalize fallback.
- The phone door's Save line names `connect`.
- Live run 2026-09-29 through `connect`: 8 of 9 apps confirmed; Canva not confirmed (bot check). [RECEIPTS.md](RECEIPTS.md#one-command-run-with-connect-2026-09-29).

## 0.1.12 — 2026-09-28 (published)

npm `auspex-solari@0.1.12`. Agents do not `npm publish`. Founder publishes this release.

- **README rewritten for humans** (reviewers and operators): about half the length, with the live-test table, the three results, install, the login door, and MCP. Agent detail stays in AGENTS.md and llms.txt, and the README points agents there. No code changes.

## 0.1.11 — 2026-09-28 (published)

npm `auspex-solari@0.1.11`. Agents do not `npm publish`. Founder publishes this release.

- **The npm CLI runs prebuilt JavaScript.** `npm run build:mcp` also bundles the CLI to `dist/cli.mjs`; an npm install runs it directly instead of compiling TypeScript with tsx on every call. A clone still runs the source, so an edit never meets a stale bundle.
- **No nested install for npm users.** Runtime dependencies moved to the root `package.json`. The nested `npm install` under `examples/auspex-ts` now runs only in a git clone (`bin/postinstall.mjs`), so `npm install --ignore-scripts auspex-solari` works (it used to fail with NotInstalled) and installs no TypeScript toolchain.
- The release smoke also runs `npx auspex-solari trace` from the empty folder, so a broken CLI cannot ship unnoticed.

## 0.1.10 — 2026-09-28 (published)

npm `auspex-solari@0.1.10`. Agents do not `npm publish`. Founder publishes this release. Closes the open items from the live test.

- **Receipt excerpts prefer the page's main region** (`<main>` / `role=main`) when it has real content, so menus and promo cards stop filling the 500 characters. Matching still uses the whole page.
- **`auspex profiles --keep <name>` / `--unkeep <name>`** (MCP `keep` / `unkeep`): exempt a saved login from the 30-minute idle wipe for long agent loops, outside a sweep plan. A human-agreed purge still wipes it.
- **`auspex profiles` is a read.** A plain listing no longer deletes idle logins; only a human-agreed `--purge` wipes.
- **Saved-login inventory:** `profileSeed.authCookieNames` names recognised login cookies on the app's site (Supabase `sb-*-auth-token`, Appwrite `a_session_*`, Clerk `__session`, `*_session`), and `thirdPartyCookieHosts` lists trackers and other cross-site cookie hosts. Names only; nothing is dropped. Sibling subdomains of the app (Appwrite on `appwrite.example.com` for `app.example.com`) count as the app's site.
- **Operator site stays the minted URL.** Later checks no longer overwrite it with the last URL probed.
- **Check URL guard** also blocks `metadata.google.internal` and AWS's IPv6 metadata address, matching its error message.
- Docs: canvas / live-sync apps need `waitFor`; read-only checks still run the site's own load behaviour (presence, writes on load). README: results of the live test across eight stacks.

## 0.1.9 — 2026-09-28 (published)

npm `auspex-solari@0.1.9`. Agents do not `npm publish`. Founder publishes this release. Everything below was found or confirmed in a live test of eight real sites (Lorari, Good Tape, Clozemaster, tldraw, Chatwoot, MariaDB Cloud, back4app, ConsistencyHub).

- **Refresh-token-only saves point to finalize when needed.** A `local-storage-auth` Save whose only auth key is a refresh token (no access token, no app cookie) now says: run the check, and if it lands loggedOut, finalize-login is next. Live ConsistencyHub (MSAL) needed exactly that; the old advice said never to finalize.
- **Receipt excerpts mask key-shaped text** (JWTs, `sk-`/`pk_`/`slr_` keys, long letter-and-digit tokens) before truncation. A live back4app overview printed its client key into a local receipt.
- **Late client-side redirects no longer fail a check.** When a page navigates itself after load (MariaDB Cloud `/alerts`, `/billing`, `/byoa`), the text read hit "Execution context was destroyed" and the check ended with no receipt. The check now settles on the new page and reads once more.
- `clickMissed` keeps Playwright's reason (the last call-log step, e.g. `<div> intercepts pointer events`, `element is not stable`), not only "Timeout exceeded".
- **Phone door Save reports the copy honestly.** It says Copied only when the clipboard write is confirmed. Otherwise the button reads Copy by hand, the page says the clipboard still holds its old contents, and the line on screen is selected. Before, a failed copy still said Copied, and a live tester pasted days-old text.
- **A missed click no longer ends the check.** When the click target is not found, the receipt comes back with the screenshot, `clicked` unset, `clickMissed` (first line of the error), `ok: false`, and a `next` that says to pick a selector that exists. Before, the agent got an error with no screenshot.
- **Empty saved login is one step to fix.** A check on a profile with 0 cookies and 0 origins now fails with `code: EmptySave` and `nextCall: auspex_login`. `auspex profiles` says what `populated` means (Solari holds a file; it can be empty).
- **Door links are never served stale.** Each minted `phone.html` link carries `?r=<exp>`, and the Pages deploy versions the three door scripts. Before, a tester could get the previous door for ~10 minutes after a deploy.
- **Phone door Clear** now empties the whole remote field (select-all + Backspace in remote Chrome) and drops keys not yet sent. Before, it only erased characters it was still tracking, so after Enter, Save, or autofill the remote field kept its text.
- **Phone door Save paste** says `npx auspex-solari …`. Bare `npx auspex` fetched the unrelated npm package `auspex` for anyone without a clone.
- **`auspex sweep` / `auspex_sweep`:** read-only check over an operator-written JSON plan (one site, up to 12 pages). Each page is pass, fail, or could-not-tell; could-not-tell is never a pass, and a live match the second machine cannot confirm is could-not-tell, not fail. A re-gate or 429 stops the sweep with one human step. Writes `report.md` + `report.json` (no page text); optional scrubbed webhook summary. Regressions compare only the same URL and expect.
- **`keepProfile`** in a sweep plan exempts that profile from the 30-minute idle wipe. A human-agreed purge still wipes it.
- **Release smoke** (`npm run smoke:release`, CI): runs the MCP server from the packed tarball on every push and from the npm release daily (with live verify). It fails on 0.1.5 (no `dist/`) and would have failed 0.1.7.
- CLI option values may start with `-` (`--expect "-20% off"`).
- Sandbox anonymous claim matcher is word-bounded like the live matcher.
- Profile-claim failure samples are short, fenced as untrusted, and have digit runs stripped.
- Receipt `diff` carries `previousExpect`.

## 0.1.8 — 2026-09-28 (published)

npm `auspex-solari@0.1.8`. Agents do not `npm publish`. Founder publishes this release.

- **Fix (0.1.7 regression):** an npm install wrote an absolute `/Users/<name>/.auspex/…` `screenshotPath`, and sandbox verify rejects home paths, so every verified check returned `ok: false` (`reason: network`) even though the page matched and `claimOk` was true. Receipts now write `~/.auspex/runs/…` (no username), and every reader expands `~/`.
- The sandbox home-path rule flags only real home directories (`/Users/`, `/home/`, `/root`, `C:\Users\`), so an `AUSPEX_HOME` such as `/srv/auspex` still verifies.

## 0.1.7 — 2026-09-28 (published)

npm `auspex-solari@0.1.7`. Agents do not `npm publish`. Founder publishes this release.

- **State location:** an npm install keeps local state in `~/.auspex` instead of the npx cache, so screenshots are at a path the agent can open and saved-login handles, jobs, and traces survive upgrades. A clone still uses `examples/auspex-ts/.auspex`. `AUSPEX_HOME` overrides both. Receipt `screenshotPath` is relative inside a clone and absolute otherwise.
- Tests run against a temp state dir. Before this, `npm test` wrote fake run folders and session ids (`s1`, `sbx-1`) into the real `.auspex/`, where `verify` (latest run), receipt `diff`, and `reap` could pick them up.

## 0.1.6 — 2026-09-28 (published)

npm `auspex-solari@0.1.6`. Agents do not `npm publish`. Founder publishes this release.

- **Fix: the published MCP server now starts.** 0.1.5 shipped without `dist/` because npm applied `examples/auspex-ts/.gitignore` inside the package, so `npx -p auspex-solari auspex-mcp` exited `DistMissing`. `examples/auspex-ts/.npmignore` now ships `dist/` and drops `__pycache__`.
- **Fix: bundled MCP tools no longer fail with `ENOENT dist/assert_receipt.py`.** The script resolves from `../src` when running from `dist/`.
- `check --record` with no profile on a public deep link is no longer refused as `recordedLoggedIn`.
- A single-word expect in a nav menu (`Home` / `Dashboard` / `Settings`) matches again. `One Dashboard` on one line is still refused.
- `phone.html` stays hidden when framed by another site.
- MCP `serverInfo.version` reports the package version.
- One check can fill one field and click one control. A later check starts a new browser, so a form opened in the first check is not still open. Documented ceiling only. Multi-step page actions are not in this change.
- `auspex solari-health` / `auspex_solari_health`: cheap Solari preflight. `GET /profiles` once, with an 8 second cap. `ok` means the key was accepted. It does not mint a browser, open the phone door, or say the app is logged in.

## 0.1.5 — 2026-09-27 (published)

npm `auspex-solari@0.1.5`. Agents do not `npm publish`. Founder publishes this release.

- Phone-only door (#116): a new login opens `phone.html` on a phone or a computer. Old `door.html` and `desktop.html` links redirect to that page and keep the hash. **Clear** empties the whole typing field. Delete is gone.
- Save stays honest inside the ~5 minute Solari token (#118). Clipboard Save signals a running await, and `editor/save` runs when that signal arrives. A failed save does not claim cookies. Auspex does not extend the JWT.
- Concurrent `login --wait` and `await-login --save-editor` (#119): one path owns `editor/save`. The other exits `sibling-saved` and does not report `stream-expired` when the sibling already posted or is posting. It does not read the jar. The Solari JWT `exp` is unchanged.
- Phone-door copy (#120): the page is Solari's remote Chrome. Saved login data stays on Solari, not on this phone or desktop, and not in Auspex.
- Phone-door demo (#121): the README shows the `phone.html` recording (countdown, Clear, Solari remote Chrome). The desktop-door clip is gone.
- Solari live 409 (#123): `editor/save` text "isn't in a savable state" enters the documented retry (one live `editor/token` check, then `stream-expired`). The older "not in a savable state" check never matched, so await waited out the JWT. This does not extend the Solari JWT.
- Docs hygiene (#122): PLAN.md and PITCH.md stay off the public tip.

## 0.1.4 — 2026-09-26 (published)

npm `auspex-solari@0.1.4`. Later main commits through #123 ship in `auspex-solari@0.1.5`. Agents do not `npm publish`. Founder publishes.

- Editor 409 reuse and purge honesty: a live editor is reused instead of a purge-and-remint loop. Voluntary purge calls `stopProfileEditor` before wipe. If the wipe misses, `ok` is false and `wipeFailed` names the profile.
- `check --fill` waits out Loading document chrome before type, then settles and re-reads visible `innerText`. `filled` is set only when that paint contains `--value`. A value glued only to the placeholder does not count. Evaluate payloads stay `__name`-safe source literals.
- ConsistencyHub dogfood green: both docs land and `filled` on tip `d2bedff`.
- Cookie and localStorage Solari Saves are a first-class shape. `seedReadiness` reports counts and allowlisted key names only (`cookie-strong`, `local-storage-auth`). `solariSaveReady` is not `claimOkProfile`. IdP hosts alone stay refused. `weakSeed` and IdP-only still block `--verify-with-profile`. Apps that want phone Save to become reusable still dual-write a short-lived token to localStorage, or set a first-party session cookie, on their side.
- Solari SDK exhaustion (`exhausted N attempts`, status stripped, cookbook #56) is `SolariSdkExhausted` with `solariBlame`: `unknown-exhausted` (remint), `infra-5xx` (wait once when the cause still has 502–504), `stealth-pool-empty` (drop `--stealth` or wait once), or `concurrency` (ledger `auspex_reap`). Never `loggedOut` or `needsHuman`.
- Await `preflight: low` when the VNC JWT has 90 seconds or less left. The Save poll uses that short cap. Auspex does not extend the JWT. Remint table: [docs/stream-jwt-solari.md](docs/stream-jwt-solari.md).
- `--verify-with-profile` is refused on `weakSeed`, `emptySave`, and a dead fold. No claim session. Save is not sessionStorage.
- `auspex_reap` receipts include `ledgerCount`, `accountWide: false` by default, and a note that Solari has no `GET /sessions` (cookbook #61). Measured Starter concurrency is 18 vs marketed 20 (#57). Dead sessions can look active for about 10 minutes (#25).
- Phone door docs cite cookbook #80. The native text field is the seed-door workaround. It is not a same-session takeover.

## 0.1.3 — 2026-09-24 (published)

npm `auspex-solari@0.1.3`. Later main commits through #114 ship in `auspex-solari@0.1.4`.

Tip after #61–#65 (public-landing expect, `hostChanged` remint, door IME/Save, Site-URL `stripSecret`). This release adds:

- Phone door (Chrome-on-phone dogfood): brief background (password manager / Mail) pauses and reconnects the same VNC JWT instead of an immediate remint. Autofill-discoverable typing field (`current-password`, optional `one-time-code`). `stream-expired` stays honest when the JWT is gone or reconnect fails. Solari editor tokens remain ~305s — no client-side TTL extend (verified: `POST /editor/token` has no TTL; door hash is `v,n,exp,u` only).
- Slim `examples/auspex-ts`: short shared tool copy (`tool-copy.ts`), one `nextCall`/`scrub` path, CLI/MCP over shared `runners.ts`, lazy MCP boot (light tools do not import desktop/sandbox), CI-built `dist/` (not committed; founder `npm run build:mcp` / `prepublishOnly` before publish), stub `demo/replay.html` generated from `replay.ndjson` in Pages. Fail-closed reasons and receipt schema v1 unchanged.
- Honesty after slim #79: clone MCP is `npm install` + `npm run build:mcp` (`bin/auspex-mcp.mjs` fail-closes `DistMissing` if `dist/mcp.mjs` is absent; do not commit `dist/`). Committed `demo/replay.html` is a stub — watch the Pages player or `npm run generate:replay`. `auspex_desktop` MCP/CLI go through `runners.runDesktopDoor`. Assessor live job-receipt still parked.

- Agent-local durable job compose: `auspex_job` / `auspex job` (mint→await→finalize→check) plus `auspex_job_status`. Optional operator-local `AUSPEX_WAKE_WEBHOOK` / `--wake-webhook` (not a Solari push API). Fail-closed `nextCall` matrix, ledger reap on 429, secret-aware scrub on job/status/webhook payloads. Step tools remain for debugging.
- Parseable await-login fail-closed: `stream-expired` (VNC/phone JWT), `editor-save-hung`, `profile-busy`, with remint `nextCall`.
- Door-card copy: Console Save is not fold; unique expect; `hostChanged` first-run; keep-marker collision hardened.
- Reviewer 5-minute path, blame matrix, door-card API examples, dogfood pack (`host-changed-receipt.json`).
- Official apply-path hygiene: tag `@harrychow_` `@getsolari` on LinkedIn or X; Discord is setup help only. Outbound copy stays with the founder (no in-repo post draft).
- Weekly `public` docs match observed Actions run 35605123361 (secret present, ironadamant + checkpoint `ok: true`). Do not remove the secret.

## 0.1.2 — 2026-09-21 (published)

npm `auspex-solari@0.1.2`. Later main commits #61–#65 shipped in published `auspex-solari@0.1.3`.

## Fail-closed / Solari-workaround labels (PR hygiene)

Use these labels on PRs when they apply (create the label in GitHub if missing):

| Label | Meaning |
| --- | --- |
| `fail-closed` | Receipt/`status` refuses a lie (`hostChanged`, `expectMatchedPublicLanding`, `stream-expired`, password fill, empty Save). |
| `solari-workaround` | Honest handling of a Solari-native limit (noVNC, editor 401, no CDP fold, 429 reap, 402 plan). |

See `.github/PULL_REQUEST_TEMPLATE.md`.
