import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { ProfileBusyError, lockFileName, profileLockHeld, withProfileLock } from "../src/profile-lock.ts"

test("withProfileLock fails closed when a second agent holds the same profile", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-lock-"))
  let inside = 0
  const first = withProfileLock(
    "consistencyhub",
    async () => {
      inside += 1
      await new Promise((r) => setTimeout(r, 120))
      inside -= 1
      return "held"
    },
    { lockDir: dir },
  )
  const lockPath = path.join(dir, lockFileName("consistencyhub"))
  const start = Date.now()
  while (!(await profileLockHeld(lockPath)) && Date.now() - start < 1000) {
    await new Promise((r) => setTimeout(r, 5))
  }
  assert.equal(await profileLockHeld(lockPath), true)
  await assert.rejects(
    () => withProfileLock("consistencyhub", async () => "second", { lockDir: dir }),
    (err: unknown) => {
      assert.ok(err instanceof ProfileBusyError)
      assert.equal(err.code, "ProfileBusy")
      assert.match(err.message, /locked|busy/i)
      return true
    },
  )
  assert.equal(await first, "held")
  assert.equal(inside, 0)
})

test("withProfileLock allows two different profile names at once", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-lock-"))
  const [a, b] = await Promise.all([
    withProfileLock("alpha", async () => "a", { lockDir: dir }),
    withProfileLock("beta", async () => "b", { lockDir: dir }),
  ])
  assert.equal(a, "a")
  assert.equal(b, "b")
})

test("withProfileLock steals a lock whose PID is dead", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-lock-"))
  writeFileSync(path.join(dir, "stale.lock"), "999999999\n0\n")
  const value = await withProfileLock("stale", async () => "ok", { lockDir: dir })
  assert.equal(value, "ok")
})
