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
  querySelectorAll?: (sel: string) => Iterable<FillEl>
}

type FillRange = {
  selectNodeContents: (node: FillEl) => void
  collapse: (toStart: boolean) => void
}

type FillSelection = {
  removeAllRanges: () => void
  addRange: (range: FillRange) => void
}

type FillDoc = {
  querySelector: (sel: string) => FillEl | null
  createRange?: () => FillRange
  getSelection?: () => FillSelection | null
  defaultView?: { getSelection?: () => FillSelection | null }
  execCommand?: (command: string, showUi: boolean, value: string) => boolean
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
 * Focus the editable surface, then optionally select it.
 * Self-contained so page.evaluate can ship this function alone.
 * Picks the contenteditable with the most visible text so a wrapper is not focused
 * instead of the document. Equal length prefers the descendant.
 * `all` is Playwright's contenteditable fill (select, then insert).
 * `end` places a caret so the next keyboard.type has a selection inside the editor.
 */
export function prepareFillTarget(arg: { selector: string; select: FillSelectMode }): boolean {
  const doc = (globalThis as unknown as { document?: FillDoc }).document
  const el = doc?.querySelector(arg.selector)
  if (!el) return false
  const nodes: FillEl[] = []
  if (el.isContentEditable === true) nodes.push(el)
  const nested = typeof el.querySelectorAll === "function" ? el.querySelectorAll("[contenteditable]") : undefined
  const listed = nested && typeof nested[Symbol.iterator] === "function" ? nested : []
  for (const node of listed) {
    const attr = node?.getAttribute?.("contenteditable")
    if (typeof attr === "string" && attr.toLowerCase() === "false") continue
    if (node) nodes.push(node)
  }
  if (nodes.length === 0 && typeof el.querySelector === "function") {
    const one = el.querySelector("[contenteditable]")
    const attr = one?.getAttribute?.("contenteditable")
    if (one && !(typeof attr === "string" && attr.toLowerCase() === "false")) nodes.push(one)
  }
  let target = el
  let bestLen = -1
  for (const node of nodes) {
    const len = (node.innerText ?? "").length
    const deeper = node !== el
    if (len > bestLen || (deeper && len === bestLen && len >= 0)) {
      target = node
      bestLen = len
    }
  }
  try {
    if (typeof target.focus === "function") target.focus()
  } catch {
    /* focus can throw on a detached node; the selection step still runs */
  }
  if (arg.select === "none") return true
  try {
    const range = doc?.createRange?.()
    const selection = doc?.getSelection?.() ?? doc?.defaultView?.getSelection?.()
    if (!range || !selection) return false
    range.selectNodeContents(target)
    if (arg.select === "end") range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
    return true
  } catch {
    return false
  }
}

type EditorModel = {
  focus?: () => void
  dispatch: (tr: unknown) => void
  state: {
    doc: { content?: { size?: number } }
    tr: { insertText: (text: string, from: number, to?: number) => unknown }
  }
}

type ViewHost = FillEl & { pmViewDesc?: { view?: EditorModel } }

/**
 * Same-turn paint after keyboard events miss the document.
 * Self-contained so page.evaluate can ship this function alone.
 * ProseMirror/TipTap keep the document on the view stored as pmViewDesc.
 * Other contenteditables get a selection plus execCommand('insertText'), which is
 * what Playwright uses when CDP insertText is not the path. No host-specific ids.
 */
export function paintFillTarget(arg: { selector: string; value: string }): boolean {
  const doc = (globalThis as unknown as { document?: FillDoc }).document
  const root = doc?.querySelector(arg.selector) as ViewHost | null
  if (!doc || !root) return false
  const hosts: ViewHost[] = [root]
  const marked = root.querySelector?.(".ProseMirror") as ViewHost | null | undefined
  if (marked) hosts.push(marked)
  const nested = typeof root.querySelectorAll === "function" ? root.querySelectorAll("[contenteditable]") : undefined
  const listed = nested && typeof nested[Symbol.iterator] === "function" ? nested : []
  for (const node of listed) {
    if (node) hosts.push(node as ViewHost)
  }
  let view: EditorModel | undefined
  for (const host of hosts) {
    const candidate = host.pmViewDesc?.view
    if (
      candidate?.state?.doc &&
      typeof candidate.state.tr?.insertText === "function" &&
      typeof candidate.dispatch === "function"
    ) {
      view = candidate
      break
    }
  }
  const visible = (): string => {
    const parts = [String(root.innerText ?? "")]
    const inner = root.querySelector?.(".ProseMirror") as ViewHost | null | undefined
    if (inner) parts.push(String(inner.innerText ?? ""))
    return parts.join("\n")
  }
  if (view) {
    try {
      if (typeof view.focus === "function") view.focus()
    } catch {
      /* the transaction is what paints */
    }
    const size = Number(view.state.doc.content?.size ?? 0)
    const from = size > 1 ? 1 : 0
    const to = size > 1 ? size - 1 : size
    try {
      view.dispatch(view.state.tr.insertText(arg.value, from, to))
    } catch {
      try {
        const at = size > 0 ? size - 1 : 0
        view.dispatch(view.state.tr.insertText(arg.value, at))
      } catch {
        /* range rejected; execCommand below is the general contenteditable path */
      }
    }
    if (visible().includes(arg.value)) return true
  }
  let target: ViewHost = root
  let bestLen = -1
  for (const host of hosts) {
    if (host.pmViewDesc?.view) {
      target = host
      break
    }
    if (host === root && host.isContentEditable !== true && hosts.length > 1) continue
    const len = (host.innerText ?? "").length
    const deeper = host !== root
    if (len > bestLen || (deeper && len === bestLen && len >= 0)) {
      target = host
      bestLen = len
    }
  }
  try {
    if (typeof target.focus === "function") target.focus()
    const range = doc.createRange?.()
    const selection = doc.getSelection?.() ?? doc.defaultView?.getSelection?.()
    if (range && selection) {
      range.selectNodeContents(target)
      selection.removeAllRanges()
      selection.addRange(range)
    }
    doc.execCommand?.("insertText", false, arg.value)
  } catch {
    /* a miss stays FILL_NOT_LANDED */
  }
  return visible().includes(arg.value)
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
  // Type before any further focus(). A click can leave a caret; element.focus() drops it,
  // and a contenteditable with no selection ignores both key events and insertText.
  if (keyboard && typeof keyboard.type === "function") {
    await keyboard.type(value, { delay: CE_TYPE_DELAY_MS })
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
  // Same turn: ProseMirror transaction when the node has a view, otherwise execCommand.
  await page.evaluate(paintFillTarget, { selector, value })
  return visibleLanded(page, selector, value, true)
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
