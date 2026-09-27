import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  boundEditorWork,
  editorSaveHungGuide,
  isBoundTimeoutMessage,
  isEditorSaveInfraStatus,
  isProfileBusyMessage,
  profileBusyAwaitGuide,
  profileSaveWaitTimeoutMs,
  STREAM_EXPIRED_STATUS,
  STREAM_EXPIRED_WAIT_MS,
  streamExpiredGuide,
} from "../src/await-fail.ts"
import { remintLoginNextCall } from "../src/next-call.ts"
import { ProfileBusyError } from "../src/profile-lock.ts"

test("stream-expired guide remints auspex_login and is parseable", () => {
  const g = streamExpiredGuide("app-example")
  assert.match(g.text, /status stream-expired/)
  assert.match(g.text, /not loggedOut/)
  assert.match(g.text, /or a Solari 502/)
  assert.match(g.text, /Remint now: npx auspex login --profile app-example/)
  assert.equal(/ignore this remint/i.test(g.text), false)
  assert.equal(/finalize-login instead/i.test(g.text), false)
  assert.equal(g.nextCall.tool, "auspex_login")
  assert.equal(g.nextCall.profile, "app-example")
  assert.equal(STREAM_EXPIRED_STATUS, "stream-expired")
  assert.deepEqual(g.nextCall, remintLoginNextCall("app-example"))
})

test("completed editorSave 5xx caps the jar poll and does not mark the stream expired", () => {
  const full = 1_800_000
  for (const status of [502, 503, 504]) {
    assert.equal(isEditorSaveInfraStatus(status), true)
    const capped = profileSaveWaitTimeoutMs({
      timeoutMs: full,
      streamExpired: false,
      editorHung: false,
      editorSaveInfra5xx: true,
      preflight: "proceed",
      streamWaitTimeoutMs: full,
    })
    assert.equal(capped, STREAM_EXPIRED_WAIT_MS)
    assert.ok((capped ?? 0) < 60_000)
    const guide = streamExpiredGuide("app-example", { editorSaveStatus: status })
    assert.equal(/or a Solari 502/i.test(guide.text), false)
    assert.equal(/not a Solari 502/i.test(guide.text), false)
    assert.equal(/not a Solari 5\d\d/i.test(guide.text), false)
    assert.match(guide.text, new RegExp(`editorSave returned Solari ${status}`))
    assert.match(guide.text, /That status stands/)
  }
  assert.equal(isEditorSaveInfraStatus(200), false)
  assert.equal(isEditorSaveInfraStatus(401), false)
  assert.equal(isEditorSaveInfraStatus(409), false)
  assert.equal(isEditorSaveInfraStatus(0), false)
})

test("editorSave.ok keeps the full poll and the 409 path keeps the short cap", () => {
  const full = 1_800_000
  assert.equal(
    profileSaveWaitTimeoutMs({
      timeoutMs: full,
      streamExpired: false,
      editorHung: false,
      editorSaveInfra5xx: false,
      preflight: "proceed",
      streamWaitTimeoutMs: full,
    }),
    full,
  )
  assert.equal(
    profileSaveWaitTimeoutMs({
      streamExpired: false,
      editorHung: false,
      editorSaveInfra5xx: false,
      preflight: "low",
      streamWaitTimeoutMs: 90_000,
    }),
    90_000,
  )
  assert.equal(
    profileSaveWaitTimeoutMs({
      timeoutMs: full,
      streamExpired: true,
      editorHung: false,
      editorSaveInfra5xx: false,
      preflight: "proceed",
      streamWaitTimeoutMs: full,
    }),
    STREAM_EXPIRED_WAIT_MS,
  )
  assert.equal(
    profileSaveWaitTimeoutMs({
      timeoutMs: 2_000,
      streamExpired: false,
      editorHung: false,
      editorSaveInfra5xx: true,
      preflight: "proceed",
      streamWaitTimeoutMs: full,
    }),
    2_000,
  )
})

test("live await uses the 5xx cap and does not set streamExpired from that status", () => {
  const src = readFileSync(new URL("../src/profile-persist.ts", import.meta.url), "utf8")
  assert.match(src, /editorSaveInfra5xx/)
  assert.match(src, /profileSaveWaitTimeoutMs\(\{/)
  assert.match(src, /Do not set streamExpired from that status/)
  assert.equal(/isEditorSaveInfraStatus\([\s\S]{0,120}streamExpired\s*=\s*true/.test(src), false)
})

test("editor-save-hung and profile-busy do not point at finalize-login", () => {
  const hung = editorSaveHungGuide("app-example")
  assert.match(hung.text, /status editor-save-hung/)
  assert.match(hung.text, /Do not run finalize-login in parallel/)
  assert.equal(hung.nextCall.tool, "auspex_await_login")
  assert.equal(hung.nextCall.saveEditor, true)
  const busy = profileBusyAwaitGuide("app-example")
  assert.match(busy.text, /status profile-busy/)
  assert.match(busy.text, /Do not start a second finalize-login/)
  assert.equal(busy.nextCall.tool, "auspex_await_login")
})

test("boundEditorWork maps timeout to hung and rethrows other errors", async () => {
  const hung = await boundEditorWork(
    () => new Promise(() => undefined),
    20,
    "editorSave timed out after 20ms",
  )
  assert.equal(hung.ok, false)
  if (!hung.ok) {
    assert.equal(hung.hung, true)
    assert.match(hung.error, /timed out after/)
    assert.equal(isBoundTimeoutMessage(hung.error), true)
  }
  const ok = await boundEditorWork(async () => 7, 50, "nope")
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(ok.value, 7)
  await assert.rejects(
    () => boundEditorWork(async () => {
      throw new Error("editor 503")
    }, 50, "timed out after 50ms"),
    /editor 503/,
  )
})

test("isProfileBusyMessage matches ProfileBusyError", () => {
  const err = new ProfileBusyError("app-example")
  assert.equal(isProfileBusyMessage(err.message), true)
  assert.equal(isProfileBusyMessage("connect-failed"), false)
})
