# Changelog

The npm package is `auspex-solari`. **Do not npm publish from an agent.** Founder publishes.

## Unreleased

- **A sign-in window that closes before Save is no longer reported as a Solari refusal.** Live on Canva, the human was still clearing a captcha and 2FA when the five minutes ran out, and `connect` said "Solari refused to save the login (HTTP 0: stream-expired before Solari editor/save…)". Auspex writes that stand-in itself when the window closes; Solari refused nothing. `connect` now says "The five-minute sign-in window closed before Save." and that the new door reopens the same cloud browser while Solari keeps it, so a sign-in under way can carry on (the Canva remint did).

- **The public proof is a live run's receipt, readable without downloading logs.** A research pass could not tie the README's "run 36678582381: 0.1.24, `ok: true`" to that run without its logs (they do say it), and the committed public receipt carried a placeholder session id with no date or version. CI now writes the published package's public check to the run page and uploads its receipt and screenshot as the `auspex-public-evidence` artifact, with Solari ids withheld and the package, version, time, and run URL stamped in. The docs now cite [run 36789267135](https://github.com/IronAdamant/auspex/actions/runs/36789267135) (published 0.1.28, `ok: true`, `claimOk: true`), and its receipt and screenshot replace the committed ones. The session id is withheld outright, not faked.

- **Two sentences say exactly what they mean.** "`ok=true` requires `claimOk=true`" now says it holds when the anonymous check runs (the default; `--no-verify` skips it). The CLI help no longer calls the saved checks "not the stranger path" while the README offers `--name ironadamant` as a reviewer's live check.

- **A public check's receipt no longer carries `profileSeed` and `seedReadiness`.** The CI receipt for ironadamant.com (no saved login) said `seedReadiness` "post-save", shape "empty", which reads like a failed save. They now appear only with a saved login, as AGENTS.md always said. The committed 0.1.28 receipt keeps them, because it is that run's output verbatim.

- **Words on `<input type="submit">` buttons count as page text.** Trello's add-card page draws "Send to Today" as `<input type="submit" value="Send to Today">`; the screenshot showed it and the check said it was missing, because `innerText` leaves input values out. The live browser, the second browser, and the anonymous fetch now all read the labels of visible submit, button, and reset inputs. Text typed into a field is still not page text, so an agent cannot "find" words it filled in itself. That page then created a card in one click, and both browsers confirmed it on the board.

- **After a click, the excerpt is an overlay the click opened, not a cookie banner that was already there.** On Trello, after clicking Templates, the excerpt was Atlassian's cookie banner: open before the click and still open on the new page. Overlays open before the click are no longer taken as what the click showed; a menu or dialog the click opened still is.

- **Excerpts skip cookie-consent banners.** A fresh cloud browser sees one on most sites; Atlassian's took 290 of the excerpt's 500 characters, and Trello's new card fell off the end. The excerpt now drops a visible consent banner outside `<main>` (unless the click opened it, such as Preferences). Matching still reads the whole page.

## 0.1.28 — 2026-10-01

npm `auspex-solari@0.1.28` (latest). Agents do not `npm publish`. Founder publishes this release.

