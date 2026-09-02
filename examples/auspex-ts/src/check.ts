import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { BrowserSession } from "@solarisdk/browser"
import { requireHttpUrl } from "./http-url.ts"
import { excerptOf, haystackMatches, normalizeHaystack, requireExpect } from "./text.ts"
import {
  createClient,
  GOTO_TIMEOUT_MS,
  launchBrowser,
  NETWORKIDLE_TIMEOUT_MS,
  OVERALL_TIMEOUT_MS,
  pageForSession,
  resolveProfileId,
} from "./solari.ts"
import { explainSolariError } from "./errors.ts"
import { completeMicrosoftSso, shouldFailClosedAuth } from "./sso.ts"
import {
  boundPromise,
  closeThenRelease,
  CLOSE_TIMEOUT_MS,
  observeAbort,
  ReadyRelease,
  raceWithTimeout,
  SCREENSHOT_TIMEOUT_MS,
} from "./timeout.ts"

type Page = Awaited<ReturnType<BrowserSession["newPage"]>>

export type CheckOptions = {
  url: string
  expect: string
  selector?: string
  profile?: string
  stealth?: boolean
  record?: boolean
  sso?: boolean
}

export type CheckResult = {
  title: string
  finalUrl: string
  ok: boolean
  expect: string
  matched: boolean
  excerpt: string
  screenshotPath: string
  sessionId: string
  networkIdle: boolean
}

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export function toReceiptPath(absPath: string): string {
  return path.relative(packageRoot, absPath).replaceAll("\\", "/")
}

function runDir(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  return path.join(packageRoot, ".auspex", "runs", stamp)
}

async function extractText(page: Page, selector: string | undefined, signal: AbortSignal): Promise<string> {
  if (selector) {
    return page.locator(selector).first().innerText({ timeout: 10_000, signal })
  }
  return page.locator("body").innerText({ timeout: 30_000, signal })
}

async function waitNetworkIdle(page: Page, signal: AbortSignal): Promise<boolean> {
  try {
    await page.waitForLoadState("networkidle", { timeout: NETWORKIDLE_TIMEOUT_MS, signal })
    return true
  } catch {
    return false
  }
}

export async function runCheck(opts: CheckOptions): Promise<CheckResult> {
  requireExpect(opts.expect)
  requireHttpUrl(opts.url, "url")
  const solari = createClient()
  const closer = new ReadyRelease()
  let sessionId = ""
  const outDir = runDir()
  await mkdir(outDir, { recursive: true })
  const screenshotAbs = path.join(outDir, "screenshot.png")
  const screenshotPath = toReceiptPath(screenshotAbs)

  let title = ""
  let finalUrl = ""
  let excerpt = ""
  let matched = false
  let networkIdle = false
  let workError: unknown

  const work = async (isCancelled: () => boolean, signal: AbortSignal) => {
    try {
      const profileId = opts.profile ? await resolveProfileId(solari, opts.profile) : undefined
      if (isCancelled()) return
      const browser = await observeAbort(
        launchBrowser(solari, {
          stealth: opts.stealth === true,
          recording: opts.record === true,
          profileId,
        }),
        signal,
      )
      closer.set(async () => {
        await closeThenRelease(
          () => browser.close(),
          () => solari.sessions.releaseAndWait(browser.id),
          CLOSE_TIMEOUT_MS,
        )
      })
      sessionId = browser.id
      if (isCancelled()) return
      const page = await pageForSession(browser)
      if (isCancelled()) return
      await page.goto(opts.url, {
        timeout: GOTO_TIMEOUT_MS,
        waitUntil: "domcontentloaded",
        signal,
      })
      networkIdle = await waitNetworkIdle(page, signal)
      if (isCancelled()) return
      if (opts.sso) {
        await completeMicrosoftSso(page, { isCancelled, signal })
        networkIdle = await waitNetworkIdle(page, signal)
      }
      if (isCancelled()) return
      title = await observeAbort(page.title(), signal)
      finalUrl = page.url()
      let raw = ""
      try {
        raw = await extractText(page, opts.selector, signal)
        const haystack = normalizeHaystack(raw)
        excerpt = excerptOf(haystack)
        matched = haystackMatches(raw, opts.expect)
      } catch (extractErr) {
        const authUrl = new URL(finalUrl)
        if (shouldFailClosedAuth(authUrl, opts)) {
          matched = false
          excerpt = `still on ${finalUrl}. ${extractErr instanceof Error ? extractErr.message : String(extractErr)}`
        } else {
          throw extractErr
        }
      }
      if (finalUrl && shouldFailClosedAuth(new URL(finalUrl), opts)) {
        matched = false
        excerpt = `still on ${finalUrl}. ${excerpt}`
      }
      await page.screenshot({
        path: screenshotAbs,
        type: "png",
        fullPage: true,
        signal,
        timeout: SCREENSHOT_TIMEOUT_MS,
      })
      // Never auto-save: a check of the public login page would overwrite a
      // console-editor login (empty ~150 byte v4). Save only via the editor.
    } finally {
      closer.skip()
    }
  }

  try {
    try {
      await raceWithTimeout(
        work,
        OVERALL_TIMEOUT_MS,
        `auspex check timed out after ${OVERALL_TIMEOUT_MS}ms`,
      )
    } catch (err) {
      workError = err
    } finally {
      try {
        await closer.release()
      } catch (closeErr) {
        const closeMsg = `session close failed: ${explainSolariError(closeErr)}`
        if (workError) throw new Error(`${explainSolariError(workError)}; ${closeMsg}`)
        throw new Error(closeMsg)
      }
    }
    if (workError) throw new Error(explainSolariError(workError))

    const result: CheckResult = {
      title,
      finalUrl,
      ok: matched,
      expect: opts.expect,
      matched,
      excerpt,
      screenshotPath,
      sessionId,
      networkIdle,
    }
    await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(result, null, 2)}\n`)
    return result
  } finally {
    try {
      await boundPromise(
        solari.close(),
        CLOSE_TIMEOUT_MS,
        `solari close timed out after ${CLOSE_TIMEOUT_MS}ms`,
      )
    } catch {
      /* local proxy stop is bounded; session already released */
    }
  }
}
