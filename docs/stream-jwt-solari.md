# Editor stream JWT — what Auspex controls

Dogfood (2026-09-24): phone OTP and email codes often outlive the door. Socialaize in Safari backgrounded past the token. Every successful mint still had `editorSave` 200 and `editorFold` `no-cdp`, then `finalize-login` matched.

## What Solari controls

- `POST /api/profiles/:id/editor/token` returns a noVNC JWT. In-repo expiry is about 305 seconds (`streamExpirySource: jwt`).
- That POST has **no TTL body**. The door hash is `v,n,exp,u` only. Pages cannot call Solari to extend `exp`.
- Login-handoff (`POST /profiles/:id/login-handoff`) accepts `{ reason }`. It does not accept stealth or a stream TTL. A `--stealth` flag on `auspex login` would be a lie. See PR #87.

## What Auspex does

- While `exp` is in the future, `phone.html` / `desktop.html` pause on background and reconnect the **same** JWT (`doorStreamDisconnectAction`). A dropped socket before `exp` is not `stream-expired`. That does not invent a live stream.
- After `exp`, the door reports `stream-expired` and the remint `nextCall` is `auspex_login`.
- If `editorSave` already returned 200 and the profile has cookies, `await-login` does **not** lead with remint. It leads with `finalize-login`. The dead JWT is a footnote.
- `--verify-with-profile` does not use this JWT. It creates a new browser session from the saved profile.

## Remint nextCall (frozen)

Auspex cannot extend the JWT. Pages do not call Solari. There is no client TTL.

| VNC JWT | Handoff token (~30m) | editorSave | Profile jar | nextCall |
| --- | --- | --- | --- | --- |
| Past | Still live | 200, and cookies include the app host | Fold missed (`no-cdp`) | `auspex_finalize_login` |
| Past | Still live | Not 200, or jar empty | No cookies | `auspex_login` (`stream-expired`) |
| Past | Still live | 200, jar omits the app host | IdP-only or app-visible with no sessionStorage | Do not finalize. `sign-in-wall` remints `auspex_login`. `app-visible` has no nextCall |
| Still ahead, 90s or less left | Live | Not saved yet | — | `preflight: low`. Await uses the short cap (stamp plus 5s). It does not start the 30-minute poll |
| Still ahead | Live | Save or fold timed out | — | Retry `auspex_await_login` once. Do not finalize in parallel |
| Past | Irrelevant | Finalize or check with no completed seed | Empty | Do not `POST /sessions`. `stream-expired`, remint `auspex_login` |

A dropped socket while `exp` is still ahead reconnects the same JWT. That is not `stream-expired`.

## Ask for Solari

Email and SMS codes need either a longer editor JWT (more than 5 minutes) or a reconnect API that issues a new VNC token for the same editor without a new login-handoff. Until that exists, operators remint when the code arrives after `exp` and the profile is still empty.
