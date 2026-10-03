import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import {
  OPERATOR_IDLE_MS,
  OPERATOR_PURGE_QUESTION,
  applyOperatorWipes,
  commitOperatorSession,
  voluntaryPurgeHonesty,
  noteAfterSignupWait,
  decideOperatorSession,
  decodePhoneSavedList,
  phoneSavedParams,
  PHONE_LIST_MS,
  operatorKeyIsPresent,
  readOperatorKey,
  SIGNUP_BUSY_MS,
  writeOperatorKey,
} from "../src/operator-session.ts"
import { applyOperatorKeyFile } from "../src/solari.ts"

const MIN = 60 * 1000
const T0 = 1_700_000_000_000
const USERNAME = "fixture-operator-username"
const PASSWORD = "fixture-operator-password"
const SOLARI_KEY = "slr_live_fixture_operator_key"

test("an agreed purge deletes a profile that has no local timer row yet", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "auspex-operator-new-"))
  const deleted: string[] = []
  const result = await commitOperatorSession({
    root,
    nowMs: T0,
    humanAgree: true,
    voluntary: ["appwrite-io"],
    applyWipes: async (names) => {
      deleted.push(...names)
      return names
    },
  })
  assert.deepEqual(result.wiped, ["appwrite-io"])
  assert.deepEqual(deleted, ["appwrite-io"])
  const declined = await commitOperatorSession({
    root,
    nowMs: T0,
    humanAgree: false,
    voluntary: ["console-neon-tech"],
    applyWipes: async (names) => names,
  })
  assert.deepEqual(declined.wiped, [])
  const blob = JSON.stringify(result.agent)
  assert.match(blob, /appwrite-io/)
  assert.equal(blob.includes(PASSWORD), false)
})

test("a check during signup keeps the busy window until signup ends", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "auspex-operator-busy-"))
  await commitOperatorSession({
    root,
    nowMs: T0,
    note: { profile: "supabase-com", site: "https://supabase.com/dashboard", busyMs: SIGNUP_BUSY_MS },
    applyWipes: async () => [],
  })
  const during = await commitOperatorSession({
    root,
    nowMs: T0 + MIN,
    note: { profile: "supabase-com", site: "https://supabase.com/dashboard" },
    applyWipes: async (names) => names,
  })
  assert.deepEqual(during.wiped, [])
  const stillBusy = await commitOperatorSession({
    root,
    nowMs: T0 + 7 * MIN,
    applyWipes: async (names) => names,
  })
  assert.deepEqual(stillBusy.wiped, [])
  const ended = await commitOperatorSession({
    root,
    nowMs: T0 + 7 * MIN,
    note: { profile: "supabase-com", clearBusy: true },
    applyWipes: async (names) => names,
  })
  assert.deepEqual(ended.wiped, [])
  const idle = await commitOperatorSession({
    root,
    nowMs: T0 + 37 * MIN,
    applyWipes: async (names) => names,
  })
  assert.deepEqual(idle.wiped, ["supabase-com"])
})

test("await-login timeout and empty-save keep the signup window; only completed clears it", async () => {
  for (const status of ["timeout", "empty-save", "waiting"] as const) {
    const root = mkdtempSync(path.join(tmpdir(), "auspex-operator-wait-"))
    await commitOperatorSession({
      root,
      nowMs: T0,
      note: { profile: "supabase-com", site: "https://supabase.com/dashboard", busyMs: SIGNUP_BUSY_MS },
      applyWipes: async () => [],
    })
    const afterWait = await commitOperatorSession({
      root,
      nowMs: T0 + 2 * MIN,
      note: noteAfterSignupWait({ profile: "supabase-com", status, site: "https://supabase.com/dashboard" }),
      applyWipes: async (names) => names,
    })
    assert.equal(afterWait.wiped.length, 0, status)
    const later = await commitOperatorSession({
      root,
      nowMs: T0 + 7 * MIN,
      applyWipes: async (names) => names,
    })
    assert.deepEqual(later.wiped, [], status)
  }
  const root = mkdtempSync(path.join(tmpdir(), "auspex-operator-done-"))
  await commitOperatorSession({
    root,
    nowMs: T0,
    note: { profile: "supabase-com", busyMs: SIGNUP_BUSY_MS },
    applyWipes: async () => [],
  })
  const done = await commitOperatorSession({
    root,
    nowMs: T0 + 2 * MIN,
    note: noteAfterSignupWait({ profile: "supabase-com", status: "completed" }),
    applyWipes: async (names) => names,
  })
  assert.deepEqual(done.wiped, [])
  const idle = await commitOperatorSession({
    root,
    nowMs: T0 + 32 * MIN,
    applyWipes: async (names) => names,
  })
  assert.deepEqual(idle.wiped, ["supabase-com"])
})

