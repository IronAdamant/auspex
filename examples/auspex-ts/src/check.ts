import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { BrowserSession } from "@solarisdk/browser"
import { requireCheckUrl } from "./http-url.ts"
import { requireProfileName } from "./profiles.ts"
import { excerptOf, haystackMatches, normalizeHaystack, requireExpect } from "./text.ts"
import { assertRecordProfileAllowed } from "./tool-schema.ts"
import {
  createClient,
  GOTO_TIMEOUT_MS,
  launchBrowser,
  OVERALL_TIMEOUT_MS,
  pageForSession,
  resolveProfileId,
  waitUntilReleased,
} from "./solari.ts"
import { AuspexError, classifySolariError, explainSolariError } from "./errors.ts"
import { noopProgress, type ProgressFn } from "./progress.ts"
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
  allowRecordProfile?: boolean
  onProgress?: ProgressFn
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

export function runDirFromResult(result: CheckResult): string {
  const abs = path.isAbsolute(result.screenshotPath)
    ? result.screenshotPath
    : path.join(packageRoot, result.screenshotPath)
  return path.dirname(abs)
}

function runDir(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  return path.join(packageRoot, ".auspex", "runs", stamp)
}

async function extractPage(
  page: Page,
  selector: string | undefined,
  signal: AbortSignal,
): Promise<{ title: string; finalUrl: string; raw: string }> {
  return observeAbort(
    page.evaluate((sel: string | null) => {
      const el = sel ? (document.querySelector(sel) as HTMLElement | null) : document.body
      return {
        title: document.title,
        finalUrl: location.href,
        raw: el?.innerText ?? "",
      }
    }, selector ?? null),
    signal,
  )
}

export async function runCheck(opts: CheckOptions): Promise<CheckResult> {
  requireExpect(opts.expect)
  requireCheckUrl(opts.url, "url")
  assertRecordProfileAllowed(opts)
  if (opts.profile) opts = { ...opts, profile: requireProfileName(opts.profile) }
  const onProgress = opts.onProgress ?? noopProgress
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
      onProgress("launching")
      const profileId = opts.profile ? await resolveProfileId(solari, opts.profile) : undefined
      if (isCancelled()) return
      const browser = await observeAbort(
        launchBrowser(
          solari,
          {
            stealth: opts.stealth === true,
            recording: opts.record === true,
            profileId,
          },
          signal,
        ),
        signal,
      )
      closer.set(async () => {
        onProgress("closing")
        await closeThenRelease(
          () => browser.close(),
          async () => {
            await solari.sessions.releaseAndWait(browser.id)
            await waitUntilReleased(browser.id).catch(() => undefined)
          },
          CLOSE_TIMEOUT_MS,
        )
      })
      sessionId = browser.id
      if (isCancelled()) return
      const page = await pageForSession(browser)
      if (isCancelled()) return
      onProgress("goto")
      await page.goto(opts.url, {
        timeout: GOTO_TIMEOUT_MS,
        waitUntil: "domcontentloaded",
        signal,
      })
      if (isCancelled()) return
      if (opts.sso) {
        onProgress("sso")
        await completeMicrosoftSso(page, { isCancelled, signal })
      }
      if (isCancelled()) return
      onProgress("extract")
      let raw = ""
      try {
        const extracted = await extractPage(page, opts.selector, signal)
        title = extracted.title
        finalUrl = extracted.finalUrl || page.url()
        raw = extracted.raw
        const haystack = normalizeHaystack(raw)
        excerpt = excerptOf(haystack)
        matched = haystackMatches(raw, opts.expect)
      } catch (extractErr) {
        title = title || (await observeAbort(page.title(), signal).catch(() => ""))
        finalUrl = page.url()
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
      onProgress("screenshot")
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
    if (workError) {
      throw new AuspexError(explainSolariError(workError), {
        issue: classifySolariError(workError),
        sessionId: sessionId || undefined,
        screenshotPath: existsSync(screenshotAbs) ? screenshotPath : undefined,
        cause: workError,
      })
    }

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
