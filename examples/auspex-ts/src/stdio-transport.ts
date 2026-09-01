import process from "node:process"
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"

/**
 * Stdio transport that accepts both Grok's Content-Length framing and
 * newline-delimited JSON. Replies with Content-Length so Grok can parse initialize.
 */
export class DualStdioServerTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void

  private started = false
  private buffer = Buffer.alloc(0)
  private replyContentLength = false

  constructor(
    private readonly stdin: NodeJS.ReadStream = process.stdin,
    private readonly stdout: NodeJS.WriteStream = process.stdout,
  ) {}

  private ondata = (chunk: Buffer) => {
    try {
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
    const cl = asText.match(/^Content-Length:\s*(\d+)/i)
    if (cl || asText.toLowerCase().startsWith("content-length:")) {
      this.replyContentLength = true
      let sep = this.buffer.indexOf("\r\n\r\n")
      let sepLen = 4
      if (sep === -1) {
        sep = this.buffer.indexOf("\n\n")
        sepLen = 2
      }
      if (sep === -1) return null
      const header = this.buffer.subarray(0, sep).toString("utf8")
      const lenMatch = header.match(/Content-Length:\s*(\d+)/i)
      if (!lenMatch) {
        throw new Error(`stdio header missing Content-Length: ${header.slice(0, 80)}`)
      }
      const n = Number(lenMatch[1])
      const start = sep + sepLen
      if (this.buffer.length < start + n) return null
      const json = this.buffer.subarray(start, start + n).toString("utf8")
      this.buffer = this.buffer.subarray(start + n)
      return JSON.parse(json) as JSONRPCMessage
    }
    const nl = this.buffer.indexOf("\n")
    if (nl === -1) return null
    const line = this.buffer.subarray(0, nl).toString("utf8").replace(/\r$/, "")
    this.buffer = this.buffer.subarray(nl + 1)
    if (!line.trim()) return this.readOne()
    return JSON.parse(line) as JSONRPCMessage
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
    return new Promise((resolve) => {
      if (this.stdout.write(payload)) resolve()
      else this.stdout.once("drain", resolve)
    })
  }
}