tldraw retried live (it logged in first time; the earlier Save 502 was Solari's and transient) and explored with connect, check clicks and fills, sweep, the MCP check, profile-status, and trace. Two privacy fixes (receipts and trace named the home folder; a click error quoted a capability link), a Save retry on a Solari 5xx, and clearer click, fill, and sweep results. Each fix has a test; the release smoke now scans every receipt field for home-folder paths.

- **A Solari 502 on Save gets one retry before the human is sent back to sign in.** Live on tldraw, Solari's editor/save answered 502 "Failed to export storageState" with over two minutes of the sign-in window left, and Auspex asked for a whole new sign-in; the same save worked the next morning. On a 502, 503 or 504, Auspex now waits 5 s, checks the remote browser is still live (the same token check the 409 path uses), and saves once more. `editorSave.retriedAfter` records it. If the browser is gone or the retry fails too, the Solari status stands exactly as before: nothing saved, not `stream-expired`, and `connect` says a retry was tried.

- **A covered click names what is on top and how to click it.** tldraw's sidebar lays a transparent link row over each file name, so `--click "text=Random Test"` found the text but the link took the click, and the advice said "nothing matching that selector became visible". It now says `<a aria-label="Random Test"> lies on top of it and takes the click` and suggests `role=link[name="Random Test"]` (which then opened the file live), while warning that a banner or dialog cannot be got past in one check.

- **Click errors no longer copy link addresses into the receipt.** The same miss quoted the covering link's HTML, including `href="/f/…"`: the id of the user's other tldraw file, which opens it for anyone who has it. Quoted elements keep only id, class, role, aria-label, name, type, title, and data-testid.

- **A fill target that never appears says so.** tldraw's search box exists only after its Search button is clicked, and a check fills before it clicks; the error said the text "does not contain --value". It now says nothing matched, and why a field behind a button cannot be filled in the same check.

- **`--fill` refuses a Playwright-only selector at once.** The typed value is read back with `document.querySelector`, so `text=`, `role=`, `>>`, `:visible`, and XPath fill selectors could never be found (each after a 12 s wait). They are now refused before a browser opens, naming CSS forms that work. `--click` still takes both, and the MCP descriptions now say so (click was described as CSS only).

- **Failure JSON has no terminal colour codes.** A `--wait-for` timeout's `error` carried Playwright's `\u001b[2m` escapes.

- **The live check waits for late-drawn words as long as the second browser does.** In a tldraw sweep, a file page's first read had only the sidebar; the screenshot a moment later showed "Page 1", and the second browser with the saved login saw it, yet the row said fail. The second browser re-reads for up to 2 s (5 s on a nearly empty page) before a miss, and the live check read once. It now re-reads with the same budget (a test keeps the two equal); the same sweep then passed 3 of 3.

- **A sweep row where the two browsers disagree is "could not tell", not "fail".** If the live browser still misses words the second browser saw, the row says so and suggests `check --wait-for`.

- **Receipts no longer carry the home folder.** `screenshotPath` was relative (clone) or `~/…` (npm), but `verify.runDir` and `diff.previousRunDir` were absolute paths naming the user's home folder, in every check receipt; receipts get attached to PRs. Both now use the same `toStatePath` rule. The release smoke checked only `screenshotPath`; it now scans every field of the receipt, and fails published 0.1.27 on exactly those two fields. `trace` had the same problem in `tracePath`; it is fixed too, and the smoke scans the trace output the same way.

## 0.1.27 — 2026-10-01

npm `auspex-solari@0.1.27`. Agents do not `npm publish`. Founder publishes this release.

Live test on eight apps. Seven logged in and were explored by clicking (Lorari, Good Tape, Clozemaster, Chatwoot, MariaDB Cloud, Back4App, ConsistencyHub); tldraw's save hit a Solari 502 and nothing was saved. Two privacy fixes (email addresses in excerpts, an OAuth code in a click error), one fill fix, and robustness and clarity fixes found on real pages. Each fix has a test.

- **Receipt excerpts no longer keep email addresses.** A logged-in page shows the account's email (Lorari's account menu did, in a live run), and receipts are kept on disk and copied for PRs by `reap --pack-receipts`. Excerpts now show `[redacted-email]`, as job files and webhooks already did. Matching still uses the full page text.

- **After a click, the receipt excerpt shows the dialog the click opened.** Clicking Good Tape's "Explore plans" opened a "Choose your plan" dialog, but the excerpt kept showing the page underneath, so an agent reading the receipt could not see what its click did. Without a click, an open dialog is usually a cookie banner, so the page stays the excerpt there. Matching still reads the whole page.

- **A missed click says why.** Exploring Clozemaster, `--click "text=Collections"` failed because two elements matched (one hidden, for mobile), and the advice said to "pick a selector that exists there". The receipt now says how many elements matched and suggests `>> visible=true`, `>> nth=N`, or a role selector; a hidden first match gets `>> visible=true`; a timeout says nothing matching became visible.

