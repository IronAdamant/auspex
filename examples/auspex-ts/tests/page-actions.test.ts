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
  assert.ok(calls.indexOf("click:#editor-content") < calls.indexOf("focus"))
  assert.ok(calls.indexOf("focus") < calls.indexOf("type:hello world"))
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

test("a click miss says why: several matches need a unique selector; a timeout means not found", async () => {
  const { clickMissedNext } = await import("../src/page-actions.ts")
  const several = clickMissedNext(
    "text=Collections",
    "locator.click: Error: strict mode violation: locator('text=Collections') resolved to 2 elements: waiting for locator('text=Collections')",
  )
  assert.match(several, /matched 2 elements and a click needs exactly one/)
  assert.match(several, />> visible=true/)
  const stillSeveral = clickMissedNext("text=View >> visible=true", "locator.click: Error: strict mode violation: locator('text=View').filter({ visible: true }) resolved to 6 elements: wait")
  assert.match(stillSeveral, /matched 6 elements/)
  assert.equal(stillSeveral.includes('add " >> visible=true"'), false, "no advice to add what the selector already has")
  assert.match(stillSeveral, />> nth=N/)
  const hidden = clickMissedNext("text=Collections >> nth=0", "locator.click: Timeout 15000ms exceeded. element is not visible")
  assert.match(hidden, /The first match is hidden/)
  assert.match(hidden, />> visible=true/)
  assert.equal(several.includes("Pick a selector that exists there"), false)
  const missing = clickMissedNext("header button", "locator.click: Timeout 15000ms exceeded. waiting for locator('header button')")
  assert.match(missing, /Nothing matching that selector became visible and clickable/)
  assert.match(missing, /One check is one click/)
})

test("a click that waited through a redirect says the page navigated, not that nothing matched", async () => {
  const { clickMissedNext } = await import("../src/page-actions.ts")
  const nav = clickMissedNext(
    'text="MANAGE" >> visible=true',
    'locator.click: Timeout 15000ms exceeded. navigated to "https://app.example/login/oauth2/code/grant?code=redacted"',
  )
  assert.match(nav, /The page navigated while the click waited/)
  assert.equal(nav.includes("Nothing matching that selector"), false)
})

test("check lets the page settle before a fill or click, and keeps OAuth codes out of the receipt", () => {
  const src = readFileSync(new URL("../src/check.ts", import.meta.url), "utf8")
  const settle = src.indexOf("if (opts.fill || opts.click)")
  assert.ok(settle > 0 && settle < src.indexOf("await runPageActions(page, opts, signal)"))
  assert.match(src, /clickMissed = actions\.clickMissed \? redactUrlSecretsInText\(actions\.clickMissed\)/)
  assert.match(src, /finalUrl: receiptFinalUrl,/)
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

test("a covered click names what is on top and a selector for it, not 'nothing matching'", async () => {
  const { clickMissedNext } = await import("../src/page-actions.ts")
  const overlayLink = clickMissedNext(
    "text=Random Test >> visible=true",
    'locator.click: Timeout 15000ms exceeded. <a aria-label="Random Test"></a> intercepts pointer events',
  )
  assert.match(overlayLink, /<a aria-label="Random Test"> lies on top of it and takes the click/)
  assert.match(overlayLink, /click it instead: role=link\[name="Random Test"\]\./)
  assert.equal(overlayLink.includes("Nothing matching that selector"), false)
  const banner = clickMissedNext(
    "text=Buy",
    'locator.click: Timeout 15000ms exceeded. <button id="accept">Accept all</button> from <div id="banner">…</div> subtree intercepts pointer events',
  )
  assert.match(banner, /role=button\[name="Accept all"\]/)
  assert.match(banner, /If it is a banner or dialog, one check cannot get past it/)
  // A cut-off text preview is not a name; fall back to the id.
  const cut = clickMissedNext("text=Buy", 'locator.click: Timeout 15000ms exceeded. <div id="overlay">Sign up for our newsletter and…</div> intercepts pointer events')
  assert.match(cut, /click it instead: \[id="overlay"\]\./)
  const anonymous = clickMissedNext("text=Buy", "locator.click: Timeout 15000ms exceeded. <div></div> intercepts pointer events")
  assert.match(anonymous, /click it instead by its role and name/)
  const quoted = clickMissedNext("text=Go", 'locator.click: Timeout 15000ms exceeded. <button aria-label="Say &quot;hi&quot;"></button> intercepts pointer events')
  assert.match(quoted, /role=button\[name="Say &quot;hi&quot;"\]/)
})

test("--fill refuses Playwright-only selectors before any browser opens; --click keeps them", async () => {
  const { isPlaywrightOnlySelector, FILL_SELECTOR_CSS_ERROR } = await import("../src/page-actions.ts")
  for (const sel of [
    "text=Search",
    'role=textbox[name="Search"]',
    'input >> visible=true',
    "//input[@name='q']",
    "xpath=//input",
    "css=#q",
    "input:visible",
    'input:has-text("Search")',
    "internal:role=textbox",
  ]) {
    assert.equal(isPlaywrightOnlySelector(sel), true, sel)
    assert.throws(() => assertFillPair({ fill: sel, value: "x" }), (err: Error) => err.message === FILL_SELECTOR_CSS_ERROR, sel)
  }
  for (const sel of ["#q", '[placeholder="Search..."]', 'input[name="q"]', "div > input", "input:not([type=hidden])", '[aria-label="Search"]', "#doc-title-input"]) {
    assert.equal(isPlaywrightOnlySelector(sel), false, sel)
    assert.doesNotThrow(() => assertFillPair({ fill: sel, value: "x" }), sel)
  }
  assert.doesNotThrow(() => assertPageActionsAllowed({ click: 'role=link[name="Random Test"] >> visible=true' }))
})

test("a fill target that never appears says so, instead of 'the value did not land'", async () => {
  // Live, tldraw: the sidebar search box exists only after its Search button is clicked, and a check
  // fills before it clicks; the old error said the text "does not contain --value".
  const page = {
    waitForSelector: async () => undefined,
    locator: () => ({ fill: async () => undefined, click: async () => undefined }),
    evaluate: async <R,>(): Promise<R> => ({ password: false, contentEditable: false, text: "", present: false }) as R,
    keyboard: { insertText: async () => undefined, type: async () => undefined },
  }
  await assert.rejects(
    () => runPageActions(page, { fill: '[placeholder="Search..."]', value: "Random" }),
    (err: Error) =>
      err.message.startsWith('check --fill found nothing matching [placeholder="Search..."] on the page. filled was not set.') &&
      /fills first, then clicks/.test(err.message) &&
      !err.message.includes("does not contain --value"),
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
