import assert from "node:assert/strict"
import test from "node:test"
import { sessionCreateFromCheck } from "../src/launch-options.ts"

test("sessionCreateFromCheck implies stealth for proxy and captcha", () => {
  const proxied = sessionCreateFromCheck({ proxy: "us" })
  assert.equal(proxied.stealth, true)
  assert.equal(proxied.proxy, "us")
  const captcha = sessionCreateFromCheck({ captcha: true })
  assert.equal(captcha.stealth, true)
  assert.equal(captcha.captcha, true)
  const off = sessionCreateFromCheck({ stealth: false, proxy: "off" })
  assert.equal(off.stealth, false)
  assert.equal(off.proxy, undefined)
  const stealth = sessionCreateFromCheck({
    stealth: true,
    record: true,
    profileId: "p1",
    url: "https://ironadamant.com",
  })
  assert.equal(stealth.stealth, true)
  assert.equal(stealth.recording, true)
  assert.equal(stealth.profileId, "p1")
  const hub = sessionCreateFromCheck({ record: true, profileId: "p1", url: "https://consistencyhub.io" })
  assert.equal(hub.recording, false)
})
