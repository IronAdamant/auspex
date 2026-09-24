import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import vm from "node:vm"
import {
  DOOR_STREAM_MAX_RECONNECT,
  DOOR_STREAM_RECONNECT_GRACE_MS,
  PREVIEW_ZOOM_DEFAULT,
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_STEP,
  clampPreviewZoom,
  doorStreamDisconnectAction,
  imeAutocomplete,
  imeInputType,
  nextPreviewZoom,
  previewZoomLabel,
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
    PREVIEW_ZOOM_MIN: number
    PREVIEW_ZOOM_MAX: number
    PREVIEW_ZOOM_STEP: number
    PREVIEW_ZOOM_DEFAULT: number
    clampPreviewZoom: (value: number) => number
    nextPreviewZoom: (current: number, direction: number) => number
    previewZoomLabel: (scale: number) => string
    bindPreviewZoom: (
      getLocked: () => boolean,
      viewport: { style: { setProperty: (name: string, value: string) => void } },
      zoomOut: { disabled: boolean; addEventListener: (type: string, fn: () => void) => void },
      zoomIn: { disabled: boolean; addEventListener: (type: string, fn: () => void) => void },
      zoomReset: { disabled: boolean; textContent: string; addEventListener: (type: string, fn: () => void) => void },
    ) => { get: () => number; apply: (next: number) => number }
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
  assert.equal(Door.PREVIEW_ZOOM_MIN, PREVIEW_ZOOM_MIN)
  assert.equal(Door.PREVIEW_ZOOM_MAX, PREVIEW_ZOOM_MAX)
  assert.equal(Door.PREVIEW_ZOOM_STEP, PREVIEW_ZOOM_STEP)
  assert.equal(Door.PREVIEW_ZOOM_DEFAULT, PREVIEW_ZOOM_DEFAULT)
  assert.equal(Door.clampPreviewZoom(1.4), clampPreviewZoom(1.4))
  assert.equal(Door.nextPreviewZoom(1, 1), nextPreviewZoom(1, 1))
  assert.equal(Door.previewZoomLabel(1.5), previewZoomLabel(1.5))
  assert.equal(JSON.stringify(Door).includes("off"), false)
})

test("preview zoom clamps locally and does not invent remote DPI", () => {
  assert.equal(clampPreviewZoom(Number.NaN), PREVIEW_ZOOM_DEFAULT)
  assert.equal(clampPreviewZoom(0), PREVIEW_ZOOM_MIN)
  assert.equal(clampPreviewZoom(9), PREVIEW_ZOOM_MAX)
  assert.equal(clampPreviewZoom(1.4), 1.5)
  assert.equal(nextPreviewZoom(1, 1), 1.25)
  assert.equal(nextPreviewZoom(1, -1), PREVIEW_ZOOM_MIN)
  assert.equal(nextPreviewZoom(PREVIEW_ZOOM_MAX, 1), PREVIEW_ZOOM_MAX)
  assert.equal(previewZoomLabel(1), "100%")
  assert.equal(previewZoomLabel(2.5), "250%")
  const Door = loadDoorStream()
  const props: Record<string, string> = {}
  const inClicks: Array<() => void> = []
  const outClicks: Array<() => void> = []
  const resetClicks: Array<() => void> = []
  const viewport = { style: { setProperty(name: string, value: string) { props[name] = value } } }
  const zoomOut = { disabled: false, addEventListener(_type: string, fn: () => void) { outClicks.push(fn) } }
  const zoomIn = { disabled: false, addEventListener(_type: string, fn: () => void) { inClicks.push(fn) } }
  const zoomReset = {
    disabled: false,
    textContent: "100%",
    addEventListener(_type: string, fn: () => void) { resetClicks.push(fn) },
  }
  let locked = false
  const live = Door.bindPreviewZoom(() => locked, viewport, zoomOut, zoomIn, zoomReset)
  assert.equal(live.get(), 1)
  assert.equal(props["--preview-zoom"], "1")
  assert.equal(zoomReset.textContent, "100%")
  assert.equal(zoomOut.disabled, true)
  inClicks[0]?.()
  assert.equal(live.get(), 1.25)
  assert.equal(props["--preview-zoom"], "1.25")
  assert.equal(zoomReset.textContent, "125%")
  inClicks[0]?.()
  assert.equal(live.get(), 1.5)
  resetClicks[0]?.()
  assert.equal(live.get(), 1)
  assert.equal(zoomReset.textContent, "100%")
  live.apply(2.5)
  assert.equal(zoomIn.disabled, true)
  locked = true
  live.apply(live.get())
  assert.equal(zoomOut.disabled, true)
  assert.equal(zoomIn.disabled, true)
  assert.equal(zoomReset.disabled, true)
  inClicks[0]?.()
  assert.equal(live.get(), 2.5)
  void outClicks
})
