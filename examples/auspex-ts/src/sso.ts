import type { BrowserSession } from "@solarisdk/browser"

type Page = Awaited<ReturnType<BrowserSession["newPage"]>>

export type SsoCancel = {
  isCancelled?: () => boolean
  signal?: AbortSignal
}

export type SsoProvider = "microsoft" | "google" | "auto"

/** True when hostname is exactly `domain` or a subdomain of it (label match, not substring). */
export function hostIs(hostname: string, domain: string): boolean {
  const h = hostname.toLowerCase()
  const d = domain.toLowerCase()
  return h === d || h.endsWith(`.${d}`)
}

export function stillOnAuth(url: URL): boolean {
  if (
    hostIs(url.hostname, "login.microsoftonline.com") ||
    hostIs(url.hostname, "login.live.com") ||
    hostIs(url.hostname, "accounts.google.com")
  ) {
    return true
  }
  const path = (url.pathname.replace(/\/+$/, "") || "/").toLowerCase()
  if (path === "/login" || path.startsWith("/login/") || path === "/auth" || path.startsWith("/auth/")) {
    return true
  }
  return false
}

/** Identity-provider hosts always fail-close; `/login` and `/auth` when --sso or --profile. */
export function shouldFailClosedAuth(
  url: URL,
  opts: { sso?: boolean; profile?: string },
): boolean {
  if (!stillOnAuth(url)) return false
  if (
    hostIs(url.hostname, "login.microsoftonline.com") ||
    hostIs(url.hostname, "login.live.com") ||
    hostIs(url.hostname, "accounts.google.com")
  ) {
    return true
  }
  return Boolean(opts.sso || opts.profile)
}

function stopped(cancel: SsoCancel): boolean {
  return Boolean(cancel.isCancelled?.() || cancel.signal?.aborted)
}

async function clickFirst(page: Page, name: RegExp, signal?: AbortSignal): Promise<boolean> {
  const btn = page.getByRole("button", { name })
  if ((await btn.count()) === 0) return false
  await btn.first().click({ timeout: 10_000, signal })
  return true
}

async function finishMicrosoftPicker(page: Page, cancel: SsoCancel): Promise<void> {
  const signal = cancel.signal
  await page
    .waitForURL(
      (url) =>
        hostIs(url.hostname, "login.microsoftonline.com") || hostIs(url.hostname, "login.live.com"),
      { timeout: 30_000, signal },
    )
    .catch(() => undefined)
  if (stopped(cancel)) return

  const picker = page.getByText(/pick an account/i)
  await picker.waitFor({ timeout: 20_000, signal }).catch(() => undefined)
  if (stopped(cancel)) return

  const signedIn = page.getByText(/^Signed in$/i)
  const tile = page.locator("[data-test-id='native-tile']").filter({ hasText: /signed in/i })
  if ((await signedIn.count()) > 0) {
    await signedIn.first().click({ timeout: 10_000, signal })
  } else if ((await tile.count()) > 0) {
    await tile.first().click({ timeout: 10_000, signal })
  }
  if (stopped(cancel)) return

  const yes = page.getByRole("button", { name: /^yes$/i })
  if ((await yes.count()) > 0) {
    await yes.first().click({ timeout: 8_000, signal }).catch(() => undefined)
  }
}

async function finishGooglePicker(page: Page, cancel: SsoCancel): Promise<void> {
  const signal = cancel.signal
  await page
    .waitForURL((url) => hostIs(url.hostname, "accounts.google.com"), { timeout: 30_000, signal })
    .catch(() => undefined)
  if (stopped(cancel)) return
  const account = page.getByRole("link", { name: /@/ }).or(page.getByRole("button", { name: /@/ }))
  if ((await account.count()) > 0) {
    await account.first().click({ timeout: 10_000, signal }).catch(() => undefined)
  }
}

/** Click a vendor SSO button if present, then the signed-in account tile. */
export async function completeSso(
  page: Page,
  opts: SsoCancel & { provider?: SsoProvider } = {},
): Promise<void> {
  if (stopped(opts)) return
  const provider = opts.provider ?? "auto"
  const signal = opts.signal
  const tryMs = provider === "auto" || provider === "microsoft"
  const tryGoogle = provider === "auto" || provider === "google"
  let clicked = false
  if (tryMs && (await clickFirst(page, /sign in with microsoft/i, signal))) {
    clicked = true
    if (stopped(opts)) return
    await finishMicrosoftPicker(page, opts)
  } else if (tryGoogle && (await clickFirst(page, /sign in with google/i, signal))) {
    clicked = true
    if (stopped(opts)) return
    await finishGooglePicker(page, opts)
  } else if (provider === "auto" && (await clickFirst(page, /sign in with /i, signal))) {
    clicked = true
  }
  if (!clicked || stopped(opts)) return
  await page
    .waitForURL((url) => !stillOnAuth(url), { timeout: 45_000, signal })
    .catch(() => undefined)
}

/** @deprecated Use completeSso. */
export async function completeMicrosoftSso(page: Page, cancel: SsoCancel = {}): Promise<void> {
  await completeSso(page, { ...cancel, provider: "microsoft" })
}
