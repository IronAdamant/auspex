import assert from "node:assert/strict"
import test from "node:test"
import { FILL_NOT_LANDED_ERROR, prepareFillTarget, runPageActions } from "../src/page-actions.ts"

test("select-all then insertText replaces visible text when type does not paint", async () => {
  let selected = false
  const el = {
    tagName: "DIV",
    isContentEditable: true,
    textContent: "old sentence",
    innerText: "old sentence",
    focus() {},
    getAttribute() {
      return "true"
    },
    querySelector() {
      return null
    },
    querySelectorAll() {
      return []
    },
  }
  const keyboard = {
    _page: { session: "solari" },
    async insertText(text: string) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      if (selected) el.innerText = text
      else el.textContent += text
    },
    async type(text: string) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      el.textContent += text
    },
  }
  const page = {
    waitForSelector: async () => undefined,
    locator: () => ({
      fill: async () => undefined,
      click: async () => undefined,
    }),
    evaluate: async <R, Arg>(fn: (arg: Arg) => R, arg?: Arg): Promise<R> => fn(arg as Arg),
    keyboard,
  }
  const prev = (globalThis as { document?: unknown }).document
  ;(globalThis as { document: unknown }).document = {
    querySelector: () => el,
    createRange: () => ({
      selectNodeContents() {
        selected = true
      },
      collapse() {},
    }),
    getSelection: () => ({
      removeAllRanges() {},
      addRange() {},
    }),
    execCommand() {
      return false
    },
  }
  try {
    const out = await runPageActions(page, { fill: "#editor-content", value: "MARK" })
    assert.equal(out.filled, "#editor-content")
    assert.equal(selected, true)
    assert.equal(el.innerText, "MARK")
    assert.equal(el.innerText.includes("old sentence"), false)
  } finally {
    ;(globalThis as { document?: unknown }).document = prev
  }
})

test("execCommand insertText paints when keyboard paths only touch textContent", async () => {
  const el = {
    tagName: "DIV",
    isContentEditable: true,
    textContent: "old sentence",
    innerText: "old sentence",
    focus() {},
    getAttribute() {
      return "true"
    },
    querySelector() {
      return null
    },
    querySelectorAll() {
      return []
    },
  }
  const keyboard = {
    _page: { session: "solari" },
    async insertText(text: string) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      el.textContent += text
    },
    async type(text: string) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      el.textContent += text
    },
  }
  const page = {
    waitForSelector: async () => undefined,
    locator: () => ({
      fill: async () => undefined,
      click: async () => undefined,
    }),
    evaluate: async <R, Arg>(fn: (arg: Arg) => R, arg?: Arg): Promise<R> => fn(arg as Arg),
    keyboard,
  }
  const prev = (globalThis as { document?: unknown }).document
  ;(globalThis as { document: unknown }).document = {
    querySelector: () => el,
    createRange: () => ({
      selectNodeContents() {},
      collapse() {},
    }),
    getSelection: () => ({
      removeAllRanges() {},
      addRange() {},
    }),
    execCommand(_command: string, _showUi: boolean, value: string) {
      el.innerText = value
      return true
    },
  }
  try {
    const out = await runPageActions(page, { fill: "#editor-content", value: "MARK" })
    assert.equal(out.filled, "#editor-content")
    assert.equal(el.innerText, "MARK")
    assert.match(el.textContent, /MARK/)
  } finally {
    ;(globalThis as { document?: unknown }).document = prev
  }
})

test("filled stays unset when select, type, insertText, and execCommand leave innerText unchanged", async () => {
  const el = {
    tagName: "DIV",
    isContentEditable: true,
    textContent: "old sentence",
    innerText: "old sentence",
    focus() {},
    getAttribute() {
      return "true"
    },
    querySelector() {
      return null
    },
    querySelectorAll() {
      return []
    },
  }
  const keyboard = {
    _page: { session: "solari" },
    async insertText(text: string) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      el.textContent += text
    },
    async type(text: string) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      el.textContent += text
    },
  }
  const page = {
    waitForSelector: async () => undefined,
    locator: () => ({
      fill: async () => undefined,
      click: async () => undefined,
    }),
    evaluate: async <R, Arg>(fn: (arg: Arg) => R, arg?: Arg): Promise<R> => fn(arg as Arg),
    keyboard,
  }
  const prev = (globalThis as { document?: unknown }).document
  ;(globalThis as { document: unknown }).document = {
    querySelector: () => el,
    createRange: () => ({
      selectNodeContents() {},
      collapse() {},
    }),
    getSelection: () => ({
      removeAllRanges() {},
      addRange() {},
    }),
    execCommand(_command: string, _showUi: boolean, value: string) {
      el.textContent += value
      return true
    },
  }
  try {
    await assert.rejects(
      () => runPageActions(page, { fill: "#editor-content", value: "MARK" }),
      new RegExp(FILL_NOT_LANDED_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    )
    assert.equal(el.innerText, "old sentence")
    assert.match(el.textContent, /MARK/)
  } finally {
    ;(globalThis as { document?: unknown }).document = prev
  }
})
