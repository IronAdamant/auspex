import type { BrowserSession } from "@solarisdk/browser"

type Page = Awaited<ReturnType<BrowserSession["newPage"]>>

export type SsoCancel = {
  isCancelled?: () => boolean
  signal?: AbortSignal
}

/** True when hostname is exactly `domain` or a subdomain of it (label match, not substring). */
export function hostIs(hostname: string, domain: string): boolean {
  const h = hostname.toLowerCase()
  const d = domain.toLowerCase()
  return h === d || h.endsWith(`.${d}`)
}

export function stillOnAuth(url: URL): boolean {
  if (hostIs(url.hostname, "login.microsoftonline.com") || hostIs(url.hostname, "login.live.com")) {
    return true
  }
  const path = url.pathname.replace(/\/+$/, "") || "/"
  if (path === "/login" || path === "/auth" || path.startsWith("/auth/")) return true
  return false
}

function stopped(cancel: SsoCancel): boolean {
  return Boolean(cancel.isCancelled?.() || cancel.signal?.aborted)
}

/** Click "Sign in with Microsoft" and the signed-in account tile if they appear. */
export async function completeMicrosoftSso(page: Page, cancel: SsoCancel = {}): Promise<void> {
  if (stopped(cancel)) return
  const signal = cancel.signal
  const msBtn = page.getByRole("button", { name: /sign in with microsoft/i })
  if ((await msBtn.count()) === 0) return
  await msBtn.first().click({ timeout: 10_000 })
  if (stopped(cancel)) return
  await page
    .waitForURL(/login\.microsoftonline\.com|login\.live\.com/, { timeout: 30_000, signal })
    .catch(() => undefined)
  if (stopped(cancel)) return
  await page.waitForLoadState("domcontentloaded", { timeout: 45_000, signal }).catch(() => undefined)
  if (stopped(cancel)) return

  const picker = page.getByText(/pick an account/i)
  await picker.waitFor({ timeout: 20_000 }).catch(() => undefined)
  if (stopped(cancel)) return

  const signedIn = page.getByText(/^Signed in$/i)
  const tile = page.locator("[data-test-id='native-tile']").filter({ hasText: /signed in/i })
  if ((await signedIn.count()) > 0) {
    await signedIn.first().click({ timeout: 10_000 })
  } else if ((await tile.count()) > 0) {
    await tile.first().click({ timeout: 10_000 })
  }
  if (stopped(cancel)) return

  const yes = page.getByRole("button", { name: /^yes$/i })
  if ((await yes.count()) > 0) {
    await yes.first().click({ timeout: 8_000 }).catch(() => undefined)
  }
  if (stopped(cancel)) return

  await page
    .waitForURL((url) => !stillOnAuth(url), { timeout: 45_000, signal })
    .catch(() => undefined)
  if (stopped(cancel)) return
  await page.waitForLoadState("networkidle", { timeout: 15_000, signal }).catch(() => undefined)
}
