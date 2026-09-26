# Reviewer 5-minute path

Timed walkthrough. No login. No clone required for Watch.

**Beat:** the logged-in app on the remote screen is not a reusable saved login. A site behind an identity provider, especially MSAL (Microsoft’s in-tab session), can show that app while Save still stores only Microsoft or Google cookies. Auspex refuses that jar. Status `idp-only-save`, kind `app-visible`. That refusal is honest. Login worked. Do not finalize. Do not open login again to finish Microsoft. Stranger path: `login --url https://…` (the profile name comes from the host), human Save, `await-login --save-editor`, then finalize only when the seed is the app session. ConsistencyHub and OneDrive are worked receipts, not that path. Detail: [Two truths about Save](../README.md#two-truths-about-save).

| Minute | What | Evidence |
| --- | --- | --- |
| 0:00–0:30 | Open [Pages](https://ironadamant.com/auspex/). First screen: **`ok` ≠ `claimOk` ≠ `claimOkProfile`** (true / false skipped / true on the redacted receipt) and the blurred auth-gated still. Labels: **Measured**, **Redacted demo**, **Stripped wall**. The skim under the blur names the dual pack. Read the beat above with it: the app on screen is not a reusable saved login. | Header legend + blur |
| 0:30–1:00 | The player further down is the Microsoft sign-in wall only (emails and passwords stripped). Not logged-in proof. Login door: [phone page](../examples/auspex-ts/demo/door-phone.gif) (`phone.html` on a phone or a computer). Clear empties the whole field. Also in the [root README](../README.md#login-door). Pages also has a short Agent door card. | Wall label, phone door |
| 1:00–2:30 | Optional live public check (needs `SOLARI_API_KEY`): `npx auspex-solari check --name ironadamant` | Expect `One office job.` · [receipt](../examples/auspex-ts/demo/ironadamant-receipt.json) |
| 2:30–4:00 | Auth-gated honesty without logging in: redacted SaaS [receipt](../examples/auspex-ts/demo/consistencyhub-receipt.json) + receipt-only [OneDrive](../examples/auspex-ts/demo/onedrive-receipt.json). This row is **Truth A** only (a finished seed, `claimOkProfile` true). Evidence, not the recipe. Truth B is the beat: the app can already be on screen while the jar is still IdP-only. | Triad stays honest; no OneDrive PNG |
| 4:00–5:00 | Stranger path (read only): `login --url https://…` (profile from the host) → human Save → `await-login --save-editor` → finalize only when the seed is the app session, not `idp-only-save` / `app-visible`. Frozen door: [AGENTS.md](../AGENTS.md#frozen-agent-door-sequence). Fail-closed also: `expectMatchedPublicLanding`, `hostChanged`, `stream-expired`. Phone Chrome dogfood: pause/reconnect on background; remint only when the JWT is gone. The phone text field is the Auspex workaround for [Solari cookbook #80](https://github.com/solari-sdk/solari-cookbook/issues/80) (remote view will not open a phone keyboard). Optional compose: `auspex_job` (not a fourth primitive). | Not a same-session takeover |

## Two truths

The dual pack above is **Truth A**: a finished saved login, then `claimOkProfile` on ConsistencyHub (blur + receipt) and OneDrive (receipt only). Evidence, not the default recipe. `ok` ≠ `claimOk` ≠ `claimOkProfile`.

**Truth B:** Save can return 200 while the app is already on the remote picture and the saved jar is still only Microsoft or Google cookies (in-tab session storage 0). Status `idp-only-save`, kind `app-visible`. Do not finalize. The picture is not a saved login. Solari handoff Save stores cookies and local storage. It cannot read the in-tab session token (MSAL often lives there). That is not Auspex broken, and it is not a reason to mint again to finish Microsoft.

Stranger path, once: `login --url https://…` (profile from the host), Save, `await-login --save-editor`. Finalize only when the seed is the app session.

Do not run npm `auspex` (a different scraper). After a clone: `npm install && npm run build:mcp`, then `npx auspex` / `npx auspex-mcp`.

Official apply path (Harry Chow, LinkedIn 2026-08-31): fork cookbook → real Solari use case → public GitHub → tag @harrychow_ @getsolari on LinkedIn or X. Discord is setup help, not a substitute. Agents do not write or post showcase copy. No extra stills invented — use the committed redacted ConsistencyHub still + receipt.

ConsistencyHub / OneDrive are evidence, not the default recipe. Strangers use `login --url <https>` plus *their* URL and expect.
