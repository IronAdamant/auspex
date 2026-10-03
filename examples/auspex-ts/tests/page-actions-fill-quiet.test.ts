import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import vm from "node:vm"
import { browserEvaluatePayloads } from "../src/page-action-browser.ts"
import { runPageActions, waitForSurfaceQuiet } from "../src/page-actions.ts"

const KEEP_NAMES_HELPER = "__" + "name"

const MARK = "MARK"

type QuietGlobal = {
  document?: unknown
  MutationObserver?: unknown
}

function quietGlobal(): QuietGlobal {
  return globalThis as unknown as QuietGlobal
}

/** These tests install MutationObserver. Keep them off each other's global. */
let quietChain: Promise<unknown> = Promise.resolve()

function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = quietChain.then(fn, fn)
  quietChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

test("waitForSurfaceQuiet resolves false when the process has no MutationObserver", async () => {
  await exclusive(async () => {
    const g = quietGlobal()
    const prev = g.MutationObserver
    delete g.MutationObserver
    try {
      const started = Date.now()
      const ok = await waitForSurfaceQuiet({ selector: "#editor-content", quietMs: 400, timeoutMs: 8_000 })
      assert.equal(ok, false)
      assert.ok(Date.now() - started < 50)
    } finally {
      if (prev) g.MutationObserver = prev
    }
  })
})

test("waitForSurfaceQuiet resolves after mutations on the target stop", async () => {
  await exclusive(async () => {
    const el = { tagName: "DIV", innerText: "spinner" }
    let callback: (() => void) | undefined
    let observed: object | undefined
    class FakeObserver {
      constructor(cb: () => void) {
        callback = cb
      }
      observe(node: object) {
        observed = node
      }
      disconnect() {
        callback = undefined
      }
    }
    const g = quietGlobal()
    const prevDoc = g.document
    const prevMo = g.MutationObserver
    g.document = { querySelector: () => el }
    g.MutationObserver = FakeObserver
    try {
      const pending = waitForSurfaceQuiet({ selector: "#editor-content", quietMs: 60, timeoutMs: 500 })
      await new Promise((resolve) => setTimeout(resolve, 25))
      el.innerText = "chapter"
      callback?.()
      assert.equal(await pending, true)
      assert.equal(observed, el)
      assert.equal(el.innerText, "chapter")
    } finally {
      g.document = prevDoc
      if (prevMo) g.MutationObserver = prevMo
      else delete g.MutationObserver
    }
  })
})

test("waitForSurfaceQuiet reports false when the selector never appears", async () => {
  await exclusive(async () => {
    class FakeObserver {
      constructor(_cb: () => void) {}
      observe() {}
      disconnect() {}
    }
    const g = quietGlobal()
    const prevDoc = g.document
    const prevMo = g.MutationObserver
    g.document = { querySelector: () => null }
    g.MutationObserver = FakeObserver
    try {
      const started = Date.now()
      const ok = await waitForSurfaceQuiet({ selector: "#editor-content", quietMs: 400, timeoutMs: 80 })
      assert.equal(ok, false)
      assert.ok(Date.now() - started < 250)
    } finally {
      g.document = prevDoc
      if (prevMo) g.MutationObserver = prevMo
      else delete g.MutationObserver
    }
  })
})

