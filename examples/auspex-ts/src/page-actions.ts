import { paintFillTarget, prepareFillTarget, probeVisibleControl, waitForSurfaceQuiet } from "./page-action-browser.ts"
import { insertTextAt, pageHasInsertText } from "./remote-input.ts"

export { paintFillTarget, prepareFillTarget, probeVisibleControl, waitForSurfaceQuiet }

export type ActionPage = {
  waitForSelector: (
    selector: string,
    opts?: { state?: "attached" | "visible"; timeout?: number; signal?: AbortSignal },
  ) => Promise<unknown>
  locator: (selector: string) => {
    fill: (value: string, opts?: { timeout?: number; signal?: AbortSignal }) => Promise<unknown>
    click: (opts?: { timeout?: number; signal?: AbortSignal }) => Promise<unknown>
    /** Playwright focuses the node, then types. Absent on older drivers and on test doubles. */
    pressSequentially?: (text: string, opts?: { delay?: number; timeout?: number }) => Promise<unknown>
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
/** Quiet window after the last mutation on the fill target. A chapter rewrite is a childList mutation. */
const SURFACE_QUIET_MS = 400
/** Bound for a lazy editor that mounts, then replaces its HTML. Past this, the fill proceeds. */
const SURFACE_QUIET_TIMEOUT_MS = 8_000
const CE_LAND_PASSES = 2

type FieldProbe = {
  password: boolean
  contentEditable: boolean
  text: string
}

/** none = focus only. all = replace the control. end = caret after the current text. */
export type FillSelectMode = "none" | "all" | "end"

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

async function surfaceQuiet(page: ActionPage, selector: string): Promise<void> {
  await page.evaluate(waitForSurfaceQuiet, {
    selector,
    quietMs: SURFACE_QUIET_MS,
    timeoutMs: SURFACE_QUIET_TIMEOUT_MS,
  })
}

async function typeInto(page: ActionPage, selector: string, value: string, timeout: number, signal?: AbortSignal): Promise<void> {
  const keyboard = page.keyboard
  if (!keyboard || typeof keyboard.type !== "function") return
  await page.locator(selector).click({ timeout, signal })
  // Method call. Extracting keyboard.type drops this and Playwright throws reading _page.
  await keyboard.type(value)
}

async function landOnce(
  page: ActionPage,
  selector: string,
  value: string,
  timeout: number,
  signal?: AbortSignal,
): Promise<boolean> {
  const keyboard = page.keyboard
  const box = page.locator(selector)
  await box.click({ timeout, signal })
  // Focus the editable surface with no synthetic range, then type.
  // A click can leave the caret on a wrapper. The loaded-editor probe that paints
  // is click, then focus, then keyboard.type. A range is added only when that misses.
  await page.evaluate(prepareFillTarget, { selector, select: "none" })
  if (keyboard && typeof keyboard.type === "function") {
    await keyboard.type(value, { delay: CE_TYPE_DELAY_MS })
    if (await visibleLanded(page, selector, value, true)) return true
  }
  if (typeof box.pressSequentially === "function") {
    await box.pressSequentially(value, { delay: CE_TYPE_DELAY_MS, timeout })
    if (await visibleLanded(page, selector, value, true)) return true
  }
  await page.evaluate(prepareFillTarget, { selector, select: "end" })
  if (keyboard && typeof keyboard.type === "function") {
    await keyboard.type(value, { delay: CE_TYPE_DELAY_MS })
    if (await visibleLanded(page, selector, value, true)) return true
  }
  // Playwright fill for contenteditable: select the control, then CDP insertText.
  const selected = Boolean(await page.evaluate(prepareFillTarget, { selector, select: "all" }))
  if (selected && keyboard && typeof keyboard.insertText === "function") {
    await keyboard.insertText(value)
    if (await visibleLanded(page, selector, value, true)) return true
  }
  // Same turn: append through a ProseMirror view when the node has one, otherwise execCommand.
  await page.evaluate(paintFillTarget, { selector, value })
  return visibleLanded(page, selector, value, true)
}

async function landContentEditable(
  page: ActionPage,
  selector: string,
  value: string,
  timeout: number,
  signal?: AbortSignal,
): Promise<boolean> {
  for (let pass = 0; pass < CE_LAND_PASSES; pass++) {
    // Pass 0 already waited in runPageActions, before the contenteditable read.
    // A later rewrite can still drop the value; pass 1 waits out that rewrite, then types again.
    if (pass > 0) await surfaceQuiet(page, selector)
    const painted = await landOnce(page, selector, value, timeout, signal)
    if (!painted) continue
    await surfaceQuiet(page, selector)
    if (await controlContainsValue(page, selector, value)) return true
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
    // Classify after the node exists and its HTML has stopped changing. A lazy editor
    // mounts the control, then replaces its contents; a fill before that rewrite never
    // reaches the visible document, and a missing node is not contenteditable yet.
    await surfaceQuiet(page, fillSelector)
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
