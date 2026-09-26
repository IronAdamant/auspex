import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import {
  DOOR_AWAIT_ROWS,
  agentsDoorAwaitBlock,
  llmsDoorAwaitBlock,
} from "../src/door-await-contract.ts"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

function rowIndex(needle: string): number {
  return DOOR_AWAIT_ROWS.findIndex((row) => row.status.includes(needle))
}

test("door table keeps opposite rows adjacent and unmerged", () => {
  assert.equal(Math.abs(rowIndex("app-visible") - rowIndex("sign-in-wall")), 1)
  assert.equal(Math.abs(rowIndex("no-cdp") - rowIndex("stream-expired")), 1)
  assert.equal(
    DOOR_AWAIT_ROWS.some((row) => row.status.includes("app-visible") && row.status.includes("sign-in-wall")),
    false,
  )
  assert.equal(
    DOOR_AWAIT_ROWS.some((row) => row.status.includes("idp-only-save") && row.status.includes("no-cdp")),
    false,
  )
  assert.equal(
    DOOR_AWAIT_ROWS.some((row) => row.status.includes("weakSeed") && row.status.includes("emptySave")),
    false,
  )

  const appVisible = DOOR_AWAIT_ROWS[rowIndex("app-visible")]
  assert.match(appVisible?.dont ?? "", /Do not finalize/)
  assert.match(appVisible?.dont ?? "", /Do not remint to finish Microsoft/)
  assert.equal(appVisible?.nextCall, "(none)")

  const wall = DOOR_AWAIT_ROWS[rowIndex("sign-in-wall")]
  assert.equal(wall?.nextCall, "`auspex_login`")
  assert.match(wall?.dont ?? "", /Do not finalize/)

  const fold = DOOR_AWAIT_ROWS[rowIndex("no-cdp")]
  assert.match(fold?.doThis ?? "", /Finalize \*\*now\*\*/)
  assert.match(fold?.doThis ?? "", /even if the JWT is already past/)
  assert.equal(fold?.nextCall, "`auspex_finalize_login`")

  const expired = DOOR_AWAIT_ROWS[rowIndex("stream-expired")]
  assert.equal(expired?.nextCall, "`auspex_login`")
  assert.match(expired?.doThis ?? "", /no cookies/)

  assert.ok(DOOR_AWAIT_ROWS.some((row) => row.status.includes("weakSeed")))
  assert.ok(DOOR_AWAIT_ROWS.some((row) => row.status.includes("emptySave")))
  const empty = DOOR_AWAIT_ROWS[rowIndex("emptySave")]
  assert.match(empty?.dont ?? "", /Do not finalize-login/)
  assert.equal(empty?.nextCall, "`auspex_login`")

  const triad = DOOR_AWAIT_ROWS.find((row) => row.status.includes("claimOkProfile") || row.status.includes("triad"))
  assert.ok(triad)
  assert.match(triad?.doThis ?? "", /claimOkProfile/)
  assert.match(triad?.dont ?? "", /Do not fold `claimOkProfile` into `ok`/)

  const rendered = agentsDoorAwaitBlock()
  assert.match(rendered, /\| status \| do \| don't \| nextCall \|/)
  for (const row of DOOR_AWAIT_ROWS) {
    assert.match(rendered, new RegExp(row.status.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
})

test("llms door lines keep the same adjacent pairs", () => {
  const lines = llmsDoorAwaitBlock().split("\n")
  assert.equal(lines.length, 4)
  assert.match(lines[0] ?? "", /app-visible/)
  assert.match(lines[0] ?? "", /do not finalize/)
  assert.match(lines[1] ?? "", /sign-in-wall/)
  assert.match(lines[1] ?? "", /mint again/)
  assert.match(lines[2] ?? "", /no-cdp/)
  assert.match(lines[2] ?? "", /finalize-login now/)
  assert.match(lines[3] ?? "", /stream-expired/)
  assert.match(lines[3] ?? "", /mint again/)
  assert.equal(/finalize-login now/.test(lines[0] ?? ""), false)
  assert.equal(/do not finalize/.test(lines[2] ?? ""), false)
})

test("llms clock and If stuck do not fork mint-or-finalize next to app-visible", () => {
  const card = readFileSync(path.join(repo, "llms.txt"), "utf8")
  assert.equal(card.includes("Mint again or finalize now"), false)
  const clock = card.split("## Clock")[1]?.split("## ")[0] ?? ""
  const lines = clock.split("\n").map((line) => line.trim()).filter((line) => line.length > 0)
  assert.ok(lines.length >= 6 && lines.length <= 8, `clock block should be 6-8 lines, got ${lines.length}`)
  assert.match(clock, /docs\/stream-jwt-solari\.md/)
  assert.match(clock, /does not die with it|saved profile does not/)
  assert.match(clock, /reconnects the same token/)
  assert.match(clock, /await-login --save-editor/)
  assert.match(clock, /do not finalize/)
  const stuck = card.split("## If stuck")[1]?.split("## ")[0] ?? ""
  assert.match(stuck, /app-visible/)
  assert.match(stuck, /sign-in-wall/)
  assert.match(stuck, /`emptySave`/)
  assert.match(stuck, /This is not `app-visible`/)
  assert.match(card, /Handraise/)
  assert.match(card, /vault or an agent/)
  assert.match(card, /phone keyboard/)
  assert.match(card, /remote HTTP/)
  assert.match(card, /CAPTCHA/)
  assert.match(card, /auspex-solari/)
  assert.match(card, /SOLARI_API_KEY/)
})
