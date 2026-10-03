import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import vm from "node:vm"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { doorSaveSiteUrl } from "../src/live-host-change.ts"
import {
  CONSOLE_PROFILES_URL,
  EDITOR_CONSOLE_ORIGIN,
  PHONE_HANDOFF_PAGE,
  attachHandoffQr,
  stampLoginStreamExpiry,
  fetchEditorVncToken,
  editorStartConflictGuide,
  editorStartOk,
  mintStageAfterVnc,
  formatLogin,
  phoneSavePaste,
  saveProfileEditor,
  handoffTokenFromUrl,
  loginInstructions,
  phoneHandoffUrl,
  deleteSolariProfilesByName,
  persistEditorSave,
  stopEditorBeforeProfileDelete,
  stopProfileEditor,
  qrPayloadForHandoff,
  requestLoginHandoff,
  publicHandoffUrl,
  classifyHandoffHost,
} from "../src/profiles.ts"

test("fetchEditorVncToken reuses a live editor on HTTP 409 by polling the token", async () => {
  const calls: string[] = []
  let deleted = false
  const vnc = await fetchEditorVncToken("prof_1", "hand_1", {
    sleepMs: 0,
    tries: 3,
    recover: true,
    del: async () => {
      deleted = true
      return { status: 204, json: {} }
    },
    post: async (p) => {
      calls.push(p)
      if (p.endsWith("/editor/token")) return { status: 200, json: { token: "vnc.jwt", ready: true } }
      if (p.endsWith("/editor")) return { status: 409, json: { error: "Editor already running" } }
      return { status: 500, json: {} }
    },
  })
  assert.equal(vnc.token, "vnc.jwt")
  assert.equal(vnc.editorStartStatus, 409)
  assert.equal(vnc.tokenTries, 1)
  assert.equal(deleted, false)
  assert.equal(calls[0]?.endsWith("/editor"), true)
  assert.equal(calls[1]?.endsWith("/editor/token"), true)
  assert.equal(mintStageAfterVnc(vnc, Boolean(vnc.token)), "ready")
  const guide = editorStartConflictGuide("consistencyhub")
  assert.equal(guide.nextCall.tool, "auspex_login")
  assert.match(guide.text, /status editor-busy/)
  assert.match(guide.text, /409/)
  assert.match(guide.text, /Do not finalize-login/)
  assert.match(guide.text, /still running/)
  assert.match(guide.text, /stop it/)
  assert.equal(/purge the profile after you agree/.test(guide.text), false)
  assert.equal(/--purge/.test(guide.text), false)
})

test("fetchEditorVncToken polls a 409 editor and does not DELETE unless recover is set", async () => {
  const calls: string[] = []
  let deleted = false
  const vnc = await fetchEditorVncToken("prof_1", "hand_1", {
    sleepMs: 0,
    tries: 2,
    del: async () => {
      deleted = true
      return { status: 204, json: {} }
    },
    post: async (p) => {
      calls.push(p)
      if (p.endsWith("/editor/token")) return { status: 404, json: {} }
      if (p.endsWith("/editor")) return { status: 409, json: { error: "Editor already running" } }
      return { status: 500, json: {} }
    },
  })
  assert.equal(vnc.token, undefined)
  assert.equal(vnc.editorStartStatus, 409)
  assert.equal(vnc.tokenTries, 2)
  assert.equal(deleted, false)
  assert.equal(calls.filter((p) => p.endsWith("/editor/token")).length, 2)
  assert.equal(mintStageAfterVnc(vnc), "editor-start")
})