- **After a failed Solari save, `nextCall` says remint, like the text.** On a live tldraw run Solari's editor/save returned 502 ("Failed to export storageState"). The receipt's `next` said "Remint now" (the documented step: nothing was saved), but `nextCall` said `auspex_await_login`, so an agent taking `nextCall` would wait again on a save that did not happen. It now points at `auspex_login`.

- **The saved-login second browser no longer reports a working login as broken when the page navigates while loading.** Live on MariaDB Cloud, the dashboard navigated during the second browser's read ("Execution context was destroyed"), so `claimOkProfile` came back false with "do not reuse this seed. Stop the loop" for a login that worked. The second browser now settles and reads again, as the first browser always did; two reruns confirmed the login.

- **A missed click no longer puts an OAuth code in the receipt.** On MariaDB Cloud a click waited while the app refreshed its sign-in, and the `clickMissed` text quoted the redirect URL with its live `code=` and `state=`. Secret query and hash parameters (codes, state, tokens) in `clickMissed`, `finalUrl`, and check error text now read `redacted`; host, path, and hash routes stay.

- **A fill or click waits for the page to settle first.** The same MariaDB click landed during that sign-in refresh: once on a page that was then replaced (the menu vanished), once timing out. A check with `--fill` or `--click` now waits (bounded) for network idle and, with a saved login, for the page to leave any sign-in URL. A click that still loses a navigation says so instead of "nothing matching became visible".

- **After a click, the excerpt also shows a menu the click opened.** MariaDB's Manage menu is not a dialog, so the excerpt showed the dashboard underneath and the click looked like it did nothing. A popup named by an expanded menu button (`aria-haspopup`, `aria-expanded`, `aria-controls`) now counts like a dialog.

- **A saved-login check no longer crashes when the app redirects right after load.** MariaDB Cloud refreshes its sign-in just after the page loads. When that landed during Auspex's session-storage read after `goto`, the whole check failed with "Execution context was destroyed", `retryable: false` and no receipt (Billing and AI Agents did, 3 of 3 for Billing). That read is now skipped on a navigation race (the new page already ran the restore script), and the page read retries up to three times for an app that redirects twice. Billing then opened 3 of 3, and `claimOkProfile` stayed true.

- **`--fill` replaces what a text field held instead of adding to it.** On ConsistencyHub, filling the document title (which said "Untitled") with "Auspex probe" produced "UntitledAuspex probe": the text was inserted at the caret, and the fill still reported success because the field contained the value. An input or textarea is now emptied before the text goes in, as Playwright's own fill does. Rich-text editors are unchanged. The corrected fill then renamed the document, and a new "Pirate Hunt Log" document was written, saved, and confirmed by a second browser.

## 0.1.26 — 2026-10-01

npm `auspex-solari@0.1.26`. Agents do not `npm publish`. Founder publishes this release.

Final review pass (2026-10-01). Two security fixes (the anonymous fetch and the live check could be pointed at cloud metadata through a redirect or DNS) and five accuracy and robustness fixes. Each fix has a test.

- **The anonymous fetch never follows a redirect, or DNS, to cloud metadata.** It refused to start at such an address, but Python's `urllib` followed redirects on its own, so a public page that redirected to `169.254.169.254` was fetched from inside the Solari sandbox (the text never came back, but `claimOk` for a chosen expect answered yes/no about it). Redirects there, and names that resolve there, are now refused.
- **`check` refuses a URL whose DNS points at loopback or metadata** (`169.254.169.254.nip.io`), before any Solari session; a landing whose DNS points there keeps nothing. The saved-login second browser also keeps no text sample from such a landing.
- **Host-change detection knows more sites.** Two companies under `com.sg`, `org.uk`, `com.hk`… or two apps on `vercel.app`, `netlify.app`, `github.io`… were one "site", so a login saved on the wrong one was not flagged `hostChanged`. One shared rule now covers country suffixes and shared hosting.
- **Sign-in pages at `/signin`, `/sign-in`, `/users/sign_in`, `/account/login`** count as sign-in pages (only `/login` and `/auth` did): a dead login landing there is `loggedOut`, a save there is refused, and `profile-status` without `--expect` says what its `loggedIn` means.
- **Solari HTTP calls that had no timeout now have one**: the login-handoff POST (60 s, a named `SolariTimeout`), the session-status read (5 s) and reap's release (15 s), instead of Node's 5-minute default.
- **The MCP image of a tall page is readable.** A 1280×3139 page used to arrive as a 417-px-wide sliver; a tall page is now cropped to its top before scaling, and the result says so.

