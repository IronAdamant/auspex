import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import {
  CLAIM_FALSE_STOP,
  DOOR_AWAIT_BEGIN,
  DOOR_AWAIT_END,
  DOOR_AWAIT_ROWS,
  KEY_ENV_REFUSE,
  LOGGED_IN_SEED_HEALTH,
  LONG_RUN_BEGIN,
  LONG_RUN_CLI_LINE,
  LONG_RUN_END,
  OPS_GUIDE,
  PROFILES_MAP_LINE,
  RE_GATE_STOP,
  agentsDoorAwaitBlock,
  agentsLongRunBlock,
  extractMarked,
  llmsDoorAwaitBlock,
  llmsLongRunBlock,
} from "../src/door-await-contract.ts"
import { USAGE } from "../src/cli.ts"
import { PROFILES_DESCRIPTION } from "../src/tool-copy.ts"

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
  const longRun = extractMarked(card, LONG_RUN_BEGIN, LONG_RUN_END)
  assert.equal(longRun, llmsLongRunBlock())
  assert.match(longRun, /no keepalive/)
  assert.match(longRun, /claimOkProfile/)
  assert.match(longRun, /not overnight-safe/)
  assert.match(longRun, /auspex_login/)
  assert.match(longRun, /app-visible/)
  assert.match(longRun, /finalize now/)
  assert.match(card, /#long-run/)
  assert.match(card, /24–48h loop/)
  const agents = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  assert.equal(extractMarked(agents, LONG_RUN_BEGIN, LONG_RUN_END), agentsLongRunBlock())
  assert.equal(extractMarked(agents, DOOR_AWAIT_BEGIN, DOOR_AWAIT_END), agentsDoorAwaitBlock())
  assert.match(agents, /## Long unattended loops/)
  assert.match(USAGE, new RegExp(LONG_RUN_CLI_LINE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  const cursorRule = readFileSync(path.join(repo, ".cursor/rules/auspex.mdc"), "utf8")
  assert.match(cursorRule, /AGENTS\.md#long-unattended-loops/)
  assert.match(cursorRule, /not a 24–48h login/)
  const doorCard = readFileSync(path.join(repo, "docs/door-card-api.md"), "utf8")
  assert.match(doorCard, /seed health before a long loop/)
  assert.match(doorCard, /Not a keepalive/)
  assert.match(doorCard, /app-visible` stays separate/)
  const pack = readFileSync(path.join(repo, "examples/auspex-ts/README.md"), "utf8")
  const commands = pack.split("### Commands")[1]?.split("Flag behavior")[0] ?? ""
  assert.match(commands, /npx auspex login --url/)
  assert.ok(commands.indexOf("npx auspex login --url") < commands.indexOf("npx auspex check <url>"))
  const checkLine = commands.split("\n").find((line) => line.startsWith("npx auspex check <url>")) ?? ""
  assert.equal(checkLine.includes("--captcha"), false)
  assert.equal(checkLine.includes("--stealth"), false)
  assert.match(commands, /Leave alone/)
  assert.match(commands, /--captcha/)
})

test("ops stamps lock key refuse, profile map, and the runbook", () => {
  assert.equal(DOOR_AWAIT_ROWS.length, 11)
  const agents = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const card = readFileSync(path.join(repo, "llms.txt"), "utf8")
  const runbook = readFileSync(path.join(repo, "docs/ops-runbook.md"), "utf8")
  for (const text of [USAGE, agents, card]) {
    assert.ok(text.includes(KEY_ENV_REFUSE), "key refuse stamp must match")
  }
  for (const text of [USAGE, agents, PROFILES_DESCRIPTION]) {
    assert.ok(text.includes(PROFILES_MAP_LINE), "profile map stamp must match")
  }
  assert.ok(card.includes(PROFILES_MAP_LINE))
  assert.match(agents, /docs\/ops-runbook\.md/)
  assert.match(card, /docs\/ops-runbook\.md/)
  const longRun = extractMarked(agents, LONG_RUN_BEGIN, LONG_RUN_END)
  assert.match(longRun, /Operator note/)
  assert.match(longRun, /occasional human door/)
  assert.match(longRun, /re-gate path/)
  assert.match(longRun, /no minute timer/)
  assert.match(extractMarked(card, LONG_RUN_BEGIN, LONG_RUN_END), /Operator note/)
  assert.match(runbook, /## Heartbeat/)
  assert.match(runbook, /## Remint and re-gate/)
  assert.match(runbook, /## Who opens the human door/)
  assert.match(runbook, /## Stop the loop/)
  assert.match(runbook, /## What to watch/)
  assert.match(runbook, /## Many profiles/)
  assert.match(runbook, /## How long a login lasts/)
  assert.match(runbook, /claimOkProfile/)
  assert.match(runbook, /weakSeed/)
  assert.match(runbook, /stream-expired/)
  assert.match(runbook, /needsHuman/)
  assert.match(runbook, /One profile per host/)
  assert.match(runbook, /Solari profile plus the site session/)
  assert.equal(runbook.includes("auspex_pager"), false)
  assert.equal(/auspex keepalive/.test(runbook), false)
  assert.ok(LOGGED_IN_SEED_HEALTH.endsWith(OPS_GUIDE))
  assert.ok(RE_GATE_STOP.endsWith(OPS_GUIDE))
  assert.ok(CLAIM_FALSE_STOP.endsWith(OPS_GUIDE))
  assert.match(RE_GATE_STOP, /This is a re-gate/)
  assert.match(CLAIM_FALSE_STOP, /do not reuse this seed/)
})
