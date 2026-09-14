import type { BrowserSession } from "@solarisdk/browser"

type Page = Awaited<ReturnType<BrowserSession["newPage"]>>

export type SsoCancel = {
  isCancelled?: () => boolean
  signal?: AbortSignal
}

export type SsoProvider = "microsoft" | "google" | "auto"

export type SsoWall = "password" | "otp"

export type SsoResult = {
  needsHuman: boolean
  wall?: SsoWall
  url?: string
}

export const SSO_RETURN_TIMEOUT_MS = 120_000
const SSO_POLL_MS = 500

const PASSWORD_WALL = /enter (your )?password/i
const OTP_WALL =
  /enter (the )?code|one-time|authenticator app|approve a sign[- ]in|approve sign[- ]in|verify your identity|texted a code/i

/** True when hostname is exactly `domain` or a subdomain of it (label match, not substring). */
export function hostIs(hostname: string, domain: string): boolean {
  const h = hostname.toLowerCase()
  const d = domain.toLowerCase()
  return h === d || h.endsWith(`.${d}`)
}

export function microsoftAuthHost(hostname: string): boolean {
  return hostIs(hostname, "login.microsoftonline.com") || hostIs(hostname, "login.live.com")
}

export function stillOnAuth(url: URL): boolean {
  if (microsoftAuthHost(url.hostname) || hostIs(url.hostname, "accounts.google.com")) {
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
  if (microsoftAuthHost(url.hostname) || hostIs(url.hostname, "accounts.google.com")) {
    return true
  }
  return Boolean(opts.sso || opts.profile)
}

export function describeAuthWall(opts: {
  url: string
  hasPasswordInput?: boolean
  text?: string
}): SsoResult {
  let parsed: URL
  try {
    parsed = new URL(opts.url)
  } catch {
    return { needsHuman: false }
  }
  const text = opts.text ?? ""
  const ms = microsoftAuthHost(parsed.hostname)
  if (ms && (opts.hasPasswordInput || PASSWORD_WALL.test(text))) {
    return { needsHuman: true, wall: "password", url: opts.url }
  }
  if (ms && OTP_WALL.test(text)) {
    return { needsHuman: true, wall: "otp", url: opts.url }
  }
  return { needsHuman: false }
}

function stopped(cancel: SsoCancel): boolean {
  return Boolean(cancel.isCancelled?.() || cancel.signal?.aborted)
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"))
      return
    }
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t)
        reject(signal.reason ?? new Error("aborted"))
      },
      { once: true },
    )
  })
}

async function probeSsoWall(page: Page): Promise<SsoResult> {
  let hasPassword = false
  let text = ""
  try {
    const snap = (await page.evaluate(() => ({
      hasPassword: Boolean(document.querySelector('input[type="password"]')),
      text: document.body?.innerText ?? "",
    }))) as { hasPassword?: boolean; text?: string }
    hasPassword = Boolean(snap.hasPassword)
    text = snap.text ?? ""
  } catch {
    /* navigation mid-probe */
  }
  return describeAuthWall({ url: page.url(), hasPasswordInput: hasPassword, text })
}

async function clickFirst(page: Page, name: RegExp, signal?: AbortSignal): Promise<boolean> {
  const btn = page.getByRole("button", { name })
  if ((await btn.count()) === 0) return false
  await btn.first().click({ timeout: 10_000, signal })
  return true
}

async function finishMicrosoftPicker(page: Page, cancel: SsoCancel): Promise<SsoResult> {
  const signal = cancel.signal
  await page
    .waitForURL((url) => microsoftAuthHost(url.hostname), { timeout: 30_000, signal })
    .catch(() => undefined)
  if (stopped(cancel)) return { needsHuman: false }
  const wallNow = await probeSsoWall(page)
  if (wallNow.needsHuman) return wallNow

  const picker = page.getByText(/pick an account/i)
  await picker.waitFor({ timeout: 20_000, signal }).catch(() => undefined)
  if (stopped(cancel)) return { needsHuman: false }

  const signedIn = page.getByText(/^Signed in$/i)
  const tile = page.locator("[data-test-id='native-tile']").filter({ hasText: /signed in/i })
  if ((await signedIn.count()) > 0) {
    await signedIn.first().click({ timeout: 10_000, signal })
  } else if ((await tile.count()) > 0) {
    await tile.first().click({ timeout: 10_000, signal })
  } else {
    const blocked = await probeSsoWall(page)
    if (blocked.needsHuman) return blocked
  }
  if (stopped(cancel)) return { needsHuman: false }

  const afterPick = await probeSsoWall(page)
  if (afterPick.needsHuman) return afterPick

  const yes = page.getByRole("button", { name: /^yes$/i })
  if ((await yes.count()) > 0) {
    await yes.first().click({ timeout: 8_000, signal }).catch(() => undefined)
  }
  return probeSsoWall(page)
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

async function waitForSsoReturn(page: Page, cancel: SsoCancel): Promise<SsoResult> {
  const deadline = Date.now() + SSO_RETURN_TIMEOUT_MS
  while (!stopped(cancel) && Date.now() < deadline) {
    const wall = await probeSsoWall(page)
    if (wall.needsHuman) return wall
    try {
      if (!stillOnAuth(new URL(page.url()))) return { needsHuman: false }
    } catch {
      /* invalid url mid-nav */
    }
    try {
      await sleep(SSO_POLL_MS, cancel.signal)
    } catch {
      return { needsHuman: false }
    }
  }
  const wall = await probeSsoWall(page)
  if (wall.needsHuman) return wall
  return { needsHuman: false }
}

/** Click a vendor SSO button if present, then the signed-in account tile. Never types password/OTP. */
export async function completeSso(
  page: Page,
  opts: SsoCancel & { provider?: SsoProvider } = {},
): Promise<SsoResult> {
  if (stopped(opts)) return { needsHuman: false }
  const already = await probeSsoWall(page)
  if (already.needsHuman) return already
  const provider = opts.provider ?? "auto"
  const signal = opts.signal
  const tryMs = provider === "auto" || provider === "microsoft"
  const tryGoogle = provider === "auto" || provider === "google"
  let clicked = false
  if (tryMs && (await clickFirst(page, /sign in with microsoft/i, signal))) {
    clicked = true
    if (stopped(opts)) return { needsHuman: false }
    const wall = await finishMicrosoftPicker(page, opts)
    if (wall.needsHuman) return wall
  } else if (tryGoogle && (await clickFirst(page, /sign in with google/i, signal))) {
    clicked = true
    if (stopped(opts)) return { needsHuman: false }
    await finishGooglePicker(page, opts)
  } else if (provider === "auto" && (await clickFirst(page, /sign in with /i, signal))) {
    clicked = true
  }
  if (!clicked) return probeSsoWall(page)
  if (stopped(opts)) return { needsHuman: false }
  return waitForSsoReturn(page, opts)
}

/** @deprecated Use completeSso. */
export async function completeMicrosoftSso(page: Page, cancel: SsoCancel = {}): Promise<SsoResult> {
  return completeSso(page, { ...cancel, provider: "microsoft" })
}
