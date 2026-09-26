# Door-card as API

The login packet is the door-card. Agents parse JSON, not the VNC picture. Extra keys stay optional; receipt schema v1 required keys are unchanged.

## Mint (`auspex login`)

```json
{
  "name": "app-example",
  "nextCall": { "tool": "auspex_await_login", "profile": "app-example", "saveEditor": true },
  "handoff": {
    "url": "https://ironadamant.com/auspex/phone.html#v=…&n=app-example&exp=…",
    "mobileUrl": "https://ironadamant.com/auspex/phone.html#…",
    "streamExpiresAt": "2026-09-23T19:10:00.000Z",
    "streamExpirySource": "jwt"
  }
}
```

`streamExpiresAt` is ISO. The JWT is never on stdout. When it is past, await-login returns `status: "stream-expired"` and remints.

## Edge remints

### `hostChanged`

```json
{
  "ok": false,
  "reason": "hostChanged",
  "hostChanged": true,
  "profileHostMatch": false,
  "suggestedProfile": "app-socialaize-com",
  "suggestedUrl": "https://app.socialaize.com",
  "nextCall": { "tool": "auspex_login", "profile": "app-socialaize-com", "url": "https://app.socialaize.com" }
}
```

Golden: [`examples/auspex-ts/demo/host-changed-receipt.json`](../examples/auspex-ts/demo/host-changed-receipt.json).

### `expectMatchedPublicLanding`

```json
{
  "ok": false,
  "reason": "expectMatchedPublicLanding",
  "matched": false,
  "nextCall": { "tool": "auspex_finalize_login", "profile": "app-example", "url": "https://app.example/app", "expect": "Workspace ready" }
}
```

Expect must be unique to the logged-in app. `Dashboard` does not match `One Dashboard`.

### `stream-expired` (await-login)

```json
{
  "status": "stream-expired",
  "ok": false,
  "nextCall": { "tool": "auspex_login", "profile": "app-example" }
}
```

Not `loggedOut`, not `needsHuman`, not a Solari 502.

### Phone background / password manager (door UI)

Chrome on the phone is the dogfood browser. Operator copy lives in AGENTS.md; `phone.html` does not show a dogfood banner.

- Autofill: the typing field uses `autocomplete="current-password"` (and optional `one-time-code`). Check Show as bullets for a real password box. The form cannot POST (`form-action 'none'`). Keys stream only into Solari remote Chrome.
- Brief background (password manager / Mail / authenticator): mobile Chrome drops the WebSocket. The door **pauses** and **reconnects the same VNC JWT** on visibility return. That is not `stream-expired`.
- Solari JWT is ~305s. In-repo `POST /editor/token` has no TTL. Pages cannot refresh the token (hash keys `v,n,exp,u` only). The door timer is the minted hash `exp`. The phone page counts down to that stamp. Save before zero. Pasting the clipboard line signals a running await and does not kill it. A sign-in longer than about five minutes needs a fresh login for the final Save window. Auspex cannot lengthen the token. A dropped socket before that stamp reconnects and is not `stream-expired`. After `exp`, the door remints with `status stream-expired` (`nextCall auspex_login`) when the profile has no cookies. If `editorSave` already returned 200 and the jar is cookie-strong or local-storage-auth, `await-login` leads with `auspex_check` and `verifyWithProfile`. Other app-host jars with a missed fold still lead with `finalize-login`. Do not fake a live stream. Design note: [stream-jwt-solari.md](stream-jwt-solari.md). Login typing limits: [login-handoff-input.md](login-handoff-input.md).

### `handshake-no-frames` (door UI)

The phone door locks after RFB `securityfailure` or ~30s with no canvas frames. Not a “Connected” lie.

```
status handshake-no-frames. Remint: npx auspex login --profile app-example (nextCall auspex_login).
```

### `editor-save-hung` / `profile-busy`

```json
{
  "status": "editor-save-hung",
  "nextCall": { "tool": "auspex_await_login", "profile": "app-example", "saveEditor": true }
}
```

Do not run `finalize-login` while this await is unresolved.

## Job API (`auspex_job`)

Durable compose of the door sequence. Not a fourth primitive. Not a hosted Solari push API.

```
mint → (human Save) → await(--save-editor) → finalize → check[+ optional verifyWithProfile]
```

State lives in gitignored `.auspex/jobs/<id>.json`. Resume with `jobId`.

