import assert from "node:assert/strict"
import test from "node:test"
import {
  EDITOR_FOLD_NO_CDP,
  captureEditorFoldState,
  persistCapturedEditorFold,
  pickEditorCdp,
} from "../src/editor-fold.ts"
import { SESSION_STORAGE_PREFIX } from "../src/profile-storage.ts"
import {
  DEAD_FOLD_VWP_BAN,
  overlaySaveEditorNext,
  remintLoginGuidance,
  saveEditorMissedFold,
  weakSeedWarning,
} from "../src/profile-persist.ts"

test("pickEditorCdp accepts Playwright sockets and ignores VNC", () => {
  assert.deepEqual(
    pickEditorCdp({
      wsEndpoint: "wss://api.getsolari.com/ws/sess-1",
      sessionId: "sess-1",
    }),
    { wsEndpoint: "wss://api.getsolari.com/ws/sess-1", sessionId: "sess-1" },
  )
  assert.deepEqual(
    pickEditorCdp({
      session: { cdpEndpoint: "wss://api.getsolari.com/cdp/sess-2" },
    }),
    { cdpEndpoint: "wss://api.getsolari.com/cdp/sess-2" },
  )
  assert.equal(pickEditorCdp({ token: "vnc.jwt.token", ready: true }), undefined)
  assert.equal(pickEditorCdp({ wsEndpoint: "wss://api.getsolari.com/vnc-proxy/ws?token=x" }), undefined)
  assert.equal(pickEditorCdp({ editorStatus: "idle" }), undefined)
})

test("captureEditorFoldState is no-cdp without a Playwright attach", async () => {
  let connected = 0
  const missed = await captureEditorFoldState({
    saveJson: { editorStatus: "idle" },
    connectAndCapture: async () => {
      connected += 1
      throw new Error("must not connect")
    },
  })
  assert.equal(missed.fold.ok, false)
  assert.equal(missed.fold.reason, "no-cdp")
  assert.match(missed.fold.error ?? "", /no Playwright CDP/)
  assert.equal(connected, 0)
  assert.match(EDITOR_FOLD_NO_CDP, /POST \/sessions/)
})

test("captureEditorFoldState folds live SS and refuses empty capture persist", async () => {
  const state = {
    cookies: [{ name: "sid", value: "1", domain: "consistencyhub.io" }],
    origins: [
      {
        origin: "https://consistencyhub.io",
        localStorage: [
          { name: `${SESSION_STORAGE_PREFIX}accessToken`, value: "fresh" },
          { name: `${SESSION_STORAGE_PREFIX}expiresOn`, value: String(Date.now() + 3_600_000) },
        ],
      },
    ],
  }
  const captured = await captureEditorFoldState({
    saveJson: { wsEndpoint: "wss://api.getsolari.com/ws/live" },
    connectAndCapture: async (attach) => {
      assert.equal(attach.wsEndpoint, "wss://api.getsolari.com/ws/live")
      return state
    },
  })
  assert.equal(captured.fold.reason, "attached")
  assert.equal(captured.fold.folded, 2)
  assert.equal(captured.fold.ok, false)

  let persisted = 0
  const saved = await persistCapturedEditorFold({
    handle: { profileId: "p1", name: "consistencyhub", handoffToken: "h" },
    captured,
    persist: async (got) => {
      persisted += 1
      assert.equal(got.origins?.[0]?.localStorage?.[0]?.name, `${SESSION_STORAGE_PREFIX}accessToken`)
      return { ok: true }
    },
  })
  assert.equal(saved.ok, true)
  assert.equal(saved.reason, "attached")
  assert.equal(persisted, 1)

  const empty = await captureEditorFoldState({
    saveJson: { cdpEndpoint: "wss://api.getsolari.com/cdp/x" },
    connectAndCapture: async () => ({ cookies: [{ name: "a", value: "1", domain: "x.com" }], origins: [] }),
  })
  assert.equal(empty.fold.reason, "capture-empty")
  const blockedEmpty = await persistCapturedEditorFold({
    handle: { profileId: "p1", name: "demo", handoffToken: "h" },
    captured: empty,
    persist: async () => {
      persisted += 1
      return { ok: true }
    },
  })
  assert.equal(blockedEmpty.ok, false)
  assert.equal(blockedEmpty.reason, "capture-empty")
  assert.equal(persisted, 1)
})

