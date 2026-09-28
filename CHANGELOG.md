# Changelog

The npm package is `auspex-solari`. **Do not npm publish from an agent.** Founder publishes.

## Unreleased

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

npm `auspex-solari@0.1.8` (latest). Agents do not `npm publish`. Founder publishes this release.

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
