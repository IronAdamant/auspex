# Auspex for agents

Auspex proves that a browser saw the exact words on a page. It runs on this machine. It does not use a cloud browser and it does not take a password.

Start here. The human overview is [README.md](README.md).

## Command

From a clone:

```bash
cargo build --release
./target/release/auspex <command>
```

Every command prints one JSON object on stdout and nothing else. Exit 0 when that command succeeded. Exit 1 when it ran and the result is no. Exit 2 when the arguments are wrong.

| Exit | Meaning |
| --- | --- |
| 0 | `ok` is true, or `proved` is true for `prove` |
| 1 | a receipt or status was produced and the success field is false |
| 2 | usage error (`code` is `usage`) |

`prove` exits 0 only when `proved` is true. `proved` is `claimOkProfile` for a saved login, or the plain fetch when there is no saved login. `ok` is still printed on its own.

## Which command

| You want | Run |
| --- | --- |
| Check a public page | `check <url> --expect <words>` |
| Check a named page | `check --name ironadamant` |
| Sign in the first time | `login --url <https>`, then the human taps Save, then `await-login` and `finalize-login` |
| Check a logged-in page again | `check <url> --expect <words> --profile <name> --verify-with-profile` |
| Prove a change landed | `prove --profile <name> --url <https> --expect <words>` |
| Is Hornet Swarm installed? | `hornet-status` |
| What happened already? | `summary` or `runs`, then `trace` |
| Many pages, up to 12 | `sweep --plan plan.json` |
| MCP | `mcp` |

Do not carry `--profile` from one site to another. `login --url` names the profile from the host (`app.example.com` becomes `app-example-com`) unless you pass `--profile`.

## Three answers

A check receipt is schema version 1. Required keys: `schemaVersion`, `ok`, `reason`, `url`, `expect`, `screenshotPath`.

- `ok`: the live browser saw the words, and the second check passed when it ran.
- `verify.claimOk`: a plain `curl` fetch, with no cookies, saw the words.
- `verify.claimOkProfile`: a new Chrome, seeded only with the saved login, saw the words.

Do not treat these as the same bit.

Rules:

- A public page runs the plain fetch by default. `ok` requires `claimOk`.
- A saved login on an app URL skips the plain fetch. `verify.anonymousClaimSkipped` is true and `claimOk` stays false. That false is not a failure.
- `--verify` forces the plain fetch. On a logged-in app that fetch cannot see the page, so it makes `ok` false.
- `--no-verify` skips the second look. `ok` is then the live browser alone.
- `--verify-with-profile` opens a second Chrome with the saved login and sets `claimOkProfile`. It does not copy that bit into `ok`.
- Read `claimOkProfile` before reusing a saved login. `ok` true with `claimOkProfile` false means the live browser saw the words and the fresh browser did not.
- `loggedOut`, `needsHuman`, `expectMatchedPublicLanding`, and `hostChanged` are not retried.

`reason` is one of: `matched`, `loggedOut`, `needsHuman`, `mismatch`, `network`, `recordedLoggedIn`, `expectMatchedPublicLanding`, `hostChanged`.

The expect is case-sensitive and word-bounded. `Dashboard` does not match `Dashboards`. A single capitalised word does not match inside a capitalised phrase, so `Dashboard` does not match `One Dashboard`. A line break ends that phrase.

## Sign in

1. `login --url https://app.example`. Read `handoff.url`. Give that URL to a person. Do not open it yourself to type.
2. The person signs in on that page and taps Save.
3. `await-login --profile <name>`.
4. `finalize-login --profile <name> --url <https> --expect <words>`.
5. `check --profile <name> --url <https> --expect <words> --verify-with-profile`.

The door has one text field. Keys go into the local Chrome. They are not logged. Show as bullets is off unless the person ticks it, so a password manager can paste. Enter sends Enter. Clear empties the field.

| Status | Do |
| --- | --- |
| `waiting` | Wait. Do not start a second login. |
| `completed` and shape `cookie-strong`, `local-storage-auth`, or `session-strong` | Run `check --verify-with-profile`. |
| `idp-only-save` | Stop. Provider cookies are not the app login. Do not finalise them into a success. |
| `empty-save` or `emptySave` | `login` again. |
| `weak-seed` | `login` again. Do not pass `--verify-with-profile`. |
| `timeout` | `login` again. The door closed before Save. |
| `hostChanged` | `login` with `suggestedProfile` and `suggestedUrl`. Do not write the new site into the old profile. |

`finalize-login` only classifies the save. It does not invent session storage. `nextCall.tool` is the next command when there is one. An `idp-only` save has no next tool.

`--record` with a profile is refused (`recordedLoggedIn`). Auspex does not record a logged-in session.

