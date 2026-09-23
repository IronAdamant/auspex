# Desktop door tip review — 2026-09-23

Read-only CoS pass of IronAdamant/auspex `main` after founder (Aron) shipped the desktop login variant. No runtime change in this memo.

**Tip SHA:** `ec23aa6bc7979584c5cc3430b05215d8dd782e39`  
**Prior tip (PR #55):** `71262a6335a82a5a33eef1979af8cdedea92ee9c`  
**Live HTML:** `https://ironadamant.com/auspex/desktop` and `/desktop.html` byte-match tip `docs/desktop.html` (sha256 `f2fe9614…`; Pages `Last-Modified: 2026-09-23 03:26:37Z`).  
**Phone live:** `https://ironadamant.com/auspex/phone.html` also byte-matches tip (sha256 `773ea905…`). Phone was **not** left alone.

## Verdict for CoS

The desktop door is a real product step: computer `handoff.desktopUrl` now opens `desktop.html` with the same live hash as the phone, paste buttons keep username/password off the agent chat line, and there is a 30-minute **profile** idle wipe plus `--purge --yes`. That matches “copy/paste so secrets do not go through the agent.”

The founder claims overshoot the code in three places:

1. **Username/password do not stay only on the device.** They are typed into Solari remote Chrome over VNC. “Stay local” is true for the **agent message**, not for Solari.
2. **The ~30 minute wipe is not a credential timer.** It deletes a **Solari profile** on the next Auspex command after 30 minutes idle. It does not wipe the Solari API key, and it does not run if nobody runs a command.
3. **One-to-one is copy, not enforcement.** Multi-profile state and tests remain. The watch page still only names the phone door.

No P0 “password appears in agent JSON / receipts.” Closest P1s are the Solari-key localStorage on the marketing origin, the unauthenticated loopback key POST, opportunistic wipe, and the phone page being changed in the same commit.

## 1. Inventory vs `71262a6` (PR #55)

Five commits on `main` after #55:

| SHA | Date (UTC) | What |
|---|---|---|
| `0029d69` | 2026-09-21 | Docs: logged-in still before the player; `npx auspex-solari` |
| `952ccc3` | 2026-09-22 | `nextCall` on agent JSON + one post-handoff trace row |
| `4ddcf9d` | 2026-09-22 | MCP dist refresh so 429 stamps `nextCall` |
| `83bf3f9` | 2026-09-22 | Watch card + Discord: phone keyboard door (no `phone.html` edit) |
| **`ec23aa6`** | **2026-09-23** | **Desktop door + operator session + phone paste fields** |

`ec23aa6` is the desktop work (Aron Amos, 2026-09-23 03:26:15Z): `docs/desktop.html` (new, 578 lines), `examples/auspex-ts/src/operator-session.ts` (new), CLI/MCP/schema/tests, **and `docs/phone.html` (+98)**.

**Desktop/docs/phone touches since `71262a6`:**

- **Desktop page:** only `ec23aa6` (`docs/desktop.html` born here).
- **Phone page:** `ec23aa6` added URL/username/password paste controls, 30-minute status copy, `data-solari-remote="vnc"`. Earlier phone work (`4f7e89a`…`a0e1e4a`) is before #55.
- **Watch / Discord:** `0029d69`, `83bf3f9` (phone only). Landing still has a **Phone door** card and **no desktop card** (`docs/index.html`).
- **Agent docs:** `ec23aa6` updates `AGENTS.md`, package AGENTS/README, `.cursor/rules/auspex.mdc` so `handoff.desktopUrl` is `desktop.html` when VNC minted.

## 2. Where the desktop credential path lives

| Surface | Path | Role |
|---|---|---|
| Thin client | `docs/desktop.html` | Public Pages page. Hash: `v` VNC token, `h` handoff URL, `p`/`n` profile, `t` handoff token, `exp`, `u` https site, `k=1` if key already in use. |
| Phone twin | `docs/phone.html` | Same hash + IME field. **Same commit** added the three paste controls. |
| Mint | `examples/auspex-ts/src/profiles.ts` | `DESKTOP_HANDOFF_PAGE`, `desktopHandoffUrlFromPhone`, `loginInstructions` sets `desktopUrl` to desktop.html + same hash (else console). |
| Idle / purge | `examples/auspex-ts/src/operator-session.ts` | `OPERATOR_IDLE_MS = 30m`, `decideOperatorSession`, `.auspex/operator-session.json` (site + clocks only), loopback key server `:17321`. |
| CLI | `examples/auspex-ts/src/cli.ts` | `withOperatorSession` on check / login / await / finalize / profile-status / profiles. `profiles --purge --yes`. **Does not** start the key listener. |
| MCP | `examples/auspex-ts/src/mcp.ts` + `mcp-tools.ts` | `startOperatorKeyListener(packageRoot)` on MCP boot. `purge` + `humanAgree`. |
| Key load | `examples/auspex-ts/src/solari.ts` | Env wins, then `.auspex/operator-key`. |
| Tests | `tests/operator-doors.test.ts`, `tests/operator-session.test.ts`, `tests/login.test.ts` | Doors, redaction, idle/purge, hash parity. |
| Not this door | `src/desktop.ts` / `auspex_desktop` | Named Solari **Mousepad** demo. First-call still says “Desktop is not a first call.” Name collision. |

## 3. What improved

- Computer link is no longer “go to console → Open editor” when VNC minted. Same remote Chrome as the phone, hardware keyboard, paste buttons.
- Agent tool schemas have no `username` / `password` / `solariKey` field. Save paste line is profile + https site + “was pasted” flags. Unit tests assert fixture secrets never appear on the chat line.
- Operator state on disk is site + `lastUsedMs` + optional `busyUntilMs`. Mode `0600`. Secrets in the TypeScript input type are dropped, not persisted.
- Voluntary purge requires `--yes` / `humanAgree: true`.
- Signup `inUse` / `SIGNUP_BUSY_MS` keeps the idle clock from firing mid-login.
- Live public page is up, matches tip, and an Auspex check of the empty door is `ok=true`, `claimOk=true` (expect `Auspex desktop login`). Without a hash the page locks: “Link expiry unknown — remint.”

## 4. Ranked findings

### P0

**None** for “username/password appear in agent receipts / CLI JSON / MCP schemas.” That fence holds in src + tests.

Treat the next items as P1, not “ship-blocking leak of the password into chat.”

### P1 — Solari API key on the marketing origin (not wiped)

`desktop.html` writes `localStorage["auspex.solariKey"]` and POSTs `{ key }` to `http://127.0.0.1:17321/auspex-operator-key`.

- Origin is `https://ironadamant.com`. Path `/auspex/` does **not** isolate storage. Marketing JS on `/` (`js/navigation.js`, `js/main.js`, `js/sw-register.js`) is same-origin and can read that key if it is ever saved.
- The 30-minute operator wipe does **not** delete this key or `.auspex/operator-key`.
- Live check excerpt of the **locked, unminted** page still shows the Solari key field and “Save Solari key.” `lockUi` disables paste fields; it does **not** disable `#solari-key` / `#save-solari-key`.
- Key listener starts only from MCP (`mcp.ts`), not CLI. From HTTPS Pages, the HTTP loopback fetch is mixed content and may fail; then the page keeps the key in `localStorage` and says Auspex was not listening.

This is a bigger secret than the site password, stored longer, on a public origin.

### P1 — Loopback key POST is unauthenticated + `Access-Control-Allow-Origin: *`

`createOperatorKeyServer` binds `127.0.0.1:17321`, GET returns `{ present: boolean }` only (good), POST writes whatever `{ key }` it is given (8 KiB cap). CORS is `*`. Any local page that can reach loopback can **overwrite** the operator key. That is substitution / DoS of the next Auspex command, not a read of the existing key. No origin allowlist.

### P1 — “30 minute wipe” does not hold as stated

What the code does (`operator-session.ts`, `withOperatorSession` in CLI/MCP):

- Clock is **per Solari profile**, 30 minutes after **last Auspex use** (`lastUsedMs`).
- Wipe runs only when a later command calls `commitOperatorSession` (check, login, await, finalize, profile-status, profiles). There is no daemon. Walk away and never run Auspex again: the Solari profile stays.
- `applyWipes` failures are swallowed (`catch { return [] }`). Stamp can remain; delete can no-op.
- Signup busy window is another 30 minutes; idle wipe is skipped while `inUse`.
- Username/password in the HTML fields are cleared on **paste, Save, or expiry lock** — not on a 30-minute timer.
- Desktop **VNC disconnect** stops the countdown and does **not** call `lockUi` / `clearLocalSecrets`. Fields can remain after remote Chrome dies.
- Phone **IME** (`#ime`) is never cleared on Save. A password typed in the phone keyboard field stays in the DOM.

Founder sentence “username/password … wiped after ~30 minutes” is a category error: the 30-minute action is **profile delete**, not secret-field wipe.

### P1 — Phone was not left alone

`ec23aa6` adds the same URL / username / password paste UI to `docs/phone.html`, plus “A saved login on the computer lasts 30 minutes after its last use.” Live phone HTML matches that tip. If the intent was “desktop only, phone frozen,” the tip does not match.

### P1 — “Stay local / do not leak” is only true for the agent line

Paste sends each character as RFB keysyms to `wss://api.getsolari.com/vnc-proxy/ws?token=…`. Username and password **do** go to Solari’s remote Chrome (and then to the target site). That is the login. They must not be described as never leaving the laptop.

Also on the agent line by design (not passwords, still capability):

- `handoff.desktopUrl` / `desktopOneLiner` include the **full hash** (`v` VNC JWT, `t` handoff token, `p` profile id). Login stdout is supposed to show those URLs.
- Hash is not sent to GitHub Pages (good). History, address-bar screenshots, and the agent transcript still see the live ~5 minute VNC URL.

### P2 — One-to-one is not implemented

`OPERATOR_PURGE_QUESTION` says “One site at a time. Other profiles stay.” `decideOperatorSession` still walks **N** profiles; tests keep `supabase-com` and `appwrite-io` at once; `phoneSavedParams` still packs a list (mint path does not pass `saved`/`plist`). No “refuse a second site.” Watch page (`docs/index.html`) still only has **Phone door**. First-call fence is still phone-only. `computerDoor` in `login-trace.ts` is still `"console-editor"`. Desktop Save still copies “I tapped Save on the Auspex **phone** page.” Boot fail still says “Phone viewer failed to load.”

So: simplified **story**, leftover **multi-portfolio machinery**, watch page not updated.

### P2 — Other residuals

- `stripSecret` skips secrets shorter than 3 characters or equal to the profile name.
- `autocomplete="off"` is a hint; browser password managers may still offer to save.
- No `Referrer-Policy` on the door pages (hash usually not in referrer; still sloppy).
- Desktop HTML has no `#ime` but leftover IME/backspace/enter JS; after connect, status says “type in the field below.”
- `HANDOFF_PHONE_DOOR_BAN` still says never open `handoff.desktopUrl` on a phone — that URL is now `desktop.html` (paste buttons, no IME).
- `auspex_desktop` (Mousepad) vs `docs/desktop.html` (login door): first-call “Desktop is not a first call” is the demo, not this page. Easy for agents to confuse.

## 5. Copy/paste and receipt surfaces (no secrets in this memo)

| Surface | Username / password | VNC / handoff token | Solari API key |
|---|---|---|---|
| Agent Save paste | Stripped; flags only | No | No |
| Login JSON `desktopUrl` / `desktopOneLiner` | No | **Yes** (hash) | No (`k=1` only) |
| `operator-session.json` | No | No | No |
| `operator` notice on receipts | Site + profile name | No | No |
| Local paste fields | Until paste/Save/lock | — | — |
| Phone IME | Until lock (not cleared on Save) | — | — |
| `localStorage` on ironadamant.com | No | No | **Yes**, until user clears site data |
| `.auspex/operator-key` | No | No | **Yes**, until file delete |
| Solari VNC / remote Chrome | **Yes** (keystrokes / form) | Token in WS query | No |
| Auspex check of empty door | No | No | Field **visible** on locked page |

Live Auspex check (2026-09-23): `ok=true`, `reason=matched`, `verify.claimOk=true`, expect `Auspex desktop login`. Excerpt includes the remint lock **and** the Solari key box. Run dir `examples/auspex-ts/.auspex/runs/2026-09-23T03-56-23/` (gitignored; do not attach).

## 6. Does tip match founder intent?

| Claim | Tip match |
|---|---|
| Desktop variant at `/auspex/desktop` | **Yes.** Live = tip. |
| Copy/paste so user/pass do not go through the agent | **Yes** for the chat line. |
| User/pass stay local, never sent to Solari/Auspex/logs | **Partial.** Not on Auspex/agent. **Yes sent to Solari** as VNC keystrokes. |
| Wiped after ~30 minutes | **Partial.** Profile idle delete on next command. Not the key. Not a wall-clock daemon. Fields clear on paste/Save, not at 30m. |
| Simplified multi-portfolio → one-to-one | **Copy only.** Multi-profile state + tests remain. Watch page still phone-only. |
| Phone left alone | **No.** Same commit added paste fields to `phone.html`. |

## 7. Suggested next cuts (not done in this memo)

1. Stop storing `auspex.solariKey` on the `ironadamant.com` origin; hide the key box on an unminted/locked page; disable it in `lockUi`.
2. Bind the loopback POST to a same-page secret or refuse CORS `*`; do not start a write-any-key server without a one-time token.
3. Say honestly: 30 minutes = “next Auspex command after idle deletes that Solari profile.” Wipe the key file only with explicit human agree, or never accept the key on Pages.
4. Either enforce one live operator profile or drop “one site at a time.”
5. Desktop Save paste should say desktop, not phone. Trace `computerDoor` should not stay `console-editor` when the thin client minted.
6. If phone was meant to stay frozen, revert the `phone.html` paste block or treat it as an intentional twin and update the watch card.

## Evidence paths

- Tip: `ec23aa6` — https://github.com/IronAdamant/auspex/commit/ec23aa6bc7979584c5cc3430b05215d8dd782e39  
- Prior: `71262a6` / https://github.com/IronAdamant/auspex/pull/55  
- Door: `docs/desktop.html`, `docs/phone.html`  
- Session/wipe/key: `examples/auspex-ts/src/operator-session.ts`  
- Mint: `examples/auspex-ts/src/profiles.ts` (`DESKTOP_HANDOFF_PAGE`, `loginInstructions`)  
- CLI/MCP: `examples/auspex-ts/src/cli.ts`, `mcp.ts`, `mcp-tools.ts`  
- Tests: `examples/auspex-ts/tests/operator-doors.test.ts`, `operator-session.test.ts`, `login.test.ts`  
- Watch (no desktop card): `docs/index.html`  
- Live: `https://ironadamant.com/auspex/desktop` (and `.html`)
