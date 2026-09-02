/** Race work against a timer that is always cleared. AbortSignal fires when the timer wins. */
export type TimeoutWork<T> = (isCancelled: () => boolean, signal: AbortSignal) => Promise<T>

export const CLOSE_TIMEOUT_MS = 15_000
/** Cap wait for launch to arm a closer. Solari's chromium.connect has no timeout (0 = forever). */
export const LAUNCH_SETTLE_MS = 50_000
/** Bound around `solari.launch()` / Playwright `chromium.connect`. */
export const CHROMIUM_CONNECT_TIMEOUT_MS = 45_000
export const SCREENSHOT_TIMEOUT_MS = 30_000

export async function boundPromise<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return raceWithTimeout(async () => p, ms, message)
}

/** Reject `p` when `signal` aborts (does not cancel the inner work, but observes cancel). */
export async function observeAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error("aborted")
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"))
    }
    signal.addEventListener("abort", onAbort, { once: true })
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort)
        resolve(v)
      },
      (e: unknown) => {
        signal.removeEventListener("abort", onAbort)
        reject(e)
      },
    )
  })
}

/**
 * Time-bound `close`, then still attempt `release` (DELETE) if close hung or failed
 * so Playwright `closed = true` cannot skip Solari session release.
 */
export async function closeThenRelease(
  close: () => Promise<void>,
  release: () => Promise<void>,
  ms: number,
): Promise<void> {
  try {
    await boundPromise(close(), ms, `session close timed out after ${ms}ms`)
  } catch (err) {
    try {
      await boundPromise(release(), ms, `session release timed out after ${ms}ms`)
    } catch {
      /* first error wins */
    }
    throw err
  }
}

/**
 * Holds a close function that may be assigned after launch. `release` waits until
 * set/skip so a timeout during launch cannot skip close.
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

  async release(settleMs: number = LAUNCH_SETTLE_MS): Promise<void> {
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
