export type ProgressFn = (phase: string) => void

export type ProgressExtra = {
  sendNotification?: (notification: {
    method: string
    params: Record<string, unknown>
  }) => Promise<void>
}

/** Append-only `:: phase` lines plus optional MCP progress notifications. */
export function createProgress(opts: {
  extra?: ProgressExtra
  stream?: NodeJS.WritableStream
} = {}): ProgressFn {
  const stream = opts.stream ?? process.stderr
  return (phase: string) => {
    stream.write(`:: ${phase}\n`)
    const send = opts.extra?.sendNotification
    if (!send) return
    void send({
      method: "notifications/progress",
      params: { progressToken: "auspex", progress: 1, message: phase },
    }).catch(() => undefined)
  }
}

export const noopProgress: ProgressFn = () => undefined