## 0.1.25 — 2026-09-30

npm `auspex-solari@0.1.25`. Agents do not `npm publish`. Founder publishes this release.

Docs only; no change to how a check works. The npm page's README now matches GitHub: it cites the green Actions run 36678582381 (live checks and the published 0.1.24 package) and today's ConsistencyHub and tldraw sign-ins. AGENT-CARD's opening names the second check plainly (a fetch for a public page, a saved-login browser for a logged-in one), and RECEIPTS no longer calls either claim a "sandbox claim".

## 0.1.24 — 2026-09-30

npm `auspex-solari@0.1.24`. Agents do not `npm publish`. Founder publishes this release.

Third review pass, plus fixes from live tldraw testing on 0.1.23 (connect login, repeat check, profile-status, a four-page sweep, MCP, the published package, and a logged-out check; all passed once `check --url` was fixed). Each fix has a test.

- **An npm install audits clean.** The published package listed Solari's own MCP server (`@solarisdk/mcp`) as a dependency, though only the clone's contributor path uses it. It pulled `puppeteer-core` and a vulnerable `extract-zip` into every install: `npm audit` reported 5 high findings, and `node_modules` was 99 MB. Now 0 findings and 41 MB. The clone keeps it; its lockfile also takes `ip-address` 10.7.2.
- **One saved-login idle clock for both installs.** Each install kept its own 30-minute clock, but Solari shares saved logins across installs, so a login used a minute ago from a clone could read as idle to the npm install and be deleted by its next command. A clone now also records uses in `~/.auspex`, and both read the latest use.
- **A saved login already deleted elsewhere stops being tracked**, instead of costing a Solari profile list on every later command.
- **`check` accepts `--url`.** The "Next time" command `connect` prints after a login (`check --profile … --url … --expect … --verify-with-profile`), and the same shape in AGENTS.md, the landing page, RECEIPTS, both READMEs, the Cursor rule and DEMO.md, all failed with "unexpected arguments: --url". Found by running connect's own hint after a live tldraw login. A test now parses every command in the docs' code blocks.
- A usage error prints the message and that command's usage line, not the whole 60-line help.
- `check --verify-with-profile` prints progress while the sandbox and the second browser run (it went quiet after `:: closing`). Receipt guidance names `AGENTS.md` instead of `docs/ops-runbook.md`, which npm users do not have.
- AGENTS.md's CLI reference now matches the CLI's own usage text (it lacked `--auth-keys` and one `--expect`), with a test. The host paste block points agents at `AGENT-CARD.md`, which the package ships.

## 0.1.23 — 2026-09-30

npm `auspex-solari@0.1.23`. Agents do not `npm publish`. Founder publishes this release.

Second review round, mostly from probing the published 0.1.22 CLI and MCP server with bad input, plus two items the freeze had held back (run-folder pruning, smaller MCP tool text). Each fix has a test.

