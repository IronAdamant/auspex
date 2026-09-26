/**
 * Agent typing on a Playwright-attached Solari session may use CDP insertText.
 * The fill waits until the targeted node stops changing, then clicks, focuses, and types.
 * Visible innerText is re-read on a short backoff, and a hit has to still be there
 * after a brief settle. When those reads still lack the value, pressSequentially runs when the driver
 * has it, then a caret and another type, then a selection and insertText (Playwright's
 * fill for contenteditable). That same turn appends through a ProseMirror view when the
 * node stores pmViewDesc, and uses execCommand('insertText') for other editors. If a
 * rewrite drops the value, the fill waits and tries once more. `filled` requires visible
 * text, not hidden textContent. 
 * The login-handoff editor is noVNC and does not expose
 * that socket (editorFold no-cdp). Auspex does not add login --stealth. Solari ignores
 * stealth on login-handoff.
 */

export type InsertTextTarget = {
  click: (opts?: { timeout?: number }) => Promise<unknown>
  insertText: (text: string) => Promise<void>
}

export function pageHasInsertText<T extends object>(
  page: T,
): page is T & { keyboard: { insertText: (text: string) => Promise<void> } } {
  const keyboard = (page as { keyboard?: { insertText?: unknown } }).keyboard
  return typeof keyboard?.insertText === "function"
}

/** Click the control, then CDP insertText. Does not walk a VNC keystream. */
export async function insertTextAt(target: InsertTextTarget, text: string, timeout = 15_000): Promise<void> {
  await target.click({ timeout })
  await target.insertText(text)
}
