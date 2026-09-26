# Typing into remote Chrome

## Check and finalize (Playwright attached)

`auspex check --fill` types into the control, then reads visible text (`value` or `innerText`). It sets `filled` only when that text contains `--value`. Hidden `textContent` does not count. The fill waits until the targeted node stops changing, so a later rewrite of that node does not erase the typed text. A contenteditable target is then clicked, focused, and `keyboard.type` runs. When visible text still lacks `--value`, `pressSequentially` runs when the driver has it, then a caret and another `keyboard.type`, then a selection and `insertText`. That same turn appends through a ProseMirror/TipTap view when the node stores `pmViewDesc`, and uses `execCommand('insertText')` for other editors. If a rewrite drops `--value` after it appeared, the fill waits for the node to settle and tries once more. The check re-reads that text after settle, against the excerpt haystack, before `filled` is kept.  Prefer a stable selector such as `#save-document`; `text=Save` can match Unsaved chrome. Password selectors stay refused. Agents never type passwords.

## Login handoff (noVNC owns the browser)

The profile editor started by login-handoff is a picture of Chrome. `editorFold` stays `no-cdp`: there is no Playwright socket beside the live view. Attaching CDP while that view is up collides with the single debugger (Duolingo-class paste and keystream failures).

Auspex does not release that view, does not paste through VNC, and does not add `auspex login --stealth`. Stealth is `sessions.create` only.

Paste-hostile and hard anti-bot logins on the handoff door stay unsupported until Solari either exposes CDP on the editor without killing noVNC, or accepts stealth on the profile-editor launch and returns `402 FeatureRequiresPlan` on plans that lack it.

Human typing stays on `phone.html` / `desktop.html`. Keys go to Solari remote Chrome. They are not stored in receipts.
