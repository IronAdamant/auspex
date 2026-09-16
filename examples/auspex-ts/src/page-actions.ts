export type ActionPage = {
  waitForSelector: (
    selector: string,
    opts?: { state?: "attached" | "visible"; timeout?: number; signal?: AbortSignal },
  ) => Promise<unknown>
  locator: (selector: string) => {
    fill: (value: string, opts?: { timeout?: number; signal?: AbortSignal }) => Promise<unknown>
    click: (opts?: { timeout?: number; signal?: AbortSignal }) => Promise<unknown>
  }
  evaluate: <R>(pageFunction: () => R) => Promise<R>
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

/** wait-for-visible, then fill, then click. Missing fields are no-ops. */
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
    const isPassword = await page.evaluate((sel: string) => {
      try {
        const el = document.querySelector(sel)
        return el instanceof HTMLInputElement && el.type === "password"
      } catch {
        return false
      }
    }, fillSelector)
    if (isPassword) {
      throw new Error(PASSWORD_FILL_ERROR)
    }
    await page.locator(opts.fill).fill(opts.value, { timeout, signal })
    out.filled = opts.fill
  }
  if (opts.click) {
    await page.locator(opts.click).click({ timeout, signal })
    out.clicked = opts.click
  }
  return out
}
