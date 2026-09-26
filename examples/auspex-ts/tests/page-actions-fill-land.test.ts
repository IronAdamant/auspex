import assert from "node:assert/strict"
import test from "node:test"
import { FILL_NOT_LANDED_ERROR, paintFillTarget, runPageActions } from "../src/page-actions.ts"

const MARK = "MARK"

async function withDocument<T>(doc: unknown, fn: () => Promise<T> | T): Promise<T> {
  const prev = (globalThis as { document?: unknown }).document
  ;(globalThis as { document: unknown }).document = doc
  try {
    return await fn()
  } finally {
    ;(globalThis as { document?: unknown }).document = prev
  }
}

test("paintFillTarget appends through a nested ProseMirror view", async () => {
  const calls: Array<{ text: string; from: number; to?: number }> = []
  let exec = false
  const surface = {
    tagName: "DIV",
    isContentEditable: true,
    innerText: "old sentence",
    focus() {},
    getAttribute() {
      return "true"
    },
    pmViewDesc: {
      view: {
        focus() {
          calls.push({ text: "focus", from: -1 })
        },
        dispatch(tr: { text: string }) {
          root.innerText = tr.text
          surface.innerText = tr.text
        },
        state: {
          doc: { content: { size: 14 } },
          tr: {
            insertText(text: string, from: number, to?: number) {
              calls.push({ text, from, to })
              return { text, from, to }
            },
          },
        },
      },
    },
  }
  const root = {
    tagName: "DIV",
    isContentEditable: false,
    innerText: "old sentence",
    textContent: "old sentence",
    focus() {},
    querySelector(sel: string) {
      return sel === ".ProseMirror" ? surface : null
    },
    querySelectorAll(sel: string) {
      return sel === "[contenteditable]" ? [surface] : []
    },
  }
  await withDocument(
    {
      querySelector: () => root,
      execCommand() {
        exec = true
        return false
      },
    },
    () => {
      assert.equal(paintFillTarget({ selector: "#editor-content", value: MARK }), true)
    },
  )
  assert.equal(exec, false)
  assert.deepEqual(
    calls.filter((row) => row.from >= 0),
    [{ text: MARK, from: 13, to: undefined }],
  )
  assert.equal(root.innerText, MARK)
  assert.equal(root.textContent, "old sentence")
})

test("paintFillTarget appends at the end and does not replace the chapter", async () => {
  const calls: Array<{ text: string; from: number; to?: number }> = []
  const root = {
    tagName: "DIV",
    isContentEditable: true,
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
    pmViewDesc: {
      view: {
        dispatch(tr: { text: string; to?: number }) {
          if (tr.to !== undefined) throw new Error("replace range")
          root.innerText = `old sentence${tr.text}`
        },
        state: {
          doc: { content: { size: 14 } },
          tr: {
            insertText(text: string, from: number, to?: number) {
              calls.push({ text, from, to })
              return { text, from, to }
            },
          },
        },
      },
    },
  }
  await withDocument({ querySelector: () => root }, () => {
    assert.equal(paintFillTarget({ selector: "#editor-content", value: MARK }), true)
  })
  assert.deepEqual(calls, [{ text: MARK, from: 13, to: undefined }])
  assert.equal(root.innerText, "old sentenceMARK")
})

