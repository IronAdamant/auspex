import assert from "node:assert/strict"
import test from "node:test"
import { parseProxyFlag, sessionCreateFromCheck, PROXY_FLAG_ERROR } from "../src/launch-options.ts"

test("parseProxyFlag accepts country, smart, off, and sticky pin", () => {
  assert.equal(parseProxyFlag("us"), "us")
  assert.equal(parseProxyFlag("smart"), "smart")
  assert.equal(parseProxyFlag("off"), "off")
  assert.deepEqual(parseProxyFlag("gb", "warm-1"), { country: "gb", session: "warm-1" })
  assert.deepEqual(parseProxyFlag(undefined, "warm-1"), { country: "us", session: "warm-1" })
  assert.throws(() => parseProxyFlag("united-states"), new RegExp(PROXY_FLAG_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.throws(() => parseProxyFlag("smart", "x"), /sticky/)
})

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
