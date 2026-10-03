import assert from "node:assert/strict"
import test from "node:test"
import {
  imeAutocomplete,
  imeInputType,
  isStreamExpired,
  jwtExpSeconds,
  streamExpiryStamp,
} from "../src/handoff-doors.ts"

/** Standard JWT: header.payload.sig — exp in segment 1. */
function jwtWithExp(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url")
  return `${header}.${payload}.sig`
}

/** Solari VNC editor token: payload in segment 0 (nbf + exp, ~305s lifetime). */
function solariVncJwt(exp: number, nbf = exp - 305): string {
  const payload = Buffer.from(JSON.stringify({ nbf, exp })).toString("base64url")
  const extra = Buffer.from("not-json").toString("base64url")
  return `${payload}.${extra}.sig`
}

test("jwtExpSeconds reads exp from segment 1 or segment 0", () => {
  const exp = 1_800_000_000
  assert.equal(jwtExpSeconds(jwtWithExp(exp)), exp)
  assert.equal(jwtExpSeconds(solariVncJwt(exp)), exp)
  assert.equal(jwtExpSeconds("vnc.jwt.token"), undefined)
  assert.equal(jwtExpSeconds("not-a-jwt"), undefined)
  assert.equal(jwtExpSeconds(""), undefined)
})

test("isStreamExpired and streamExpiryStamp stay off the JWT", () => {
  const past = 1_700_000_000
  const future = 2_000_000_000
  assert.equal(isStreamExpired({ expiresAt: String(past), nowSec: past + 1 }), true)
  assert.equal(isStreamExpired({ expiresAt: String(future), nowSec: past }), false)
  assert.equal(isStreamExpired({ expiresAt: "soon", jwt: "vnc.jwt.token", nowSec: past }), false)
  const stamp = streamExpiryStamp({ jwt: solariVncJwt(future) })
  assert.equal(stamp.streamExpirySource, "jwt")
  assert.equal(stamp.streamExpiresAt, new Date(future * 1000).toISOString())
  assert.equal(JSON.stringify(stamp).includes("nbf"), false)
})

test("imeAutocomplete stays discoverable and never off", () => {
  assert.equal(imeAutocomplete({ bulletsOn: false }), "current-password")
  assert.equal(imeAutocomplete({ bulletsOn: true }), "current-password")
  assert.equal(imeAutocomplete({ bulletsOn: false, otpOn: true }), "one-time-code")
  assert.equal(imeAutocomplete({ bulletsOn: true, otpOn: true }), "current-password")
  assert.equal(imeInputType(false), "text")
  assert.equal(imeInputType(true), "password")
})
