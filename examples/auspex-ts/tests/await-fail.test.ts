import assert from "node:assert/strict"
import test from "node:test"
import {
  boundEditorWork,
  editorSaveHungGuide,
  isBoundTimeoutMessage,
  isProfileBusyMessage,
  profileBusyAwaitGuide,
  remintLoginNextCall,
  STREAM_EXPIRED_STATUS,
  streamExpiredGuide,
} from "../src/await-fail.ts"
import { ProfileBusyError } from "../src/profile-lock.ts"

test("stream-expired guide remints auspex_login and is parseable", () => {
  const g = streamExpiredGuide("app-example")
  assert.match(g.text, /status stream-expired/)
  assert.match(g.text, /not loggedOut/)
  assert.match(g.text, /auspex login --profile app-example/)
  assert.equal(g.nextCall.tool, "auspex_login")
  assert.equal(g.nextCall.profile, "app-example")
  assert.equal(STREAM_EXPIRED_STATUS, "stream-expired")
  assert.deepEqual(remintLoginNextCall("app-example"), { tool: "auspex_login", profile: "app-example" })
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
