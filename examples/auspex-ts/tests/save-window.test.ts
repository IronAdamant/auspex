import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import {
  editorSaveForReceipt,
  editorSaveHttpProgress,
  isNotSavableConflict,
  saveEditorWithNotSavableReuse,
} from "../src/editor-save-attempt.ts"
import { enableLiveLineBuffer, writeLiveLine } from "../src/line-buffer.ts"
import { saveDrainDir, signalSaveDrain } from "../src/save-drain.ts"
import { postEditorSaveWhenSignaled, waitForSaveSignal } from "../src/signaled-editor-save.ts"

const NOT_SAVABLE = { ok: false, status: 409, error: "profile is not in a savable state" }
/** Exact Solari editor/save 409 body from live dogfood. */
const SOLARI_NOT_SAVABLE = "The editor isn't in a savable state."

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "auspex-save-window-"))
}

test("isNotSavableConflict matches only that 409 phrase", () => {
  assert.equal(isNotSavableConflict(409, "not in a savable state"), true)
  assert.equal(isNotSavableConflict(409, "Editor is NOT in a savable state right now"), true)
  assert.equal(isNotSavableConflict(409, "profile is not in a savable state"), true)
  assert.equal(isNotSavableConflict(409, SOLARI_NOT_SAVABLE), true)
  assert.equal(isNotSavableConflict(409, "The editor isn’t in a savable state."), true)
  assert.equal(isNotSavableConflict(409, "editor already running"), false)
  assert.equal(isNotSavableConflict(409, "editor is open"), false)
  assert.equal(isNotSavableConflict(409, "The editor isn't ready"), false)
  assert.equal(isNotSavableConflict(409, "not savable"), false)
  assert.equal(isNotSavableConflict(409, "cannot in a savable state"), false)
  assert.equal(isNotSavableConflict(502, "not in a savable state"), false)
  assert.equal(isNotSavableConflict(502, SOLARI_NOT_SAVABLE), false)
  assert.equal(isNotSavableConflict(401, "not in a savable state"), false)
})

test("Solari 409 isn't stays fail-closed when the token is gone or the retry fails", async () => {
  let goneSaves = 0
  const gone = await saveEditorWithNotSavableReuse({
    save: async () => {
      goneSaves += 1
      return { ok: false, status: 409, error: SOLARI_NOT_SAVABLE }
    },
    editorStillLive: async () => false,
  })
  assert.equal(goneSaves, 1)
  assert.equal(gone.ok, false)
  assert.equal(gone.notSavableExhausted, true)
  assert.equal(gone.tokenReuse, false)
  assert.equal(gone.error, SOLARI_NOT_SAVABLE)
  assert.deepEqual(editorSaveForReceipt(gone), {
    ok: false,
    status: 409,
    error: SOLARI_NOT_SAVABLE,
    notSavableExhausted: true,
    tokenReuse: false,
  })

  let retrySaves = 0
  const retry = await saveEditorWithNotSavableReuse({
    save: async () => {
      retrySaves += 1
      return { ok: false, status: 409, error: SOLARI_NOT_SAVABLE }
    },
    editorStillLive: async () => true,
  })
  assert.equal(retrySaves, 2)
  assert.equal(retry.ok, false)
  assert.equal(retry.notSavableExhausted, true)
  assert.equal(retry.tokenReuse, true)
  assert.equal(retry.error, SOLARI_NOT_SAVABLE)
  assert.deepEqual(editorSaveForReceipt(retry), {
    ok: false,
    status: 409,
    error: SOLARI_NOT_SAVABLE,
    notSavableExhausted: true,
    tokenReuse: true,
  })
})

test("a second not-savable save is exhausted", async () => {
  let saves = 0
  const saved = await saveEditorWithNotSavableReuse({
    save: async () => {
      saves += 1
      return NOT_SAVABLE
    },
    editorStillLive: async () => true,
  })
  assert.equal(saves, 2)
  assert.equal(saved.ok, false)
  assert.equal(saved.notSavableExhausted, true)
  assert.equal(saved.tokenReuse, true)
})

test("a hung save is not a savable-state retry", async () => {
  let liveChecks = 0
  const first = await saveEditorWithNotSavableReuse({
    save: async () => ({ ok: false, status: 0, error: "editorSave timed out", hung: true }),
    editorStillLive: async () => {
      liveChecks += 1
      return true
    },
  })
  assert.equal(liveChecks, 0)
  assert.equal(first.notSavableExhausted, undefined)
  assert.equal(first.hung, true)

  const second = await saveEditorWithNotSavableReuse({
    save: async () => {
      liveChecks += 1
      if (liveChecks === 1) return NOT_SAVABLE
      return { ok: false, status: 0, error: "editorSave timed out", hung: true }
    },
    editorStillLive: async () => true,
  })
  assert.equal(second.hung, true)
  assert.equal(second.tokenReuse, true)
  assert.equal(second.notSavableExhausted, undefined)
  assert.equal(second.ok, false)
})

