import assert from "node:assert/strict"
import test from "node:test"
import { redactUrlSecrets, redactUrlSecretsInText } from "../src/scrub.ts"

test("redactUrlSecrets drops OAuth codes and hash tokens but keeps host, path, and hash routes", () => {
  const grant = redactUrlSecrets("https://cloud.example/login/oauth2/code/grant?code=4f47bc0be3df&state=M0jZ.JTJG&lang=en")
  assert.equal(grant, "https://cloud.example/login/oauth2/code/grant?code=redacted&state=redacted&lang=en")
  assert.equal(redactUrlSecrets("https://app.example/#/dashboard"), "https://app.example/#/dashboard")
  assert.equal(redactUrlSecrets("https://app.example/dashboard?tab=2"), "https://app.example/dashboard?tab=2")
  const implicit = redactUrlSecrets("https://app.example/cb#access_token=abc123&token_type=bearer&expires_in=3600")
  assert.equal(implicit.includes("abc123"), false)
  assert.match(implicit, /expires_in=3600/)
  const routed = redactUrlSecrets("https://app.example/#/callback?id_token=eyJabc&view=1")
  assert.match(routed, /^https:\/\/app\.example\/#\/callback\?id_token=redacted&view=1$/)
  assert.equal(redactUrlSecrets("not a url"), "not a url")
})

test("redactUrlSecretsInText scrubs every URL inside a Playwright error line", () => {
  const line =
    'locator.click: Timeout 15000ms exceeded. navigated to "https://cloud.example/login/oauth2/code/grant?code=4f47bc0be3df4ff6&state=M0jZFW1Zi9"'
  const out = redactUrlSecretsInText(line)
  assert.equal(out.includes("4f47bc0be3df4ff6"), false)
  assert.equal(out.includes("M0jZFW1Zi9"), false)
  assert.match(out, /navigated to "https:\/\/cloud\.example\/login\/oauth2\/code\/grant\?code=redacted&state=redacted"$/)
})
