import assert from "node:assert/strict"
import test from "node:test"
import { assertFillPair, assertPageActionsAllowed, FILL_NOT_LANDED_ERROR, runPageActions } from "../src/page-actions.ts"

function fieldPage(opts: {
  contentEditable?: boolean
  password?: boolean
  text: () => string
  onFill?: (value: string) => void
  onInsert?: (text: string) => void
  onType?: (text: string) => void
  keyboard?: boolean
}) {
  const calls: string[] = []
  const keyboard = opts.keyboard === false ? undefined : {
    insertText: async (text: string) => {
      calls.push(`insert:${text}`)
      opts.onInsert?.(text)
    },
    type: async (text: string) => {
      calls.push(`type:${text}`)
      opts.onType?.(text)
    },
  }
  const page = {
    waitForSelector: async (sel: string) => {
      calls.push(`wait:${sel}`)
    },
    locator: (sel: string) => ({
      fill: async (value: string) => {
        calls.push(`fill:${sel}=${value}`)
        opts.onFill?.(value)
      },
      click: async () => {
        calls.push(`click:${sel}`)
      },
    }),
    evaluate: async <R, Arg>(_fn: (arg: Arg) => R, _arg?: Arg): Promise<R> =>
      ({
        password: opts.password === true,
        contentEditable: opts.contentEditable === true,
        text: opts.text(),
      }) as R,
    keyboard,
  }
  return { page, calls }
}

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
  let text = ""
  const { page, calls } = fieldPage({
    keyboard: false,
    text: () => text,
    onFill: (value) => {
      text = value
    },
  })
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
      evaluate: async <R, Arg>(_fn: (arg: Arg) => R, _arg?: Arg): Promise<R> => false as R,
    },
    {},
  )
  assert.equal(waited, false)
})

test("runPageActions types into contenteditable and does not claim insertText", async () => {
  let text = ""
  const { page, calls } = fieldPage({
    contentEditable: true,
    text: () => text,
    onInsert: () => undefined,
    onType: (value) => {
      text = value
    },
  })
  const out = await runPageActions(page, { fill: "#editor-content", value: "hello world" })
  assert.equal(out.filled, "#editor-content")
  assert.equal(calls.includes("insert:hello world"), false)
  assert.ok(calls.includes("click:#editor-content"))
  assert.ok(calls.includes("type:hello world"))
})

test("runPageActions keeps insertText when the control text contains the value", async () => {
  let text = ""
  const { page, calls } = fieldPage({
    text: () => text,
    onInsert: (value) => {
      text = value
    },
    onType: () => {
      text = "typed-over"
    },
  })
  const out = await runPageActions(page, { fill: "#q", value: "hi" })
  assert.equal(out.filled, "#q")
  assert.ok(calls.includes("insert:hi"))
  assert.equal(calls.includes("type:hi"), false)
  assert.equal(text, "hi")
})

test("runPageActions falls back to keyboard.type when insertText leaves the DOM unchanged", async () => {
  let text = ""
  const { page, calls } = fieldPage({
    text: () => text,
    onInsert: () => undefined,
    onType: (value) => {
      text = value
    },
  })
  const out = await runPageActions(page, { fill: "#q", value: "hi" })
  assert.equal(out.filled, "#q")
  assert.ok(calls.includes("insert:hi"))
  assert.ok(calls.includes("type:hi"))
})

test("runPageActions does not set filled when the value never lands", async () => {
  const { page } = fieldPage({
    contentEditable: true,
    text: () => "370 words",
    onType: () => undefined,
  })
  await assert.rejects(
    () => runPageActions(page, { fill: "#editor-content", value: "hello" }),
    new RegExp(FILL_NOT_LANDED_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  )
})
