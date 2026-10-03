import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { DEVICES, listDevices, parseDeviceOptions } from "../src/device-emulation.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("parseDeviceOptions unknown device throws with listDevices keys", () => {
  assert.throws(
    () => parseDeviceOptions({ device: "nokia-3310" }),
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      assert.match(msg, /Unknown device/)
      for (const name of listDevices()) {
        assert.match(msg, new RegExp(name))
      }
      return true
    },
  )
})

test("parseDeviceOptions mobile matches iphone-13-pro fields", () => {
  const mobile = parseDeviceOptions({ mobile: true })
  const named = parseDeviceOptions({ device: "iphone-13-pro" })
  assert.deepEqual(mobile, named)
  assert.deepEqual(mobile?.viewport, DEVICES["iphone-13-pro"]?.viewport)
  assert.equal(mobile?.userAgent, DEVICES["iphone-13-pro"]?.userAgent)
  assert.equal(mobile?.deviceScaleFactor, DEVICES["iphone-13-pro"]?.deviceScaleFactor)
  assert.equal(mobile?.isMobile, true)
  assert.equal(mobile?.hasTouch, true)
})

