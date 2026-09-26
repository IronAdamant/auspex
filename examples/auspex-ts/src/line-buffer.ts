/** Flush progress lines while stdout is a pipe. Node block-buffers a non-TTY until the process exits. */

type BlockingHandle = { setBlocking?: (blocking: boolean) => void }

function streamHandle(stream: NodeJS.WritableStream): BlockingHandle | undefined {
  return (stream as { _handle?: BlockingHandle })._handle
}

/** Make each write hit the pipe now. A missing handle (tests, odd pipes) is a no-op. */
export function enableLiveLineBuffer(stream: NodeJS.WritableStream = process.stderr): void {
  try {
    streamHandle(stream)?.setBlocking?.(true)
  } catch {
    // Some pipes refuse setBlocking. The newline write below is still the progress line.
  }
}

export function writeLiveLine(stream: NodeJS.WritableStream, line: string): void {
  const text = line.endsWith("\n") ? line : `${line}\n`
  stream.write(text)
}
