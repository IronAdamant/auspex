/**
 * Read-only sweep: one operator-written plan, many pages, one report.
 * Composes auspex_check (no new primitive). No fill, no click, no record, no sso.
 *
 * pass    = live browser matched AND (with a profile) a second browser seeded from the
 *           saved login confirmed it (claimOkProfile true). Without a profile, anonymous
 *           verify is folded into ok.
 * fail    = the page loaded and the expect text is not there (reason mismatch).
 * unknown = anything else. Never counted as pass or fail.
 * A re-gate (logged out, password wall, dead stream, host change) or a Solari 429 / plan
 * limit stops the sweep. Remaining pages are not-run. A human takes the stop row once.
 */

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { AgentReceipt } from "./agent-receipt.ts"
import { classifySolariError } from "./errors.ts"
import { requireCheckUrl } from "./http-url.ts"
import type { JobWakeResult } from "./job-wake.ts"
import type { NextCall } from "./next-call.ts"
import { stateDir, toStatePath } from "./paths.ts"
import { requireProfileName } from "./profile-slug.ts"
import { hostIs } from "./sso.ts"
import { requireExpect } from "./text.ts"

export const MAX_SWEEP_PAGES = 12
export const SWEEP_REPORT_VERSION = 1

export type SweepPage = { name: string; url: string; expect: string }

export type SweepPlan = {
  name: string
  profile?: string
  /** Operator opt-out of the 30-minute idle wipe for this profile. A human-agreed purge still wipes it. */
  keepProfile?: boolean
  pages: SweepPage[]
}

export type SweepStatus = "pass" | "fail" | "unknown" | "not-run"

export type SweepRow = {
  name: string
  url: string
  expect: string
  status: SweepStatus
  /** Receipt reason, or the Solari error code when the check threw. */
  reason?: string
  detail: string
  screenshotPath?: string
  claimOkProfile?: boolean
  /** Previous receipt for this URL was matched and this one is not. */
  regressed?: boolean
  previousReason?: string
}

export type SweepStop = { page: string; reason: string; next: string; nextCall?: NextCall }

export type SweepReport = {
  schemaVersion: 1
  kind: "sweep"
  ok: boolean
  plan: string
  profile?: string
  keepProfile?: boolean
  startedAt: string
  finishedAt: string
  counts: { pass: number; fail: number; unknown: number; notRun: number }
  regressions: string[]
  stopped?: SweepStop
  rows: SweepRow[]
  reportPath?: string
  reportJsonPath?: string
  notify?: JobWakeResult
  next: string
}

