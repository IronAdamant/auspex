import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { completeSso, describeAuthWall, shouldFailClosedAuth, stillOnAuth } from "../src/sso.ts"

const ssoSrc = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/sso.ts"), "utf8")

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

test("sign-in pages are recognised by any sign-in path segment, not only /login and /auth", async () => {
  const { stillOnAuth } = await import("../src/sso.ts")
  for (const url of [
    "https://app.example/login",
    "https://app.example/login/sso",
    "https://app.example/auth/callback",
    "https://app.example/signin",
    "https://app.example/sign-in?next=/dash",
    "https://gitlab.example/users/sign_in",
    "https://app.example/account/login",
    "https://app.example/accounts/log-in/",
  ]) {
    assert.equal(stillOnAuth(new URL(url)), true, url)
  }
  for (const url of [
    "https://app.example/dashboard",
    "https://app.example/settings/login-history",
    "https://app.example/signing-keys",
    "https://app.example/api/authors",
    "https://www.tldraw.com/f/abc",
  ]) {
    assert.equal(stillOnAuth(new URL(url)), false, url)
  }
})
