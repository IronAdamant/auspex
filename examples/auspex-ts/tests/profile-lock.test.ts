import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { ProfileBusyError, withProfileLock } from "../src/profile-lock.ts"

test("withProfileLock does not steal a lock that is still being written", async () => {
  const { utimesSync } = await import("node:fs")
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-lock-"))
  // Another process has created the lock file but not yet written its PID.
  writeFileSync(path.join(dir, "fresh.lock"), "")
  await assert.rejects(() => withProfileLock("fresh", async () => "stolen", { lockDir: dir }), ProfileBusyError)
  // An empty lock left behind long ago (a crash between create and write) is still stolen.
  const old = new Date(Date.now() - 60_000)
  utimesSync(path.join(dir, "fresh.lock"), old, old)
  assert.equal(await withProfileLock("fresh", async () => "ok", { lockDir: dir }), "ok")
})

test("a lock held by a live process of another user (EPERM) is not stolen", async (t) => {
  if (process.platform === "win32") return t.skip("no pid 1 on Windows")
  const { pidAlive } = await import("../src/session-ledger.ts")
  // pid 1 (init/launchd) always exists; a normal user gets EPERM for it, root gets success.
  assert.equal(pidAlive(1), true)
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-lock-"))
  writeFileSync(path.join(dir, "held.lock"), "1\n0\n")
  await assert.rejects(() => withProfileLock("held", async () => "stolen", { lockDir: dir }), ProfileBusyError)
})
