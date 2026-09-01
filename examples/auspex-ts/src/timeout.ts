/** Race work against a timer that is always cleared. */
export async function raceWithTimeout<T>(
  work: (isCancelled: () => boolean) => Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let cancelled = false
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      cancelled = true
      reject(new Error(message))
    }, ms)
  })
  const pending = work(() => cancelled)
  void pending.catch(() => {
    /* timeout already won: ignore late goto/screenshot rejection */
  })
  try {
    return await Promise.race([pending, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
