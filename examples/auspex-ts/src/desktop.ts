import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { SolariClient } from "@solarisdk/sdk"
import { packageRoot, toReceiptPath } from "./check.ts"
import { AuspexError, classifySolariError, explainSolariError } from "./errors.ts"
import { haystackMatches } from "./text.ts"
import { forgetLive, rememberLive } from "./session-ledger.ts"
import { fetchWithIdempotencyKey, requireApiKey } from "./solari.ts"
import { observeAbort, raceWithTimeout } from "./timeout.ts"
import { createDesktopTui, desktopOverviewText, desktopSummary, type DesktopTui } from "./tui.ts"

export const DESKTOP_OVERALL_MS = 90_000
export const DESKTOP_HEALTH_MS = 30_000
export const WINDOW_MAP_MS = 8_000
/** Mousepad's editor, not screen center (640,360 misses the window). */
export const MOUSEPAD_CLICK = { x: 320, y: 300 }
export const DEFAULT_DESKTOP_TASK = { open: "mousepad", click: MOUSEPAD_CLICK }

export type DesktopResult = {
  ok: boolean
  errors: string[]
  desktopId: string
  screenshotPath: string
  ready: boolean
  windowReady: boolean
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

export type DesktopProcess = { pid: number; name: string; cmd?: string }

export type DesktopHandle = {
  sessionId: string
  streamUrl?: string
  connect: () => Promise<void>
  health: () => Promise<{ ready?: boolean }>
  screenshot: () => Promise<Uint8Array>
  kill: () => Promise<void>
  click?: (x: number, y: number) => Promise<void>
  typeText?: (text: string) => Promise<void>
  openApp?: (name: string) => Promise<void>
  exec?: (cmd: string, opts?: { args?: string[] }) => Promise<{ stdout?: string; exitCode: number }>
  processList?: () => Promise<DesktopProcess[]>
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
  if (task.click) return task.click
  if ((task.open ?? "").toLowerCase() === "mousepad") return MOUSEPAD_CLICK
  return undefined
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

function processHaystack(procs: DesktopProcess[]): string {
  return procs.map((p) => `${p.name} ${p.cmd ?? ""}`).join("\n")
}

async function waitForWindow(
  desktop: DesktopHandle,
  open: string,
  sleepFn: (ms: number) => Promise<void>,
  windowMs = WINDOW_MAP_MS,
): Promise<boolean> {
  if (!desktop.processList && !desktop.exec) {
    await sleepFn(windowMs)
    return true
  }
  const deadline = Date.now() + windowMs
  const needle = open.toLowerCase()
  while (Date.now() < deadline) {
    try {
      if (desktop.processList) {
        const hay = processHaystack(await desktop.processList())
        if (haystackMatches(hay, needle)) return true
      } else if (desktop.exec) {
        const out = await desktop.exec("sh", { args: ["-c", "ps -A -o args="] })
        if (haystackMatches(out.stdout || "", needle)) return true
      }
    } catch {
      /* window list can lag */
    }
    await sleepFn(500)
  }
  return false
}

export async function expectOnDesktop(desktop: DesktopHandle, expect: string): Promise<boolean> {
  if (desktop.processList) {
    const hay = processHaystack(await desktop.processList())
    if (haystackMatches(hay, expect)) return true
  }
  if (desktop.exec) {
    const out = await desktop.exec("sh", { args: ["-c", "ps -A -o args="] })
    if (haystackMatches(out.stdout || "", expect)) return true
  }
  return false
}

export async function runDesktopReview(deps: DesktopDeps = defaultDesktopDeps()): Promise<DesktopResult> {
  const status = deps.status ?? process.stderr
  const sleepFn = deps.sleep ?? sleep
  const tui = deps.tui ?? createDesktopTui(status)
  const overview = desktopOverviewText()
  const overallMs = deps.overallMs ?? DESKTOP_OVERALL_MS
  const task = resolveDesktopTask(deps.task)
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
        let windowReady = true
        if (task.open && desktop.openApp) {
          await desktop.openApp(task.open)
          windowReady = await waitForWindow(desktop, task.open, sleepFn, deps.windowMs)
        }
        const clickAt = clickForTask(task)
        if (task.type && desktop.typeText && clickAt && desktop.click) {
          await desktop.click(clickAt.x, clickAt.y)
          await desktop.typeText(task.type)
        } else {
          if (clickAt && desktop.click) await desktop.click(clickAt.x, clickAt.y)
          if (task.type && desktop.typeText) await desktop.typeText(task.type)
        }
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
        if (task.open && !windowReady) errors.push(`window for ${task.open} did not appear`)
        if (task.expect) {
          matched = await expectOnDesktop(desktop, task.expect)
          if (!matched) errors.push(`expect not found on desktop: ${task.expect}`)
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
        const summary = desktopSummary({ ok, ready, screenshotPath, errors })
        status.write(`${summary}\n`)
        const log = `${tui.transcript()}\n${summary}`
        return {
          ok,
          errors,
          desktopId,
          screenshotPath,
          ready,
          windowReady,
          matched,
          expect: task.expect,
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
