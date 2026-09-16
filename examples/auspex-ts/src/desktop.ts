import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { SolariClient } from "@solarisdk/sdk"
import { packageRoot, toReceiptPath } from "./check.ts"
import {
  collectProcessSignal,
  collectWindowSignal,
  desktopNeedleMatches,
  expectOnProcessSignal,
  waitForProcess,
  type DesktopProcess,
  type DesktopProbeHandle,
} from "./desktop-probe.ts"
import { AuspexError, classifySolariError, explainSolariError } from "./errors.ts"
import { forgetLive, rememberLive } from "./session-ledger.ts"
import { fetchWithIdempotencyKey, requireApiKey } from "./solari.ts"
import { observeAbort, raceWithTimeout } from "./timeout.ts"
import { createDesktopTui, desktopOverviewText, desktopSummary, type DesktopTui } from "./tui.ts"

export type { DesktopProcess }

export const DESKTOP_OVERALL_MS = 90_000
export const DESKTOP_HEALTH_MS = 30_000
export const WINDOW_MAP_MS = 8_000
/** Old Mousepad layout guess. Unverified; not the default demo. Pass --click to attempt it. */
export const MOUSEPAD_CLICK = { x: 320, y: 300 }
export const DEFAULT_DESKTOP_TASK: DesktopTask = { open: "mousepad" }

export type DesktopResult = {
  ok: boolean
  errors: string[]
  desktopId: string
  screenshotPath: string
  ready: boolean
  processOk?: boolean
  windowOk?: boolean
  clicked?: boolean
  click?: { x: number; y: number; verified: false }
  matched: boolean
  expect?: string
  streamUrl?: string
  overview: string
  log: string
}

export type DesktopTask = {
  open?: string
  type?: string
  click?: { x: number; y: number }
  expect?: string
}

export type DesktopHandle = DesktopProbeHandle & {
  sessionId: string
  streamUrl?: string
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
  healthMs?: number
  windowMs?: number
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

export function resolveDesktopTask(task?: DesktopTask): DesktopTask {
  if (task?.open || task?.type || task?.click || task?.expect) return { ...task }
  return { ...DEFAULT_DESKTOP_TASK }
}

export function clickForTask(task: DesktopTask): { x: number; y: number } | undefined {
  return task.click
}

export function desktopNeedle(task: DesktopTask): string | undefined {
  const open = task.open?.trim()
  const expect = task.expect?.trim()
  return open || expect || undefined
}

export function defaultDesktopDeps(): DesktopDeps {
  return {
    create: async () => {
      const pt = new SolariClient({ apiKey: requireApiKey(), fetch: fetchWithIdempotencyKey() })
      const d = await pt.desktops.create(DESKTOP_CREATE_OPTS)
      return {
        sessionId: d.sessionId,
        streamUrl: d.streamUrl,
        connect: () => d.connect(),
        health: () => d.health(),
        screenshot: () => d.screenshot({ format: "png" }),
        kill: () => d.kill(),
        click: (x, y) => d.mouse.click(x, y),
        typeText: (text) => d.keyboard.type(text),
        openApp: (name) => d.open(name).then(() => undefined),
        exec: (cmd, opts) => d.exec(cmd, { args: opts?.args }),
        processList: () => d.process.list(),
      }
    },
  }
}

function newRunDir(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  return path.join(packageRoot, ".auspex", "runs", stamp)
}

async function waitReady(
  desktop: DesktopHandle,
  sleepFn: (ms: number) => Promise<void>,
  healthMs = DESKTOP_HEALTH_MS,
): Promise<boolean> {
  const deadline = Date.now() + healthMs
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

export async function expectOnDesktop(desktop: DesktopHandle, expect: string): Promise<boolean> {
  return expectOnProcessSignal(await collectProcessSignal(desktop), expect)
}

export async function runDesktopReview(deps: DesktopDeps = defaultDesktopDeps()): Promise<DesktopResult> {
  const status = deps.status ?? process.stderr
  const sleepFn = deps.sleep ?? sleep
  const tui = deps.tui ?? createDesktopTui(status)
  const overview = desktopOverviewText()
  const overallMs = deps.overallMs ?? DESKTOP_OVERALL_MS
  const task = resolveDesktopTask(deps.task)
  const needle = desktopNeedle(task)
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
        await rememberLive("desktop", desktop.sessionId).catch(() => undefined)
        if (isCancelled()) {
          await desktop.kill().catch(() => undefined)
          throw new Error(`desktop review timed out after ${overallMs}ms`)
        }
        tui.setPhase("connecting")
        await desktop.connect()
        tui.setPhase("waiting")
        const ready = await waitReady(desktop, sleepFn, deps.healthMs)
        tui.setPhase("task")
        let processOk: boolean | undefined
        let windowOk: boolean | undefined
        let processSignal = { haystack: "", via: [] as Array<"processList" | "ps"> }
        if (task.open && desktop.openApp) {
          await desktop.openApp(task.open)
        }
        if (needle) {
          const waited = await waitForProcess(desktop, needle, sleepFn, deps.windowMs ?? WINDOW_MAP_MS)
          processOk = waited.processOk
          processSignal = waited.signal
          const windows = await collectWindowSignal(desktop)
          if (windows) windowOk = desktopNeedleMatches(windows.haystack, needle)
        }
        const clickAt = clickForTask(task)
        let click: DesktopResult["click"]
        if (clickAt && desktop.click) {
          await desktop.click(clickAt.x, clickAt.y)
          click = { x: clickAt.x, y: clickAt.y, verified: false }
        }
        // Desktop --type is free-form and cannot detect password fields. Agents must refuse
        // typing passwords/secrets even when the desktop cannot enforce (unlike page-actions fill).
        if (task.type && desktop.typeText) await desktop.typeText(task.type)
        tui.setPhase("screenshot")
        const png = await desktop.screenshot()
        const dir = newRunDir()
        mkdirSync(dir, { recursive: true })
        const abs = path.join(dir, "screenshot.png")
        writeFileSync(abs, png)
        const desktopId = desktop.sessionId
        const streamUrl = desktop.streamUrl
        let matched = true
        const errors: string[] = []
        if (!ready) errors.push("desktop X11 was not ready")
        if (needle && processOk === false) errors.push(`process for ${needle} did not appear`)
        if (windowOk === false) errors.push(`window for ${needle} did not appear`)
        if (task.expect) {
          matched = expectOnProcessSignal(processSignal, task.expect)
          if (!matched) errors.push(`expect not found on desktop: ${task.expect}`)
        } else if (needle) {
          matched = processOk === true
        }
        tui.setPhase("killing")
        try {
          await desktop.kill()
          await forgetLive("desktop", desktopId).catch(() => undefined)
        } catch (err) {
          errors.push(`desktop kill failed: ${explainSolariError(err)}`)
        }
        desktop = undefined
        tui.close()
        const screenshotPath = toReceiptPath(abs)
        const ok = errors.length === 0
        const summary = desktopSummary({ ok, ready, processOk, windowOk, screenshotPath, errors })
        status.write(`${summary}\n`)
        const log = `${tui.transcript()}\n${summary}`
        return {
          ok,
          errors,
          desktopId,
          screenshotPath,
          ready,
          processOk,
          windowOk,
          click,
          matched,
          expect: task.expect ?? needle,
          streamUrl,
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
        await forgetLive("desktop", desktop.sessionId).catch(() => undefined)
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
