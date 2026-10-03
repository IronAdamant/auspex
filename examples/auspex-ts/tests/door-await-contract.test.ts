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

  const cookie = DOOR_AWAIT_ROWS[rowIndex("cookie-strong")]
  assert.equal(rowIndex("cookie-strong"), rowIndex("stream-expired") + 1)
  assert.equal(cookie?.nextCall, "`auspex_check`")
  assert.match(cookie?.dont ?? "", /Do not call this weakSeed/)
  assert.match(cookie?.dont ?? "", /solariSaveReady as claimOkProfile/)

  assert.ok(DOOR_AWAIT_ROWS.some((row) => row.status.includes("weakSeed")))
  assert.ok(DOOR_AWAIT_ROWS.some((row) => row.status.includes("emptySave")))
  const empty = DOOR_AWAIT_ROWS[rowIndex("emptySave")]
  assert.match(empty?.dont ?? "", /Do not finalize-login/)
  assert.equal(empty?.nextCall, "`auspex_login`")

  const triad = DOOR_AWAIT_ROWS.find((row) => row.status.includes("triad"))
  assert.ok(triad)
  assert.match(triad?.doThis ?? "", /claimOkProfile/)
  assert.match(triad?.dont ?? "", /Do not fold `claimOkProfile` into `ok`/)

  const health = DOOR_AWAIT_ROWS[rowIndex("seed health")]
  const regate = DOOR_AWAIT_ROWS[rowIndex("re-gate")]
  assert.ok(health && regate)
  assert.ok(rowIndex("seed health") > rowIndex("triad"))
  assert.equal(rowIndex("re-gate"), rowIndex("seed health") + 1)
  assert.ok(rowIndex("re-gate") > rowIndex("stream-expired"))
  assert.equal(health?.nextCall, "(none)")
  assert.match(health?.doThis ?? "", /claimOkProfile/)
  assert.match(health?.dont ?? "", /not overnight-safe|overnight-safe/)
  assert.match(health?.dont ?? "", /No Auspex keepalive/)
  assert.match(regate?.doThis ?? "", /Stop the loop/)
  assert.match(regate?.doThis ?? "", /matching row/)
  assert.match(regate?.dont ?? "", /Do not remint `app-visible`/)
  assert.match(regate?.dont ?? "", /Do not skip finalize-now/)
  assert.match(regate?.dont ?? "", /CAPTCHA/)
  assert.match(regate?.nextCall ?? "", /only when the matching row's nextCall is `auspex_login`/)
  assert.equal(regate?.status.includes("app-visible"), false)
  assert.equal(regate?.status.includes("no-cdp"), false)
  assert.equal(
    DOOR_AWAIT_ROWS.some((row) => row.status.includes("re-gate") && row.status.includes("app-visible")),
    false,
  )

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

test("receipt and tool pointers name files the npm package ships, never docs/", async () => {
  const { OPS_GUIDE, DOOR_DETAIL } = await import("../src/door-await-contract.ts")
  const pkg = JSON.parse(readFileSync(path.join(repo, "package.json"), "utf8")) as { files: string[] }
  for (const pointer of [OPS_GUIDE, DOOR_DETAIL]) {
    assert.equal(pointer.includes("docs/"), false, pointer)
    assert.match(pointer, /AGENTS\.md/)
  }
  assert.ok(pkg.files.includes("AGENTS.md"))
  assert.equal(pkg.files.some((f) => f.startsWith("docs")), false, "docs/ is not published, so receipts must not send agents there")
})