```json
{
  "schemaVersion": 1,
  "ok": false,
  "jobId": "job-…",
  "phase": "await",
  "status": "waiting",
  "reason": "awaiting-save",
  "profile": "app-example",
  "url": "https://app.example",
  "expect": "Workspace ready",
  "nextCall": { "tool": "auspex_job", "jobId": "job-…", "profile": "app-example" }
}
```

First call with `url`+`expect` (or a saved-check `name`) mints and returns **waiting** plus `handoff`. Profile is derived from the URL host unless `--profile` is set. Pass `wait: true` to continue into await in the same call. After the human Saves, resume `--job-id`.

### Remint encyclopedia

Same table as [stream-jwt-solari.md](stream-jwt-solari.md#remint-nextcall-frozen). Short form: JWT past and the jar is cookie-strong or local-storage-auth → `auspex_check` with `verifyWithProfile`. JWT past and the jar includes the app host but is not that shape → `auspex_finalize_login`. JWT past and the jar is empty → `auspex_login`. Less than 90 seconds left → short await, not a 30-minute poll. Auspex does not extend the JWT.

### nextCall matrix (job)

| Job `status` / `reason` | `nextCall.tool` | Notes |
| --- | --- | --- |
| `waiting` / `awaiting-save` | `auspex_job` + `jobId` | Resume after Save. Debug: `auspex_await_login` + `saveEditor`. |
| `stream-expired` | `auspex_login` | Remint. Do not poll 30 minutes. |
| `sibling-saved` | (none) | Another path owns editor/save. Do not remint. Do not report `stream-expired`. This path did not read the jar. |
| `host-changed` / `hostChanged` | `auspex_login` + suggested profile/url | Do not save into the old jar. |
| `editor-save-hung` / `profile-busy` | `auspex_await_login` + `saveEditor` | Do not finalize in parallel. |
| `expectMatchedPublicLanding` | `auspex_finalize_login` | Better persistable URL + unique expect. |
| `concurrency-limited` (429) | `auspex_job` + `jobId` | Job already ran ledger `auspex_reap` (not `accountWide`). |
| `completed` + `claimOkProfile=true` | omit | Reuse gate is `claimOkProfile`, not `ok`. Not a 24–48h lease. |
| seed health before a long loop | (none) | Read `profile-status` and `claimOkProfile`. `loggedIn` and `ok` are not overnight-safe. Not a keepalive. |
| re-gate (`needsHuman`, bare `stream-expired`, stale `weakSeed`, `emptySave`) | `auspex_login` once | Stop. Do not auto-fill. Do not claim a challenge is solved. |
| `idp-only-save` / `app-visible` | (none) | The app on screen is not a saved login. Do not remint to finish Microsoft. |
| `editorFold` `no-cdp` + app host in the jar, not cookie-strong | `auspex_finalize_login` | Finalize now. This row is not re-gate. |
| `cookie-strong` / `local-storage-auth` | `auspex_check` + `verifyWithProfile` | Read `claimOkProfile`. `solariSaveReady` is not reuse. Do not invent sessionStorage. |

How long a saved login lasts is the Solari profile and the site session. Auspex does not extend it. Seed health and re-gate are door-table rows, not a new tool. `app-visible` stays separate from bare `stream-expired` and from finalize-now. Operator page: [ops-runbook.md](ops-runbook.md).

Golden fail-closed job: [`examples/auspex-ts/demo/job-failed-receipt.json`](../examples/auspex-ts/demo/job-failed-receipt.json).

### Wake

Optional operator-local POST. Set `AUSPEX_WAKE_WEBHOOK` or per-job `wakeWebhookUrl`. Payload is secret-scrubbed JSON:

```json
{
  "schemaVersion": 1,
  "event": "stream-expired",
  "jobId": "job-…",
  "phase": "failed",
  "status": "stream-expired",
  "ok": false,
  "reason": "stream-expired",
  "profile": "app-example",
  "nextCall": { "tool": "auspex_login", "profile": "app-example" },
  "at": "2026-09-23T20:00:00.000Z"
}
```

Events: `awaiting-save`, `stream-expired`, `hostChanged`, `editor-save-hung`, `profile-busy`, `profile-saved`, `profile-claimable`, `completed`, `failed`. There is no Solari inbound webhook. Without an operator URL, use `auspex_job_status` (`waitMs` max 60s) — it watches the local job file, not Solari. Phase changes only when a job/resume process writes the file. After Save, resume `auspex_job --job-id`. Do not blind-poll `await-login` for 30 minutes.

Mint/status stdout keeps phone.html hashes so the human can open the door. Webhook POSTs redact URL hashes, drop `sessionId`/`excerpt`/password keys, and run `redactSecrets` + email redact. The wake body does not include `handoff`.
