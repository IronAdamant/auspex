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

test("30-minute desktop idle keeps a fresh use, wipes at 30 minutes, and leaves a newer profile", () => {
  assert.equal(OPERATOR_IDLE_MS, 30 * MIN)
  const fresh = decideOperatorSession({
    profiles: [
      {
        profile: "supabase-com",
        site: "https://supabase.com/dashboard",
        lastUsedMs: T0,
        username: USERNAME,
        password: PASSWORD,
        solariKey: SOLARI_KEY,
      },
    ],
    nowMs: T0 + 4 * MIN,
    humanAgree: false,
    voluntary: ["supabase-com"],
    username: USERNAME,
    password: PASSWORD,
    solariKey: SOLARI_KEY,
  })
  assert.deepEqual(fresh.wipe, [])

  const expired = decideOperatorSession({
    profiles: [
      {
        profile: "supabase-com",
        site: "https://supabase.com/dashboard",
        lastUsedMs: T0,
        username: USERNAME,
        password: PASSWORD,
        solariKey: SOLARI_KEY,
      },
      {
        profile: "appwrite-io",
        site: "https://appwrite.io/",
        lastUsedMs: T0 + 29 * MIN,
        username: USERNAME,
        password: PASSWORD,
        solariKey: SOLARI_KEY,
      },
    ],
    nowMs: T0 + 30 * MIN,
    humanAgree: false,
    username: USERNAME,
    password: PASSWORD,
    solariKey: SOLARI_KEY,
  })
  assert.deepEqual(expired.wipe, ["supabase-com"])
  assert.equal(expired.wipe.includes("appwrite-io"), false)

  const busy = decideOperatorSession({
    profiles: [
      {
        profile: "supabase-com",
        site: "https://supabase.com/dashboard",
        lastUsedMs: T0,
        inUse: true,
        password: PASSWORD,
      },
    ],
    nowMs: T0 + 30 * MIN,
    humanAgree: false,
  })
  assert.deepEqual(busy.wipe, [])
})

test("voluntary purge is selected only when the human agrees, and the agent object stays redacted", () => {
  const shared = {
    profiles: [
      {
        profile: "console-neon-tech",
        site: "https://console.neon.tech",
        lastUsedMs: T0 + 4 * MIN,
        username: USERNAME,
        password: PASSWORD,
        solariKey: SOLARI_KEY,
      },
    ],
    nowMs: T0 + 4 * MIN,
    voluntary: ["console-neon-tech"],
    username: USERNAME,
    password: PASSWORD,
    solariKey: SOLARI_KEY,
  }
  const declined = decideOperatorSession({ ...shared, humanAgree: false })
  assert.deepEqual(declined.wipe, [])

  const agreed = decideOperatorSession({ ...shared, humanAgree: true })
  assert.deepEqual(agreed.wipe, ["console-neon-tech"])
  assert.equal(agreed.agent.question, OPERATOR_PURGE_QUESTION)
  assert.match(agreed.agent.question, /testing is done/)
  assert.match(agreed.agent.question, /purged/)
  assert.match(agreed.agent.question, /30 minutes/)
  assert.match(agreed.agent.question, /not included in the agent message/)
  assert.match(agreed.agent.question, /next Auspex command/)
  assert.match(agreed.agent.question, /not that wipe/)
  assert.equal(agreed.agent.question.includes("stay in the local page fields only"), false)
  assert.equal(agreed.agent.idleMinutes, 30)
  assert.deepEqual(agreed.agent.sites, [
    { site: "https://console.neon.tech", profile: "console-neon-tech" },
  ])
  const blob = JSON.stringify(agreed.agent)
  assert.equal(blob.includes(USERNAME), false)
  assert.equal(blob.includes(PASSWORD), false)
  assert.equal(blob.includes(SOLARI_KEY), false)
  assert.equal("username" in agreed.agent, false)
  assert.equal("password" in agreed.agent, false)
  assert.equal("solariKey" in agreed.agent, false)
})

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
  assert.deepEqual(wiped, ["supabase-com"])
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

test("phone QR list lasts 10 minutes and carries site and profile only", () => {
  assert.equal(PHONE_LIST_MS, 10 * MIN)
  const packed = phoneSavedParams(
    [
      {
        profile: "socialaize-com",
        site: "https://socialaize.com/login",
        username: USERNAME,
        password: PASSWORD,
      },
    ],
    T0,
  )
  assert.equal(packed.plist, String(Math.floor(T0 / 1000) + 10 * 60))
  const rows = decodePhoneSavedList(packed.saved ?? "")
  assert.deepEqual(rows, [{ site: "https://socialaize.com/login", profile: "socialaize-com" }])
  const blob = JSON.stringify(packed)
  assert.equal(blob.includes(USERNAME), false)
  assert.equal(blob.includes(PASSWORD), false)
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
