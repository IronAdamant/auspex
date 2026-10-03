import assert from "node:assert/strict"
import test from "node:test"
import { DEVICES, parseDeviceOptions } from "../src/device-emulation.ts"

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

