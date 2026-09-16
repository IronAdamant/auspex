import assert from "node:assert/strict"
import test from "node:test"
import { assertFillPair, assertPageActionsAllowed, runPageActions } from "../src/page-actions.ts"

test("assertFillPair requires fill and value together", () => {
  assert.throws(() => assertFillPair({ fill: "#q" }), /--value/)
  assert.throws(() => assertFillPair({ value: "x" }), /--fill/)
  assert.doesNotThrow(() => assertFillPair({ fill: "#q", value: "x" }))
  assert.doesNotThrow(() => assertFillPair({}))
})

test("assertPageActionsAllowed refuses profile fill/click without the opt-in flag", () => {
  assert.throws(() => assertPageActionsAllowed({ profile: "hub", click: "a" }), /allow-page-actions/)
  assert.doesNotThrow(() => assertPageActionsAllowed({ click: "a" }))
  assert.doesNotThrow(() =>
    assertPageActionsAllowed({ profile: "hub", click: "a", allowPageActions: true }),
  )
})

test("runPageActions waits, fills, then clicks in order", async () => {
  const calls: string[] = []
  const page = {
    waitForSelector: async (sel: string) => {
      calls.push(`wait:${sel}`)
    },
    locator: (sel: string) => ({
      fill: async (value: string) => {
        calls.push(`fill:${sel}=${value}`)
      },
      click: async () => {
        calls.push(`click:${sel}`)
      },
    }),
    evaluate: async () => false, // not a password input
  }
  const out = await runPageActions(page, { waitFor: "#main", fill: "#q", value: "hi", click: "button.go" })
  assert.deepEqual(calls, ["wait:#main", "fill:#q=hi", "click:button.go"])
  assert.equal(out.waitedFor, "#main")
  assert.equal(out.filled, "#q")
  assert.equal(out.clicked, "button.go")
})

test("runPageActions is a no-op when no actions are set", async () => {
  let waited = false
  await runPageActions(
    {
      waitForSelector: async () => {
        waited = true
      },
      locator: () => ({
        fill: async () => undefined,
        click: async () => undefined,
      }),
      evaluate: async () => false,
    },
    {},
  )
  assert.equal(waited, false)
})