const READ_ONLY_KEYS = ["fill", "value", "click", "record", "sso", "allowPageActions", "saveProfile", "waitFor"]
const RE_GATE_REASONS = new Set(["loggedOut", "needsHuman", "stream-expired", "hostChanged", "expectMatchedPublicLanding"])
const STOP_CODES = new Set(["ConcurrencyLimitExceeded", "FeatureRequiresPlan", "PlanLimitExceeded", "MissingApiKey"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function defaultPageName(url: string): string {
  const u = new URL(url)
  return u.pathname === "/" ? u.hostname : u.pathname.replace(/\/+$/, "")
}

function sameSite(a: string, b: string): boolean {
  return hostIs(a, b) || hostIs(b, a) || a.replace(/^www\./, "") === b.replace(/^www\./, "")
}

/** Validate an operator-written plan. Throws with a message an agent can show the human. */
export function parseSweepPlan(raw: unknown): SweepPlan {
  if (!isRecord(raw)) throw new Error("sweep plan must be a JSON object with pages")
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 80) : "sweep"
  const profile = typeof raw.profile === "string" && raw.profile.trim() ? requireProfileName(raw.profile) : undefined
  if (raw.keepProfile !== undefined && typeof raw.keepProfile !== "boolean") {
    throw new Error("sweep plan keepProfile must be true or false")
  }
  // Explicit false clears a stored keep; omitted leaves it as it was.
  const keepProfile = typeof raw.keepProfile === "boolean" ? raw.keepProfile : undefined
  if (keepProfile && !profile) throw new Error("sweep plan keepProfile needs a profile")
  if (!Array.isArray(raw.pages) || raw.pages.length === 0) throw new Error("sweep plan needs at least one page")
  if (raw.pages.length > MAX_SWEEP_PAGES) {
    throw new Error(`sweep plan has ${raw.pages.length} pages; the cap is ${MAX_SWEEP_PAGES} (cost and Solari concurrency)`)
  }
  const pages: SweepPage[] = raw.pages.map((row, i) => {
    if (!isRecord(row)) throw new Error(`sweep page ${i + 1} must be an object with url and expect`)
    for (const key of READ_ONLY_KEYS) {
      if (key in row) throw new Error(`sweep page ${i + 1} sets ${key}; sweeps are read-only (no fill, click, record, sso, or save)`)
    }
    const url = requireCheckUrl(String(row.url ?? ""), `pages[${i}].url`)
    const expect = requireExpect(String(row.expect ?? ""))
    const pageName = typeof row.name === "string" && row.name.trim() ? row.name.trim().slice(0, 80) : defaultPageName(url)
    return { name: pageName, url, expect }
  })
  if (profile) {
    const first = new URL(pages[0]!.url).hostname.toLowerCase()
    for (const page of pages) {
      const host = new URL(page.url).hostname.toLowerCase()
      if (!sameSite(host, first)) {
        throw new Error(`sweep page ${page.name} is on ${host}; one profile covers one site (${first}). Use one plan per site.`)
      }
    }
  }
  return { name, profile, ...(keepProfile !== undefined ? { keepProfile } : {}), pages }
}

type VerifyLike = { ok?: boolean; claimOk?: boolean; claimOkProfile?: boolean; skipped?: boolean }

/** Map one agent receipt to a sweep row. Only a confirmed match is pass. */
export function classifySweepReceipt(page: SweepPage, receipt: AgentReceipt, hasProfile: boolean): SweepRow {
  const verify = receipt.verify as VerifyLike | undefined
  const base: SweepRow = {
    name: page.name,
    url: page.url,
    expect: page.expect,
    status: "unknown",
    reason: receipt.reason,
    detail: "",
    screenshotPath: receipt.screenshotPath || undefined,
    ...(verify?.claimOkProfile !== undefined ? { claimOkProfile: verify.claimOkProfile } : {}),
  }
  // A regression compares like with like: same URL key and the same expect text.
  const previousReason = receipt.diff?.previousReason
  const sameExpect = receipt.diff?.previousExpect === page.expect
  if (previousReason && sameExpect) {
    base.previousReason = previousReason
    if (previousReason === "matched" && receipt.reason !== "matched") base.regressed = true
  }

  if (receipt.reason === "matched" && receipt.ok) {
    if (!hasProfile) return { ...base, status: "pass", detail: "matched; anonymous second machine agreed" }
    if (verify?.claimOkProfile === true) {
      return { ...base, status: "pass", detail: "matched; a second browser with the saved login confirmed it" }
    }
    return {
      ...base,
      detail: `live browser matched, but the second browser with the saved login did not confirm (claimOkProfile ${verify?.claimOkProfile ?? "missing"}). Not a pass.`,
    }
  }
  // Only the live browser's own miss is a fail. A live match that the second machine could not
  // see (JS-rendered text, fetch blocked) also surfaces as reason mismatch; that is not a fail.
  if (receipt.matched === true) {
    return {
      ...base,
      detail: `live browser matched; the second machine did not confirm (reason ${receipt.reason}, claimOk ${verify?.claimOk ?? "missing"}). Often JS-rendered text an anonymous fetch cannot see. Not a pass, not a fail.`,
    }
  }
  if (receipt.reason === "mismatch") {
    return { ...base, status: "fail", detail: "page loaded; the live browser did not find the expected text" }
  }
  return { ...base, detail: receipt.next ? receipt.next.slice(0, 280) : `could not tell (${receipt.reason})` }
}

export function isReGate(receipt: AgentReceipt): boolean {
  return RE_GATE_REASONS.has(receipt.reason)
}

export type SweepDeps = {
  check: (page: SweepPage, plan: SweepPlan) => Promise<AgentReceipt>
  noteUse?: (plan: SweepPlan) => Promise<void>
  now?: () => Date
  writeReport?: (report: SweepReport, markdown: string) => Promise<{ reportPath: string; reportJsonPath: string }>
  notify?: (report: SweepReport) => Promise<JobWakeResult>
}

function notRun(page: SweepPage, why: string): SweepRow {
  return { name: page.name, url: page.url, expect: page.expect, status: "not-run", detail: why }
}

export async function runSweep(plan: SweepPlan, deps: SweepDeps): Promise<SweepReport> {
  const now = deps.now ?? (() => new Date())
  const startedAt = now().toISOString()
  if (deps.noteUse) await deps.noteUse(plan)
  const hasProfile = Boolean(plan.profile)
  const rows: SweepRow[] = []
  let stopped: SweepStop | undefined

  for (const page of plan.pages) {
    if (stopped) {
      rows.push(notRun(page, `sweep stopped at ${stopped.page} (${stopped.reason})`))
      continue
    }
    try {
      const receipt = await deps.check(page, plan)
      rows.push(classifySweepReceipt(page, receipt, hasProfile))
      if (isReGate(receipt)) {
        stopped = {
          page: page.name,
          reason: receipt.reason,
          next: receipt.next ?? `Stop. ${receipt.reason} needs a human. Take the matching door-table row once.`,
          ...(receipt.nextCall ? { nextCall: receipt.nextCall as NextCall } : {}),
        }
      }
    } catch (err) {
      const issue = classifySolariError(err)
      rows.push({
        name: page.name,
        url: page.url,
        expect: page.expect,
        status: "unknown",
        reason: issue.code,
        detail: issue.recovery ? `${issue.message} ${issue.recovery}` : issue.message,
      })
      if (STOP_CODES.has(issue.code)) {
        stopped = {
          page: page.name,
          reason: issue.code,
          next: issue.recovery ?? issue.message,
          ...(issue.nextCall ? { nextCall: issue.nextCall } : {}),
        }
      }
    }
  }

  const counts = {
    pass: rows.filter((r) => r.status === "pass").length,
    fail: rows.filter((r) => r.status === "fail").length,
    unknown: rows.filter((r) => r.status === "unknown").length,
    notRun: rows.filter((r) => r.status === "not-run").length,
  }
  const regressions = rows.filter((r) => r.regressed).map((r) => r.name)
  const ok = counts.pass === rows.length
  const report: SweepReport = {
    schemaVersion: 1,
    kind: "sweep",
    ok,
    plan: plan.name,
    ...(plan.profile ? { profile: plan.profile } : {}),
    ...(plan.keepProfile ? { keepProfile: true } : {}),
    startedAt,
    finishedAt: now().toISOString(),
    counts,
    regressions,
    ...(stopped ? { stopped } : {}),
    rows,
    next: sweepNext({ ok, counts, stopped, regressions }),
  }
  if (deps.writeReport) {
    const written = await deps.writeReport(report, renderSweepMarkdown(report))
    report.reportPath = written.reportPath
    report.reportJsonPath = written.reportJsonPath
  }
  if (deps.notify) report.notify = await deps.notify(report)
  return report
}

function sweepNext(r: {
  ok: boolean
  counts: SweepReport["counts"]
  stopped?: SweepStop
  regressions: string[]
}): string {
  if (r.stopped) {
    return `Stopped at ${r.stopped.page} (${r.stopped.reason}). A human takes that row once; do not loop. ${r.stopped.next}`.trim()
  }
  if (r.ok) return "Every page passed. pass is evidence for this run, not a lease; re-sweep before trusting it later."
  const parts = []
  if (r.counts.fail) parts.push(`${r.counts.fail} failed (page loaded, text missing)`)
  if (r.counts.unknown) parts.push(`${r.counts.unknown} could not be confirmed (not a pass)`)
  if (r.regressions.length) parts.push(`regressed since last run: ${r.regressions.join(", ")}`)
  return `${parts.join("; ")}. Open each screenshot before reporting a cause.`
}

function cell(text: string | undefined): string {
  return (text ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim()
}

const STATUS_LABEL: Record<SweepStatus, string> = {
  pass: "PASS",
  fail: "FAIL",
  unknown: "COULD NOT TELL",
  "not-run": "NOT RUN",
}

/** Human report. No page text (untrusted, may be personal): status, reason, and evidence paths only. */
export function renderSweepMarkdown(report: SweepReport): string {
  const c = report.counts
  const lines = [
    `# Auspex sweep: ${cell(report.plan)}`,
    "",
    `- When: ${report.startedAt} to ${report.finishedAt}`,
    `- Saved login: ${report.profile ? cell(report.profile) : "none (public pages)"}`,
    `- Result: **${report.ok ? "all pages passed" : "attention needed"}**: ${c.pass} pass, ${c.fail} fail, ${c.unknown} could not tell, ${c.notRun} not run`,
    "",
  ]
  if (report.stopped) {
    lines.push("## Needs a human", "", `Stopped at **${cell(report.stopped.page)}** (\`${report.stopped.reason}\`).`, "", cell(report.stopped.next), "")
  }
  if (report.regressions.length) {
    lines.push("## Regressions since the last run", "", ...report.regressions.map((name) => `- ${cell(name)}: was matched, is not now`), "")
  }
  lines.push("## Pages", "", "| Status | Page | Expected text | Reason | Screenshot |", "| --- | --- | --- | --- | --- |")
  for (const row of report.rows) {
    lines.push(
      `| ${STATUS_LABEL[row.status]} | [${cell(row.name)}](${row.url}) | ${cell(row.expect)} | ${cell(row.reason ?? "")} | ${row.screenshotPath ? `\`${row.screenshotPath}\`` : ""} |`,
    )
  }
  lines.push("", "### Details", "")
  for (const row of report.rows) lines.push(`- **${cell(row.name)}** (${STATUS_LABEL[row.status]}): ${cell(row.detail)}`)
  lines.push(
    "",
    "---",
    "PASS means the live browser matched and, with a saved login, a second browser seeded from it confirmed the text (`claimOkProfile`). COULD NOT TELL is never counted as a pass or a fail. Read-only: no fills, clicks, or saves. No page text is copied into this report.",
    "",
  )
  return lines.join("\n")
}

export async function writeSweepReport(
  report: SweepReport,
  markdown: string,
  root: string = path.join(stateDir, "sweeps"),
): Promise<{ reportPath: string; reportJsonPath: string }> {
  const slug = report.plan.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "sweep"
  const dir = path.join(root, `${report.startedAt.replace(/[:.]/g, "-")}-${slug}`)
  await mkdir(dir, { recursive: true })
  const md = path.join(dir, "report.md")
  const json = path.join(dir, "report.json")
  await writeFile(md, markdown)
  await writeFile(json, `${JSON.stringify({ ...report, reportPath: toStatePath(md), reportJsonPath: toStatePath(json) }, null, 2)}\n`)
  return { reportPath: toStatePath(md), reportJsonPath: toStatePath(json) }
}

/** Scrubbed webhook body: counts, names, reasons, report path. No page text, no URLs with queries. */
export function sweepNotifyPayload(report: SweepReport): Record<string, unknown> {
  return {
    event: "sweep-report",
    plan: report.plan,
    ok: report.ok,
    counts: report.counts,
    regressions: report.regressions,
    ...(report.stopped ? { stopped: { page: report.stopped.page, reason: report.stopped.reason } } : {}),
    failed: report.rows.filter((r) => r.status === "fail").map((r) => r.name),
    couldNotTell: report.rows.filter((r) => r.status === "unknown").map((r) => r.name),
    reportPath: report.reportPath,
    next: report.next,
  }
}
