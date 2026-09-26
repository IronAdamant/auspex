import { insertTextAt, pageHasInsertText } from "./remote-input.ts"

export type ActionPage = {
  waitForSelector: (
    selector: string,
    opts?: { state?: "attached" | "visible"; timeout?: number; signal?: AbortSignal },
  ) => Promise<unknown>
  locator: (selector: string) => {
    fill: (value: string, opts?: { timeout?: number; signal?: AbortSignal }) => Promise<unknown>
    click: (opts?: { timeout?: number; signal?: AbortSignal }) => Promise<unknown>
  }
  evaluate: <R, Arg>(pageFunction: (arg: Arg) => R, arg?: Arg) => Promise<R>
  keyboard?: {
    insertText?: (text: string) => Promise<unknown>
    type?: (text: string) => Promise<unknown>
  }
}

export type PageActionOpts = {
  waitFor?: string
  fill?: string
  value?: string
  click?: string
  profile?: string
  name?: string
  allowPageActions?: boolean
}

export const PAGE_ACTIONS_PROFILE_ERROR =
  "fill/click with a profile (including name=consistencyhub) requires --allow-page-actions. Refuse-by-default so a logged-in app is not driven from page/OCR text. Public checks without a profile may still fill/click."

export const PASSWORD_FILL_ERROR =
  "Auspex check --fill is refused on input[type=password] selectors (includes input[type=password], input:password, [type='password'], [type=password]). Agents must never type passwords. SSO IdP password walls are detected and returned as needsHuman."

export const FILL_NOT_LANDED_ERROR =
  "check --fill did not land: the control textContent/value does not contain --value. filled was not set."

type FieldProbe = {
  password: boolean
  contentEditable: boolean
  text: string
}

/** Test doubles may return `true` for a password input. A string is the control text. */
export function normalizeFieldProbe(raw: unknown): FieldProbe {
  if (raw === true) return { password: true, contentEditable: false, text: "" }
  if (typeof raw === "string") return { password: false, contentEditable: false, text: raw }
  if (!raw || typeof raw !== "object") return { password: false, contentEditable: false, text: "" }
  const row = raw as { password?: unknown; contentEditable?: unknown; text?: unknown }
  return {
    password: row.password === true,
    contentEditable: row.contentEditable === true,
    text: typeof row.text === "string" ? row.text : "",
  }
}

function textHasValue(text: string, value: string): boolean {
  if (value.length === 0) return text.trim().length === 0
  return text.includes(value)
}

async function readField(page: ActionPage, selector: string): Promise<FieldProbe> {
  const raw = await page.evaluate((sel: string) => {
    const blank = { password: false, contentEditable: false, text: "" }
    try {
      const el = document.querySelector(sel)
      if (!el || !(el instanceof HTMLElement)) return blank
      const password = el instanceof HTMLInputElement && el.type === "password"
      const contentEditable = el.isContentEditable
      const text =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : (el.textContent ?? "")
      return { password, contentEditable, text }
    } catch {
      return blank
    }
  }, selector)
  return normalizeFieldProbe(raw)
}

async function controlContainsValue(page: ActionPage, selector: string, value: string): Promise<boolean> {
  const probe = await readField(page, selector)
  if (probe.password) throw new Error(PASSWORD_FILL_ERROR)
  return textHasValue(probe.text, value)
}

async function typeInto(page: ActionPage, selector: string, value: string, timeout: number, signal?: AbortSignal): Promise<void> {
  const typeText = page.keyboard?.type
  if (typeof typeText !== "function") return
  await page.locator(selector).click({ timeout, signal })
  await typeText(value)
}

export type PageActionResult = {
  waitedFor?: string
  filled?: string
  clicked?: string
}

export const PAGE_ACTION_TIMEOUT_MS = 15_000

/** Fail-closed password-fill ban: refuse selectors that target input[type=password]. */
export function assertNotPasswordSelector(selector: string): void {
  const norm = selector.toLowerCase().replace(/\s+/g, "")
  const patterns = [
    /input\[type=["']?password["']?\]/,
    /\[type=["']?password["']?\]/,
    /:password\b/,
  ]
  if (patterns.some((p) => p.test(norm))) {
    throw new Error(PASSWORD_FILL_ERROR)
  }
}

export function assertFillPair(opts: PageActionOpts): void {
  if (opts.fill && opts.value === undefined) {
    throw new Error("check --fill requires --value")
  }
  if (opts.value !== undefined && !opts.fill) {
    throw new Error("check --value requires --fill <css>")
  }
  if (opts.fill) {
    assertNotPasswordSelector(opts.fill)
  }
}

/**
 * Fail-closed page-action guards: profile-attached checks (ConsistencyHub) cannot fill/click
 * unless explicitly opted in. Prevents agents from driving logged-in apps based on page/OCR text.
 */
export function assertPageActionsAllowed(opts: PageActionOpts): void {
  assertFillPair(opts)
  const attached =
    Boolean(opts.profile?.trim()) || (opts.name ?? "").trim().toLowerCase() === "consistencyhub"
  if (!attached) return
  if (!opts.fill && !opts.click) return
  if (opts.allowPageActions) return
  throw new Error(PAGE_ACTIONS_PROFILE_ERROR)
}

/** wait-for-visible, then fill, then click. `filled` is set only after the control contains --value. */
export async function runPageActions(
  page: ActionPage,
  opts: PageActionOpts,
  signal?: AbortSignal,
): Promise<PageActionResult> {
  assertFillPair(opts)
  const out: PageActionResult = {}
  const timeout = PAGE_ACTION_TIMEOUT_MS
  if (opts.waitFor) {
    await page.waitForSelector(opts.waitFor, { state: "visible", timeout, signal })
    out.waitedFor = opts.waitFor
  }
  if (opts.fill && opts.value !== undefined) {
    const fillSelector = opts.fill
    const value = opts.value
    const first = await readField(page, fillSelector)
    if (first.password) throw new Error(PASSWORD_FILL_ERROR)
    const box = page.locator(fillSelector)
    const canType = typeof page.keyboard?.type === "function"
    if (first.contentEditable && canType) {
      await typeInto(page, fillSelector, value, timeout, signal)
    } else if (pageHasInsertText(page)) {
      const insert = page.keyboard.insertText
      await insertTextAt(
        {
          click: (clickOpts) => box.click({ timeout: clickOpts?.timeout ?? timeout, signal }),
          insertText: (text) => insert(text).then(() => undefined),
        },
        value,
        timeout,
      )
      if (!(await controlContainsValue(page, fillSelector, value)) && canType) {
        await typeInto(page, fillSelector, value, timeout, signal)
      }
    } else {
      await box.fill(value, { timeout, signal })
      if (!(await controlContainsValue(page, fillSelector, value)) && canType) {
        await typeInto(page, fillSelector, value, timeout, signal)
      }
    }
    if (!(await controlContainsValue(page, fillSelector, value))) {
      throw new Error(FILL_NOT_LANDED_ERROR)
    }
    out.filled = fillSelector
  }
  if (opts.click) {
    await page.locator(opts.click).click({ timeout, signal })
    out.clicked = opts.click
  }
  return out
}