test("key presence reports yes or no and does not return the key", () => {
  const root = mkdtempSync(path.join(tmpdir(), "auspex-key-present-"))
  const prev = process.env.SOLARI_API_KEY
  delete process.env.SOLARI_API_KEY
  try {
    assert.equal(operatorKeyIsPresent(root), false)
    writeOperatorKey(root, SOLARI_KEY)
    assert.equal(operatorKeyIsPresent(root), true)
    assert.equal(readOperatorKey(path.join(root, ".auspex", "operator-key")), SOLARI_KEY)
  } finally {
    if (prev === undefined) delete process.env.SOLARI_API_KEY
    else process.env.SOLARI_API_KEY = prev
  }
})

test("operator-key file on the machine loads when env is empty", () => {
  const root = mkdtempSync(path.join(tmpdir(), "auspex-operator-file-"))
  const prev = process.env.SOLARI_API_KEY
  try {
    writeOperatorKey(root, SOLARI_KEY)
    delete process.env.SOLARI_API_KEY
    applyOperatorKeyFile(path.join(root, ".auspex", "operator-key"))
    assert.equal(process.env.SOLARI_API_KEY, SOLARI_KEY)
  } finally {
    if (prev === undefined) delete process.env.SOLARI_API_KEY
    else process.env.SOLARI_API_KEY = prev
  }
})

test("applyOperatorWipes deletes by profile id and does not take login secrets", async () => {
  const deleted: string[] = []
  const wiped = await applyOperatorWipes(["supabase-com"], {
    list: async () => [{ id: "prof_supabase", name: "supabase-com" }],
    deleteProfile: async (id) => {
      deleted.push(id)
    },
  })
  assert.deepEqual(wiped.wiped, ["supabase-com"])
  assert.deepEqual(wiped.wipeFailed, [])
  assert.deepEqual(deleted, ["prof_supabase"])
  assert.equal(deleted.includes(PASSWORD), false)
  assert.equal(deleted.includes(SOLARI_KEY), false)
})

test("commitOperatorSession wipes the idle profile through the delete path and stores no secrets", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "auspex-operator-"))
  const deleted: string[] = []
  await commitOperatorSession({
    root,
    nowMs: T0,
    note: { profile: "supabase-com", site: "https://supabase.com/dashboard" },
    applyWipes: async (names) => {
      deleted.push(...names)
      return names
    },
  })
  const kept = await commitOperatorSession({
    root,
    nowMs: T0 + 4 * MIN,
    humanAgree: false,
    voluntary: ["supabase-com"],
    applyWipes: async (names) => {
      deleted.push(...names)
      return names
    },
  })
  assert.deepEqual(kept.wiped, [])
  const expired = await commitOperatorSession({
    root,
    nowMs: T0 + 30 * MIN,
    humanAgree: false,
    applyWipes: async (names) => {
      deleted.push(...names)
      return names
    },
  })
  assert.deepEqual(expired.wiped, ["supabase-com"])
  assert.deepEqual(deleted, ["supabase-com"])
  const onDisk = readFileSync(path.join(root, ".auspex", "operator-session.json"), "utf8")
  assert.equal(onDisk.includes(USERNAME), false)
  assert.equal(onDisk.includes(PASSWORD), false)
  assert.equal(onDisk.includes(SOLARI_KEY), false)
  const notice = JSON.stringify(expired.agent)
  assert.match(notice, /testing is done/)
  assert.equal(notice.includes(PASSWORD), false)
})

test("writeOperatorKey stores the key under .auspex and the agent notice does not echo it", () => {
  const root = mkdtempSync(path.join(tmpdir(), "auspex-key-"))
  const file = writeOperatorKey(root, SOLARI_KEY)
  assert.equal(file, path.join(root, ".auspex", "operator-key"))
  assert.equal(statSync(file).mode & 0o777, 0o600)
  assert.equal(readOperatorKey(file), SOLARI_KEY)
  const decision = decideOperatorSession({
    profiles: [
      {
        profile: "dash-cloudflare-com",
        site: "https://dash.cloudflare.com/",
        lastUsedMs: T0,
        solariKey: SOLARI_KEY,
        password: PASSWORD,
        username: USERNAME,
      },
    ],
    nowMs: T0,
    humanAgree: true,
    voluntary: ["dash-cloudflare-com"],
    solariKey: SOLARI_KEY,
  })
  const blob = JSON.stringify(decision.agent)
  assert.equal(blob.includes(SOLARI_KEY), false)
  assert.match(blob, /dash-cloudflare-com/)
  assert.match(decision.agent.question, /purged/)
})

