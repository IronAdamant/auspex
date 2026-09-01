import process from "node:process"
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"

const CL_PREFIX = "content-length:"

export function parseContentLength(raw: string, maxBytes: number): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`stdio Content-Length not an integer: ${raw}`)
  }
  const n = Number(raw)
  if (!Number.isSafeInteger(n) || n < 0 || n > maxBytes) {
    throw new Error(`stdio Content-Length out of range: ${n}`)
  }
  return n
}

/**
 * Stdio transport that accepts both Grok's Content-Length framing and
 * newline-delimited JSON. Replies with Content-Length so Grok can parse initialize.
 */
export class DualStdioServerTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void

  static readonly MAX_BUFFER_BYTES = 10 * 1024 * 1024

  private started = false
  private buffer = Buffer.alloc(0)
  private replyContentLength = false

  constructor(
    private readonly stdin: NodeJS.ReadStream = process.stdin,
    private readonly stdout: NodeJS.WriteStream = process.stdout,
  ) {}

  private ondata = (chunk: Buffer) => {
    try {
      if (this.buffer.length + chunk.length > DualStdioServerTransport.MAX_BUFFER_BYTES) {
        throw new Error(
          `ReadBuffer exceeded maximum size of ${DualStdioServerTransport.MAX_BUFFER_BYTES} bytes`,
        )
      }
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.drain()
    } catch (error) {
      this.onerror?.(error instanceof Error ? error : new Error(String(error)))
      void this.close()
    }
  }

  private onerr = (error: Error) => {
    this.onerror?.(error)
  }

  private drain() {
    while (true) {
      const msg = this.readOne()
      if (!msg) break
      this.onmessage?.(msg)
    }
  }

  private readOne(): JSONRPCMessage | null {
    if (this.buffer.length === 0) return null
    const asText = this.buffer.toString("utf8")
    const lower = asText.toLowerCase()

    if (this.replyContentLength) {
      if (!lower.startsWith("content-length:")) {
        const firstLine = lower.split(/\r?\n/, 1)[0] ?? ""
        if (CL_PREFIX.startsWith(firstLine) && asText.indexOf("\n") === -1) return null
        throw new Error("stdio framing error: leftover bytes after Content-Length message")
      }
    }

    if (lower.startsWith("content-length:") || asText.match(/^Content-Length:\s*\d+/i)) {
      this.replyContentLength = true
      let sep = this.buffer.indexOf("\r\n\r\n")
      let sepLen = 4
      if (sep === -1) {
        sep = this.buffer.indexOf("\n\n")
        sepLen = 2
      }
      if (sep === -1) return null
      const header = this.buffer.subarray(0, sep).toString("utf8")
      const lenMatch = header.match(/Content-Length:\s*(\S+)/i)
      if (!lenMatch) {
        throw new Error(`stdio header missing Content-Length: ${header.slice(0, 80)}`)
      }
      const n = parseContentLength(lenMatch[1] ?? "", DualStdioServerTransport.MAX_BUFFER_BYTES)
      const start = sep + sepLen
      if (this.buffer.length < start + n) return null
      const json = this.buffer.subarray(start, start + n).toString("utf8")
      this.buffer = this.buffer.subarray(start + n)
      if (this.buffer.length > 0) {
        const rest = this.buffer.toString("utf8")
        const restLower = rest.toLowerCase()
        if (!restLower.startsWith("content-length:")) {
          const firstLine = restLower.split(/\r?\n/, 1)[0] ?? ""
          if (!(CL_PREFIX.startsWith(firstLine) && rest.indexOf("\n") === -1)) {
            throw new Error("stdio framing error: leftover bytes after Content-Length message")
          }
        }
      }
      return JSON.parse(json) as JSONRPCMessage
    }

    while (true) {
      const nl = this.buffer.indexOf("\n")
      if (nl === -1) return null
      const line = this.buffer.subarray(0, nl).toString("utf8").replace(/\r$/, "")
      this.buffer = this.buffer.subarray(nl + 1)
      if (!line.trim()) {
        if (this.buffer.length === 0) return null
        continue
      }
      return JSON.parse(line) as JSONRPCMessage
    }
  }

  async start(): Promise<void> {
    if (this.started) throw new Error("DualStdioServerTransport already started")
    this.started = true
    this.stdin.on("data", this.ondata)
    this.stdin.on("error", this.onerr)
  }

  async close(): Promise<void> {
    this.stdin.off("data", this.ondata)
    this.stdin.off("error", this.onerr)
    if (this.stdin.listenerCount("data") === 0) this.stdin.pause()
    this.buffer = Buffer.alloc(0)
    this.onclose?.()
  }

  send(message: JSONRPCMessage): Promise<void> {
    const json = JSON.stringify(message)
    const body = Buffer.from(json, "utf8")
    const payload = this.replyContentLength
      ? Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8"), body])
      : Buffer.from(`${json}\n`, "utf8")
    return new Promise((resolve, reject) => {
      const onError = (err: Error) => {
        this.stdout.off("drain", onDrain)
        this.stdout.off("error", onError)
        reject(err)
      }
      const onDrain = () => {
        this.stdout.off("error", onError)
        resolve()
      }
      this.stdout.once("error", onError)
      let ok: boolean
      try {
        ok = this.stdout.write(payload)
      } catch (err) {
        this.stdout.off("error", onError)
        reject(err instanceof Error ? err : new Error(String(err)))
        return
      }
      if (ok) {
        this.stdout.off("error", onError)
        resolve()
      } else {
        this.stdout.once("drain", onDrain)
      }
    })
  }
}