- **A profile name can no longer be a path.** The name becomes a local file name (`.auspex/editor-save/<name>.json`, the Save signal files), and `../../package` resolved to the clone's own `package.json`. Names with `/`, `\` or control characters are now refused (CLI and MCP); normal names are unchanged.
- **`login`, `job` and `connect` refuse loopback and cloud-metadata URLs up front**, like `check` always did. `connect http://localhost:3000` used to send the human through the sign-in and fail only at the final check.
- **A job that fails on a missing key or a plan refusal (402, 403) has no `nextCall`.** It pointed at "start a new job", which fails the same way.
- **`desktop` refuses a password-like `--type` before booting a VM**, not after a paid desktop had started (about a minute later).
- **One process-alive check.** The profile lock and the Save folder treated a live process of another user as dead, so such a lock could be stolen.
- `verify` with no run names the folder as `~/.auspex/runs`, not the account's home path.
- **Old run folders are pruned.** `.auspex/runs` kept every check's screenshot and receipt forever (about 150 KB each). When a run starts, folders past the newest 200 are deleted, never one under an hour old. `AUSPEX_KEEP_RUNS` changes the number (`0` keeps all). Two runs started in the same second no longer share a folder (one screenshot overwrote the other).
- **MCP tool text is 31% smaller** (about 8,000 → 5,500 tokens that every agent session loads). Same rules and facts; repeated rules, fill-engine internals and restated tables are gone. Tool text pointed at `docs/`, which the npm package does not ship; it now points at `AGENTS.md`. A test keeps the total under a budget.

## 0.1.22 — 2026-09-30

npm `auspex-solari@0.1.22`. Agents do not `npm publish`. Founder publishes this release.

From a clean-up and wiring review (Claude). Same features and contract; each fix has a test. Proven live on this code: ConsistencyHub (Microsoft sign-in) logged in end to end with `connect`, including the one-time finalize fallback (`claimOkProfile=true`), then purged.

- **Ctrl-C and SIGTERM close the Solari sessions the command opened.** Nothing handled a stop signal, so Ctrl-C mid-check (or an MCP host stopping the server mid-call) left the browser holding a Solari slot until `reap`. The CLI and the MCP server now release their own ledger rows first (at most 8 s), then exit 130 or 143. The `bin/` launcher passes the signal on instead of dying and orphaning its child. Live: a check interrupted at `goto` released its browser in 0.3 s.
- **MCP progress works with real clients.** Progress notifications used a made-up token, so SDK clients logged "unknown progress token" on each one and could not use them to keep a long call alive. They now use the client's own `progressToken` with a rising count, and are sent only when asked for.
- **`job-status --wait-ms` answers at once for a completed or failed job** instead of sleeping the whole wait.
- **One Solari profile list per logged-in check** instead of two (one fewer round trip).
- **`check` and `finalize-login` print `::` progress lines** on stderr, like `login`, `job` and `sweep`. Stdout is still one JSON object.
- **One flag reader for every command.** `job` and `connect` now read a value that starts with a dash (`--expect "-20% off"`) the way `check` always did.
- Clean-up: the MCP server version comes from `package.json`; the MCP sweep tool gives the same "not readable JSON" message as the CLI; dead exports and a duplicate `.env` parser removed; `cli.ts` 701 → 510 lines.

## 0.1.21 — 2026-09-30

npm `auspex-solari@0.1.21`. Agents do not `npm publish`. Founder publishes this release.

Easier for AI agents to operate. Proven live: Clozemaster and Lorari logged in end to end on this code (`claimOkProfile=true`).

- **The door QR comes with the link.** `job` and `connect` now write a QR image of the phone door when they mint. `connect` prints `QR code image: <path>` next to the link (so an agent in the background can hand it to the human), the job's `handoff.qrPath` records it, and `auspex_job` attaches the image while it waits, so an MCP host can show it to scan.
- **`solari-health` names the environment**: `install` (npm, clone, or AUSPEX_HOME), `stateDir` (where jobs, receipts and the Save folder live; home shown as `~`), and `command` for this install.
- **One-page agent card.** `AGENT-CARD.md` (about 900 words, shipped in the package) gives an agent the command table, one copyable pattern for waiting on a human (shell and MCP), how to read the three answers, when to stop, and the environment traps. CLAUDE.md loads the card; AGENTS.md stays the full contract.
- **`connect`'s hints name the command for its install** (`npx auspex` from a clone, `npx auspex-solari` from npm): the Save hint, "Next time", the one-retry hint and the wrong-site hint.
- Landing page: a copy button on each command block. CI test fix for Linux (no product change).

