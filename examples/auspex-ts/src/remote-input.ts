/**
 * Agent typing on a Playwright-attached Solari session may use CDP insertText.
 * Contenteditable controls ignore insertText; page-actions falls back to keyboard.type
 * and sets `filled` only after value/textContent contains the typed text.
 * The login-handoff editor is noVNC and does not expose that socket (editorFold no-cdp).
 * Auspex does not add login --stealth. Solari ignores stealth on login-handoff.
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
