import assert from "node:assert/strict"
import test from "node:test"
import { assertFillPair, runPageActions } from "../src/page-actions.ts"

test("assertFillPair requires fill and value together", () => {
  assert.throws(() => assertFillPair({ fill: "#q" }), /--value/)
  assert.throws(() => assertFillPair({ value: "x" }), /--fill/)
  assert.doesNotThrow(() => assertFillPair({ fill: "#q", value: "x" }))
  assert.doesNotThrow(() => assertFillPair({}))
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
    },
    {},
  )
  assert.equal(waited, false)
})
