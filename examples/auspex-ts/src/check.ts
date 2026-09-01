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
import { completeMicrosoftSso } from "./sso.ts"

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

  const work = async () => {
    const profileId = opts.profile ? await resolveProfileId(solari, opts.profile) : undefined
    browser = await solari.launch({
      stealth: opts.stealth === true,
      recording: opts.record === true,
      profileId,
    })
    sessionId = browser.id
    const page = await pageForSession(browser)
    await page.goto(opts.url, { timeout: GOTO_TIMEOUT_MS, waitUntil: "domcontentloaded" })
    await page
      .waitForLoadState("networkidle", { timeout: NETWORKIDLE_TIMEOUT_MS })
      .catch(() => undefined)
    if (opts.sso) {
      await completeMicrosoftSso(page)
    }
    title = await page.title()
    finalUrl = page.url()
    const raw = await extractText(page, opts.selector)
    excerpt = excerptOf(raw)
    matched = raw.includes(opts.expect)
    await page.screenshot({ path: screenshotPath, type: "png" })
    // Never auto-save: a check of the public login page would overwrite a
    // console-editor login (empty ~150 byte v4). Save only via the editor.
  }

  try {
    try {
      await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`auspex check timed out after ${OVERALL_TIMEOUT_MS}ms`)),
            OVERALL_TIMEOUT_MS,
          )
        }),
      ])
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
