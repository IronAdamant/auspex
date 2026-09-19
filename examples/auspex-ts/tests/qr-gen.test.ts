import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { generateQRCode } from "../src/qr-gen.ts"

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const testsDir = path.dirname(fileURLToPath(import.meta.url))

test("generateQRCode writes a PNG with magic bytes", async () => {
  const dir = mkdtempSync(path.join(testsDir, "qr-"))
  try {
    const { qrPath } = await generateQRCode("https://ironadamant.com", dir)
    assert.ok(qrPath)
    const bytes = readFileSync(qrPath)
    assert.equal(bytes.subarray(0, 8).equals(PNG_MAGIC), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("generateQRCode failure does not throw", async () => {
  const missing = path.join(testsDir, "qr-missing-dir", "nope")
  const result = await generateQRCode("https://ironadamant.com", missing)
  assert.equal(result.qrPath, "")
})
