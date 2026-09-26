import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import {
  isNotSavableConflict,
  saveEditorWithNotSavableReuse,
} from "../src/editor-save-attempt.ts"
import { enableLiveLineBuffer, writeLiveLine } from "../src/line-buffer.ts"
import { clearSaveOwner, saveDrainDir, siblingSavedNext, signalSaveDrain } from "../src/save-drain.ts"
import { postEditorSaveWhenSignaled, waitForSaveSignal } from "../src/signaled-editor-save.ts"

const NOT_SAVABLE = { ok: false, status: 409, error: "profile is not in a savable state" }

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "auspex-save-window-"))
}

test("isNotSavableConflict matches only that 409 phrase", () => {
  assert.equal(isNotSavableConflict(409, "not in a savable state"), true)
  assert.equal(isNotSavableConflict(409, "Editor is NOT in a savable state right now"), true)
  assert.equal(isNotSavableConflict(409, "editor already running"), false)
  assert.equal(isNotSavableConflict(409, "editor is open"), false)
  assert.equal(isNotSavableConflict(502, "not in a savable state"), false)
  assert.equal(isNotSavableConflict(401, "not in a savable state"), false)
})

test("409 not-savable reuses one live token then saves again", async () => {
  let saves = 0
  let liveChecks = 0
  const saved = await saveEditorWithNotSavableReuse({
    save: async () => {
      saves += 1
      return saves === 1 ? NOT_SAVABLE : { ok: true, status: 200 }
    },
    editorStillLive: async () => {
      liveChecks += 1
      return true
    },
  })
  assert.equal(saves, 2)
  assert.equal(liveChecks, 1)
  assert.equal(saved.ok, true)
  assert.equal(saved.tokenReuse, true)
  assert.equal(saved.notSavableExhausted, undefined)
})