One check can fill one CSS field and click one control. A later check is a new browser, so a form opened earlier is gone. Fill or click with a profile needs `--allow-page-actions`. A password field is refused. The agent does not type a password, a one-time code, or a captcha answer.

`needsHuman` means a person must finish sign-in. `botWall` means the site showed a bot check. That is not a logout. Do not log in again for it.

## Prove a change

The click, or a Hornet journey status of `passed`, is not proof.

```bash
auspex prove --profile app-example --url https://app.example/board --expect "Card landed"
```

Exit 0 only when `proved` is true. On a saved login that is `claimOkProfile` from a fresh Chrome. `ok` may differ. Read both.

```bash
auspex prove --hornet-run <run id> --profile app-example --url https://app.example/board --expect "Card landed"
```

`hornet.claimStatus` is what Hornet wrote. `hornet.confirmed` is true only when Auspex saw the words. If Hornet is not installed, `prove` without `--hornet-run` still works.

## Hornet Swarm

Optional. Detection:

- `hornet-swarm` on `PATH`, or `HORNET_SWARM_BIN`
- home directory `AEGIS_HOME` or `~/.hornet-swarm`
- `AUSPEX_HORNET=off` forces it off

`hornet-status` returns `present`, `absent`, `home-only`, or `disabled`. `ok` true means the status command worked, including when Hornet is absent.

First look through a Hornet account browser:

```bash
auspex check --via hornet --hornet-project <id> --hornet-label <label> --url <https> --expect <words>
```

Auspex runs `hornet-swarm inspect --project --user --url --json` and uses that page as the live look. The second look is always Auspex (plain fetch or a fresh saved-login Chrome). If Hornet is missing or the inspect fails, the same check runs in local Chrome and `hornet.used` is false.

## Logs and resume

State lives in `~/.auspex` unless `AUSPEX_HOME` is set.

| Path | What |
| --- | --- |
| `logs/auspex.jsonl` | append-only log, one JSON object per line |
| `traces/<run id>.jsonl` | steps for one run |
| `sessions/<run id>.json` | short summary: command, url, expect, ok, reason, next |
| `runs/<run id>/` | screenshot and receipt |
| `profiles/<name>.json` | saved login, mode 0600 |

`summary` prints the latest session plus `traceSteps`. Another agent should read that and continue from `next`. Do not repeat a step that already has a verdict.

Two runs do not share a directory. The shared log is locked so lines are not torn.

Never put a password, cookie, token, or session value in a log, trace, receipt, or chat. Profile files are the only place cookies are stored. Do not read a profile file into the chat.

## MCP tools

`auspex mcp` speaks JSON-RPC 2.0, one message per line. `Content-Length` framing is also accepted. Responses are one JSON line.

Tools match the commands: `auspex_check`, `auspex_prove`, `auspex_login`, `auspex_await_login`, `auspex_finalize_login`, `auspex_profile_status`, `auspex_profiles`, `auspex_runs`, `auspex_run`, `auspex_summary`, `auspex_hornet_status`, `auspex_sweep`.

`tools/call` returns the same JSON as the CLI, inside `content[0].text`. A mismatch is not `isError`. `isError` is for a bad tool name or bad arguments.

A login call returns the door URL and does not wait for Save. Poll `auspex_await_login`. Do not block the tool on the human.

## Sweep

`sweep --plan plan.json` checks up to 12 pages. The plan is `{ "profile": "optional", "pages": [{ "url", "expect", "name" }] }`. Each row is `pass`, `fail`, or `could not tell`. A sign-in wall stops the sweep. The sweep report does not copy page text.

## Saved checks

`auspex.yml` in the working directory, or `AUSPEX_CONFIG`. Built-in names if the file is missing:

| Name | Expect |
| --- | --- |
| ironadamant | Web app testing, in plain English. |
| checkpoint | Checkpoint |
| consistencyhub | Document Editor, profile `consistencyhub` |

`consistencyhub` skips the plain fetch. ironadamant.com and checkpointprojects.com stay public checks even if a profile is left attached.

## Limits

- Auspex does not detect the wrong account.
- It does not solve bot checks.
- It does not type passwords or one-time codes.
- It does not record a logged-in session.
- Loopback URLs are refused unless `AUSPEX_ALLOW_LOOPBACK=1`. Link-local and cloud metadata hosts are always refused.
- Opening a logged-in app runs that app's normal load behaviour. A chat app can show the account as online.
- The plain fetch is `curl`, because the Rust standard library has no TLS. Chrome is required for the browser look.
- Chrome is whatever `CHROME_PATH` or `google-chrome` / `chromium` points at. Headless is the default. The sign-in door uses a headed window when `DISPLAY` is set, and still shows frames on the door page.
