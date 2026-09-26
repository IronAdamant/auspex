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
    type?: (text: string, opts?: { delay?: number }) => Promise<unknown>
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
  "check --fill did not land: the visible document text does not contain --value. filled was not set."

/** Per-key delay so a contenteditable can commit each character. Zero-delay bursts are easy to revert. */
const CE_TYPE_DELAY_MS = 15
/** Long enough for an editor to revert a DOM write that never entered the document the user sees. */
const CE_VISIBLE_SETTLE_MS = 120

type FieldProbe = {
  password: boolean
  contentEditable: boolean
  text: string
}

type FillEl = {
  tagName?: string
  type?: string
  value?: string
  innerText?: string
  isContentEditable?: boolean
  focus?: () => void
  getAttribute?: (name: string) => string | null
  querySelector?: (sel: string) => FillEl | null
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Visible text only. Self-contained so page.evaluate can ship this function alone.
 * innerText matches excerpt and the painted document. textContent also counts hidden nodes,
 * which is how a contenteditable can look filled while the screenshot still shows the old body.
 */
export function probeVisibleControl(selector: string): FieldProbe {
  const blank = { password: false, contentEditable: false, text: "" }
  const doc = (globalThis as { document?: { querySelector(sel: string): FillEl | null } }).document
  if (!doc) return blank
  try {
    const el = doc.querySelector(selector)
    if (!el || typeof el.tagName !== "string") return blank
    const tag = el.tagName.toUpperCase()
    const password = tag === "INPUT" && String(el.type ?? "").toLowerCase() === "password"
    let contentEditable = el.isContentEditable === true
    if (!contentEditable && typeof el.querySelector === "function") {
      const nested = el.querySelector("[contenteditable]")
      const attr = nested?.getAttribute?.("contenteditable")
      if (nested && !(typeof attr === "string" && attr.toLowerCase() === "false")) contentEditable = true
    }
    if (password) return { password: true, contentEditable, text: "" }
    const text = tag === "INPUT" || tag === "TEXTAREA" ? String(el.value ?? "") : String(el.innerText ?? "")
    return { password: false, contentEditable, text }
  } catch {
    return blank
  }
}

/**
 * Focus the control or the contenteditable inside it.
 * A synthetic DOM range is not set: ProseMirror-style editors revert a selection they do not own.
 * The caret comes from the click plus this focus, which is the sequence that has landed markers.
 */
export function focusFillTarget(selector: string): void {
  const doc = (globalThis as { document?: { querySelector(sel: string): FillEl | null } }).document
  const el = doc?.querySelector(selector)
  if (!el) return
  let target = el
  if (el.isContentEditable !== true && typeof el.querySelector === "function") {
    const nested = el.querySelector("[contenteditable]")
    const attr = nested?.getAttribute?.("contenteditable")
    if (nested && !(typeof attr === "string" && attr.toLowerCase() === "false")) target = nested
  }
  if (typeof target.focus === "function") target.focus()
}

async function readField(page: Pick<ActionPage, "evaluate">, selector: string): Promise<FieldProbe> {
  const raw = await page.evaluate(probeVisibleControl, selector)
  return normalizeFieldProbe(raw)
}

async function controlContainsValue(page: Pick<ActionPage, "evaluate">, selector: string, value: string): Promise<boolean> {
  const probe = await readField(page, selector)
  if (probe.password) throw new Error(PASSWORD_FILL_ERROR)
  return textHasValue(probe.text, value)
}

async function visibleLanded(
  page: Pick<ActionPage, "evaluate">,
  selector: string,
  value: string,
  settle: boolean,
): Promise<boolean> {
  const appearMs = settle ? 80 : 0
  const deadline = Date.now() + appearMs
  let saw = await controlContainsValue(page, selector, value)
  while (!saw && Date.now() < deadline) {
    await wait(20)
    saw = await controlContainsValue(page, selector, value)
  }
  if (!saw) return false
  if (!settle) return true
  await wait(CE_VISIBLE_SETTLE_MS)
  return controlContainsValue(page, selector, value)
}

/**
 * After networkidle and excerpt extraction, refuse filled when the painted control
 * (and, for a contenteditable, the excerpt haystack) no longer contains --value.
 */
export async function assertVisibleFillLanded(
  page: Pick<ActionPage, "evaluate">,
  selector: string,
  value: string,
  excerptText?: string,
): Promise<void> {
  const probe = await readField(page, selector)
  if (probe.password) throw new Error(PASSWORD_FILL_ERROR)
  if (!textHasValue(probe.text, value)) throw new Error(FILL_NOT_LANDED_ERROR)
  if (probe.contentEditable && excerptText !== undefined && !textHasValue(excerptText, value)) {
    throw new Error(FILL_NOT_LANDED_ERROR)
  }
}

async function typeInto(page: ActionPage, selector: string, value: string, timeout: number, signal?: AbortSignal): Promise<void> {
  const keyboard = page.keyboard
  if (!keyboard || typeof keyboard.type !== "function") return
  await page.locator(selector).click({ timeout, signal })
  // Method call. Extracting keyboard.type drops this and Playwright throws reading _page.
  await keyboard.type(value)
}

async function landContentEditable(
  page: ActionPage,
  selector: string,
  value: string,
  timeout: number,
  signal?: AbortSignal,
): Promise<boolean> {
  const keyboard = page.keyboard
  await page.locator(selector).click({ timeout, signal })
  if (keyboard && typeof keyboard.type === "function") {
    await page.evaluate(focusFillTarget, selector)
    await keyboard.type(value, { delay: CE_TYPE_DELAY_MS })
    if (await visibleLanded(page, selector, value, true)) return true
  }
  if (keyboard && typeof keyboard.insertText === "function") {
    await page.evaluate(focusFillTarget, selector)
    // Method call. insertText is the beforeinput path when key events dirty the editor and do not stick.
    await keyboard.insertText(value)
    if (await visibleLanded(page, selector, value, true)) return true
  }
  return false
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

/** wait-for-visible, then fill, then click. `filled` is set only after visible text contains --value. */
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
    let landed = false
    if (first.contentEditable && (canType || pageHasInsertText(page))) {
      landed = await landContentEditable(page, fillSelector, value, timeout, signal)
    } else if (pageHasInsertText(page)) {
      const keyboard = page.keyboard
      await insertTextAt(
        {
          click: (clickOpts) => box.click({ timeout: clickOpts?.timeout ?? timeout, signal }),
          insertText: (text) => keyboard.insertText(text).then(() => undefined),
        },
        value,
        timeout,
      )
      if (!(await controlContainsValue(page, fillSelector, value)) && canType) {
        await typeInto(page, fillSelector, value, timeout, signal)
      }
      landed = await controlContainsValue(page, fillSelector, value)
    } else {
      await box.fill(value, { timeout, signal })
      if (!(await controlContainsValue(page, fillSelector, value)) && canType) {
        await typeInto(page, fillSelector, value, timeout, signal)
      }
      landed = await controlContainsValue(page, fillSelector, value)
    }
    if (!landed) throw new Error(FILL_NOT_LANDED_ERROR)
    out.filled = fillSelector
  }
  if (opts.click) {
    await page.locator(opts.click).click({ timeout, signal })
    out.clicked = opts.click
  }
  return out
}
