/**
 * Functions Playwright evaluates in remote Chrome.
 * page.evaluate sends String(fn) into that page. tsx keepNames rewrites nested
 * helpers to __name(...), and remote Chrome has no such binding, so these
 * payloads are source literals compiled here. The literal is what String(fn) returns.
 */

export type BrowserEvaluatePayload = {
  name: string
  source: string
  fn: (arg: never) => unknown
}

const KEEP_NAMES_HELPER = "__" + "name"

export function compileBrowserFunction<T>(source: string): T {
  if (source.includes(KEEP_NAMES_HELPER)) {
    throw new Error("page.evaluate source contains a tsx keepNames helper")
  }
  const compiled = new Function(`return (${source}\n);`)() as T
  const serialized = Function.prototype.toString.call(compiled)
  if (serialized.includes(KEEP_NAMES_HELPER)) {
    throw new Error("page.evaluate serialization contains a tsx keepNames helper")
  }
  return compiled
}

const PROBE_VISIBLE_CONTROL_SOURCE = `function probeVisibleControl(selector) {
  const blank = { password: false, contentEditable: false, text: "", present: false }
  const doc = globalThis.document
  if (!doc) return blank
  try {
    const el = doc.querySelector(selector)
    if (!el || typeof el.tagName !== "string") return blank
    const tag = el.tagName.toUpperCase()
    const password = tag === "INPUT" && String(el.type ?? "").toLowerCase() === "password"
    let contentEditable = el.isContentEditable === true
    if (!contentEditable && typeof el.querySelector === "function") {
      const nested = el.querySelector("[contenteditable]")
      const attr = nested?.getAttribute?.("contenteditable")
      if (nested && !(typeof attr === "string" && attr.toLowerCase() === "false")) contentEditable = true
    }
    if (password) return { password: true, contentEditable, text: "", present: true }
    const text = tag === "INPUT" || tag === "TEXTAREA" ? String(el.value ?? "") : String(el.innerText ?? "")
    return { password: false, contentEditable, text, present: true }
  } catch {
    return blank
  }
}`

const PREPARE_FILL_TARGET_SOURCE = `function prepareFillTarget(arg) {
  const doc = globalThis.document
  const el = doc?.querySelector(arg.selector)
  if (!el) return false
  const nodes = []
  if (el.isContentEditable === true) nodes.push(el)
  const nested = typeof el.querySelectorAll === "function" ? el.querySelectorAll("[contenteditable]") : undefined
  const listed = nested && typeof nested[Symbol.iterator] === "function" ? nested : []
  for (const node of listed) {
    const attr = node?.getAttribute?.("contenteditable")
    if (typeof attr === "string" && attr.toLowerCase() === "false") continue
    if (node) nodes.push(node)
  }
  if (nodes.length === 0 && typeof el.querySelector === "function") {
    const one = el.querySelector("[contenteditable]")
    const attr = one?.getAttribute?.("contenteditable")
    if (one && !(typeof attr === "string" && attr.toLowerCase() === "false")) nodes.push(one)
  }
  let target = el
  let bestLen = -1
  for (const node of nodes) {
    const len = (node.innerText ?? "").length
    const deeper = node !== el
    if (len > bestLen || (deeper && len === bestLen && len >= 0)) {
      target = node
      bestLen = len
    }
  }
  try {
    if (typeof target.focus === "function") target.focus()
  } catch {
    /* focus can throw on a detached node; the selection step still runs */
  }
  if (arg.select === "none") return true
  try {
    const range = doc?.createRange?.()
    const selection = doc?.getSelection?.() ?? doc?.defaultView?.getSelection?.()
    if (!range || !selection) return false
    range.selectNodeContents(target)
    if (arg.select === "end") range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
    return true
  } catch {
    return false
  }
}`

const WAIT_FOR_SURFACE_QUIET_SOURCE = `function waitForSurfaceQuiet(arg) {
  const Ctor = globalThis.MutationObserver
  if (typeof Ctor !== "function") return Promise.resolve(false)
  const doc = globalThis.document
  const quietMs = arg.quietMs
  const timeoutMs = arg.timeoutMs
  const selector = arg.selector
  return new Promise((resolve) => {
    let done = false
    let target = null
    let observer = null
    let quietTimer
    let pollTimer
    const finish = (ok) => {
      if (done) return
      done = true
      if (quietTimer) clearTimeout(quietTimer)
      if (pollTimer) clearInterval(pollTimer)
      observer?.disconnect()
      resolve(ok)
    }
    const arm = () => {
      if (done) return
      if (quietTimer) clearTimeout(quietTimer)
      quietTimer = setTimeout(() => finish(true), quietMs)
    }
    const attach = (node) => {
      if (done || node === target) return
      observer?.disconnect()
      target = node
      observer = new Ctor(() => arm())
      try {
        observer.observe(node, { subtree: true, childList: true, characterData: true })
      } catch {
        finish(false)
        return
      }
      arm()
    }
    const started = Date.now()
    const tick = () => {
      if (done) return
      if (Date.now() - started >= timeoutMs) {
        finish(false)
        return
      }
      let node = null
      try {
        node = doc?.querySelector(selector) ?? null
      } catch {
        node = null
      }
      if (node) attach(node)
    }
    tick()
    pollTimer = setInterval(tick, 50)
  })
}`