## 0.1.20 — 2026-09-30

npm `auspex-solari@0.1.20`. Agents do not `npm publish`. Founder publishes this release.

From a second wide review and two live `connect` runs (Lorari on 0.1.19, Clozemaster on this code). Each fix has a test.

- **One stray line no longer shuts the MCP server down.** A line that was not JSON closed the stdio transport for good; it is now reported and skipped, like the MCP SDK's own transport. `Content-Length` framing errors still close the connection.
- **`connect --save` reaches a waiting `connect` from either install.** A clone keeps its state inside the clone, so the phone's Save line (`npx auspex-solari connect --save`) could not reach a `connect` started from a clone. A waiting `connect` now leaves a pointer in `~/.auspex/save-drain`. `connect`'s own hint names the command for its install.
- **The anonymous check reads page text only.** Words that appear only in the `<title>` (or an inert `<template>`) no longer count as seen. example.com's redesign keeps "Example Domain" only in its title; the first-run example now expects `documentation examples`.
- **Nothing is kept from a page that redirects to loopback, link-local or cloud metadata**: no page text, a blank screenshot, no saved login. The anonymous check never fetches such an address.
- **Lock races.** A save lock, or the editor/save owner lock, is no longer taken in the instant between its file being created and its PID being written.
- **Replay redaction** blanks hidden form fields (sign-in flow tokens) and token-like link parameters; the committed demo replay is re-redacted and no longer carries a real name.
- Docs: the anonymous check is an HTTP fetch of the page text (OCR only where Tesseract is installed, which Solari's base sandbox is not); live evidence cites Actions run 36638435165; the reviewer five-minute page is current.

## 0.1.19 — 2026-09-30

npm `auspex-solari@0.1.19`. Agents do not `npm publish`. Founder publishes this release.

From an end-to-end trace of `connect` → `job` → `check --verify-with-profile`. Each fix has a test that fails on 0.1.18.

- **A refused second browser is named for what it is.** When `--verify-with-profile` is refused (`weakSeed`, `emptySave`, or an IdP-only save), the words had matched, but `job` reported `mismatch` and `connect` told the human their words were not on the page. `job` now reports `weak-seed` (new), `empty-save`, or `idp-only-save` (with the IdP-only kind), and `connect` words each one.
- **`connect` ignores an Enter typed before the login link appears.** A spare Enter at the words prompt was taken as Save the moment the link showed, before anyone had signed in.
- **Replay redaction blanks one-time codes and value changes that arrive without a field type** (public `--record` replays only).

## 0.1.18 — 2026-09-30

npm `auspex-solari@0.1.18`. Agents do not `npm publish`. Founder publishes this release.

- **`reap` leaves another running command's browsers open.** The ledger records which process opened each session and when. `reap` (including a job's own reap after a 429) skips a browser or VM whose process is alive and that was opened less than 10 minutes ago, and lists it in `inUse`. A crashed command's sessions, anything older (a leak in a long-running MCP server), and entries from an older ledger are still released. `--session` / `--vm` always release the named id. Before, `reap` closed every ledger browser, including a parallel check's mid-run.

## 0.1.17 — 2026-09-30

npm `auspex-solari@0.1.17`. Agents do not `npm publish`. Founder publishes this release.

Second pass of the review. Each fix has a test.

- **`claimOkProfile` is never true on a sign-in page.** The second browser used to match text only, so a dead saved login that bounced to `/login` (or a Microsoft or Google sign-in host) could pass the reuse gate if the words were on that page. It now fails closed there, as `check` already did.
- **`--fill` refuses a shown password and a one-time-code box.** Besides `type=password`, a field marked `autocomplete` `current-password`, `new-password` or `one-time-code` is refused.
- **A Microsoft account tile that will not click no longer fails `finalize-login`** with a raw timeout; the page is probed and the receipt says what it shows, as with Google.

## 0.1.16 — 2026-09-30

npm `auspex-solari@0.1.16`. Agents do not `npm publish`. Founder publishes this release.

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
