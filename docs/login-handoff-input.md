# Typing into remote Chrome

## Check and finalize (Playwright attached)

`auspex check --fill` types into the control, then reads `value` or `textContent`. It sets `filled` only when that text contains `--value`. A contenteditable target (or an `insertText` that leaves the DOM unchanged) uses `keyboard.type` after a click. Prefer a stable selector such as `#save-document`; `text=Save` can match Unsaved chrome. Password selectors stay refused. Agents never type passwords.

## Login handoff (noVNC owns the browser)

The profile editor started by login-handoff is a picture of Chrome. `editorFold` stays `no-cdp`: there is no Playwright socket beside the live view. Attaching CDP while that view is up collides with the single debugger (Duolingo-class paste and keystream failures).

Auspex does not release that view, does not paste through VNC, and does not add `auspex login --stealth`. Stealth is `sessions.create` only.

Paste-hostile and hard anti-bot logins on the handoff door stay unsupported until Solari either exposes CDP on the editor without killing noVNC, or accepts stealth on the profile-editor launch and returns `402 FeatureRequiresPlan` on plans that lack it.

Human typing stays on `phone.html` / `desktop.html`. Keys go to Solari remote Chrome. They are not stored in receipts.
