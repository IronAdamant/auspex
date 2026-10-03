import assert from "node:assert/strict"
import test from "node:test"
import { FILL_NOT_LANDED_ERROR, runPageActions } from "../src/page-actions.ts"

const MARK = "MARK"

test("fill does not type while the editor is still the loading placeholder", async () => {
  let text = "Loading document…"
  let types = 0
  const page = {
    waitForSelector: async () => undefined,
    locator: () => ({
      fill: async () => undefined,
      click: async () => undefined,
    }),
    evaluate: async <R,>(): Promise<R> =>
      ({ password: false, contentEditable: true, present: true, text }) as R,
    keyboard: {
      _page: { session: "solari" },
      async insertText() {
        if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      },
      async type() {
        if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
        types += 1
      },
    },
  }
  await assert.rejects(
    () => runPageActions(page, { fill: "#editor-content", value: MARK }),
    new RegExp(FILL_NOT_LANDED_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  )
  assert.equal(types, 0)
  assert.equal(text, "Loading document…")
})

