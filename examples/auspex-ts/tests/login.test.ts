import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  stampLoginStreamExpiry,
  fetchEditorVncToken,
  mintStageAfterVnc,
  loginInstructions,
  phoneHandoffUrl,
  deleteSolariProfilesByName,
  persistEditorSave,
  stopEditorBeforeProfileDelete,
  stopProfileEditor,
  } from "../src/profiles.ts"

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

test("stampLoginStreamExpiry writes ISO expiry and never the JWT", () => {
  const exp = 1_700_000_000
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url")
  const jwt = `${header}.${payload}.sig`
  const mobile = phoneHandoffUrl(jwt, "https://console.getsolari.com/handoff/abc")
  const result = loginInstructions(
    { id: "p", name: "app-example" },
    undefined,
    { url: "https://console.getsolari.com/handoff/abc", expiresAt: "2027-01-15T08:00:00.000Z" },
    undefined,
    mobile,
  )
  stampLoginStreamExpiry(result, "2027-01-15T08:00:00.000Z")
  assert.equal(result.handoff?.streamExpirySource, "jwt")
  assert.equal(result.handoff?.streamExpiresAt, new Date(exp * 1000).toISOString())
  assert.equal((result.handoff?.streamExpiresAt ?? "").includes(jwt), false)
  assert.equal((result.handoff?.streamExpiresAt ?? "").includes("nbf"), false)
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
