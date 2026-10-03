import assert from "node:assert/strict"
import test from "node:test"
import { completeSso, stillOnAuth } from "../src/sso.ts"

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

test("completeSso: a Microsoft account tile that will not click is probed, not thrown", async () => {
  let url = "https://app.example/login"
  const timeout = () => Promise.reject(new Error("locator.click: Timeout 10000ms exceeded"))
  const loc = (count: number, click: () => Promise<void>) => ({
    count: async () => count,
    first: () => ({ click }),
    waitFor: async () => undefined,
    filter: () => loc(0, timeout),
  })
  const page = {
    url: () => url,
    evaluate: async () => ({ hasPassword: false, text: "" }),
    waitForURL: async () => undefined,
    getByRole: (_role: string, opts: { name: RegExp }) =>
      opts.name.test("Sign in with Microsoft")
        ? loc(1, async () => {
            url = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
          })
        : loc(0, timeout),
    getByText: (re: RegExp) => (re.test("Signed in") ? loc(1, timeout) : loc(1, async () => undefined)),
    locator: () => loc(0, timeout),
  }
  // The picker never lets go; the SSO return wait then ends on the aborted signal.
  const ac = new AbortController()
  setTimeout(() => ac.abort(), 50)
  const result = await completeSso(page as never, { provider: "microsoft", signal: ac.signal })
  assert.equal(result.needsHuman, false)
})

