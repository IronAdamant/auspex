import assert from "node:assert/strict"
import test from "node:test"
import {
  doorStreamDisconnectAction,
  imeAutocomplete,
  imeInputType,
  isStreamExpired,
  jwtExpSeconds,
  parseUnixSeconds,
  resolvePhoneExpirySeconds,
  streamExpiryStamp,
} from "../src/handoff-doors.ts"
import { phoneHandoffUrl } from "../src/profiles.ts"

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

test("parseUnixSeconds accepts ISO, unix seconds, and epoch ms", () => {
  assert.equal(parseUnixSeconds("2026-09-20T12:00:00.000Z"), Date.parse("2026-09-20T12:00:00.000Z") / 1000)
  assert.equal(parseUnixSeconds("1800000000"), 1_800_000_000)
  assert.equal(parseUnixSeconds(1_800_000_000_000), 1_800_000_000)
  assert.equal(parseUnixSeconds("soon"), undefined)
  assert.equal(parseUnixSeconds(""), undefined)
})

test("jwtExpSeconds reads exp from segment 1 or segment 0", () => {
  const exp = 1_800_000_000
  assert.equal(jwtExpSeconds(jwtWithExp(exp)), exp)
  assert.equal(jwtExpSeconds(solariVncJwt(exp)), exp)
  assert.equal(jwtExpSeconds("vnc.jwt.token"), undefined)
  assert.equal(jwtExpSeconds("not-a-jwt"), undefined)
  assert.equal(jwtExpSeconds(""), undefined)
})

test("resolvePhoneExpirySeconds uses the earliest of expiresAt and JWT", () => {
  const handoffIso = "2026-09-20T12:30:00.000Z"
  const handoffExp = Date.parse(handoffIso) / 1000
  const vncExp = handoffExp - 25 * 60
  const jwt = solariVncJwt(vncExp)
  const minned = resolvePhoneExpirySeconds({ expiresAt: handoffIso, jwt })
  assert.equal(minned.source, "jwt")
  assert.equal(minned.exp, vncExp)

  const earlierAt = resolvePhoneExpirySeconds({
    expiresAt: "2026-09-20T12:00:00.000Z",
    jwt: jwtWithExp(handoffExp),
  })
  assert.equal(earlierAt.source, "expiresAt")
  assert.equal(earlierAt.exp, Date.parse("2026-09-20T12:00:00.000Z") / 1000)

  const fromJwt = resolvePhoneExpirySeconds({ jwt })
  assert.equal(fromJwt.source, "jwt")
  assert.equal(fromJwt.exp, vncExp)

  const fromAt = resolvePhoneExpirySeconds({ expiresAt: handoffIso, jwt: "vnc.jwt.token" })
  assert.equal(fromAt.source, "expiresAt")
  assert.equal(fromAt.exp, handoffExp)

  assert.deepEqual(resolvePhoneExpirySeconds({ expiresAt: "soon", jwt: "vnc.jwt.token" }), { source: "unknown" })
})

test("phoneHandoffUrl writes min(handoffExpiresAt, vncJwtExp)", () => {
  const handoffIso = "2026-09-20T15:00:00.000Z"
  const handoffExp = Math.trunc(Date.parse(handoffIso) / 1000)
  const fromAt = phoneHandoffUrl("vnc.jwt.token", "https://console.getsolari.com/handoff/abc", {
    expiresAt: handoffIso,
  })
  assert.equal(new URLSearchParams(new URL(fromAt).hash.slice(1)).get("exp"), String(handoffExp))

  const vncExp = handoffExp - 25 * 60
  const jwt = solariVncJwt(vncExp)
  const minned = phoneHandoffUrl(jwt, "https://console.getsolari.com/handoff/abc", {
    expiresAt: handoffIso,
  })
  assert.equal(new URLSearchParams(new URL(minned).hash.slice(1)).get("exp"), String(vncExp))

  const fromJwt = phoneHandoffUrl(jwtWithExp(1_800_000_000), "https://console.getsolari.com/handoff/abc")
  assert.equal(new URLSearchParams(new URL(fromJwt).hash.slice(1)).get("exp"), "1800000000")

  const unknown = phoneHandoffUrl("vnc.jwt.token", "https://console.getsolari.com/handoff/abc")
  assert.equal(new URLSearchParams(new URL(unknown).hash.slice(1)).get("exp"), null)
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

test("doorStreamDisconnectAction pauses a live JWT on background and remints only when gone", () => {
  assert.equal(
    doorStreamDisconnectAction({ streamExpired: true, pageHidden: true, reconnectAttempts: 0 }),
    "remint",
  )
  assert.equal(
    doorStreamDisconnectAction({ streamExpired: false, pageHidden: true, reconnectAttempts: 0 }),
    "pause",
  )
  assert.equal(
    doorStreamDisconnectAction({ streamExpired: false, pageHidden: false, reconnectAttempts: 0 }),
    "reconnect",
  )
  assert.equal(
    doorStreamDisconnectAction({ streamExpired: false, pageHidden: false, reconnectAttempts: 3 }),
    "remint",
  )
  assert.equal(
    doorStreamDisconnectAction({
      streamExpired: false,
      pageHidden: false,
      reconnectAttempts: 2,
      maxReconnects: 2,
    }),
    "remint",
  )
})

test("imeAutocomplete stays discoverable and never off", () => {
  assert.equal(imeAutocomplete({ bulletsOn: false }), "current-password")
  assert.equal(imeAutocomplete({ bulletsOn: true }), "current-password")
  assert.equal(imeAutocomplete({ bulletsOn: false, otpOn: true }), "one-time-code")
  assert.equal(imeAutocomplete({ bulletsOn: true, otpOn: true }), "current-password")
  assert.equal(imeInputType(false), "text")
  assert.equal(imeInputType(true), "password")
})