test("fetchEditorVncToken restarts only after a 409 token poll misses", async () => {
  const calls: string[] = []
  let tokenPolls = 0
  let editorPosts = 0
  const vnc = await fetchEditorVncToken("prof_1", "hand_1", {
    sleepMs: 0,
    tries: 2,
    recover: true,
    del: async (p) => {
      calls.push(`DELETE ${p}`)
      return { status: 204, json: {} }
    },
    post: async (p) => {
      calls.push(`POST ${p}`)
      if (p.endsWith("/editor/token")) {
        tokenPolls += 1
        if (tokenPolls <= 2) return { status: 404, json: {} }
        return { status: 200, json: { token: "vnc.jwt" } }
      }
      if (p.endsWith("/editor")) {
        editorPosts += 1
        return { status: editorPosts === 1 ? 409 : 202, json: {} }
      }
      return { status: 500, json: {} }
    },
  })
  assert.equal(vnc.token, "vnc.jwt")
  assert.equal(calls[0]?.startsWith("POST "), true)
  assert.match(calls[0] ?? "", /\/editor$/)
  const deleteAt = calls.findIndex((call) => call.startsWith("DELETE "))
  assert.ok(deleteAt > 2)
  assert.match(calls[deleteAt] ?? "", /\/editor$/)
  assert.equal(calls[deleteAt + 1]?.startsWith("POST "), true)
  assert.equal(mintStageAfterVnc(vnc, Boolean(vnc.token)), "ready")
})

test("fetchEditorVncToken polls token after editor-start 202", async () => {
  const calls: string[] = []
  const vnc = await fetchEditorVncToken("prof_1", "hand_1", {
    sleepMs: 0,
    tries: 3,
    post: async (p) => {
      calls.push(p)
      if (p.endsWith("/editor")) return { status: 202, json: { status: "starting" } }
      return { status: 200, json: { token: "vnc.jwt", ready: true } }
    },
  })
  assert.equal(vnc.token, "vnc.jwt")
  assert.equal(vnc.editorStartStatus, 202)
  assert.equal(calls[0]?.endsWith("/editor"), true)
  assert.equal(calls[1]?.endsWith("/editor/token"), true)
})

test("fetchEditorVncToken keeps editor-start HTTP status when start is not 200/201/202", async () => {
  const mint = await fetchEditorVncToken("prof_1", "hand_1", {
    sleepMs: 0,
    tries: 2,
    post: async () => ({ status: 503, json: { error: "unconditional drop: overload" } }),
  })
  assert.equal(mint.token, undefined)
  assert.equal(mint.editorStartStatus, 503)
  assert.equal(mint.tokenTries, 0)
  assert.equal(mintStageAfterVnc(mint), "editor-start")
})

test("empty handoffToken does not report mintStage ready", async () => {
  let posted = false
  const mint = await fetchEditorVncToken("prof_1", "", {
    sleepMs: 0,
    tries: 2,
    post: async () => {
      posted = true
      return { status: 200, json: { token: "should-not-run" } }
    },
  })
  assert.equal(posted, false)
  assert.equal(mint.token, undefined)
  assert.equal(mint.editorStartStatus, 0)
  assert.equal(mint.tokenTries, 0)
  assert.equal(mintStageAfterVnc(mint, Boolean(mint.token)), "editor-token")
  assert.notEqual(mintStageAfterVnc(mint, Boolean(mint.token)), "ready")
  const blankId = await fetchEditorVncToken("", "hand_1", {
    post: async () => ({ status: 200, json: { token: "nope" } }),
  })
  assert.equal(mintStageAfterVnc(blankId, Boolean(blankId.token)), "editor-token")
  assert.equal(
    mintStageAfterVnc({ token: "vnc", editorStartStatus: 200, tokenTries: 1 }, true),
    "ready",
  )
  assert.equal(
    mintStageAfterVnc({ editorStartStatus: 200, tokenTries: 20 }, false),
    "editor-token",
  )
})

function phoneHtmlSavePaste(name?: string): string {
  const context: Record<string, unknown> = {}
  context.window = context
  vm.runInNewContext(
    readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/door-page.js"), "utf8"),
    context,
    { filename: "door-page.js" },
  )
  const api = context.AuspexDoorPage as { savePasteLine: (profile?: string) => string }
  return api.savePasteLine(name)
}

test("phone.html clipboard equals phoneSavePaste", () => {
  assert.equal(phoneHtmlSavePaste("consistencyhub"), phoneSavePaste("consistencyhub"))
  assert.equal(phoneHtmlSavePaste(""), phoneSavePaste())
  assert.equal(phoneHtmlSavePaste("  myapp  "), phoneSavePaste("  myapp  "))
  assert.equal(phoneHtmlSavePaste(), phoneSavePaste())
})

