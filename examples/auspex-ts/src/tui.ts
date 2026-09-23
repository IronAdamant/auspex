/** Human-only terminal overview. Agents read stdout JSON, not this. */
export const REVIEW_START = "Agent is using Solari to review"
export const REVIEW_DONE =
  "Solari closed, all operations completed per request. Agent sending output..."

export function writeHumanStatus(stream: NodeJS.WritableStream, line: string): void {
  stream.write(`${line}\n`)
}

export type DesktopPhase =
  | "booting"
  | "connecting"
  | "waiting"
  | "task"
  | "screenshot"
  | "killing"
  | "done"

export type DesktopTui = {
  setPhase: (phase: DesktopPhase) => void
  close: () => void
  transcript: () => string
}

export function desktopOverviewText(): string {
  return `auspex_desktop\n${REVIEW_START}\n${REVIEW_DONE}`
}

/** Pacman/apt-style append-only lines. No cursor motion; any shell can show this. */
export function desktopLogLine(phase: DesktopPhase): string {
  if (phase === "done") return `==> ${REVIEW_DONE}`
  return `:: ${phase}`
}

export function desktopLogHeader(): string {
  return `:: Starting Solari desktop review\n==> ${REVIEW_START}`
}

export function desktopSummary(opts: {
  ok: boolean
  ready: boolean
  processOk?: boolean
  windowOk?: boolean
  screenshotPath: string
  errors: string[]
}): string {
  const proc = opts.processOk === undefined ? "" : ` processOk=${opts.processOk}`
  const win = opts.windowOk === undefined ? "" : ` windowOk=${opts.windowOk}`
  const err = opts.errors.length ? ` errors=${opts.errors.join("; ")}` : ""
  return `==> ok=${opts.ok} ready=${opts.ready}${proc}${win}${err}\n==> path=${opts.screenshotPath}`
}

export function createDesktopTui(stream: NodeJS.WritableStream): DesktopTui {
  let started = false
  const lines: string[] = []
  const write = (s: string) => {
    for (const line of s.split("\n")) {
      lines.push(line)
      stream.write(`${line}\n`)
    }
  }
  return {
    setPhase: (phase) => {
      if (phase === "done") {
        write(desktopLogLine("done"))
        return
      }
      if (!started) {
        started = true
        write(desktopLogHeader())
      }
      write(desktopLogLine(phase))
    },
    close: () => write(desktopLogLine("done")),
    transcript: () => lines.join("\n"),
  }
}
