import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  assertFillPair,
  assertPageActionsAllowed,
  assertVisibleFillLanded,
  FILL_NOT_LANDED_ERROR,
  probeVisibleControl,
  runPageActions,
} from "../src/page-actions.ts"

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
    _page: { session: "solari" },
    async insertText(text: string) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      calls.push(`insert:${text}`)
      opts.onInsert?.(text)
    },
    async type(text: string, typeOpts?: { delay?: number }) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      calls.push(`type:${text}`)
      if (typeof typeOpts?.delay === "number") calls.push(`delay:${typeOpts.delay}`)
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
    evaluate: async <R, Arg>(fn: (arg: Arg) => R, arg?: Arg): Promise<R> => {
      const src = typeof fn === "function" ? fn.toString() : ""
      if (src.includes("function prepareFillTarget")) {
        const mode = arg && typeof arg === "object" && "select" in arg ? String((arg as { select?: string }).select) : ""
        calls.push(mode === "all" || mode === "end" ? `select:${mode}` : "focus")
      }
      return {
        password: opts.password === true,
        contentEditable: opts.contentEditable === true,
        text: opts.text(),
      } as R
    },
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

test("runPageActions calls keyboard.type on the keyboard so this stays bound", async () => {
  let text = ""
  const keyboard = {
    _page: { session: "solari" },
    async insertText(value: string) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      void value
    },
    async type(value: string) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      text = value
    },
  }
  const page = {
    waitForSelector: async () => undefined,
    locator: () => ({
      fill: async () => undefined,
      click: async () => undefined,
    }),
    evaluate: async <R, Arg>(_fn: (arg: Arg) => R, _arg?: Arg): Promise<R> =>
      ({ password: false, contentEditable: true, text }) as R,
    keyboard,
  }
  const out = await runPageActions(page, { fill: "#editor-content", value: "hello world" })
  assert.equal(out.filled, "#editor-content")
  assert.equal(text, "hello world")
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
  assert.ok(calls.indexOf("click:#editor-content") < calls.indexOf("type:hello world"))
  assert.equal(calls.includes("select:all"), false)
  assert.ok(calls.includes("delay:15"))
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

