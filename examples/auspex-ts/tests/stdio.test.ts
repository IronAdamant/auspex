import assert from "node:assert/strict"
import { PassThrough } from "node:stream"
import test from "node:test"
import { DualStdioServerTransport, parseContentLength } from "../src/stdio-transport.ts"

function transport() {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const t = new DualStdioServerTransport(
    stdin as unknown as NodeJS.ReadStream,
    stdout as unknown as NodeJS.WriteStream,
  )
  const messages: unknown[] = []
  let err: Error | undefined
  t.onmessage = (m) => {
    messages.push(m)
  }
  t.onerror = (e) => {
    err = e
  }
  return { stdin, stdout, t, messages, errOf: () => err }
}

test("DualStdioServerTransport drops the connection when the buffer exceeds 10MB", async () => {
  const { stdin, t, errOf } = transport()
  await t.start()
  stdin.write(Buffer.alloc(DualStdioServerTransport.MAX_BUFFER_BYTES + 1))
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(errOf())
  assert.match(errOf()!.message, /maximum size/)
  await t.close()
})

test("parseContentLength rejects non-integers", () => {
  assert.throws(
    () => parseContentLength("10.5", DualStdioServerTransport.MAX_BUFFER_BYTES),
    /not an integer/,
  )
  assert.throws(
    () => parseContentLength("0x10", DualStdioServerTransport.MAX_BUFFER_BYTES),
    /not an integer/,
  )
  assert.equal(parseContentLength("12", DualStdioServerTransport.MAX_BUFFER_BYTES), 12)
})

test("DualStdioServerTransport rejects non-integer Content-Length", async () => {
  const { stdin, t, errOf } = transport()
  await t.start()
  stdin.write("Content-Length: 10.5\r\n\r\nxxxxxxxxxx")
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(errOf())
  assert.match(errOf()!.message, /not an integer/)
  await t.close()
})

test("blank NDJSON lines do not recurse or throw", async () => {
  const { stdin, t, messages, errOf } = transport()
  await t.start()
  stdin.write(`${"\n".repeat(10_000)}{"jsonrpc":"2.0","id":1,"method":"ping"}\n`)
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(errOf(), undefined)
  assert.equal(messages.length, 1)
  await t.close()
})

test("leftover bytes after a Content-Length body are a framing error", async () => {
  const { stdin, t, messages, errOf } = transport()
  await t.start()
  const body = '{"jsonrpc":"2.0","id":1,"method":"ping"}'
  const extra = '{"jsonrpc":"2.0","id":2,"method":"evil"}\n'
  stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}${extra}`)
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(messages.length, 1)
  assert.ok(errOf())
  assert.match(errOf()!.message, /framing error/)
  await t.close()
})

test("send rejects when stdout errors under backpressure", async () => {
  const stdin = new PassThrough()
  const stdout = new PassThrough({ highWaterMark: 16 })
  stdout.pause()
  const t = new DualStdioServerTransport(
    stdin as unknown as NodeJS.ReadStream,
    stdout as unknown as NodeJS.WriteStream,
  )
  await t.start()
  const pending = t.send({
    jsonrpc: "2.0",
    id: 1,
    method: "x",
    params: { pad: "n".repeat(4096) },
  })
  stdout.destroy(new Error("broken pipe"))
  await assert.rejects(pending, /broken pipe/)
  await t.close()
})