test("a second Solari 5xx on the retry stands; it is still not stream-expired", async () => {
  let saves = 0
  const phases: string[] = []
  const saved = await saveEditorWithNotSavableReuse({
    save: async () => {
      saves += 1
      return { ok: false, status: 502, error: "Failed to export storageState" }
    },
    editorStillLive: async () => true,
    sleep: async () => undefined,
    onProgress: (phase) => {
      phases.push(phase)
    },
  })
  assert.equal(saves, 2, "one retry, never a loop")
  assert.equal(saved.ok, false)
  assert.equal(saved.status, 502)
  assert.equal(saved.retriedAfter, 502)
  assert.equal(saved.notSavableExhausted, undefined)
  assert.equal(
    phases.at(-1),
    "await: editor/save 502 Failed to export storageState. POST finished. Solari status stands. Short jar poll. Not a 30-minute wait.",
  )
})

test("other failures do not ask for a new editor token or save again", async () => {
  for (const first of [
    { ok: false, status: 413, error: "Payload Too Large" },
    { ok: false, status: 0, error: "editorSave timed out after 30000ms", hung: true },
  ]) {
    let liveChecks = 0
    let saves = 0
    const saved = await saveEditorWithNotSavableReuse({
      save: async () => {
        saves += 1
        return first
      },
      editorStillLive: async () => {
        liveChecks += 1
        return true
      },
      sleep: async () => undefined,
    })
    assert.equal(liveChecks, 0, first.error)
    assert.equal(saves, 1, first.error)
    assert.equal(saved.status, first.status)
    assert.equal(saved.retriedAfter, undefined)
  }
  assert.equal(
    editorSaveHttpProgress({ ok: false, status: 502, error: "Failed to export storageState" }),
    "await: editor/save 502 Failed to export storageState. POST finished. Solari status stands. Short jar poll. Not a 30-minute wait.",
  )
  assert.equal(editorSaveHttpProgress({ ok: true, status: 200 }), undefined)
  assert.equal(editorSaveHttpProgress({ ok: false, status: 0, error: "timed out", hung: true }), undefined)
  assert.equal(editorSaveHttpProgress({ ok: false, status: 409, error: SOLARI_NOT_SAVABLE }), undefined)
})

test("waitForSaveSignal returns drain, version, expiry, or timeout", async () => {
  let now = 1_000_000
  const base = {
    sinceVersion: 2,
    now: () => now,
    sleep: async (ms: number) => {
      now += ms
    },
    pollMs: 1_000,
    readVersion: async () => 2,
    consumeDrain: async () => false,
    streamExpiresAt: new Date(now + 60_000).toISOString(),
    deadlineMs: now + 10_000,
  }
  now = 1_000_000
  assert.equal(
    await waitForSaveSignal({ ...base, consumeDrain: async () => true }),
    "drain",
  )
  assert.equal(await waitForSaveSignal({ ...base, readVersion: async () => 3 }), "version")
  assert.equal(
    await waitForSaveSignal({
      ...base,
      streamExpiresAt: new Date(now - 1_000).toISOString(),
    }),
    "expired",
  )
  assert.equal(await waitForSaveSignal({ ...base, deadlineMs: now }), "timeout")
})

