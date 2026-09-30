import assert from "node:assert/strict"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import type { AgentReceipt } from "../src/agent-receipt.ts"
import { AuspexError } from "../src/errors.ts"
import { resolveStatePath } from "../src/paths.ts"
import {
  classifySweepReceipt,
  MAX_SWEEP_PAGES,
  parseSweepPlan,
  renderSweepMarkdown,
  runSweep,
  sweepNotifyPayload,
  writeSweepReport,
  type SweepPage,
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

test("parseSweepPlan refuses page actions, other hosts, loopback, and oversize plans", () => {
  for (const key of ["fill", "click", "record", "sso", "saveProfile", "allowPageActions"]) {
    assert.throws(
      () => parseSweepPlan({ pages: [{ url: "https://a.com/x", expect: "X", [key]: "#x" }] }),
      /read-only/,
      key,
    )
  }
  assert.throws(
    () => parseSweepPlan({ profile: "p", pages: [{ url: "https://a.com/x", expect: "X" }, { url: "https://b.com/y", expect: "Y" }] }),
    /one profile covers one site/,
  )
  assert.throws(() => parseSweepPlan({ pages: [{ url: "http://127.0.0.1/x", expect: "X" }] }), /loopback/)
  assert.throws(() => parseSweepPlan({ pages: [{ url: "https://a.com/x", expect: "  " }] }), /expect/)
  assert.throws(() => parseSweepPlan({ keepProfile: true, pages: [{ url: "https://a.com/x", expect: "X" }] }), /needs a profile/)
  const many = Array.from({ length: MAX_SWEEP_PAGES + 1 }, (_, i) => ({ url: `https://a.com/${i}`, expect: "X" }))
  assert.throws(() => parseSweepPlan({ pages: many }), /cap is/)
  assert.throws(() => parseSweepPlan({ pages: [] }), /at least one page/)
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

test("classifySweepReceipt: only a confirmed match is pass", () => {
  const page: SweepPage = { name: "Projects", url: "https://app.example.com/projects", expect: "Your projects" }
  assert.equal(classifySweepReceipt(page, receipt(), true).status, "pass")
  const unconfirmed = classifySweepReceipt(
    page,
    receipt({ verify: { ok: true, claimOk: false, errors: [], claimErrors: [], claimOkProfile: false, runDir: "x" } }),
    true,
  )
  assert.equal(unconfirmed.status, "unknown")
  assert.match(unconfirmed.detail, /Not a pass/)
  assert.equal(classifySweepReceipt(page, receipt({ verify: undefined }), true).status, "unknown")
  assert.equal(classifySweepReceipt(page, receipt({ verify: undefined }), false).status, "pass")
  assert.equal(classifySweepReceipt(page, receipt({ ok: false, reason: "mismatch", matched: false }), true).status, "fail")
  // Live matched, anonymous second machine could not see JS-rendered text: reason mismatch, not a fail.
  const unseen = classifySweepReceipt(page, receipt({ ok: false, reason: "mismatch", matched: true }), false)
  assert.equal(unseen.status, "unknown")
  assert.match(unseen.detail, /Not a pass, not a fail/)
  assert.equal(classifySweepReceipt(page, receipt({ ok: false, reason: "network" }), true).status, "unknown")
  assert.equal(classifySweepReceipt(page, receipt({ ok: false, reason: "loggedOut" }), true).status, "unknown")
  const regressed = classifySweepReceipt(
    page,
    receipt({ ok: false, reason: "mismatch", matched: false, diff: { previousReason: "matched", previousExpect: "Your projects", urlChanged: false, excerptChanged: true, sameUrl: true } }),
    true,
  )
  assert.equal(regressed.regressed, true)
  // A previous run with a different expect is not comparable.
  const otherExpect = classifySweepReceipt(
    page,
    receipt({ ok: false, reason: "mismatch", matched: false, diff: { previousReason: "matched", previousExpect: "Checkpoint", urlChanged: false, excerptChanged: true, sameUrl: true } }),
    true,
  )
  assert.equal(otherExpect.regressed, undefined)
})

test("runSweep stops at a re-gate; remaining pages are not-run and ok is false", async () => {
  const seen: string[] = []
  const report = await runSweep(plan(), {
    check: async (page) => {
      seen.push(page.name)
      if (page.name === "Billing") {
        return receipt({ ok: false, reason: "loggedOut", next: "Stop. Remint.", nextCall: { tool: "auspex_login", profile: "app-example-com" } })
      }
      return receipt()
    },
  })
  assert.deepEqual(seen, ["Projects", "Billing"])
  assert.equal(report.ok, false)
  assert.deepEqual(report.counts, { pass: 1, fail: 0, unknown: 1, notRun: 1 })
  assert.equal(report.stopped?.reason, "loggedOut")
  assert.deepEqual(report.stopped?.nextCall, { tool: "auspex_login", profile: "app-example-com" })
  assert.match(report.next, /do not loop/)
})

test("runSweep: 429 stops with reap; other errors are could-not-tell and continue", async () => {
  const concurrency = new AuspexError("Solari 429", {
    issue: { code: "ConcurrencyLimitExceeded", nextCall: { tool: "auspex_reap" }, recovery: "reap then retry" },
  })
  const stopped = await runSweep(plan(), {
    check: async () => {
      throw concurrency
    },
  })
  assert.equal(stopped.stopped?.reason, "ConcurrencyLimitExceeded")
  assert.deepEqual(stopped.stopped?.nextCall, { tool: "auspex_reap" })
  assert.equal(stopped.counts.notRun, 2)

  let n = 0
  const mixed = await runSweep(plan(), {
    check: async () => {
      n += 1
      if (n === 1) throw new Error("goto timed out")
      if (n === 2) return receipt({ ok: false, reason: "mismatch", matched: false })
      return receipt()
    },
  })
  assert.equal(mixed.stopped, undefined)
  assert.deepEqual(mixed.counts, { pass: 1, fail: 1, unknown: 1, notRun: 0 })
  assert.equal(mixed.ok, false)
})

test("all-pass sweep is ok and still says it is not a lease", async () => {
  const report = await runSweep(plan(), { check: async () => receipt() })
  assert.equal(report.ok, true)
  assert.match(report.next, /not a lease/)
})

test("report and webhook never carry page text", async () => {
  const report = await runSweep(plan(), {
    check: async (page) => (page.name === "Team" ? receipt({ ok: false, reason: "mismatch", matched: false }) : receipt()),
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

test("operator keep survives a write/read round trip", async () => {
  const { noteOperatorUse, emptyOperatorState, readOperatorState, writeOperatorState } = await import("../src/operator-session.ts")
  const root = mkdtempSync(path.join(tmpdir(), "auspex-op-"))
  writeOperatorState(root, noteOperatorUse(emptyOperatorState(), { profile: "kept", keep: true }, 1))
  assert.equal(readOperatorState(root).profiles.kept!.keep, true)
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

test("a profiles listing never idle-wipes; only a human-agreed purge does", async () => {
  const { commitOperatorSession, noteOperatorUse, emptyOperatorState, writeOperatorState, OPERATOR_IDLE_MS } = await import("../src/operator-session.ts")
  const root = mkdtempSync(path.join(tmpdir(), "auspex-list-"))
  writeOperatorState(root, noteOperatorUse(emptyOperatorState(), { profile: "stale" }, 0))
  const wiped: string[][] = []
  const applyWipes = async (names: readonly string[]) => {
    wiped.push([...names])
    return [...names]
  }
  const now = 10 * OPERATOR_IDLE_MS
  const listed = await commitOperatorSession({ root, nowMs: now, idleWipe: false, applyWipes })
  assert.deepEqual(listed.wiped, [])
  assert.equal(wiped.length, 0)
  const purged = await commitOperatorSession({ root, nowMs: now, idleWipe: false, humanAgree: true, voluntary: ["stale"], applyWipes })
  assert.deepEqual(purged.wiped, ["stale"])
})

test("profiles --keep / --unkeep parse and refuse both at once", async () => {
  const { parseArgv } = await import("../src/cli.ts")
  assert.deepEqual(parseArgv(["profiles", "--keep", "consistencyhub"]), {
    status: "ok",
    command: { cmd: "profiles", purge: undefined, humanAgree: false, keep: "consistencyhub", unkeep: undefined },
  })
  assert.equal(parseArgv(["profiles", "--keep", "a", "--unkeep", "b"]).status, "error")
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
