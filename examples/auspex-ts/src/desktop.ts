import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { SolariClient } from "@solarisdk/sdk"
import { packageRoot, toReceiptPath } from "./check.ts"
import { explainSolariError } from "./errors.ts"
import { requireApiKey } from "./solari.ts"
import { boundPromise } from "./timeout.ts"
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

export type DesktopHandle = {
  sessionId: string
  connect: () => Promise<void>
  health: () => Promise<{ ready?: boolean }>
  screenshot: () => Promise<Uint8Array>
  kill: () => Promise<void>
}

export type DesktopDeps = {
  create: () => Promise<DesktopHandle>
  sleep?: (ms: number) => Promise<void>
  status?: NodeJS.WritableStream
  tui?: DesktopTui
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function defaultDesktopDeps(): DesktopDeps {
  return {
    create: async () => {
      const pt = new SolariClient({ apiKey: requireApiKey() })
      const d = await pt.desktops.create({
        template: "default",
        resolution: "1280x720",
        timeoutMs: 5 * 60_000,
        lifecycle: { onTimeout: "kill" },
      })
      return {
        sessionId: d.sessionId,
        connect: () => d.connect(),
        health: () => d.health(),
        screenshot: () => d.screenshot({ format: "png" }),
        kill: () => d.kill(),
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
  tui.setPhase("booting")
  let desktop: DesktopHandle | undefined
  try {
    return await boundPromise(
      (async () => {
        desktop = await deps.create()
        tui.setPhase("connecting")
        await desktop.connect()
        tui.setPhase("waiting")
        const ready = await waitReady(desktop, sleepFn)
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
      })(),
      DESKTOP_OVERALL_MS,
      `desktop review timed out after ${DESKTOP_OVERALL_MS}ms`,
    )
  } catch (err) {
    if (desktop) {
      try {
        await desktop.kill()
      } catch {
        /* original error wins */
      }
    }
    tui.close()
    throw new Error(explainSolariError(err))
  }
}
