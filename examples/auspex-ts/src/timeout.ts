/** Race work against a timer that is always cleared. AbortSignal fires when the timer wins. */
export type TimeoutWork<T> = (isCancelled: () => boolean, signal: AbortSignal) => Promise<T>

export const CLOSE_TIMEOUT_MS = 15_000
export const LAUNCH_SETTLE_MS = 20_000

export async function boundPromise<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return raceWithTimeout(async () => p, ms, message)
}

/**
 * Holds a close function that may be assigned after launch. `release` waits until
 * the session is ready (or settleMs) so a timeout during launch cannot skip close.
 */
export class ReadyRelease {
  private mark!: () => void
  private readonly ready: Promise<void>
  private fn?: () => Promise<void>

  constructor() {
    this.ready = new Promise((r) => {
      this.mark = r
    })
  }

  set(fn: () => Promise<void>): void {
    this.fn = fn
    this.mark()
  }

  skip(): void {
    this.mark()
  }

  async release(settleMs: number): Promise<void> {
    await boundPromise(this.ready, settleMs, `session ready timed out after ${settleMs}ms`).catch(
      () => undefined,
    )
    if (this.fn) await this.fn()
  }
}

export async function raceWithTimeout<T>(
  work: TimeoutWork<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let cancelled = false
  const ac = new AbortController()
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      cancelled = true
      ac.abort()
      reject(new Error(message))
    }, ms)
  })
  const pending = work(() => cancelled, ac.signal)
  void pending.catch(() => {
    /* timeout already won: ignore late goto/screenshot rejection */
  })
  try {
    return await Promise.race([pending, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
