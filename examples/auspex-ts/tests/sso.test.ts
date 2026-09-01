import assert from "node:assert/strict"
import test from "node:test"
import { stillOnAuth } from "../src/sso.ts"

test("stillOnAuth is true on Microsoft and /login", () => {
  assert.equal(stillOnAuth(new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize")), true)
  assert.equal(stillOnAuth(new URL("https://login.live.com/")), true)
  assert.equal(stillOnAuth(new URL("https://consistencyhub.io/login")), true)
  assert.equal(stillOnAuth(new URL("https://consistencyhub.io/auth/callback")), true)
  assert.equal(stillOnAuth(new URL("https://consistencyhub.io/dashboard")), false)
  assert.equal(stillOnAuth(new URL("https://ironadamant.com/")), false)
})
