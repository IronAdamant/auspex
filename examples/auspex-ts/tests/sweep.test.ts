import assert from "node:assert/strict"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import type { AgentReceipt } from "../src/agent-receipt.ts"
import { resolveStatePath } from "../src/paths.ts"
import {
  classifySweepReceipt,
  parseSweepPlan,
  renderSweepMarkdown,
  runSweep,
  sweepNotifyPayload,
  writeSweepReport,
  } from "../src/sweep.ts"

const PAGE_TEXT = "SECRET-LOGGED-IN-PAGE-TEXT account 12345678"

function receipt(over: Partial<AgentReceipt> = {}): AgentReceipt {
  return {
    schemaVersion: 1,
    ok: true,
    reason: "matched",
    url: "https://app.example.com/a",
    expect: "Your projects",
    screenshotPath: "~/.auspex/runs/s/screenshot.png",
    excerpt: PAGE_TEXT,
    verify: { ok: true, claimOk: false, errors: [], claimErrors: [], anonymousClaimSkipped: true, claimOkProfile: true, runDir: "x" },
    ...over,
  } as AgentReceipt
}

/** A real miss: the second browser with the saved login did not see the words either. */
const BOTH_MISSED = {
  ok: true,
  claimOk: false,
  errors: [],
  claimErrors: [],
  anonymousClaimSkipped: true,
  claimOkProfile: false,
  runDir: "x",
} as AgentReceipt["verify"]

const plan = () =>
  parseSweepPlan({
    name: "App nightly",
    profile: "app-example-com",
    keepProfile: true,
    pages: [
      { name: "Projects", url: "https://app.example.com/projects", expect: "Your projects" },
      { name: "Billing", url: "https://app.example.com/billing", expect: "Current plan" },
      { name: "Team", url: "https://www.app.example.com/team", expect: "Members" },
    ],
  })

test("parseSweepPlan accepts a read-only single-site plan", () => {
  const p = plan()
  assert.equal(p.name, "App nightly")
  assert.equal(p.profile, "app-example-com")
  assert.equal(p.keepProfile, true)
  assert.equal(p.pages.length, 3)
  const unnamed = parseSweepPlan({ pages: [{ url: "https://example.com/docs/", expect: "Docs" }] })
  assert.equal(unnamed.pages[0]!.name, "/docs")
  assert.equal(unnamed.keepProfile, undefined)
  assert.equal(parseSweepPlan({ profile: "p", keepProfile: false, pages: [{ url: "https://a.com/x", expect: "X" }] }).keepProfile, false)
})

test("classifySweepReceipt: a bot check is could-not-tell, never a fail or a regression", () => {
  const page = { name: "home", url: "https://app.example/", expect: "Workspace ready" }
  const walled = classifySweepReceipt(
    page,
    receipt({
      ok: false,
      reason: "mismatch",
      matched: false,
      botWall: true,
      diff: { previousReason: "matched", previousExpect: "Workspace ready" } as AgentReceipt["diff"],
    }),
    true,
  )
  assert.equal(walled.status, "unknown")
  assert.match(walled.detail, /bot check/)
  assert.equal(walled.regressed, undefined)
})

test("all-pass sweep is ok and still says it is not a lease", async () => {
  const report = await runSweep(plan(), { check: async () => receipt() })
  assert.equal(report.ok, true)
  assert.match(report.next, /not a lease/)
})

test("report and webhook never carry page text", async () => {
  const report = await runSweep(plan(), {
    check: async (page) => (page.name === "Team" ? receipt({ ok: false, reason: "mismatch", matched: false, verify: BOTH_MISSED }) : receipt()),
  })
  const md = renderSweepMarkdown(report)
  assert.equal(md.includes(PAGE_TEXT), false)
  assert.match(md, /\| FAIL \| \[Team\]/)
  assert.match(md, /COULD NOT TELL is never counted as a pass/)
  const payload = JSON.stringify(sweepNotifyPayload(report))
  assert.equal(payload.includes(PAGE_TEXT), false)
  assert.equal(payload.includes("https://"), false)
  assert.match(payload, /"failed":\["Team"\]/)
})

