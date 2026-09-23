# Door-card as API

The login packet is the door-card. Agents parse JSON, not the VNC picture. Extra keys stay optional; receipt schema v1 required keys are unchanged.

## Mint (`auspex login`)

```json
{
  "name": "app-example",
  "nextCall": { "tool": "auspex_await_login", "profile": "app-example", "saveEditor": true },
  "handoff": {
    "url": "https://ironadamant.com/auspex/door.html#v=…&n=app-example&exp=…",
    "mobileUrl": "https://ironadamant.com/auspex/phone.html#…",
    "desktopUrl": "https://ironadamant.com/auspex/desktop.html#…",
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

### `handshake-no-frames` (door UI)

Phone/desktop lock after RFB `securityfailure` or ~30s with no canvas frames. Not a “Connected” lie.

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