test("a missing editor token does not claim a save", async () => {
  let saves = 0
  const saved = await saveEditorWithNotSavableReuse({
    save: async () => {
      saves += 1
      return NOT_SAVABLE
    },
    editorStillLive: async () => false,
  })
  assert.equal(saves, 1)
  assert.equal(saved.ok, false)
  assert.equal(saved.notSavableExhausted, true)
  assert.equal(saved.tokenReuse, false)
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

test("other failures do not ask for a new editor token", async () => {
  let liveChecks = 0
  const saved = await saveEditorWithNotSavableReuse({
    save: async () => ({ ok: false, status: 502, error: "bad gateway" }),
    editorStillLive: async () => {
      liveChecks += 1
      return true
    },
  })
  assert.equal(liveChecks, 0)
  assert.equal(saved.status, 502)
  assert.equal(saved.notSavableExhausted, undefined)
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

test("a paste signals a live waiter and does not kill it or save", async () => {
  const root = await tempRoot()
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
  let saves = 0
  try {
    assert.ok(child.pid)
    const dir = saveDrainDir(root)
    await mkdir(dir, { recursive: true })
    await writeFile(
      path.join(dir, "app-example.waiter.json"),
      JSON.stringify({ pid: child.pid, profile: "app-example" }),
    )
    const outcome = await postEditorSaveWhenSignaled({
      profile: "app-example",
      sinceVersion: 1,
      waitForSaveSignal: false,
      deadlineMs: Date.now() + 60_000,
      readVersion: async () => 9,
      save: async () => {
        saves += 1
        return { ok: true, status: 200 }
      },
      editorStillLive: async () => true,
      drainRoot: root,
    })
    assert.equal(outcome.mode, "signaled-waiter")
    assert.match(outcome.next ?? "", /Do not kill/)
    assert.match(outcome.next ?? "", /Do not remint/)
    assert.equal(saves, 0)
    assert.equal(child.exitCode, null)
  } finally {
    child.kill()
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

test("a sibling that already saved is not stream-expired and does not POST", async () => {
  const root = await tempRoot()
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
  let saves = 0
  const now = 9_000_000
  try {
    assert.ok(child.pid)
    const dir = saveDrainDir(root)
    await mkdir(dir, { recursive: true })
    await writeFile(
      path.join(dir, "app-example.owner.json"),
      JSON.stringify({ pid: child.pid, profile: "app-example", phase: "saved", status: 200 }),
    )
    const outcome = await postEditorSaveWhenSignaled({
      profile: "app-example",
      sinceVersion: 1,
      waitForSaveSignal: true,
      streamExpiresAt: new Date(now - 5_000).toISOString(),
      deadlineMs: now + 60_000,
      now: () => now,
      sleep: async () => undefined,
      pollMs: 1_000,
      readVersion: async () => 8,
      save: async () => {
        saves += 1
        return { ok: true, status: 200 }
      },
      editorStillLive: async () => false,
      drainRoot: root,
    })
    assert.equal(outcome.mode, "sibling-saved")
    assert.equal(saves, 0)
    assert.match(outcome.next ?? "", /status sibling-saved/)
    assert.match(outcome.next ?? "", /Do not call this stream-expired/)
    assert.match(outcome.next ?? "", /Do not remint/)
    assert.match(outcome.next ?? "", /did not read the jar/)
    assert.equal(outcome.next, siblingSavedNext("app-example"))
  } finally {
    child.kill()
    await rm(root, { recursive: true, force: true })
  }
})

test("a paste does not POST when a sibling save is in flight", async () => {
  const root = await tempRoot()
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
  let saves = 0
  try {
    assert.ok(child.pid)
    const dir = saveDrainDir(root)
    await mkdir(dir, { recursive: true })
    await writeFile(
      path.join(dir, "app-example.owner.json"),
      JSON.stringify({ pid: child.pid, profile: "app-example", phase: "posting" }),
    )
    const outcome = await postEditorSaveWhenSignaled({
      profile: "app-example",
      sinceVersion: 1,
      waitForSaveSignal: false,
      deadlineMs: Date.now() + 60_000,
      readVersion: async () => 4,
      save: async () => {
        saves += 1
        return { ok: true, status: 200 }
      },
      editorStillLive: async () => true,
      drainRoot: root,
    })
    assert.equal(outcome.mode, "sibling-saved")
    assert.equal(saves, 0)
    assert.match(outcome.next ?? "", /Do not call this stream-expired/)
  } finally {
    child.kill()
    await rm(root, { recursive: true, force: true })
  }
})

test("the waiter yields when the sibling save appears before the token ends", async () => {
  const root = await tempRoot()
  let saves = 0
  let now = 6_000_000
  let noted = false
  try {
    const outcome = await postEditorSaveWhenSignaled({
      profile: "app-example",
      sinceVersion: 2,
      waitForSaveSignal: true,
      streamExpiresAt: new Date(now + 30_000).toISOString(),
      deadlineMs: now + 20_000,
      now: () => now,
      sleep: async (ms: number) => {
        if (!noted) {
          noted = true
          const dir = saveDrainDir(root)
          await mkdir(dir, { recursive: true })
          await writeFile(
            path.join(dir, "app-example.owner.json"),
            JSON.stringify({ pid: process.pid + 1, profile: "app-example", phase: "saved", status: 200 }),
          )
        }
        now += ms
      },
      pollMs: 1_000,
      readVersion: async () => 2,
      save: async () => {
        saves += 1
        return { ok: true, status: 200 }
      },
      editorStillLive: async () => false,
      drainRoot: root,
    })
    assert.equal(outcome.mode, "sibling-saved")
    assert.equal(saves, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("two concurrent paste paths POST editor/save once", async () => {
  const root = await tempRoot()
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let entered = 0
  try {
    const run = () =>
      postEditorSaveWhenSignaled({
        profile: "app-example",
        sinceVersion: 1,
        waitForSaveSignal: false,
        deadlineMs: Date.now() + 60_000,
        readVersion: async () => 1,
        save: async () => {
          entered += 1
          await gate
          return { ok: true, status: 200 }
        },
        editorStillLive: async () => false,
        drainRoot: root,
      })
    const left = run()
    const right = run()
    const first = await Promise.race([
      left.then((result) => ({ label: "left" as const, result })),
      right.then((result) => ({ label: "right" as const, result })),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("both saves blocked")), 2_000)),
    ])
    assert.equal(first.result.mode, "sibling-saved")
    const start = Date.now()
    while (entered < 1 && Date.now() - start < 1_000) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    assert.equal(entered, 1)
    release()
    const second = await (first.label === "left" ? right : left)
    assert.equal(second.mode, "posted")
    assert.equal(second.editorSave?.ok, true)
    assert.equal(entered, 1)
  } finally {
    release()
    await rm(root, { recursive: true, force: true })
  }
})

test("a failed save does not block a later POST, and a saved owner does until the next login clears it", async () => {
  const root = await tempRoot()
  let saves = 0
  const base = {
    profile: "app-example",
    sinceVersion: 1,
    waitForSaveSignal: false as const,
    deadlineMs: Date.now() + 60_000,
    readVersion: async () => 1,
    editorStillLive: async () => false,
    drainRoot: root,
  }
  try {
    const failed = await postEditorSaveWhenSignaled({
      ...base,
      save: async () => {
        saves += 1
        return NOT_SAVABLE
      },
    })
    assert.equal(failed.mode, "posted")
    assert.equal(failed.editorSave?.notSavableExhausted, true)
    assert.equal(saves, 1)

    const again = await postEditorSaveWhenSignaled({
      ...base,
      save: async () => {
        saves += 1
        return { ok: true, status: 200 }
      },
    })
    assert.equal(again.mode, "posted")
    assert.equal(saves, 2)

    const blocked = await postEditorSaveWhenSignaled({
      ...base,
      save: async () => {
        saves += 1
        return { ok: true, status: 200 }
      },
    })
    assert.equal(blocked.mode, "sibling-saved")
    assert.equal(saves, 2)

    await clearSaveOwner("app-example", root)
    const remint = await postEditorSaveWhenSignaled({
      ...base,
      save: async () => {
        saves += 1
        return { ok: true, status: 201 }
      },
    })
    assert.equal(remint.mode, "posted")
    assert.equal(remint.editorSave?.status, 201)
    assert.equal(saves, 3)
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