const PAINT_FILL_TARGET_SOURCE = `function paintFillTarget(arg) {
  const doc = globalThis.document
  const root = doc?.querySelector(arg.selector)
  if (!doc || !root) return false
  const hosts = [root]
  const marked = root.querySelector?.(".ProseMirror")
  if (marked) hosts.push(marked)
  const nested = typeof root.querySelectorAll === "function" ? root.querySelectorAll("[contenteditable]") : undefined
  const listed = nested && typeof nested[Symbol.iterator] === "function" ? nested : []
  for (const node of listed) {
    if (node) hosts.push(node)
  }
  let view
  for (const host of hosts) {
    const candidate = host.pmViewDesc?.view
    if (
      candidate?.state?.doc &&
      typeof candidate.state.tr?.insertText === "function" &&
      typeof candidate.dispatch === "function"
    ) {
      view = candidate
      break
    }
  }
  const visible = () => {
    const parts = [String(root.innerText ?? "")]
    const inner = root.querySelector?.(".ProseMirror")
    if (inner) parts.push(String(inner.innerText ?? ""))
    return parts.join("\\n")
  }
  if (view) {
    try {
      if (typeof view.focus === "function") view.focus()
    } catch {
      /* the transaction is what paints */
    }
    const size = Number(view.state.doc.content?.size ?? 0)
    const at = size > 0 ? size - 1 : 0
    try {
      view.dispatch(view.state.tr.insertText(arg.value, at))
    } catch {
      /* range rejected; execCommand below is the general contenteditable path */
    }
    if (visible().includes(arg.value)) return true
  }
  let target = root
  let bestLen = -1
  for (const host of hosts) {
    if (host.pmViewDesc?.view) {
      target = host
      break
    }
    if (host === root && host.isContentEditable !== true && hosts.length > 1) continue
    const len = (host.innerText ?? "").length
    const deeper = host !== root
    if (len > bestLen || (deeper && len === bestLen && len >= 0)) {
      target = host
      bestLen = len
    }
  }
  try {
    if (typeof target.focus === "function") target.focus()
    const range = doc.createRange?.()
    const selection = doc.getSelection?.() ?? doc.defaultView?.getSelection?.()
    if (range && selection) {
      range.selectNodeContents(target)
      selection.removeAllRanges()
      selection.addRange(range)
    }
    doc.execCommand?.("insertText", false, arg.value)
  } catch {
    /* a miss stays FILL_NOT_LANDED */
  }
  return visible().includes(arg.value)
}`

export const probeVisibleControl = compileBrowserFunction<
  (selector: string) => { password: boolean; contentEditable: boolean; text: string; present: boolean }
>(PROBE_VISIBLE_CONTROL_SOURCE)

export const prepareFillTarget = compileBrowserFunction<
  (arg: { selector: string; select: string }) => boolean
>(PREPARE_FILL_TARGET_SOURCE)

export const waitForSurfaceQuiet = compileBrowserFunction<
  (arg: { selector: string; quietMs: number; timeoutMs: number }) => Promise<boolean>
>(WAIT_FOR_SURFACE_QUIET_SOURCE)

export const paintFillTarget = compileBrowserFunction<
  (arg: { selector: string; value: string }) => boolean
>(PAINT_FILL_TARGET_SOURCE)

export const browserEvaluatePayloads: readonly BrowserEvaluatePayload[] = [
  { name: "probeVisibleControl", source: PROBE_VISIBLE_CONTROL_SOURCE, fn: probeVisibleControl as BrowserEvaluatePayload["fn"] },
  { name: "prepareFillTarget", source: PREPARE_FILL_TARGET_SOURCE, fn: prepareFillTarget as BrowserEvaluatePayload["fn"] },
  { name: "waitForSurfaceQuiet", source: WAIT_FOR_SURFACE_QUIET_SOURCE, fn: waitForSurfaceQuiet as BrowserEvaluatePayload["fn"] },
  { name: "paintFillTarget", source: PAINT_FILL_TARGET_SOURCE, fn: paintFillTarget as BrowserEvaluatePayload["fn"] },
]
