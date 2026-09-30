import { enableLiveLineBuffer } from "./line-buffer.ts"

export type ProgressFn = (phase: string) => void

export type ProgressExtra = {
  /** MCP request metadata. The client names the token when it wants progress for this call. */
  _meta?: { progressToken?: string | number }
  sendNotification?: (notification: {
    method: string
    params: Record<string, unknown>
  }) => Promise<void>
}

/**
 * Append-only `:: phase` lines, plus MCP progress notifications when the client asked for them.
 * A notification carries the client's own progressToken and a rising count: a made-up token is an
 * "unknown token" error in the client, and only a real one can keep a long tool call alive.
 */
export function createProgress(opts: {
  extra?: ProgressExtra
  stream?: NodeJS.WritableStream
} = {}): ProgressFn {
  const stream = opts.stream ?? process.stderr
  enableLiveLineBuffer(stream)
  const token = opts.extra?._meta?.progressToken
  const send = token !== undefined ? opts.extra?.sendNotification : undefined
  let progress = 0
  return (phase: string) => {
    stream.write(`:: ${phase}\n`)
    if (!send) return
    progress += 1
    void send({
      method: "notifications/progress",
      params: { progressToken: token, progress, message: phase },
    }).catch(() => undefined)
  }
}

export const noopProgress: ProgressFn = () => undefined
