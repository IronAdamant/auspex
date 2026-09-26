# Changelog

The npm package is `auspex-solari`. **Do not npm publish from an agent.** Founder publishes.

## Unreleased

- Concurrent `login --wait` and `await-login --save-editor`: one path owns `editor/save`. The loser is `sibling-saved` and does not report `stream-expired` when the sibling already posted or is posting. The Solari JWT `exp` is unchanged. A failed save still does not claim cookies.

## 0.1.4 — 2026-09-26 (published)

npm `auspex-solari@0.1.4` (latest). Agents do not `npm publish`. Founder may publish this release.

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
- Slim `examples/auspex-ts`: short shared tool copy (`tool-copy.ts`), one `nextCall`/`scrub` path, CLI/MCP over shared `runners.ts`, lazy MCP boot (light tools do not import desktop/sandbox), CI-built `dist/` (not committed; founder `npm run build:mcp` / `prepublishOnly` before publish), stub `demo/replay.html` generated from `replay.ndjson` in Pages, dated memos in `docs/archive/`. Fail-closed reasons and receipt schema v1 unchanged.
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
