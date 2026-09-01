import assert from "node:assert/strict"
import { PassThrough } from "node:stream"
import test from "node:test"
import { DualStdioServerTransport } from "../src/stdio-transport.ts"

test("DualStdioServerTransport drops the connection when the buffer exceeds 10MB", async () => {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const t = new DualStdioServerTransport(
    stdin as unknown as NodeJS.ReadStream,
    stdout as unknown as NodeJS.WriteStream,
  )
  let err: Error | undefined
  t.onerror = (e) => {
    err = e
  }
  await t.start()
  stdin.write(Buffer.alloc(DualStdioServerTransport.MAX_BUFFER_BYTES + 1))
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(err)
  assert.match(err.message, /maximum size/)
  await t.close()
})