test("a paste with no waiter POSTs editor/save immediately", async () => {
  const root = await tempRoot()
  let saves = 0
  try {
    const outcome = await postEditorSaveWhenSignaled({
      profile: "app-example",
      sinceVersion: 1,
      waitForSaveSignal: false,
      deadlineMs: Date.now() + 60_000,
      readVersion: async () => 1,
      save: async () => {
        saves += 1
        return { ok: true, status: 200 }
      },
      editorStillLive: async () => false,
      drainRoot: root,
    })
    assert.equal(outcome.mode, "posted")
    assert.equal(saves, 1)
    assert.equal(outcome.editorSave?.ok, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("the waiter POSTs when the paste arrives and ignores a stale signal", async () => {
  const root = await tempRoot()
  let saves = 0
  let now = 5_000_000
  try {
    await signalSaveDrain("app-example", root, "stale")
    const stale = await postEditorSaveWhenSignaled({
      profile: "app-example",
      sinceVersion: 4,
      waitForSaveSignal: true,
      streamExpiresAt: new Date(now + 120_000).toISOString(),
      deadlineMs: now + 3_000,
      now: () => now,
      sleep: async (ms: number) => {
        now += ms
      },
      pollMs: 1_000,
      readVersion: async () => 4,
      save: async () => {
        saves += 1
        return { ok: true, status: 200 }
      },
      editorStillLive: async () => false,
      drainRoot: root,
    })
    assert.equal(stale.mode, "expired-before-save")
    assert.equal(saves, 0)

    now = 5_000_000
    let signaled = false
    const posted = await postEditorSaveWhenSignaled({
      profile: "app-example",
      sinceVersion: 4,
      waitForSaveSignal: true,
      streamExpiresAt: new Date(now + 120_000).toISOString(),
      deadlineMs: now + 30_000,
      now: () => now,
      sleep: async (ms: number) => {
        if (!signaled) {
          signaled = true
          await signalSaveDrain("app-example", root, "paste")
        }
        now += ms
      },
      pollMs: 1_000,
      readVersion: async () => 4,
      save: async () => {
        saves += 1
        return { ok: true, status: 201 }
      },
      editorStillLive: async () => false,
      drainRoot: root,
    })
    assert.equal(posted.mode, "posted")
    assert.equal(saves, 1)
    assert.equal(posted.editorSave?.status, 201)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("expiry before Save does not POST", async () => {
  const root = await tempRoot()
  let saves = 0
  const now = 8_000_000
  try {
    const outcome = await postEditorSaveWhenSignaled({
      profile: "app-example",
      sinceVersion: 1,
      waitForSaveSignal: true,
      streamExpiresAt: new Date(now - 5_000).toISOString(),
      deadlineMs: now + 60_000,
      now: () => now,
      sleep: async () => undefined,
      readVersion: async () => 2,
      save: async () => {
        saves += 1
        return { ok: true, status: 200 }
      },
      editorStillLive: async () => true,
      drainRoot: root,
    })
    assert.equal(outcome.mode, "expired-before-save")
    assert.equal(saves, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("line buffer flushes a newline and tolerates a missing handle", () => {
  const chunks: string[] = []
  let blocking: boolean | undefined
  const stream = {
    write(line: string) {
      chunks.push(line)
      return true
    },
    _handle: {
      setBlocking(value: boolean) {
        blocking = value
      },
    },
  }
  enableLiveLineBuffer(stream as unknown as NodeJS.WritableStream)
  assert.equal(blocking, true)
  writeLiveLine(stream as unknown as NodeJS.WritableStream, "await: waiting")
  writeLiveLine(stream as unknown as NodeJS.WritableStream, "await: again\n")
  assert.deepEqual(chunks, ["await: waiting\n", "await: again\n"])

  const bare = {
    write(line: string) {
      chunks.push(line)
      return true
    },
  }
  enableLiveLineBuffer(bare as unknown as NodeJS.WritableStream)
  writeLiveLine(bare as unknown as NodeJS.WritableStream, "ok")
  assert.equal(chunks.at(-1), "ok\n")
})

test("claimSaveOwner does not take a save lock whose owner is still writing it", async () => {
  const { claimSaveOwner } = await import("../src/save-drain.ts")
  const { utimes } = await import("node:fs/promises")
  const root = await mkdtemp(path.join(tmpdir(), "auspex-save-lock-"))
  const dir = saveDrainDir(root)
  await mkdir(dir, { recursive: true })
  const lock = path.join(dir, "app-example.save.lock")
  // Another process created the lock but has not written its PID yet.
  await writeFile(lock, "")
  const claim = await claimSaveOwner("app-example", root)
  assert.equal(claim.ok, false)
  // Left behind long ago: taken over.
  const old = new Date(Date.now() - 60_000)
  await utimes(lock, old, old)
  const later = await claimSaveOwner("app-example", root)
  assert.equal(later.ok, true)
  if (later.ok) await later.release()
  await rm(root, { recursive: true, force: true })
})

test("connect prints the command for this install (clone: npx auspex)", async () => {
  const { cliCommand } = await import("../src/paths.ts")
  assert.equal(cliCommand("/Users/x/code/auspex/examples/auspex-ts"), "npx auspex")
  assert.equal(cliCommand("/Users/x/.npm/_npx/abc/node_modules/auspex-solari/examples/auspex-ts"), "npx auspex-solari")
})
