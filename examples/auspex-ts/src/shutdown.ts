/**
 * Ctrl-C, or a host stopping the process (SIGTERM, SIGHUP), ends Node before any `finally` runs, so a
 * browser or VM this process opened would hold a Solari slot until `reap`. On the first such signal,
 * release this process's rows in the session ledger (bounded), then exit.
 */

import { boundPromise } from "./timeout.ts"

export const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const
export type ShutdownSignal = (typeof SHUTDOWN_SIGNALS)[number]

/** The release is a DELETE per open session; past this the process exits and reap finds the rest. */
export const SHUTDOWN_RELEASE_MS = 8_000

const EXIT_CODE: Record<ShutdownSignal, number> = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }

export type ShutdownDeps = {
  on?: (signal: ShutdownSignal, handler: (signal: ShutdownSignal) => void) => void
  release?: () => Promise<unknown>
  exit?: (code: number) => void
  stderr?: { write: (text: string) => unknown }
  boundMs?: number
}

export function releaseOwnSessionsOnSignal(deps: ShutdownDeps = {}): void {
  const on = deps.on ?? ((signal, handler) => void process.on(signal, handler))
  // Loaded on the signal only: the reap module pulls in the Solari SDK.
  const release = deps.release ?? (async () => (await import("./reap.ts")).releaseOwnSessions())
  const exit = deps.exit ?? ((code: number) => process.exit(code))
  const stderr = deps.stderr ?? process.stderr
  let stopping = false
  const handler = (signal: ShutdownSignal) => {
    // The same signal can arrive twice (the terminal and the bin/ launcher both pass it on). The first
    // one runs the bounded release; later ones wait for it instead of cutting it short.
    if (stopping) return
    stopping = true
    stderr.write(`:: ${signal}: closing the Solari sessions this command opened\n`)
    void boundPromise(release(), deps.boundMs ?? SHUTDOWN_RELEASE_MS, "session release timed out")
      .catch(() => undefined)
      .finally(() => exit(EXIT_CODE[signal]))
  }
  for (const signal of SHUTDOWN_SIGNALS) on(signal, handler)
}
