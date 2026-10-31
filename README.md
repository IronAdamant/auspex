# Auspex

Proof that an AI agent really saw a web page, including a page behind a login.

Auspex opens the page in a real local Chrome, looks for the exact words you asked for, and keeps a screenshot and a receipt. It then checks a second time on its own, so one lucky look is not enough.

## What it does

1. Opens the page in Chrome on this machine and looks for the exact words.
2. Checks again independently. A public page is fetched with no login. A logged-in page is opened again in a fresh Chrome that has only the saved login, and only when you ask.
3. Keeps three answers apart on every receipt: the live browser (`ok`), the plain fetch (`claimOk`), and the fresh saved-login browser (`claimOkProfile`).
4. Lets a person sign in once, on a simple local page that works in a phone or computer browser. The agent never sees or types the password. Auspex does not record a logged-in session.
5. Can confirm that a change really landed. After an agent says it made a card or saved a document, a fresh browser that has only the saved login looks again. The click is not the proof. The second look is.

Auspex does not claim to spot the wrong account. A saved login can belong to the wrong person and still show the words you asked for.

## Three answers

- **ok**: the live browser saw the words, and the second check passed when it ran.
- **claimOk**: a plain fetch, with no login, also saw them. On a logged-in app this stays false on purpose.
- **claimOkProfile**: a second fresh browser, using only the saved login, saw them. This is the reuse gate. `ok` alone is not enough to treat a saved login as reusable.

`ok` is not `claimOk` and not `claimOkProfile`.

## Install

You need Rust, Google Chrome or Chromium, and `curl` (the plain fetch). There are no Rust package dependencies.

```bash
cargo build --release
export PATH="$PWD/target/release:$PATH"
auspex check https://ironadamant.com --expect "Web app testing, in plain English."
```

A saved copy of that check is [examples/ironadamant-receipt.json](examples/ironadamant-receipt.json), with [examples/ironadamant-screenshot.png](examples/ironadamant-screenshot.png).

Named checks live in [auspex.yml](auspex.yml):

```bash
auspex check --name ironadamant
```

## Sign in once

```bash
auspex login --url https://app.example
```

The JSON includes `handoff.url`. Open it in a browser on this computer. The page shows the remote Chrome and a real text field. Click the remote address bar, or the field you mean to fill, then type. Tap Save. Then:

```bash
auspex await-login --profile app-example
auspex finalize-login --profile app-example --url https://app.example --expect "Workspace ready"
auspex check --profile app-example --url https://app.example --expect "Workspace ready" --verify-with-profile
```

Read `claimOkProfile`. That is the reuse gate.

To open the door from a phone on the same network, set `AUSPEX_DOOR_BIND=0.0.0.0:0` before `login` and open the printed URL in the phone's own browser. The default bind is localhost.

The agent never types the password. Keystrokes are not written to logs, traces, or receipts.

## Prove a change

```bash
auspex prove --profile app-example --url https://app.example/board --expect "Card landed"
```

`prove` exits 0 only when `proved` is true, which is `claimOkProfile`. The receipt still prints `ok` and `claimOk` separately.

## Hornet Swarm

If [Hornet Swarm](https://github.com/IronAdamant/hornet-swarm) is installed, Auspex can take its first look through a Hornet account browser, or read a Hornet journey claim and then check it independently. If Hornet is not installed, every command still works and uses local Chrome.

```bash
auspex hornet-status
auspex check --via hornet --hornet-project demo --hornet-label qa-user-1 \
  --url https://app.example/home --expect "Workspace ready" --verify-with-profile --profile app-example
auspex prove --hornet-run run_demo --profile app-example \
  --url https://app.example/board --expect "Card landed"
```

A Hornet status of `passed` is not proof. Auspex confirms the words itself. The receipt shape is the same either way.

## Logs

Every run writes under `~/.auspex` (`AUSPEX_HOME` moves it):

- `logs/auspex.jsonl`: append-only log for every run
- `traces/<run id>.jsonl`: the steps of one run
- `sessions/<run id>.json`: a short summary an agent can reload
- `runs/<run id>/`: screenshot and receipt
- `profiles/<name>.json`: the saved login (mode 0600). This file is a secret. It is never printed.

```bash
auspex runs
auspex summary
auspex trace
```

Passwords, cookies, tokens, and session values are not written into logs, traces, receipts, or the sign-in frames. Saved logins stay in the profile file only.

## MCP

```bash
auspex mcp
```

stdio, one JSON-RPC message per line. The same commands are tools: `auspex_check`, `auspex_prove`, `auspex_login`, `auspex_await_login`, `auspex_finalize_login`, `auspex_profile_status`, `auspex_profiles`, `auspex_runs`, `auspex_run`, `auspex_summary`, `auspex_hornet_status`, `auspex_sweep`.

## For agents

Start with [AGENTS.md](AGENTS.md). Every command prints one JSON object. Exit 0 means the command's success field is true (`ok` for a check, `proved` for `prove`).

## Legacy

The npm package `auspex-solari` is the old line. This repository no longer builds or publishes it. Do not publish this Rust crate either.
