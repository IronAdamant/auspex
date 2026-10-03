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

test("live await uses the 5xx cap and does not set streamExpired from that status", () => {
  const src = readFileSync(new URL("../src/profile-persist.ts", import.meta.url), "utf8")
  assert.match(src, /editorSaveInfra5xx/)
  assert.match(src, /editorSaveCompletedFailure/)
  assert.match(src, /profileSaveWaitTimeoutMs\(\{/)
  assert.match(src, /Do not set streamExpired from that HTTP status/)
  assert.equal(/isEditorSaveInfraStatus\([\s\S]{0,120}streamExpired\s*=\s*true/.test(src), false)
  assert.equal(/editorSaveCompletedFailure[\s\S]{0,80}streamExpired\s*=\s*true/.test(src), false)
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

