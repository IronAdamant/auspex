import assert from "node:assert/strict"
import test from "node:test"
import {
  REDACTED_EMAIL,
  assertNoCredentialLeak,
  redactEmailsInString,
  redactRrwebEvents,
  redactRrwebNdjson,
} from "../src/replay-redact.ts"

test("redactEmailsInString replaces addresses and leaves Microsoft copy", () => {
  assert.equal(
    redactEmailsInString("Sign in as ada@example.com please"),
    `Sign in as ${REDACTED_EMAIL} please`,
  )
  assert.equal(redactEmailsInString("Sign in with Microsoft"), "Sign in with Microsoft")
})

test("redactRrwebEvents clears email/password values and source-5 input text", () => {
  const events = [
    {
      type: 4,
      data: { href: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?login_hint=ada@example.com" },
    },
    {
      type: 2,
      data: {
        node: {
          type: 2,
          tagName: "html",
          childNodes: [
            {
              type: 2,
              tagName: "input",
              attributes: { type: "email", name: "loginfmt", value: "ada@example.com" },
              childNodes: [],
            },
            {
              type: 2,
              tagName: "input",
              attributes: { type: "password", name: "passwd", value: "hunter2" },
              childNodes: [],
            },
            { type: 3, textContent: "Contact ada@example.com" },
          ],
        },
      },
    },
    { type: 3, data: { source: 5, id: 12, text: "ada@example.com" } },
  ]
  const out = redactRrwebEvents(events)
  const blob = JSON.stringify(out)
  assert.equal(assertNoCredentialLeak(blob).length, 0)
  assert.match(blob, /Sign in with Microsoft|loginfmt|passwd/)
  const emailInput = (out[1] as { data: { node: { childNodes: Array<{ attributes?: { value?: string } }> } } })
    .data.node.childNodes[0]
  const passwordInput = (out[1] as { data: { node: { childNodes: Array<{ attributes?: { value?: string } }> } } })
    .data.node.childNodes[1]
  assert.equal(emailInput?.attributes?.value, "")
  assert.equal(passwordInput?.attributes?.value, "")
  assert.equal((out[2] as { data: { text: string } }).data.text, "")
  const href = decodeURIComponent((out[0] as { data: { href: string } }).data.href)
  assert.match(href, /login_hint=\[redacted-email\]/)
})

test("redactRrwebNdjson round-trips and keeps event count", () => {
  const ndjson = `${JSON.stringify({ type: 4, data: { href: "https://consistencyhub.io/landing" } })}\n`
  const out = redactRrwebNdjson(ndjson)
  const events = out
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: number })
  assert.equal(events.length, 1)
  assert.equal(events[0]?.type, 4)
})