test("runPageActions does not set filled when visible text reverts after type", async () => {
  let typed = false
  let reads = 0
  const { page } = fieldPage({
    contentEditable: true,
    text: () => {
      if (!typed) return "370 words"
      reads += 1
      return reads === 1 ? "hello" : "370 words"
    },
    onType: () => {
      typed = true
    },
  })
  await assert.rejects(
    () => runPageActions(page, { fill: "#editor-content", value: "hello" }),
    new RegExp(FILL_NOT_LANDED_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  )
})

test("runPageActions uses insertText when keyboard.type does not stick in visible text", async () => {
  let text = "old"
  const { page, calls } = fieldPage({
    contentEditable: true,
    text: () => text,
    onType: () => undefined,
    onInsert: (value) => {
      text = value
    },
  })
  const out = await runPageActions(page, { fill: "#editor-content", value: "hello" })
  assert.equal(out.filled, "#editor-content")
  assert.ok(calls.indexOf("type:hello") < calls.indexOf("select:all"))
  assert.ok(calls.indexOf("select:all") < calls.indexOf("insert:hello"))
  assert.equal(text, "hello")
})

test("probeVisibleControl uses innerText and ignores hidden textContent", () => {
  const el = {
    tagName: "DIV",
    isContentEditable: true,
    textContent: "MARK hidden in textContent",
    innerText: "visible sentence",
    querySelector() {
      return null
    },
  }
  const prev = (globalThis as { document?: unknown }).document
  ;(globalThis as { document: unknown }).document = { querySelector: () => el }
  try {
    const probe = probeVisibleControl("#editor-content")
    assert.equal(probe.contentEditable, true)
    assert.equal(probe.text, "visible sentence")
    assert.equal(probe.text.includes("MARK"), false)
  } finally {
    ;(globalThis as { document?: unknown }).document = prev
  }
})

test("probeVisibleControl reads input value and blanks a password", () => {
  const prev = (globalThis as { document?: unknown }).document
  const input = { tagName: "INPUT", type: "text", value: "alice", innerText: "", textContent: "" }
  ;(globalThis as { document: unknown }).document = { querySelector: () => input }
  try {
    assert.deepEqual(probeVisibleControl("#user"), { password: false, contentEditable: false, text: "alice" })
    input.type = "password"
    input.value = "secret"
    assert.deepEqual(probeVisibleControl("#pwd"), { password: true, contentEditable: false, text: "" })
  } finally {
    ;(globalThis as { document?: unknown }).document = prev
  }
})

test("assertVisibleFillLanded refuses a contenteditable whose excerpt lacks --value", async () => {
  const page = {
    evaluate: async <R, Arg>(_fn: (arg: Arg) => R, _arg?: Arg): Promise<R> =>
      ({ password: false, contentEditable: true, text: "MARK in the editor" }) as R,
  }
  await assert.rejects(
    () => assertVisibleFillLanded(page, "#editor-content", "MARK in the editor", "old sentence only"),
    new RegExp(FILL_NOT_LANDED_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  )
  await assert.doesNotReject(() =>
    assertVisibleFillLanded(page, "#editor-content", "MARK in the editor", "title MARK in the editor tail"),
  )
  const input = {
    evaluate: async <R, Arg>(_fn: (arg: Arg) => R, _arg?: Arg): Promise<R> =>
      ({ password: false, contentEditable: false, text: "alice" }) as R,
  }
  await assert.doesNotReject(() => assertVisibleFillLanded(input, "#user", "alice", "body without the field"))
})

test("check re-reads visible fill text against the excerpt before keeping filled", () => {
  const src = readFileSync(new URL("../src/check.ts", import.meta.url), "utf8")
  assert.match(src, /assertVisibleFillLanded\(/)
})

test("filled is refused when textContent contains --value but visible innerText does not", async () => {
  const log: string[] = []
  const el = {
    tagName: "DIV",
    isContentEditable: true,
    textContent: "old",
    innerText: "old",
    focus() {
      log.push("focus")
    },
    getAttribute() {
      return "true"
    },
    querySelector() {
      return null
    },
  }
  const keyboard = {
    _page: { session: "solari" },
    async insertText(text: string) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      log.push(`insert:${text}`)
      el.textContent += text
    },
    async type(text: string) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      log.push(`type:${text}`)
      el.textContent += text
    },
  }
  const page = {
    waitForSelector: async () => undefined,
    locator: () => ({
      fill: async () => undefined,
      click: async () => {
        log.push("click")
      },
    }),
    evaluate: async <R, Arg>(fn: (arg: Arg) => R, arg?: Arg): Promise<R> => fn(arg as Arg),
    keyboard,
  }
  const prev = (globalThis as { document?: unknown }).document
  ;(globalThis as { document: unknown }).document = { querySelector: () => el }
  try {
    await assert.rejects(
      () => runPageActions(page, { fill: "#editor-content", value: "MARK" }),
      new RegExp(FILL_NOT_LANDED_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    )
    assert.match(el.textContent, /MARK/)
    assert.equal(el.innerText.includes("MARK"), false)
    assert.ok(log.indexOf("click") < log.indexOf("type:MARK"))
  } finally {
    ;(globalThis as { document?: unknown }).document = prev
  }
})

test("filled is set when type lands in innerText of a nested contenteditable", async () => {
  const log: string[] = []
  const inner = {
    tagName: "DIV",
    isContentEditable: true,
    innerText: "",
    focus() {
      log.push("inner-focus")
    },
    getAttribute() {
      return "true"
    },
    querySelector(): null {
      return null
    },
  }
  const wrap = {
    tagName: "DIV",
    isContentEditable: false,
    textContent: "old",
    innerText: "old",
    focus() {
      log.push("wrap-focus")
    },
    getAttribute() {
      return null
    },
    querySelector() {
      return inner
    },
  }
  const keyboard = {
    _page: { session: "solari" },
    async insertText(text: string) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      log.push(`insert:${text}`)
    },
    async type(text: string, typeOpts?: { delay?: number }) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      log.push(`type:${text}`)
      if (typeof typeOpts?.delay === "number") log.push(`delay:${typeOpts.delay}`)
      if (!log.includes("inner-focus")) return
      wrap.innerText += text
      wrap.textContent += text
    },
  }
  const page = {
    waitForSelector: async () => undefined,
    locator: () => ({
      fill: async () => undefined,
      click: async () => {
        log.push("click")
      },
    }),
    evaluate: async <R, Arg>(fn: (arg: Arg) => R, arg?: Arg): Promise<R> => fn(arg as Arg),
    keyboard,
  }
  const prev = (globalThis as { document?: unknown }).document
  ;(globalThis as { document: unknown }).document = { querySelector: () => wrap }
  try {
    const out = await runPageActions(page, { fill: "#editor-content", value: "MARK" })
    assert.equal(out.filled, "#editor-content")
    assert.equal(log.includes("wrap-focus"), false)
    assert.ok(log.includes("inner-focus"))
    assert.ok(log.indexOf("click") < log.indexOf("inner-focus"))
    assert.ok(log.indexOf("inner-focus") < log.lastIndexOf("type:MARK"))
    assert.ok(log.includes("delay:15"))
    assert.equal(log.includes("insert:MARK"), false)
    assert.match(wrap.innerText, /MARK/)
  } finally {
    ;(globalThis as { document?: unknown }).document = prev
  }
})

