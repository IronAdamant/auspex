# Editor fold + ConsistencyHub refreshToken (2026-09-20)

Keep-small spike. No new primitive.

## A. Phone Save → folded sessionStorage

**Tried:** after `POST …/editor/save`, parse the save/editor JSON for a Playwright `wsEndpoint` / `cdpEndpoint` and, if present, `captureStorageState` + `profiles.save`.

**Evidence (fail-closed NO-GO for attach on current Solari):**

- Browser API CDP exists only on `POST https://api.getsolari.com/sessions` (`wsEndpoint`, `cdpEndpoint`). Docs: [Browser API](https://docs.getsolari.com/api-reference/browser), [Driving the browser](https://docs.getsolari.com/browser-api).
- Profile editor / login-handoff is console noVNC (`POST console.getsolari.com/api/profiles/:id/editor` + `/editor/token` + `/editor/save`). Save is Playwright-shaped **cookies + localStorage**. SessionStorage is not in that payload.
- `POST /profiles/:id/save` **409** while the dashboard editor is open. Even a captured fold could not persist without closing the human’s editor tab.
- Creating a **new** `sessions.create({ profileId })` after editor/save would recapture leftover `__auspex_ss__:` and look like a refresh. That path is refused.

`--save-editor` still POSTs editor/save, then probes JSON via `pickEditorCdp`. Claim a refresh only when `editorFold.ok`. Today that is `reason: no-cdp`.

## C. ConsistencyHub `refreshToken` cold restore

**NO-GO. No restore code shipped.**

- Dogfood 2026-09-20 (profile v38): `refreshToken` present in CH localStorage; folded `accessToken` / `expiresOn` past; finalize + `--verify-with-profile` still hit Microsoft `authorize` / password wall. OneDrive on the same seed stayed green on cookies + MSAL localStorage.
- Cold restore already hydrates folded sessionStorage then goto. The SPA did not silently mint a new access token from `refreshToken`.
- Invoking MSAL `acquireTokenSilent` (or equivalent) would be ConsistencyHub-specific, could surface password/OTP, and is not fail-closed.

If a later human pass lands on the Microsoft **account picker** (“Signed in”), one account click plus finalize can re-fold a fresh token. That is still human SSO, not a refresh-token feature.

## Agent `next`

Stale folded `expiresOn` or counted sessionStorage `0`: remint (`auspex login`) or finalize-now. Do not run `--verify-with-profile` on a dead fold.