test("paintFillTarget uses execCommand when the node has no editor view", async () => {
  const root = {
    tagName: "DIV",
    isContentEditable: true,
    innerText: "old sentence",
    textContent: "old sentence",
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
  let selected = false
  await withDocument(
    {
      querySelector: () => root,
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
      execCommand(_command: string, _showUi: boolean, value: string) {
        if (selected) root.innerText = value
        else root.textContent += value
        return true
      },
    },
    () => {
      assert.equal(paintFillTarget({ selector: "#editor-content", value: MARK }), true)
    },
  )
  assert.equal(selected, true)
  assert.equal(root.innerText, MARK)
})

test("paintFillTarget reports a miss when only hidden textContent changes", async () => {
  const root = {
    tagName: "DIV",
    isContentEditable: true,
    innerText: "old sentence",
    textContent: "old sentence",
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
  await withDocument(
    {
      querySelector: () => root,
      createRange: () => ({
        selectNodeContents() {},
        collapse() {},
      }),
      getSelection: () => ({
        removeAllRanges() {},
        addRange() {},
      }),
      execCommand(_command: string, _showUi: boolean, value: string) {
        root.textContent += value
        return true
      },
    },
    () => {
      assert.equal(paintFillTarget({ selector: "#editor-content", value: MARK }), false)
    },
  )
  assert.equal(root.innerText, "old sentence")
  assert.match(root.textContent, /MARK/)
})

test("runPageActions sets filled when the editor view paints and key events do not", async () => {
  const calls: Array<{ text: string; from: number; to?: number }> = []
  const root = {
    tagName: "DIV",
    isContentEditable: true,
    innerText: "old sentence",
    textContent: "old sentence",
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
    pmViewDesc: {
      view: {
        focus() {},
        dispatch(tr: { text: string }) {
          root.innerText = tr.text
        },
        state: {
          doc: { content: { size: 14 } },
          tr: {
            insertText(text: string, from: number, to?: number) {
              calls.push({ text, from, to })
              return { text, from, to }
            },
          },
        },
      },
    },
  }
  const keyboard = {
    _page: { session: "solari" },
    async insertText(text: string) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      root.textContent += text
    },
    async type(text: string) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      root.textContent += text
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
  const out = await withDocument(
    {
      querySelector: () => root,
      createRange: () => ({
        selectNodeContents() {},
        collapse() {},
      }),
      getSelection: () => ({
        removeAllRanges() {},
        addRange() {},
      }),
      execCommand() {
        return false
      },
    },
    () => runPageActions(page, { fill: "#editor-content", value: MARK }),
  )
  assert.equal(out.filled, "#editor-content")
  assert.equal(root.innerText, MARK)
  assert.match(root.textContent, /old sentence/)
  assert.deepEqual(calls, [{ text: MARK, from: 13, to: undefined }])
})

test("filled stays unset when the editor view paint reverts before settle", async () => {
  const root = {
    tagName: "DIV",
    isContentEditable: true,
    innerText: "old sentence",
    textContent: "old sentence",
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
    pmViewDesc: {
      view: {
        dispatch(tr: { text: string }) {
          root.innerText = tr.text
          setTimeout(() => {
            root.innerText = "old sentence"
          }, 20)
        },
        state: {
          doc: { content: { size: 14 } },
          tr: {
            insertText(text: string, from: number, to?: number) {
              return { text, from, to }
            },
          },
        },
      },
    },
  }
  let saved = false
  const keyboard = {
    _page: { session: "solari" },
    async insertText(text: string) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      root.textContent += text
    },
    async type(text: string) {
      if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
      root.textContent += text
    },
  }
  const page = {
    waitForSelector: async () => undefined,
    locator: (sel: string) => ({
      fill: async () => undefined,
      click: async () => {
        if (sel === "#save-document") saved = true
      },
    }),
    evaluate: async <R, Arg>(fn: (arg: Arg) => R, arg?: Arg): Promise<R> => fn(arg as Arg),
    keyboard,
  }
  await withDocument(
    {
      querySelector: () => root,
      createRange: () => ({
        selectNodeContents() {},
        collapse() {},
      }),
      getSelection: () => ({
        removeAllRanges() {},
        addRange() {},
      }),
    },
    async () => {
      await assert.rejects(
        () => runPageActions(page, { fill: "#editor-content", value: MARK, click: "#save-document" }),
        new RegExp(FILL_NOT_LANDED_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      )
    },
  )
  assert.equal(saved, false)
  assert.equal(root.innerText, "old sentence")
})
