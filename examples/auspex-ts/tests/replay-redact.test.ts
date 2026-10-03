import assert from "node:assert/strict"
import test from "node:test"
import {
  REDACTED_EMAIL,
  assertNoCredentialLeak,
  redactEmailsInString,
  redactRrwebEvents,
  redactRrwebNdjson,
} from "../src/replay-redact.ts"

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
