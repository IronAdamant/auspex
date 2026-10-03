import assert from "node:assert/strict"
import test from "node:test"
import { prepareFillTarget } from "../src/page-actions.ts"

test("prepareFillTarget selects the inner contenteditable that holds the visible text", () => {
  const log: string[] = []
  const child = {
    tagName: "DIV",
    isContentEditable: true,
    innerText: "document sentence",
    focus() {
      log.push("focus-child")
    },
    getAttribute() {
      return "true"
    },
    querySelectorAll() {
      return []
    },
  }
  const wrap = {
    tagName: "DIV",
    isContentEditable: true,
    innerText: "document sentence",
    focus() {
      log.push("focus-wrap")
    },
    getAttribute() {
      return "true"
    },
    querySelector() {
      return child
    },
    querySelectorAll() {
      return [child]
    },
  }
  const prev = (globalThis as { document?: unknown }).document
  ;(globalThis as { document: unknown }).document = {
    querySelector: () => wrap,
    createRange: () => ({
      selectNodeContents(node: { innerText?: string }) {
        log.push(`range:${node.innerText}`)
      },
      collapse() {
        log.push("collapse")
      },
    }),
    getSelection: () => ({
      removeAllRanges() {},
      addRange() {
        log.push("add")
      },
    }),
  }
  try {
    assert.equal(prepareFillTarget({ selector: "#editor-content", select: "all" }), true)
    assert.ok(log.includes("focus-child"))
    assert.equal(log.includes("focus-wrap"), false)
    assert.ok(log.includes("range:document sentence"))
    assert.ok(log.includes("add"))
    assert.equal(prepareFillTarget({ selector: "#editor-content", select: "end" }), true)
    assert.ok(log.includes("collapse"))
  } finally {
    ;(globalThis as { document?: unknown }).document = prev
  }
})

