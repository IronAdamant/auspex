import type { BrowserSession } from "@solarisdk/browser"

type Page = Awaited<ReturnType<BrowserSession["newPage"]>>

function stillOnAuth(url: URL): boolean {
  const host = url.hostname
  if (host.includes("login.microsoftonline.com") || host.includes("login.live.com")) return true
  if (url.pathname === "/login" || url.pathname.startsWith("/auth/")) return true
  return false
}

/** Click "Sign in with Microsoft" and the signed-in account tile if the picker appears. */
export async function completeMicrosoftSso(page: Page): Promise<void> {
  const msBtn = page.getByRole("button", { name: /sign in with microsoft/i })
  if ((await msBtn.count()) === 0) return
  await msBtn.first().click({ timeout: 10_000 })
  await page.waitForURL(/login\.microsoftonline\.com|login\.live\.com/, { timeout: 30_000 }).catch(() => undefined)
  await page.waitForLoadState("domcontentloaded", { timeout: 45_000 }).catch(() => undefined)

  const picker = page.getByText(/pick an account/i)
  await picker.waitFor({ timeout: 20_000 }).catch(() => undefined)
  if ((await picker.count()) === 0) {
    await page.waitForTimeout(3_000)
  }

  const signedIn = page.getByText(/^Signed in$/i)
  if ((await signedIn.count()) > 0) {
    await signedIn.first().click({ timeout: 10_000 })
  } else {
    const tile = page.locator("[data-test-id='native-tile'], .tile, [role='button']").filter({
      hasText: /signed in/i,
    })
    if ((await tile.count()) > 0) await tile.first().click({ timeout: 10_000 })
  }

  const yes = page.getByRole("button", { name: /^yes$/i })
  if ((await yes.count()) > 0) {
    await yes.first().click({ timeout: 8_000 }).catch(() => undefined)
  }

  await page.waitForURL((url) => !stillOnAuth(url), { timeout: 45_000 }).catch(() => undefined)
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined)
}
