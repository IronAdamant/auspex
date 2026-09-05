import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { SolariClient } from "@solarisdk/sdk"
import { packageRoot, toReceiptPath } from "./check.ts"
import { AuspexError, classifySolariError, explainSolariError } from "./errors.ts"
import { fetchWithIdempotencyKey, requireApiKey } from "./solari.ts"
import { observeAbort, raceWithTimeout } from "./timeout.ts"
import { createDesktopTui, desktopOverviewText, desktopSummary, type DesktopTui } from "./tui.ts"

export const DESKTOP_OVERALL_MS = 90_000
export const DESKTOP_HEALTH_MS = 30_000

export type DesktopResult = {
  ok: boolean
  errors: string[]
  desktopId: string
  screenshotPath: string
  ready: boolean
  /** Short MCP/chat banner. */
  overview: string
  /** Full append-only ASCII transcript (phases + ok/path). Primary human/agent report. */
  log: string
}

export type DesktopTask = {
  open?: string
  type?: string
  click?: { x: number; y: number }
}

export type DesktopHandle = {
  sessionId: string
  connect: () => Promise<void>
  health: () => Promise<{ ready?: boolean }>
  screenshot: () => Promise<Uint8Array>
  kill: () => Promise<void>
  click?: (x: number, y: number) => Promise<void>
  typeText?: (text: string) => Promise<void>
  openApp?: (name: string) => Promise<void>
}

export type DesktopDeps = {
  create: () => Promise<DesktopHandle>
  sleep?: (ms: number) => Promise<void>
  status?: NodeJS.WritableStream
  tui?: DesktopTui
  task?: DesktopTask
  overallMs?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const DESKTOP_CREATE_OPTS = {
  template: "default",
  resolution: "1280x720",
  cpu: 1,
  memMb: 2048,
  timeoutMs: 5 * 60_000,
  lifecycle: { onTimeout: "kill" as const },
}

export const DEFAULT_DESKTOP_CLICK = { x: 640, y: 360 }

export function defaultDesktopDeps(): DesktopDeps {
  return {
    create: async () => {
      const pt = new SolariClient({ apiKey: requireApiKey(), fetch: fetchWithIdempotencyKey() })
      const d = await pt.desktops.create(DESKTOP_CREATE_OPTS)
      return {
        sessionId: d.sessionId,
        connect: () => d.connect(),
        health: () => d.health(),
        screenshot: () => d.screenshot({ format: "png" }),
        kill: () => d.kill(),
        click: (x, y) => d.mouse.click(x, y),
        typeText: (text) => d.keyboard.type(text),
        openApp: (name) => d.open(name).then(() => undefined),
      }
    },
  }
}

function newRunDir(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  return path.join(packageRoot, ".auspex", "runs", stamp)
}

async function waitReady(desktop: DesktopHandle, sleepFn: (ms: number) => Promise<void>): Promise<boolean> {
  const deadline = Date.now() + DESKTOP_HEALTH_MS
  while (Date.now() < deadline) {
    try {
      const health = await desktop.health()
      if (health.ready) return true
    } catch {
      /* X11 may still be coming up */
    }
    await sleepFn(1000)
  }
  return false
}

export async function runDesktopReview(deps: DesktopDeps = defaultDesktopDeps()): Promise<DesktopResult> {
  const status = deps.status ?? process.stderr
  const sleepFn = deps.sleep ?? sleep
  const tui = deps.tui ?? createDesktopTui(status)
  const overview = desktopOverviewText()
  const overallMs = deps.overallMs ?? DESKTOP_OVERALL_MS
  tui.setPhase("booting")
  let desktop: DesktopHandle | undefined
  const createP = deps.create()
  try {
    return await raceWithTimeout(
      async (isCancelled, signal) => {
        try {
          desktop = await observeAbort(createP, signal)
        } catch (err) {
          void createP.then((d) => d.kill().catch(() => undefined))
          throw err
        }
        if (isCancelled()) {
          await desktop.kill().catch(() => undefined)
          throw new Error(`desktop review timed out after ${overallMs}ms`)
        }
        tui.setPhase("connecting")
        await desktop.connect()
        tui.setPhase("waiting")
        const ready = await waitReady(desktop, sleepFn)
        tui.setPhase("task")
        const task = deps.task ?? {}
        const clickAt = task.click ?? DEFAULT_DESKTOP_CLICK
        if (task.open && desktop.openApp) await desktop.openApp(task.open)
        if (task.type && desktop.typeText) await desktop.typeText(task.type)
        if (desktop.click) await desktop.click(clickAt.x, clickAt.y)
        tui.setPhase("screenshot")
        const png = await desktop.screenshot()
        const dir = newRunDir()
        mkdirSync(dir, { recursive: true })
        const abs = path.join(dir, "screenshot.png")
        writeFileSync(abs, png)
        const desktopId = desktop.sessionId
        tui.setPhase("killing")
        let killErr: string | undefined
        try {
          await desktop.kill()
        } catch (err) {
          killErr = `desktop kill failed: ${explainSolariError(err)}`
        }
        desktop = undefined
        tui.close()
        const errors = killErr ? [killErr] : []
        const screenshotPath = toReceiptPath(abs)
        const ok = errors.length === 0
        const summary = desktopSummary({ ok, ready, screenshotPath, errors })
        status.write(`${summary}\n`)
        const log = `${tui.transcript()}\n${summary}`
        return {
          ok,
          errors,
          desktopId,
          screenshotPath,
          ready,
          overview,
          log,
        }
      },
      overallMs,
      `desktop review timed out after ${overallMs}ms`,
    )
  } catch (err) {
    if (desktop) {
      try {
        await desktop.kill()
      } catch {
        /* original error wins */
      }
    } else {
      void createP.then((d) => d.kill().catch(() => undefined))
    }
    tui.close()
    throw new AuspexError(explainSolariError(err), {
      issue: classifySolariError(err),
      log: tui.transcript(),
      cause: err,
    })
  }
}
