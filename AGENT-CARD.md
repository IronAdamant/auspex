# Auspex agent card

One page for any AI agent (Claude, Grok, Cursor, Codex). The full contract is [AGENTS.md](AGENTS.md): read it before changing door, receipt, or login code, or when you meet a status this card does not list.

Auspex drives a Solari cloud Chrome (not the human's browser), checks a page for exact words, keeps a screenshot and a JSON receipt, and confirms with a second, independent check: a plain fetch of the page text for a public page, or a fresh browser using only the saved login for a logged-in one. It never types passwords. Use it for evidence from a live page, not for pages you can curl.

## 1. Know your install first

```bash
npx auspex-solari solari-health     # from a clone: npx auspex solari-health
```

`ok` true means the Solari key works (it is not a login check). The same receipt names `install` (npm, clone, or AUSPEX_HOME), `stateDir` (where jobs, receipts and the Save folder live), and `command`. Use that `command` for every call in this session.

## 2. Which command

| You want to | Run |
| --- | --- |
| Check a public page | `check <url> --expect <words>` |
| Sign in to a site for the first time (shell) | `connect <url> --expect <words>`, then `connect --save <profile>` |
| Sign in to a site for the first time (MCP) | `auspex_job` with `url`, `expect`, then `auspex_job_status` |
| Check a logged-in page again | `check <url> --expect <words> --profile <name> --verify-with-profile` |
| Check up to 12 pages | `sweep --plan <plan.json>` |
| Solari said 429 | `reap` |

Words for a logged-in app must appear only inside the app, never on its public pages. Matching is case-sensitive and word-bounded.

## 3. Waiting for a human: the one pattern

A sign-in needs a person. You never type on the door page.

Shell (run `connect` in the background):

```bash
npx auspex-solari connect https://app.example --expect "Words only shown when logged in"
# It prints the door link, "QR code image: <path>", and the time left (about 5 minutes).
# Give the human the link and the QR image. Then wait.
# When the human pastes the Save line or just says "saved":
npx auspex-solari connect --save <profile>
# Let the background connect finish. It prints one sentence and the receipt path.
```

`connect --save` reaches a waiting `connect` from either install (npm or a clone).

MCP: call `auspex_job` with `url` and `expect`. It returns `waiting`, a `handoff` with the door link and `qrPath`, and the QR image attached; show both to the human. After "saved", call `auspex_job` again with `jobId` and `wait: true`, or poll `auspex_job_status` with `jobId` and a short `waitMs` (60 seconds at most). Never hold one tool call open for a 30-minute wait.

## 4. Read the receipt

- `ok`: the live browser matched, and the second check passed when it ran.
- `verify.claimOk`: an anonymous second machine (a plain fetch of the page text) saw the words. It stays false on a logged-in app, on purpose.
- `verify.claimOkProfile`: a fresh browser using only the saved login saw the words. **This is the only signal that a saved login is reusable.** `connect` says "Logged in" only when it is true.

`ok` ≠ `claimOk` ≠ `claimOkProfile`. Never fold one into another, and never claim one you did not read.

`reason` is one of `matched`, `loggedOut`, `needsHuman`, `mismatch`, `network`, `recordedLoggedIn`, `expectMatchedPublicLanding`, `hostChanged`, `stream-expired`. `next` explains in words. `nextCall` names the one next tool: **take it once.** No `nextCall` means stop and tell the human.

## 5. When it stops

| Status | Do |
| --- | --- |
| `idp-only-save` / `app-visible` | Stop. Only the Microsoft or Google sign-in was saved. No new door, no finalize. |
| `idp-only-save` / `sign-in-wall` | New door: the human finishes signing in, lands on the app, then saves. |
| `editorFold` `no-cdp`, app host in the jar | Finalize now, unless the save is `cookie-strong` or `local-storage-auth` (next row). |
| bare `stream-expired` | New door. The five-minute window closed with nothing saved. |
| `cookie-strong` / `local-storage-auth` | `check --verify-with-profile`, then read `claimOkProfile`. |
| `weakSeed` / `emptySave` | Take `nextCall` (finalize, or a new door). Never `--verify-with-profile` on these. |
| `needsHuman` | New door. The human types the password or code; you never do. |
| `botWall` | Stop. The site shows cloud browsers a bot check. Not a logout; no new door, no finalize. |
| `hostChanged` | New door for `suggestedUrl` under `suggestedProfile`. |
| HTTP 429 | `reap`, then retry once. |

A Solari HTTP error is never `loggedOut` or `needsHuman`.

## 6. Never

- Type or fill a password, one-time code, or CAPTCHA answer.
- `--record` a logged-in session.
- Carry a `--profile` to a different host. Each host gets its own saved login.
- Commit `.auspex/`, `.env`, or `SOLARI_API_KEY`.
- Keep retrying for hours. On a sign-in wall or a new challenge, stop and take the row above once.

## 7. Environment traps

- An npm install keeps state in `~/.auspex`; a clone keeps it inside the clone. `solari-health` tells you which.
- A saved login no Auspex command has used for 30 minutes is deleted on the next command. Use `profiles --keep <name>` for long runs.
- The door token lives about five minutes and cannot be extended. The saved login lasts longer, but that is Solari and the site, not an Auspex timer.
- Opening a logged-in app runs the app (a chat app shows the account online). Tell the human before scheduling frequent checks.
