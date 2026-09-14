import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describeAuthWall, shouldFailClosedAuth, stillOnAuth } from "../src/sso.ts"

const ssoSrc = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/sso.ts"), "utf8")

test("stillOnAuth is true on Microsoft and /login", () => {
  assert.equal(stillOnAuth(new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize")), true)
  assert.equal(stillOnAuth(new URL("https://login.live.com/")), true)
  assert.equal(stillOnAuth(new URL("https://consistencyhub.io/login")), true)
  assert.equal(stillOnAuth(new URL("https://consistencyhub.io/login/")), true)
  assert.equal(stillOnAuth(new URL("https://consistencyhub.io/login/oauth")), true)
  assert.equal(stillOnAuth(new URL("https://consistencyhub.io/Login")), true)
  assert.equal(stillOnAuth(new URL("https://consistencyhub.io/auth")), true)
  assert.equal(stillOnAuth(new URL("https://consistencyhub.io/auth/callback")), true)
  assert.equal(stillOnAuth(new URL("https://accounts.google.com/o/oauth2/v2/auth")), true)
  assert.equal(stillOnAuth(new URL("https://ironadamant.com/")), false)
  assert.equal(stillOnAuth(new URL("https://login.microsoftonline.com.evil.com/")), false)
  assert.equal(stillOnAuth(new URL("https://notlogin.live.com/")), false)
})

test("shouldFailClosedAuth is always true on Microsoft, and on /login when sso or profile", () => {
  const ms = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize")
  assert.equal(shouldFailClosedAuth(ms, {}), true)
  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  assert.equal(shouldFailClosedAuth(google, {}), true)
  const login = new URL("https://consistencyhub.io/login")
  assert.equal(shouldFailClosedAuth(login, {}), false)
  assert.equal(shouldFailClosedAuth(login, { sso: true }), true)
  assert.equal(shouldFailClosedAuth(login, { profile: "consistencyhub" }), true)
})

test("completeSso source covers Google and a generic Sign in with button", () => {
  assert.match(ssoSrc, /sign in with google/i)
  assert.match(ssoSrc, /sign in with /i)
  assert.equal(ssoSrc.includes("networkidle"), false)
  assert.equal(ssoSrc.includes(".fill("), false)
  assert.equal(ssoSrc.includes("keyboard.type"), false)
  assert.match(ssoSrc, /needsHuman/)
  assert.match(ssoSrc, /input\[type="password"\]/)
})

test("describeAuthWall fail-closes Microsoft and Google password and OTP without typing", () => {
  const password = describeAuthWall({
    url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    hasPasswordInput: true,
    text: "Enter password",
  })
  assert.equal(password.needsHuman, true)
  assert.equal(password.wall, "password")
  const otp = describeAuthWall({
    url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    text: "Approve a sign-in request in your authenticator app",
  })
  assert.equal(otp.needsHuman, true)
  assert.equal(otp.wall, "otp")
  const picker = describeAuthWall({
    url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    text: "Pick an account",
  })
  assert.equal(picker.needsHuman, false)
  const app = describeAuthWall({
    url: "https://consistencyhub.io/dashboard",
    text: "Document Editor",
  })
  assert.equal(app.needsHuman, false)
  const google = describeAuthWall({
    url: "https://accounts.google.com/signin/v2/challenge/pwd",
    hasPasswordInput: true,
    text: "Enter your password",
  })
  assert.equal(google.needsHuman, true)
})
