import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { BrowserSession } from "@solarisdk/browser"
import { requireHttpUrl } from "./http-url.ts"
import { excerptOf, haystackMatches, normalizeHaystack, requireExpect } from "./text.ts"
import {
  createClient,
  GOTO_TIMEOUT_MS,
  NETWORKIDLE_TIMEOUT_MS,
  OVERALL_TIMEOUT_MS,
  pageForSession,
  resolveProfileId,
  waitForReplayUrl,
} from "./solari.ts"
import { explainSolariError } from "./errors.ts"
import { completeMicrosoftSso, stillOnAuth } from "./sso.ts"
import {
  boundPromise,
  CLOSE_TIMEOUT_MS,
  LAUNCH_SETTLE_MS,
  ReadyRelease,
  raceWithTimeout,
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
  replayUrl?: string
}

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export function toReceiptPath(absPath: string): string {
  return path.relative(packageRoot, absPath).replaceAll("\\", "/")
}

function runDir(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  return path.join(packageRoot, ".auspex", "runs", stamp)
}

async function extractText(page: Page, selector?: string): Promise<string> {
  if (selector) {
    return page.locator(selector).first().innerText({ timeout: 10_000 })
  }
  return page.locator("body").innerText()
}

export async function runCheck(opts: CheckOptions): Promise<CheckResult> {
  requireExpect(opts.expect)
  requireHttpUrl(opts.url, "url")
  const deadline = Date.now() + OVERALL_TIMEOUT_MS
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
      const browser = await solari.launch({
        stealth: opts.stealth === true,
        recording: opts.record === true,
        profileId,
      })
      closer.set(async () => {
        await boundPromise(
          browser.close(),
          CLOSE_TIMEOUT_MS,
          `session close timed out after ${CLOSE_TIMEOUT_MS}ms`,
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
      try {
        await page.waitForLoadState("networkidle", {
          timeout: NETWORKIDLE_TIMEOUT_MS,
          signal,
        })
        networkIdle = true
      } catch {
        networkIdle = false
      }
      if (isCancelled()) return
      if (opts.sso) {
        await completeMicrosoftSso(page, { isCancelled, signal })
      }
      if (isCancelled()) return
      title = await page.title()
      finalUrl = page.url()
      const raw = await extractText(page, opts.selector)
      const haystack = normalizeHaystack(raw)
      excerpt = excerptOf(haystack)
      matched = haystackMatches(raw, opts.expect)
      if (opts.sso && stillOnAuth(new URL(finalUrl))) {
        matched = false
        excerpt = `SSO still on ${finalUrl}. ${excerpt}`
      }
      await page.screenshot({ path: screenshotAbs, type: "png", fullPage: true, signal })
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
        await closer.release(LAUNCH_SETTLE_MS)
      } catch (closeErr) {
        const closeMsg = `session close failed: ${explainSolariError(closeErr)}`
        if (workError) throw new Error(`${explainSolariError(workError)}; ${closeMsg}`)
        throw new Error(closeMsg)
      }
    }
    if (workError) throw new Error(explainSolariError(workError))

    let replayUrl: string | undefined
    if (opts.record && sessionId) {
      replayUrl = await waitForReplayUrl(solari, sessionId, deadline)
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
      replayUrl,
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