test("runPageActions classifies a contenteditable that mounts during the quiet wait", async () => {
  await exclusive(async () => {
    type El = {
      tagName: string
      isContentEditable: boolean
      innerText: string
      textContent: string
      focus: () => void
      getAttribute: () => string
      querySelector: () => null
      querySelectorAll: () => unknown[]
    }
    const editor: { current: El | null } = { current: null }
    class FakeObserver {
      constructor(_cb: () => void) {}
      observe() {}
      disconnect() {}
    }
    const g = quietGlobal()
    const prevDoc = g.document
    const prevMo = g.MutationObserver
    g.MutationObserver = FakeObserver
    g.document = {
      querySelector: () => editor.current,
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
    }
    setTimeout(() => {
      editor.current = {
        tagName: "DIV",
        isContentEditable: true,
        innerText: "chapter",
        textContent: "chapter",
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
    }, 40)
    let sawMissing = false
    let firstPresent = ""
    const keyboard = {
      _page: { session: "solari" },
      async insertText(text: string) {
        if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
        const node = editor.current
        if (node) node.textContent += text
      },
      async type(text: string) {
        if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
        const node = editor.current
        if (!node) return
        node.innerText = `${node.innerText} ${text}`
        node.textContent = node.innerText
      },
    }
    const page = {
      waitForSelector: async () => undefined,
      locator: () => ({
        fill: async () => undefined,
        click: async () => undefined,
      }),
      evaluate: async <R, Arg>(fn: (arg: Arg) => R, arg?: Arg): Promise<R> => {
        const result = await fn(arg as Arg)
        if (fn.name === "probeVisibleControl") {
          const row = result as { present?: boolean; text?: string }
          if (row.present === false) sawMissing = true
          else if (!firstPresent) firstPresent = row.text ?? ""
        }
        return result
      },
      keyboard,
    }
    try {
      const out = await runPageActions(page, { fill: "#editor-content", value: MARK })
      assert.equal(out.filled, "#editor-content")
      assert.match(editor.current?.innerText ?? "", /MARK/)
      assert.equal(sawMissing, true)
      assert.match(firstPresent, /chapter/)
    } finally {
      g.document = prevDoc
      if (prevMo) g.MutationObserver = prevMo
      else delete g.MutationObserver
    }
  })
})

test("runPageActions types again when a rewrite drops the value after it landed", async () => {
  await exclusive(async () => {
    const el = {
      tagName: "DIV",
      isContentEditable: true,
      innerText: "chapter",
      textContent: "chapter",
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
    let observes = 0
    class FakeObserver {
      constructor(private cb: () => void) {}
      observe(node: object) {
        if (node !== el) return
        observes += 1
        if (observes !== 2) return
        setTimeout(() => {
          el.innerText = "chapter"
          el.textContent = "chapter"
          this.cb()
        }, 20)
      }
      disconnect() {}
    }
    const g = quietGlobal()
    const prevDoc = g.document
    const prevMo = g.MutationObserver
    g.MutationObserver = FakeObserver
    g.document = {
      querySelector: () => el,
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
    }
    let types = 0
    const keyboard = {
      _page: { session: "solari" },
      async insertText(text: string) {
        if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
        el.textContent += text
      },
      async type(text: string) {
        if (!this._page) throw new TypeError("Cannot read properties of undefined (reading '_page')")
        types += 1
        el.innerText = `chapter ${text}`
        el.textContent = el.innerText
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
    try {
      const out = await runPageActions(page, { fill: "#editor-content", value: MARK })
      assert.equal(out.filled, "#editor-content")
      assert.ok(types >= 2)
      assert.match(el.innerText, /MARK/)
      assert.equal(observes >= 2, true)
    } finally {
      g.document = prevDoc
      if (prevMo) g.MutationObserver = prevMo
      else delete g.MutationObserver
    }
  })
})

test("pressSequentially lands when keyboard.type only touches textContent", async () => {
  await exclusive(async () => {
  const el = {
    tagName: "DIV",
    isContentEditable: true,
    innerText: "chapter",
    textContent: "chapter",
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
  let sequential = 0
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
      pressSequentially: async (text: string) => {
        sequential += 1
        el.innerText = `${el.innerText} ${text}`
        el.textContent = el.innerText
      },
    }),
    evaluate: async <R, Arg>(fn: (arg: Arg) => R, arg?: Arg): Promise<R> => fn(arg as Arg),
    keyboard,
  }
  const g = globalThis as QuietGlobal
  const prevDoc = g.document
  g.document = {
    querySelector: () => el,
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
  }
  try {
    const out = await runPageActions(page, { fill: "#editor-content", value: MARK })
    assert.equal(out.filled, "#editor-content")
    assert.equal(sequential, 1)
    assert.match(el.innerText, /MARK/)
    } finally {
      g.document = prevDoc
    }
  })
})

test("fill page.evaluate payloads run without the tsx keepNames helper", async () => {
  const pageActions = readFileSync(new URL("../src/page-actions.ts", import.meta.url), "utf8")
  assert.equal(pageActions.includes("$eval("), false)
  const calls = [...pageActions.matchAll(/page\.evaluate\(\s*([A-Za-z0-9_]+)/g)].map((match) => match[1]).sort()
  assert.deepEqual(calls, [
    "paintFillTarget",
    "prepareFillTarget",
    "prepareFillTarget",
    "prepareFillTarget",
    "probeVisibleControl",
    "waitForSurfaceQuiet",
  ])
  const editor = {
    innerText: "old",
    isContentEditable: true,
    focus() {},
    querySelector() {
      return null
    },
    querySelectorAll() {
      return []
    },
  }
  for (const payload of browserEvaluatePayloads) {
    assert.equal(payload.source.includes(KEEP_NAMES_HELPER), false, payload.name)
    const shipped = String(payload.fn)
    assert.equal(shipped.includes(KEEP_NAMES_HELPER), false, payload.name)
    assert.match(shipped, new RegExp(`^function ${payload.name}\\b`))
    const sandbox: Record<string, unknown> = {
      Promise,
      Date,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      document:
        payload.name === "paintFillTarget"
          ? {
              querySelector: () => editor,
              createRange: () => ({ selectNodeContents() {} }),
              getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
              execCommand() {
                return false
              },
            }
          : { querySelector: () => null },
      MutationObserver: class {
        observe() {}
        disconnect() {}
      },
    }
    sandbox.globalThis = sandbox
    const fn = vm.runInContext(`(${shipped})`, vm.createContext(sandbox)) as (arg: unknown) => unknown
    if (payload.name === "probeVisibleControl") {
      const probe = fn("#editor-content") as { password: boolean; contentEditable: boolean; text: string; present: boolean }
      assert.equal(probe.password, false)
      assert.equal(probe.contentEditable, false)
      assert.equal(probe.text, "")
      assert.equal(probe.present, false)
    } else if (payload.name === "prepareFillTarget") {
      assert.equal(fn({ selector: "#editor-content", select: "all" }), false)
    } else if (payload.name === "paintFillTarget") {
      assert.equal(fn({ selector: "#editor-content", value: "MARK" }), false)
    } else {
      const quiet = await (fn({ selector: "#missing", quietMs: 20, timeoutMs: 70 }) as Promise<boolean>)
      assert.equal(quiet, false)
    }
  }
})