test("saveProfileEditor POSTs editor/save", async () => {
  const calls: string[] = []
  const saved = await saveProfileEditor(
    { profileId: "prof_1", name: "demo", handoffToken: "hand_1" },
    {
      post: async (p) => {
        calls.push(p)
        return { status: 200, json: { editorStatus: "idle" } }
      },
    },
  )
  assert.equal(saved.ok, true)
  assert.equal(saved.status, 200)
  assert.equal(calls[0]?.endsWith("/editor/save"), true)
})

test("requestLoginHandoff uses injected HTTP and requires url", async () => {
  let path = ""
  let body: unknown
  const handoff = await requestLoginHandoff("prof_1", "Auspex login", {
    post: async (p, b) => {
      path = p
      body = b
      return { url: "https://handoff.example/u", handoffId: "hid" }
    },
  })
  assert.match(path, /\/profiles\/prof_1\/login-handoff/)
  assert.equal((body as { reason: string }).reason, "Auspex login")
  assert.equal(handoff.url, "https://handoff.example/u")
  assert.equal(handoff.hostKind, "other")

  const internal = await requestLoginHandoff("prof_1", "Auspex login", {
    post: async () => ({
      url: "http://console.example.svc.cluster.local/handoff/tok",
      handoffId: "tok",
    }),
  })
  assert.equal(internal.hostKind, "cluster-internal")
  assert.equal(internal.url, "https://console.getsolari.com/handoff/tok")
  await assert.rejects(
    () => requestLoginHandoff("prof_1", "x", { post: async () => ({}) }),
    /no url/,
  )
})

test("stopProfileEditor DELETEs /editor with the handoff token", async () => {
  const seen: Array<{ method: string; url: string; token: string }> = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const headers = new Headers(init?.headers)
    seen.push({
      method: init?.method ?? "",
      url: String(url),
      token: headers.get("x-handoff-token") ?? "",
    })
    return new Response(null, { status: 204 })
  }
  try {
    const stopped = await stopProfileEditor("prof_1", "hand_1")
    assert.equal(stopped.ok, true)
    assert.equal(stopped.status, 204)
    assert.equal(seen[0]?.method, "DELETE")
    assert.match(seen[0]?.url ?? "", /\/api\/profiles\/prof_1\/editor$/)
    assert.equal(seen[0]?.token, "hand_1")
  } finally {
    globalThis.fetch = original
  }
})

test("profile wipe stops the editor before profiles.delete and reports wipeFailed", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "auspex-wipe-"))
  const calls: string[] = []
  await persistEditorSave({ profileId: "prof_1", name: "hub", handoffToken: "hand_1" }, root)
  await stopEditorBeforeProfileDelete(
    { id: "prof_1", name: "hub" },
    {
      root,
      del: async (p) => {
        calls.push(`DELETE ${p}`)
        return { status: 204, json: {} }
      },
    },
  )
  assert.match(calls[0] ?? "", /\/api\/profiles\/prof_1\/editor$/)

  const order: string[] = []
  const failed = await deleteSolariProfilesByName(["hub"], {
    list: async () => [{ id: "prof_1", name: "hub" }],
    stopEditor: async (row) => {
      order.push(`DELETE editor ${row.id}`)
    },
    deleteProfile: async (id) => {
      order.push(`profiles.delete ${id}`)
      throw new Error("409 editor is open")
    },
  })
  assert.deepEqual(order, ["DELETE editor prof_1", "profiles.delete prof_1"])
  assert.deepEqual(failed.wiped, [])
  assert.equal(failed.wipeFailed[0]?.name, "hub")
  assert.match(failed.wipeFailed[0]?.error ?? "", /409 editor is open/)

  const wiped = await deleteSolariProfilesByName(["hub"], {
    list: async () => [{ id: "prof_1", name: "hub" }],
    stopEditor: async (row) => {
      order.push(`stop ${row.id}`)
    },
    deleteProfile: async (id) => {
      order.push(`gone ${id}`)
    },
  })
  assert.deepEqual(wiped.wiped, ["hub"])
  assert.deepEqual(wiped.wipeFailed, [])
})
