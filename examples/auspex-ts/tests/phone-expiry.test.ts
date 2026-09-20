import assert from "node:assert/strict"
import test from "node:test"
import { jwtExpSeconds, parseUnixSeconds, resolvePhoneExpirySeconds } from "../src/phone-expiry.ts"
import { phoneHandoffUrl } from "../src/profiles.ts"

function jwtWithExp(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url")
  return `${header}.${payload}.sig`
}

test("parseUnixSeconds accepts ISO, unix seconds, and epoch ms", () => {
  assert.equal(parseUnixSeconds("2026-09-20T12:00:00.000Z"), Date.parse("2026-09-20T12:00:00.000Z") / 1000)
  assert.equal(parseUnixSeconds("1800000000"), 1_800_000_000)
  assert.equal(parseUnixSeconds(1_800_000_000_000), 1_800_000_000)
  assert.equal(parseUnixSeconds("soon"), undefined)
  assert.equal(parseUnixSeconds(""), undefined)
})

test("jwtExpSeconds reads exp and ignores garbage", () => {
  const exp = 1_800_000_000
  assert.equal(jwtExpSeconds(jwtWithExp(exp)), exp)
  assert.equal(jwtExpSeconds("vnc.jwt.token"), undefined)
  assert.equal(jwtExpSeconds("not-a-jwt"), undefined)
  assert.equal(jwtExpSeconds(""), undefined)
})

test("resolvePhoneExpirySeconds prefers expiresAt over JWT", () => {
  const jwt = jwtWithExp(1_700_000_000)
  const iso = resolvePhoneExpirySeconds({
    expiresAt: "2026-09-20T12:00:00.000Z",
    jwt,
  })
  assert.equal(iso.source, "expiresAt")
  assert.equal(iso.exp, Date.parse("2026-09-20T12:00:00.000Z") / 1000)
  const fromJwt = resolvePhoneExpirySeconds({ jwt })
  assert.equal(fromJwt.source, "jwt")
  assert.equal(fromJwt.exp, 1_700_000_000)
  assert.deepEqual(resolvePhoneExpirySeconds({ expiresAt: "soon", jwt: "vnc.jwt.token" }), { source: "unknown" })
})

test("phoneHandoffUrl writes exp from expiresAt or JWT", () => {
  const exp = Math.trunc(Date.parse("2026-09-20T15:00:00.000Z") / 1000)
  const fromAt = phoneHandoffUrl("vnc.jwt.token", "https://console.getsolari.com/handoff/abc", {
    expiresAt: "2026-09-20T15:00:00.000Z",
  })
  assert.equal(new URLSearchParams(new URL(fromAt).hash.slice(1)).get("exp"), String(exp))
  const jwt = jwtWithExp(1_800_000_000)
  const fromJwt = phoneHandoffUrl(jwt, "https://console.getsolari.com/handoff/abc")
  assert.equal(new URLSearchParams(new URL(fromJwt).hash.slice(1)).get("exp"), "1800000000")
  const unknown = phoneHandoffUrl("vnc.jwt.token", "https://console.getsolari.com/handoff/abc")
  assert.equal(new URLSearchParams(new URL(unknown).hash.slice(1)).get("exp"), null)
})
