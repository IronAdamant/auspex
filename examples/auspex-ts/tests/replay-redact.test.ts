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

test("redactRrwebEvents blanks one-time codes and value changes that arrive without a type", async () => {
  const { redactRrwebEvents } = await import("../src/replay-redact.ts")
  const events = [
    {
      type: 2,
      data: {
        node: {
          childNodes: [
            { tagName: "input", attributes: { autocomplete: "one-time-code", value: "482913" } },
            { tagName: "input", attributes: { type: "search", value: "shoes" } },
          ],
        },
      },
    },
    { type: 3, data: { source: 0, attributes: [{ id: 7, attributes: { value: "hunter2" } }] } },
  ]
  const out = JSON.stringify(redactRrwebEvents(events))
  assert.equal(out.includes("482913"), false)
  assert.equal(out.includes("hunter2"), false)
  assert.equal(out.includes("shoes"), true)
})

test("redactRrwebEvents blanks hidden form fields (sign-in flow tokens, canaries)", async () => {
  const { redactRrwebEvents } = await import("../src/replay-redact.ts")
  const events = [
    {
      type: 2,
      data: {
        node: {
          childNodes: [
            { tagName: "input", attributes: { type: "hidden", name: "flowToken", value: "rQQIARAAjZBPaNNgAMWTpq1acOt6ET" } },
            { tagName: "input", attributes: { type: "HIDDEN", name: "canary", value: "caaOrwt0cbXV5NTDCtFW1Rh9ekkoBFe73" } },
            { tagName: "input", attributes: { type: "submit", value: "Next" } },
          ],
        },
      },
    },
  ]
  const out = JSON.stringify(redactRrwebEvents(events))
  assert.equal(out.includes("rQQIARAA"), false)
  assert.equal(out.includes("caaOrwt0"), false)
  assert.equal(out.includes("Next"), true)
})

test("redactRrwebEvents strips sign-in flow ids from links, in snapshots and later changes", async () => {
  const { redactRrwebEvents } = await import("../src/replay-redact.ts")
  const href = "https://signup.live.com/?uaid=984f27ac7cf0&epctrc=caaOrwt0cbXV5N&state=abc123&lic=1"
  const events = [
    { type: 2, data: { node: { childNodes: [{ tagName: "a", attributes: { href } }] } } },
    { type: 3, data: { source: 0, attributes: [{ id: 3, attributes: { href } }] } },
  ]
  const out = JSON.stringify(redactRrwebEvents(events))
  for (const secret of ["984f27ac7cf0", "caaOrwt0", "abc123"]) assert.equal(out.includes(secret), false, secret)
  assert.equal(out.includes("lic=1"), true)
})
