# Reviewer 5-minute path

Timed walkthrough. No login. No clone required for Watch.

| Minute | What | Evidence |
| --- | --- | --- |
| 0:00–1:00 | Open [Pages](https://ironadamant.com/auspex/). Read the triad above the player: **`ok` ≠ `claimOk` ≠ `claimOkProfile`**. | Header copy, stills |
| 1:00–2:30 | Optional live public check (needs `SOLARI_API_KEY`): `npx auspex-solari check --name ironadamant` | Expect `One office job.` · [receipt](../examples/auspex-ts/demo/ironadamant-receipt.json) |
| 2:30–4:00 | Auth-gated honesty without logging in: redacted SaaS [receipt](../examples/auspex-ts/demo/consistencyhub-receipt.json) + receipt-only [OneDrive](../examples/auspex-ts/demo/onedrive-receipt.json) | Triad stays honest; no OneDrive PNG |
| 4:00–5:00 | Frozen door (read only): [AGENTS.md](../AGENTS.md#frozen-agent-door-sequence) — mint → human login → Save → `await-login --save-editor` → `finalize-login` → later `check`. Fail-closed: `expectMatchedPublicLanding`, `hostChanged`, `stream-expired`. Phone Chrome dogfood: pause/reconnect on background; remint only when the JWT is gone. Optional compose: `auspex_job` (not a fourth primitive). | Not a same-session takeover |

Do not run npm `auspex` (a different scraper). After a clone: `npm install && npm run build:mcp`, then `npx auspex` / `npx auspex-mcp`.

Official apply path (Harry Chow, LinkedIn 2026-08-31): fork cookbook → real Solari use case → public GitHub → tag @harrychow_ @getsolari on LinkedIn or X. Discord is setup help, not a substitute. Agents do not write or post showcase copy. No extra stills invented — use the committed redacted ConsistencyHub still + receipt.

ConsistencyHub / OneDrive are evidence, not the default recipe. Strangers use `login --url <https>` plus *their* URL and expect.
