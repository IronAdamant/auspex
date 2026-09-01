import assert from "node:assert/strict"
import test from "node:test"
import { shouldFailClosedAuth, stillOnAuth } from "../src/sso.ts"

test("stillOnAuth is true on Microsoft and /login", () => {
  assert.equal(stillOnAuth(new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize")), true)
  assert.equal(stillOnAuth(new URL("https://login.live.com/")), true)
  assert.equal(stillOnAuth(new URL("https://consistencyhub.io/login")), true)
  assert.equal(stillOnAuth(new URL("https://consistencyhub.io/login/")), true)
  assert.equal(stillOnAuth(new URL("https://consistencyhub.io/login/oauth")), true)
  assert.equal(stillOnAuth(new URL("https://consistencyhub.io/Login")), true)
  assert.equal(stillOnAuth(new URL("https://consistencyhub.io/auth")), true)
  assert.equal(stillOnAuth(new URL("https://consistencyhub.io/auth/callback")), true)
  assert.equal(stillOnAuth(new URL("https://consistencyhub.io/dashboard")), false)
  assert.equal(stillOnAuth(new URL("https://ironadamant.com/")), false)
  assert.equal(stillOnAuth(new URL("https://login.microsoftonline.com.evil.com/")), false)
  assert.equal(stillOnAuth(new URL("https://notlogin.live.com/")), false)
})

test("shouldFailClosedAuth is always true on Microsoft, and on /login when sso or profile", () => {
  const ms = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize")
  assert.equal(shouldFailClosedAuth(ms, {}), true)
  const login = new URL("https://consistencyhub.io/login")
  assert.equal(shouldFailClosedAuth(login, {}), false)
  assert.equal(shouldFailClosedAuth(login, { sso: true }), true)
  assert.equal(shouldFailClosedAuth(login, { profile: "consistencyhub" }), true)
})
