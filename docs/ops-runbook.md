# Ops runbook

Plain-language page for a long job. It reads the seed-health and re-gate contract. It does not add a tool, a pager, or a timer.

The door table stays the authority: [AGENTS.md](../AGENTS.md#frozen-agent-door-sequence). The long-loop contract is [Long unattended loops](../AGENTS.md#long-unattended-loops). Short card: [llms.txt](../llms.txt#long-run).

## Heartbeat

Auspex does not set how often a long job checks in.

Before you leave the loop running, and again before you treat an older pass as still true:

1. `profile-status` with that profile, the app URL, and the expect.
2. On an auth-gated host, `check --verify-with-profile`. Read `claimOkProfile`.

That pair is the heartbeat and the cadence. There is no other ping and no minute interval.

`loggedIn` on step 1 means the live probe saw the expect. It is not `claimOkProfile` and not overnight-safe. The `next` line says so. It does not set `nextCall`.

Reuse the seed only when `claimOkProfile` is true. `ok` is not `claimOk` and not `claimOkProfile`.

## Remint and re-gate

These are different stops. The door table keeps them on separate rows.

**Re-gate** means stop the loop. The job hit a sign-in wall, a fresh challenge (a new password, code, or challenge page), a dead typing window with no cookies (bare `stream-expired`), or a seed you cannot reuse. The clear status is the matching row. Take that row's `nextCall` once.

**Remint** means `auspex_login`: a new human door. Use it only when that row's `nextCall` is `auspex_login`. Today that is `sign-in-wall`, bare `stream-expired`, stale `weakSeed`, `emptySave`, and `hostChanged`.

These rows stay on their own:

- `app-visible`: stop. No `nextCall`. The dashboard on screen is not a saved login.
- `editorFold` `no-cdp` and the jar includes the app host: finalize now, even if the typing window already died.
- Counted `sessionStorage === 0` while the token is live: finalize-login. That row is not a remint.

## Who opens the human door

The human. The agent mints once and shows `handoff.url`. Phone: `handoff.mobileUrl`. Computer: `handoff.desktopUrl`. The human logs in and taps Save.

The agent never types a password, a one-time code, or a CAPTCHA answer, and never pastes one into chat.

One door. When the matching row says `auspex_login`, that is the one call.

## Stop the loop

Stop when the receipt or the door status is a re-gate. Take one `nextCall`. Leave the loop.

- A sign-in wall, a fresh challenge, bare `stream-expired`, or a non-reusable seed ends the unattended run.
- `claimOkProfile` false ends reuse. Do not retry the check to chase that field.
- `app-visible` is a stop with no mint.
- `editor-save-hung` and `profile-busy` mean wait for that save. Do not start a second finalize beside it.

Do not auto-fill a secret. Do not claim a challenge is solved. Do not keep checking for hours.

## What to watch

Auspex does not page anyone. Read the JSON you already get: the check receipt and the door status. Tell a person on your own channel when you see one of these.

| You see | What it means | What you do |
| --- | --- | --- |
| re-gate | The seed is not safe to leave running | Matching door row, once |
| `weakSeed` | Cookies without a fresh in-tab session, or a stale fold | Counted zero while the token is live: finalize now. Stale `expiresOn`: remint. Skip `--verify-with-profile`. This row is not `app-visible`. |
| `stream-expired` | The typing window is past and the profile has no cookies | Remint. Skip a 30-minute wait. This is not the finalize-now row. |
| `claimOkProfile` false | The second browser with the saved login did not see the expect | Stop. `ok` is not reuse. Follow the door table once. |
| `needsHuman` | Password or one-time-code wall | The human opens the door. The agent does not type. |

Those meanings are the door table. This list does not replace a row and does not merge two rows.

A job may POST `AUSPEX_WAKE_WEBHOOK` to an address the operator already set. That body is a status you already have. It is not a pager product.

## Many profiles

One profile per host. `login --url https://app.example` names the profile `app-example` (`app.example.com` → `app-example-com`). A second host gets a second name. Do not carry the first name across.

`npx auspex profiles` lists names, ids, version, and whether storage is populated. That list is the host-to-profile map. A populated row is not a logged-in proof. The tool does not open the page.

Reclaim one name at a time. After a saved login has been used and tested, ask the human whether testing is done. Purge only after they agree: `npx auspex profiles --purge <name> --yes`. An idle saved profile is deleted on the next Auspex command after 30 minutes without use. A use resets that clock. Other profiles stay.

The saved-check name `consistencyhub` belongs on consistencyhub.io. It is not the name for a new host.

## How long a login lasts

Longevity is the Solari profile plus the site session. Auspex does not set a 24–48 hour timer and does not send a keepalive.

Budget an occasional human door. Each site ends its own session on its own clock. When that session dies, the path is the re-gate row already in the door table: stop, then one `nextCall`.

A `claimOkProfile` true pass is evidence you can run another check. It is not a lease.

The five-minute typing window is only the door. A saved profile can outlast it. Detail: [stream-jwt-solari.md](stream-jwt-solari.md).

## Keys

SOLARI_API_KEY is env-only. Never commit .auspex/, .env, or keys.

Put the key in the environment of the process that runs Auspex, or in the MCP `env` block. A gitignored `.auspex/operator-key` on the operator machine is the local fallback when that environment is empty. Door pages do not collect the key. Receipts do not include it.
