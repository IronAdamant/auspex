import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import vm from "node:vm"
import {
  DOOR_STREAM_MAX_RECONNECT,
  DOOR_STREAM_RECONNECT_GRACE_MS,
  doorStreamDisconnectAction,
  imeAutocomplete,
  imeInputType,
} from "../src/handoff-doors.ts"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

function loadDoorStream() {
  const code = readFileSync(path.join(repo, "docs", "door-stream.js"), "utf8")
  const context: Record<string, unknown> = {}
  context.window = context
  vm.runInNewContext(code, context, { filename: "door-stream.js" })
  return context.AuspexDoorStream as {
    MAX_RECONNECT: number
    RECONNECT_GRACE_MS: number
    doorStreamDisconnectAction: (
      expired: boolean,
      hidden: boolean,
      attempts: number,
      maxAttempts?: number,
    ) => string
    imeAutocomplete: (bulletsOn: boolean, otpOn?: boolean) => string
    imeInputType: (bulletsOn: boolean) => string
  }
}

test("docs/door-stream.js matches the TypeScript door helpers", () => {
  const Door = loadDoorStream()
  assert.equal(Door.MAX_RECONNECT, DOOR_STREAM_MAX_RECONNECT)
  assert.equal(Door.RECONNECT_GRACE_MS, DOOR_STREAM_RECONNECT_GRACE_MS)
  assert.equal(Door.doorStreamDisconnectAction(true, true, 0), "remint")
  assert.equal(Door.doorStreamDisconnectAction(false, true, 0), "pause")
  assert.equal(Door.doorStreamDisconnectAction(false, false, 0), "reconnect")
  assert.equal(Door.doorStreamDisconnectAction(false, false, 3), "remint")
  assert.equal(
    doorStreamDisconnectAction({ streamExpired: false, pageHidden: true, reconnectAttempts: 1 }),
    "pause",
  )
  assert.equal(Door.imeAutocomplete(false, false), imeAutocomplete({ bulletsOn: false }))
  assert.equal(Door.imeAutocomplete(false, true), imeAutocomplete({ bulletsOn: false, otpOn: true }))
  assert.equal(Door.imeInputType(true), imeInputType(true))
  assert.equal(JSON.stringify(Door).includes("off"), false)
})
