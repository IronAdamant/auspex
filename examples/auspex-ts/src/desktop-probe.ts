import { haystackMatches } from "./text.ts"

export type DesktopProcess = { pid: number; name: string; cmd?: string }

export type DesktopProbeHandle = {
  processList?: () => Promise<DesktopProcess[]>
  exec?: (cmd: string, opts?: { args?: string[] }) => Promise<{ stdout?: string; exitCode: number }>
  windowList?: () => Promise<string[]>
}

export type ProcessSignal = {
  haystack: string
  via: Array<"processList" | "ps">
}

export type WindowSignal = {
  haystack: string
  via: "windowList" | "wmctrl" | "xdotool"
} | null

const PS_ARGS = ["-c", "ps -A -o args="]
const WMCTRL_ARGS = ["-c", "wmctrl -l"]
const XDOTOOL_ARGS = ["-c", "xdotool search --onlyvisible --name ."]

export function desktopNeedleMatches(haystack: string, needle: string): boolean {
  return haystackMatches(haystack.toLowerCase(), needle.toLowerCase())
}

export function processHaystack(procs: DesktopProcess[]): string {
  return procs.map((p) => `${p.name} ${p.cmd ?? ""}`).join("\n")
}

export async function collectProcessSignal(desktop: DesktopProbeHandle): Promise<ProcessSignal> {
  const chunks: string[] = []
  const via: ProcessSignal["via"] = []
  if (desktop.processList) {
    try {
      chunks.push(processHaystack(await desktop.processList()))
      via.push("processList")
    } catch {
      /* process list can lag */
    }
  }
  if (desktop.exec) {
    try {
      const out = await desktop.exec("sh", { args: PS_ARGS })
      chunks.push(out.stdout || "")
      via.push("ps")
    } catch {
      /* ps can lag */
    }
  }
  return { haystack: chunks.join("\n"), via }
}

export async function collectWindowSignal(desktop: DesktopProbeHandle): Promise<WindowSignal> {
  if (desktop.windowList) {
    try {
      const names = await desktop.windowList()
      if (Array.isArray(names)) return { haystack: names.join("\n"), via: "windowList" }
    } catch {
      /* window list can lag */
    }
  }
  if (!desktop.exec) return null
  for (const [via, args] of [
    ["wmctrl", WMCTRL_ARGS],
    ["xdotool", XDOTOOL_ARGS],
  ] as const) {
    try {
      const out = await desktop.exec("sh", { args: [...args] })
      if (out.exitCode === 0 && (out.stdout || "").trim()) {
        return { haystack: out.stdout || "", via }
      }
    } catch {
      /* guest may not ship wmctrl/xdotool */
    }
  }
  return null
}

export async function waitForProcess(
  desktop: DesktopProbeHandle,
  needle: string,
  sleepFn: (ms: number) => Promise<void>,
  windowMs: number,
): Promise<{ processOk: boolean; signal: ProcessSignal }> {
  const deadline = Date.now() + windowMs
  let signal = await collectProcessSignal(desktop)
  if (signal.via.length > 0 && desktopNeedleMatches(signal.haystack, needle)) {
    return { processOk: true, signal }
  }
  while (Date.now() < deadline) {
    await sleepFn(500)
    signal = await collectProcessSignal(desktop)
    if (signal.via.length === 0) continue
    if (desktopNeedleMatches(signal.haystack, needle)) return { processOk: true, signal }
  }
  signal = await collectProcessSignal(desktop)
  return {
    processOk: signal.via.length > 0 && desktopNeedleMatches(signal.haystack, needle),
    signal,
  }
}

export function expectOnProcessSignal(signal: ProcessSignal, expect: string): boolean {
  return signal.via.length > 0 && desktopNeedleMatches(signal.haystack, expect)
}
