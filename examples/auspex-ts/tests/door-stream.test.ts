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
import { cookieHostIsIdp } from "../src/login-trace.ts"

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
      attempts?: number,
      maxAttempts?: number,
    ) => string
    pageHostIsIdp: (host: string) => boolean
    idpWallVisible: (text: string) => boolean
    IDP_WALL_TEXT: string
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
  assert.equal(Door.doorStreamDisconnectAction(false, false, 3), "reconnect")
  assert.equal(
    doorStreamDisconnectAction({ streamExpired: false, pageHidden: true, reconnectAttempts: 1 }),
    "pause",
  )
  assert.equal(Door.imeAutocomplete(false, false), imeAutocomplete({ bulletsOn: false }))
  assert.equal(Door.imeAutocomplete(false, true), imeAutocomplete({ bulletsOn: false, otpOn: true }))
  assert.equal(Door.imeInputType(true), imeInputType(true))
  assert.equal(JSON.stringify(Door).includes("off"), false)
  assert.equal("bindPreviewZoom" in Door, false)
  assert.match(Door.IDP_WALL_TEXT, /Finish sign-in, reach the app, then Save/)
  assert.equal(Door.IDP_WALL_TEXT.includes("logged in"), false)
})

test("door IdP host list matches cookieHostIsIdp and hides only off the wall", () => {
  const Door = loadDoorStream()
  const hosts = [
    "live.com",
    "login.live.com",
    "login.microsoft.com",
    "login.microsoftonline.com",
    "accounts.google.com",
    "onedrive.live.com",
    "consistencyhub.io",
  ]
  for (const host of hosts) {
    assert.equal(Door.pageHostIsIdp(host), cookieHostIsIdp(host), host)
  }
  assert.equal(Door.idpWallVisible(""), true)
  assert.equal(Door.idpWallVisible("https://login.microsoftonline.com/common"), true)
  assert.equal(Door.idpWallVisible("https://accounts.google.com/o/oauth2/v2/auth"), true)
  assert.equal(Door.idpWallVisible("https://onedrive.live.com/"), false)
  assert.equal(Door.idpWallVisible("https://consistencyhub.io/app"), false)
  const phone = readFileSync(path.join(repo, "docs", "phone.html"), "utf8")
  const desktop = readFileSync(path.join(repo, "docs", "desktop.html"), "utf8")
  assert.match(phone, /id="idpWall"/)
  assert.match(desktop, /id="idpWall"/)
  assert.match(phone, /Finish sign-in, reach the app, then Save/)
  assert.match(desktop, /noteRemoteSurface/)
  assert.match(phone, /if \(fromHash\) return fromHash/)
  assert.match(desktop, /if \(fromHash\) return fromHash/)
})
