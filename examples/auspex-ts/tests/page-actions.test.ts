import assert from "node:assert/strict"
import test from "node:test"
import {
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
    assert.equal(probe.present, true)
    assert.equal(probe.text, "visible sentence")
    assert.equal(probe.text.includes("MARK"), false)
    ;(globalThis as { document: unknown }).document = { querySelector: () => null }
    assert.equal(probeVisibleControl("#missing").present, false)
  } finally {
    ;(globalThis as { document?: unknown }).document = prev
  }
})

test("probeVisibleControl reads input value and blanks a password", () => {
  const prev = (globalThis as { document?: unknown }).document
  const input = { tagName: "INPUT", type: "text", value: "alice", innerText: "", textContent: "" }
  ;(globalThis as { document: unknown }).document = { querySelector: () => input }
  try {
    assert.deepEqual(probeVisibleControl("#user"), { password: false, contentEditable: false, text: "alice", present: true })
    input.type = "password"
    input.value = "secret"
    assert.deepEqual(probeVisibleControl("#pwd"), { password: true, contentEditable: false, text: "", present: true })
    // A password shown as text, and a one-time-code box, are still secret fields.
    for (const autocomplete of ["current-password", "new-password", "one-time-code", "username one-time-code"]) {
      const field = { tagName: "INPUT", type: "text", value: "123456", innerText: "", getAttribute: (n: string) => (n === "autocomplete" ? autocomplete : null) }
      ;(globalThis as { document: unknown }).document = { querySelector: () => field }
      assert.equal(probeVisibleControl("#code").password, true, autocomplete)
      assert.equal(probeVisibleControl("#code").text, "")
    }
    const email = { tagName: "INPUT", type: "text", value: "a", innerText: "", getAttribute: () => "email" }
    ;(globalThis as { document: unknown }).document = { querySelector: () => email }
    assert.equal(probeVisibleControl("#email").password, false)
  } finally {
    ;(globalThis as { document?: unknown }).document = prev
  }
})

test("a missed click keeps the check alive: clickMissed is set, clicked is not", async () => {
  const timeout = "locator.click: Timeout 15000ms exceeded.\n\u001b[2mCall log:\u001b[22m\n  - waiting for locator('header button')"
  const page = {
    waitForSelector: async () => undefined,
    locator: () => ({
      fill: async () => undefined,
      click: async () => {
        throw new Error(timeout)
      },
    }),
    evaluate: async () => ({}),
  }
  const out = await runPageActions(page as never, { click: "header button" })
  assert.equal(out.clicked, undefined)
  assert.equal(out.clickMissed, "locator.click: Timeout 15000ms exceeded. waiting for locator('header button')")
  const { shortClickError } = await import("../src/page-actions.ts")
  const covered = new Error(
    "locator.click: Timeout 15000ms exceeded.\nCall log:\n  - waiting for locator('a')\n  - <div class=\"overlay\"></div> intercepts pointer events\n  - retrying click action\n  - waiting 500ms",
  )
  assert.equal(shortClickError(covered), 'locator.click: Timeout 15000ms exceeded. <div class="overlay"></div> intercepts pointer events')
  assert.equal(shortClickError(new Error("boom")), "boom")
  const { clickMissedNext } = await import("../src/page-actions.ts")
  assert.match(clickMissedNext("header button", out.clickMissed!), /clicked is unset and ok is false/)
})

test("an aborted check still throws from the click", async () => {
  const ac = new AbortController()
  ac.abort()
  const page = {
    waitForSelector: async () => undefined,
    locator: () => ({
      fill: async () => undefined,
      click: async () => {
        throw new Error("aborted")
      },
    }),
    evaluate: async () => ({}),
  }
  await assert.rejects(runPageActions(page as never, { click: "a" }, ac.signal), /aborted/)
})

test("a fill replaces what an input already holds: 'Untitled' does not become 'UntitledAuspex probe'", async () => {
  // Live on ConsistencyHub: the title field said "Untitled", insertText typed at the caret, and the
  // landed check passed because "UntitledAuspex probe" contains "Auspex probe".
  let text = "Untitled"
  const { page, calls } = fieldPage({
    text: () => text,
    onFill: (value) => {
      text = value
    },
    onInsert: (value) => {
      text += value
    },
    onType: (value) => {
      text += value
    },
  })
  const out = await runPageActions(page, { fill: "#doc-title-input", value: "Auspex probe" })
  assert.equal(out.filled, "#doc-title-input")
  assert.equal(text, "Auspex probe")
  assert.ok(calls.indexOf("fill:#doc-title-input=") < calls.indexOf("insert:Auspex probe"), calls.join(" "))
})

test("click errors keep only the attributes that name an element (no href capability links, no classes)", async () => {
  const { compactElementHtml, shortClickError } = await import("../src/page-actions.ts")
  assert.equal(
    compactElementHtml('<a draggable="false" aria-label="Random Test" href="/f/cb5gAPyOxWKFtR93icW0C" class="_sidebarFileListItemButton_tuqtq_923"></a>'),
    '<a aria-label="Random Test" class="_sidebarFileListItemButton_tuqtq_923"></a>',
  )
  assert.equal(
    compactElementHtml('<button type="button" data-testid="share" data-file-id="f1" id="s1" style="x" role="menuitem" title="Share" src="/x">'),
    '<button type="button" data-testid="share" id="s1" role="menuitem" title="Share">',
  )
  // Live, tldraw: the sidebar row's overlay link quoted the user's other file id in clickMissed.
  const live =
    "locator.click: Timeout 15000ms exceeded.\nCall log:\n  - waiting for locator('text=Random Test').filter({ visible: true })\n" +
    '  - <a draggable="false" aria-label="Random Test" href="/f/cb5gAPyOxWKFtR93icW0C" class="_sidebarFileListItemButton_tuqtq_923"></a> intercepts pointer events\n' +
    "  - retrying click action\n  - waiting 20ms"
  const short = shortClickError(new Error(live))
  assert.equal(short.includes("cb5gAPyOxWKFtR93icW0C"), false)
  assert.equal(short.includes("href"), false)
  assert.equal(
    short,
    'locator.click: Timeout 15000ms exceeded. <a aria-label="Random Test" class="_sidebarFileListItemButton_tuqtq_923"></a> intercepts pointer events',
  )
})

test("a fill target that stops matching once focused says so, not a bare Playwright timeout", async () => {
  // Live, Trello: focusing the search box turned placeholder "Search" into "Search Trello", and the
  // fill died with "locator.click: Timeout … waiting for locator" and no receipt.
  let focused = false
  const page = {
    waitForSelector: async () => undefined,
    locator: () => ({
      fill: async () => {
        focused = true
      },
      click: async () => {
        if (focused) throw new Error("locator.click: Timeout 15000ms exceeded.\nCall log:\n  - waiting for locator('input[placeholder=\"Search\"]')")
      },
    }),
    evaluate: async <R,>(): Promise<R> => ({ password: false, contentEditable: false, text: "", present: !focused }) as R,
    keyboard: { insertText: async () => undefined, type: async () => undefined },
  }
  await assert.rejects(
    () => runPageActions(page, { fill: 'input[placeholder="Search"]', value: "Auspex" }),
    (err: Error) =>
      err.message.startsWith('check --fill found input[placeholder="Search"], but once the field was focused nothing matched it any more') &&
      /its id, name, or aria-label/.test(err.message),
  )
})
