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

## Ask for Solari

Email and SMS codes need either a longer editor JWT (more than 5 minutes) or a reconnect API that issues a new VNC token for the same editor without a new login-handoff. Until that exists, operators remint when the code arrives after `exp` and the profile is still empty.