test("persistCapturedEditorFold maps 409 as persist-blocked", async () => {
  const captured = await captureEditorFoldState({
    saveJson: { wsEndpoint: "wss://api.getsolari.com/ws/live" },
    connectAndCapture: async () => ({
      cookies: [{ name: "sid", value: "1", domain: "consistencyhub.io" }],
      origins: [
        {
          origin: "https://consistencyhub.io",
          localStorage: [{ name: `${SESSION_STORAGE_PREFIX}accessToken`, value: "t" }],
        },
      ],
    }),
  })
  const blocked = await persistCapturedEditorFold({
    handle: { profileId: "p1", name: "consistencyhub", handoffToken: "h" },
    captured,
    persist: async () => ({ ok: false, error: "profile editor is open; close it, then --save-profile with the live session" }),
  })
  assert.equal(blocked.ok, false)
  assert.equal(blocked.reason, "persist-blocked")
  assert.match(blocked.error ?? "", /editor is open/)
})

test("stale and missing sessionStorage next remint or finalize-now and ban VWP", () => {
  const stale = weakSeedWarning("consistencyhub", { sessionStorage: 2, sessionStorageStale: true })
  assert.match(stale, /save-editor does not refresh folded sessionStorage/)
  assert.match(stale, /stale folded sessionStorage expiresOn/)
  assert.match(stale, new RegExp(DEAD_FOLD_VWP_BAN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(stale, /claimOkProfile will not pass/)
  assert.match(stale, /Remint now/)
  assert.match(stale, /finalize-login now only if the live editor/)
  assert.match(remintLoginGuidance("consistencyhub"), /auspex login --profile consistencyhub/)

  const missing = weakSeedWarning("consistencyhub", { sessionStorage: 0 })
  assert.match(missing, /Finalize-login NOW/)
  assert.match(missing, /while the token is live/)
  assert.match(missing, /claimOkProfile will not pass/)
  assert.match(missing, /finalize-login/)
  assert.match(missing, /Remint auspex_login if finalize-login returns needsHuman/)
  assert.equal(missing.includes("Run auspex check"), false)
})

test("overlaySaveEditorNext is loud when editorSave fails or editorFold misses", () => {
  assert.equal(saveEditorMissedFold({}), false)
  assert.equal(saveEditorMissedFold({ editorFold: { ok: true, reason: "attached" } }), false)
  assert.equal(saveEditorMissedFold({ editorSave: { ok: false, status: 401, error: "Unauthorized" } }), true)
  assert.equal(saveEditorMissedFold({ editorFold: { ok: false, reason: "no-cdp" } }), true)

  const healthy = "Saved v20 with 74 cookies and 5 origins. Run auspex check with --profile consistencyhub"
  const failed = overlaySaveEditorNext({
    next: healthy,
    profile: "consistencyhub",
    editorSave: { ok: false, status: 401, error: "Unauthorized" },
  })
  assert.equal(failed.includes("Run auspex check"), false)
  assert.match(failed, /editorSave failed \(401: Unauthorized\)/)
  assert.match(failed, /not proof this login saved/)
  assert.match(failed, /claimOkProfile will not pass/)
  assert.match(failed, /Remint now:/)
  assert.equal(/Finalize-login NOW/.test(failed), false)

  const noCdp = overlaySaveEditorNext({
    next: healthy,
    profile: "consistencyhub",
    editorSave: { ok: true, status: 200 },
    editorFold: { ok: false, reason: "no-cdp", error: EDITOR_FOLD_NO_CDP },
  })
  assert.equal(noCdp.includes("Run auspex check"), false)
  assert.match(noCdp, /editorFold\.no-cdp did not refresh folded sessionStorage/)
  assert.match(noCdp, /finalize-login/)

  const untouched = overlaySaveEditorNext({
    next: healthy,
    profile: "consistencyhub",
    editorSave: { ok: true, status: 200 },
    editorFold: { ok: true, reason: "attached" },
  })
  assert.equal(untouched, healthy)
})
