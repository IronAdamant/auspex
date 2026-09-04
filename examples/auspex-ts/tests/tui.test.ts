import assert from "node:assert/strict"
import { Writable } from "node:stream"
import test from "node:test"
import { REVIEW_DONE, REVIEW_START } from "../src/banner.ts"
import {
  createDesktopTui,
  desktopLogHeader,
  desktopLogLine,
  desktopOverviewText,
  desktopSummary,
} from "../src/tui.ts"

test("desktop log lines are append-only apt/pacman style", () => {
  assert.match(desktopLogHeader(), /Starting Solari desktop review/)
  assert.match(desktopLogHeader(), new RegExp(REVIEW_START))
  assert.equal(desktopLogLine("booting"), ":: booting")
  assert.equal(desktopLogLine("screenshot"), ":: screenshot")
  assert.match(desktopLogLine("done"), /Solari closed/)
  assert.equal(desktopLogLine("done").includes("\x1b["), false)
})

test("createDesktopTui writes a sequence of lines with no cursor motion", () => {
  let buf = ""
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += String(chunk)
      cb()
    },
  })
  const tui = createDesktopTui(stream)
  tui.setPhase("booting")
  tui.setPhase("connecting")
  tui.setPhase("screenshot")
  tui.close()
  assert.match(buf, new RegExp(REVIEW_START))
  assert.match(buf, /:: booting/)
  assert.match(buf, /:: connecting/)
  assert.match(buf, /:: screenshot/)
  assert.match(buf, new RegExp(REVIEW_DONE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.ok(buf.indexOf(":: booting") < buf.indexOf(":: connecting"))
  assert.equal(buf.includes("\x1b["), false)
  assert.equal(buf.includes("┌"), false)
  assert.match(tui.transcript(), /:: booting/)
  assert.equal(tui.transcript(), buf.trimEnd())
})

test("desktopSummary is a compact report footer", () => {
  const s = desktopSummary({
    ok: true,
    ready: true,
    screenshotPath: ".auspex/runs/stamp/screenshot.png",
    errors: [],
  })
  assert.match(s, /ok=true/)
  assert.match(s, /ready=true/)
  assert.match(s, /path=\.auspex\/runs\/stamp\/screenshot\.png/)
  assert.equal(s.includes("desktopId"), false)
})

test("desktopOverviewText is what MCP/Grok/Codex/Claude can show without a TTY", () => {
  const text = desktopOverviewText()
  assert.match(text, /^auspex_desktop/)
  assert.match(text, new RegExp(REVIEW_START))
  assert.match(text, new RegExp(REVIEW_DONE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})
