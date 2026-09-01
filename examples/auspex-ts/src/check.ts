import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { BrowserSession } from "@solarisdk/browser"
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
import { raceWithTimeout } from "./timeout.ts"

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
  replayUrl?: string
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function runDir(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  return path.join(rootDir, ".auspex", "runs", stamp)
}

function excerptOf(text: string, max = 500): string {
  const collapsed = text.replace(/\s+/g, " ").trim()
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max)}…`
}

async function extractText(page: Page, selector?: string): Promise<string> {
  if (selector) {
    return page.locator(selector).first().innerText({ timeout: 10_000 })
  }
  return page.locator("body").innerText()
}

export async function runCheck(opts: CheckOptions): Promise<CheckResult> {
  if (!opts.expect.trim()) {
    throw new Error("check requires a non-empty --expect")
  }
  const solari = createClient()
  let browser: BrowserSession | undefined
  let sessionId = ""
  const outDir = runDir()
  await mkdir(outDir, { recursive: true })
  const screenshotPath = path.join(outDir, "screenshot.png")

  let title = ""
  let finalUrl = ""
  let excerpt = ""
  let matched = false

  const work = async (isCancelled: () => boolean) => {
    const profileId = opts.profile ? await resolveProfileId(solari, opts.profile) : undefined
    if (isCancelled()) return
    browser = await solari.launch({
      stealth: opts.stealth === true,
      recording: opts.record === true,
      profileId,
    })
    if (isCancelled()) return
    sessionId = browser.id
    const page = await pageForSession(browser)
    if (isCancelled()) return
    await page.goto(opts.url, { timeout: GOTO_TIMEOUT_MS, waitUntil: "domcontentloaded" })
    await page
      .waitForLoadState("networkidle", { timeout: NETWORKIDLE_TIMEOUT_MS })
      .catch(() => undefined)
    if (isCancelled()) return
    if (opts.sso) {
      await completeMicrosoftSso(page)
    }
    if (isCancelled()) return
    title = await page.title()
    finalUrl = page.url()
    const raw = await extractText(page, opts.selector)
    excerpt = excerptOf(raw)
    matched = raw.includes(opts.expect)
    if (opts.sso && stillOnAuth(new URL(finalUrl))) {
      matched = false
      excerpt = `SSO still on ${finalUrl}. ${excerpt}`
    }
    await page.screenshot({ path: screenshotPath, type: "png" })
    // Never auto-save: a check of the public login page would overwrite a
    // console-editor login (empty ~150 byte v4). Save only via the editor.
  }

  try {
    try {
      await raceWithTimeout(
        work,
        OVERALL_TIMEOUT_MS,
        `auspex check timed out after ${OVERALL_TIMEOUT_MS}ms`,
      )
    } catch (err) {
      throw new Error(explainSolariError(err))
    } finally {
      if (browser) {
        try {
          await browser.close()
        } catch {
          /* already gone */
        }
      }
    }

    let replayUrl: string | undefined
    if (opts.record && sessionId) {
      replayUrl = await waitForReplayUrl(solari, sessionId)
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
      replayUrl,
    }
    await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(result, null, 2)}\n`)
    return result
  } finally {
    await solari.close()
  }
}