test("writeSweepReport writes report.md and report.json", async () => {
  const report = await runSweep(plan(), { check: async () => receipt() })
  const root = mkdtempSync(path.join(tmpdir(), "auspex-sweep-"))
  const written = await writeSweepReport(report, renderSweepMarkdown(report), root)
  assert.equal(JSON.parse(readFileSync(resolveStatePath(written.reportJsonPath), "utf8")).kind, "sweep")
  assert.match(readFileSync(resolveStatePath(written.reportPath), "utf8"), /# Auspex sweep: App nightly/)
})

test("operator keep: idle wipe skips a kept profile; a human-agreed purge still wipes it", async () => {
  const { decideOperatorSession, noteOperatorUse, emptyOperatorState, profilesFromState, OPERATOR_IDLE_MS } = await import("../src/operator-session.ts")
  const now = 10 * OPERATOR_IDLE_MS
  let state = noteOperatorUse(emptyOperatorState(), { profile: "kept", keep: true }, 0)
  state = noteOperatorUse(state, { profile: "idle" }, 0)
  assert.equal(state.profiles.kept!.keep, true)
  assert.deepEqual(decideOperatorSession({ profiles: profilesFromState(state, now), nowMs: now }).wipe, ["idle"])
  assert.deepEqual(
    decideOperatorSession({ profiles: profilesFromState(state, now), nowMs: now, humanAgree: true, voluntary: ["kept"] }).wipe.sort(),
    ["idle", "kept"],
  )
  // A later use without keep leaves it; explicit false clears it.
  assert.equal(noteOperatorUse(state, { profile: "kept" }, now).profiles.kept!.keep, true)
  assert.equal(noteOperatorUse(state, { profile: "kept", keep: false }, now).profiles.kept!.keep, undefined)
})

test("an unreadable lastUsedMs never idle-wipes that saved login", async () => {
  const { commitOperatorSession, operatorStatePath, OPERATOR_IDLE_MS } = await import("../src/operator-session.ts")
  const { writeFileSync, mkdirSync } = await import("node:fs")
  const root = mkdtempSync(path.join(tmpdir(), "auspex-op-bad-"))
  const file = operatorStatePath(root)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ profiles: { hand: { site: "app.example" }, old: { lastUsedMs: 0 } } }))
  const wiped: string[] = []
  const now = 10 * OPERATOR_IDLE_MS
  await commitOperatorSession({
    root,
    nowMs: now,
    applyWipes: async (names) => {
      wiped.push(...names)
      return [...names]
    },
  })
  // A real old timestamp is still idle; a missing one is treated as used now.
  assert.deepEqual(wiped, ["old"])
})

test("CLI and MCP read a sweep plan the same way: from the caller's folder, with a plain error", async () => {
  const { readSweepPlanFile } = await import("../src/runners.ts")
  const { mkdtemp, writeFile } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const dir = await mkdtemp(path.join(tmpdir(), "auspex-plan-"))
  await writeFile(path.join(dir, "plan.json"), JSON.stringify({ pages: [{ url: "https://example.com", expect: "x" }] }))
  await writeFile(path.join(dir, "bad.json"), "{ nope")
  const before = process.env.AUSPEX_CALLER_CWD
  process.env.AUSPEX_CALLER_CWD = dir
  try {
    assert.deepEqual(await readSweepPlanFile("plan.json"), { pages: [{ url: "https://example.com", expect: "x" }] })
    await assert.rejects(readSweepPlanFile("bad.json"), /sweep --plan bad\.json is not readable JSON/)
    await assert.rejects(readSweepPlanFile("missing.json"), /sweep --plan missing\.json is not readable JSON/)
  } finally {
    if (before === undefined) delete process.env.AUSPEX_CALLER_CWD
    else process.env.AUSPEX_CALLER_CWD = before
  }
  const tools = readFileSync(path.resolve("src", "mcp-tools.ts"), "utf8")
  assert.match(tools, /readSweepPlanFile\(planPath\)/)
})

