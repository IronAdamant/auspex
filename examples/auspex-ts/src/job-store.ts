/** Persist durable job records under .auspex/jobs (gitignored). */

import { randomBytes } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import type { AgentReceipt } from "./agent-receipt.ts"
import { scrubJobValue } from "./scrub.ts"
import type { JobWakeResult } from "./job-wake.ts"
import type { SeedReadiness } from "./cookie-save.ts"
import { resumeJobNextCall, type NextCall } from "./next-call.ts"
import { packageRoot } from "./paths.ts"
import { stampSchema } from "./schema-version.ts"

export const JOB_STATUS_MAX_WAIT_MS = 60_000
export const JOB_STATUS_POLL_MS = 250

type SlimVerify = {
  ok?: boolean
  claimOk?: boolean
  claimOkProfile?: boolean
  anonymousClaimSkipped?: boolean
}

export const JOB_ID_ERROR = "jobId must be a safe id (letters, digits, . _ -)"

export const JOB_PHASES = ["mint", "await", "finalize", "check", "completed", "failed"] as const
export type JobPhase = (typeof JOB_PHASES)[number]

export type JobStatus =
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "stream-expired"
  | "host-changed"
  | "editor-save-hung"
  | "profile-busy"
  | "editor-busy"
  | "empty-save"
  | "idp-only-save"
  | "timeout"
  | "expectMatchedPublicLanding"
  | "needsHuman"
  | "loggedOut"
  | "concurrency-limited"
  | "mismatch"
  | "network"

export type JobHandoff = { url?: string; mobileUrl?: string }

export type JobRecord = {
  schemaVersion: 1
  jobId: string
  phase: JobPhase
  status: JobStatus
  ok: boolean
  reason: string
  profile: string
  url?: string
  expect?: string
  name?: string
  skipFinalize?: boolean
  verifyWithProfile?: boolean
  wait?: boolean
  timeoutMs?: number
  sinceVersion?: number
  profileDerived?: boolean
  createdAt: string
  updatedAt: string
  next?: string
  nextCall?: NextCall
  /** Set on idp-only-save. app-visible must not default to a remint. */
  idpOnlyKind?: "sign-in-wall" | "app-visible"
  handoff?: JobHandoff
  hostChanged?: boolean
  profileHostMatch?: boolean
  suggestedProfile?: string
  suggestedUrl?: string
  claimOkProfile?: boolean
  /** Post-save cookie/localStorage shape. Not claimOkProfile. */
  seedReadiness?: SeedReadiness
  reaped?: boolean
  receipt?: Record<string, unknown>
}

export type JobReceipt = JobRecord & { wake?: JobWakeResult }

export function jobsDir(override?: string): string {
  return override ?? (process.env.AUSPEX_JOBS_DIR?.trim() || path.join(packageRoot, ".auspex", "jobs"))
}

export function newJobId(now: () => Date = () => new Date()): string {
  return `job-${now().getTime().toString(36)}-${randomBytes(4).toString("hex")}`
}

export function requireJobId(raw: string | undefined): string {
  const id = (raw ?? "").trim()
  if (!id || !/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(id)) throw new Error(JOB_ID_ERROR)
  return id
}

export function jobFilePath(jobId: string, dir?: string): string {
  return path.join(jobsDir(dir), `${requireJobId(jobId)}.json`)
}

export async function writeJobRecord(record: JobRecord, dir?: string): Promise<string> {
  const folder = jobsDir(dir)
  await mkdir(folder, { recursive: true })
  const dest = jobFilePath(record.jobId, dir)
  const tmp = `${dest}.${randomBytes(3).toString("hex")}.tmp`
  await writeFile(tmp, `${JSON.stringify(record, null, 2)}\n`)
  await rename(tmp, dest)
  return dest
}

export async function readJobRecord(jobId: string, dir?: string): Promise<JobRecord> {
  const raw = await readFile(jobFilePath(jobId, dir), "utf8")
  const parsed = JSON.parse(raw) as JobRecord
  if (!parsed || typeof parsed.jobId !== "string") throw new Error(`job ${jobId} is not a job record`)
  return parsed
}

export function jobIso(now: () => Date): string {
  return now().toISOString()
}

export { resumeJobNextCall }

export function slimJobReceipt(receipt: AgentReceipt): Record<string, unknown> {
  const verify = receipt.verify as SlimVerify | undefined
  const out: Record<string, unknown> = {
    schemaVersion: receipt.schemaVersion,
    ok: receipt.ok,
    reason: receipt.reason,
    url: receipt.url,
    expect: receipt.expect,
    screenshotPath: receipt.screenshotPath,
  }
  if (receipt.matched !== undefined) out.matched = receipt.matched
  if (receipt.next) out.next = receipt.next
  if (receipt.nextCall) out.nextCall = receipt.nextCall
  if (receipt.hostChanged) out.hostChanged = true
  if (receipt.profileHostMatch !== undefined) out.profileHostMatch = receipt.profileHostMatch
  if (receipt.suggestedProfile) out.suggestedProfile = receipt.suggestedProfile
  if (receipt.suggestedUrl) out.suggestedUrl = receipt.suggestedUrl
  if (verify && verify.claimOkProfile !== undefined) {
    out.verify = {
      ok: verify.ok,
      claimOk: verify.claimOk,
      claimOkProfile: verify.claimOkProfile,
      ...(verify.anonymousClaimSkipped ? { anonymousClaimSkipped: true } : {}),
    }
  }
  return out
}

export function publicJob(record: JobRecord, extra?: { wake?: JobWakeResult }): JobReceipt {
  return scrubJobValue(stampSchema({ ...record, ...(extra?.wake ? { wake: extra.wake } : {}) }), {
    redactUrlHashes: false,
  })
}

export type JobStatusOptions = {
  jobId: string
  waitMs?: number
  onProgress?: (msg: string) => void
}

export type JobStatusDeps = {
  jobsDir?: string
  sleep?: (ms: number) => Promise<void>
}

/** Local job file only — no Solari, desktop, or Playwright. */
export async function readJobStatus(opts: JobStatusOptions, deps: JobStatusDeps = {}): Promise<JobReceipt> {
  const id = requireJobId(opts.jobId)
  const dir = deps.jobsDir
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const waitMs = Math.max(0, Math.min(JOB_STATUS_MAX_WAIT_MS, opts.waitMs ?? 0))
  const progress = opts.onProgress ?? (() => undefined)
  let current: JobRecord
  try {
    current = await readJobRecord(id, dir)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return publicJob({
      schemaVersion: 1,
      jobId: id,
      phase: "failed",
      status: "failed",
      ok: false,
      reason: /enoent|no such file/i.test(message) ? "job-not-found" : message,
      profile: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  if (waitMs <= 0) return publicJob(current)
  const startPhase = current.phase
  const startStatus = current.status
  const deadline = Date.now() + waitMs
  progress(`job-status: ${current.phase}/${current.status}`)
  while (Date.now() < deadline) {
    await sleep(JOB_STATUS_POLL_MS)
    current = await readJobRecord(id, dir)
    if (current.phase !== startPhase || current.status !== startStatus) {
      progress(`job-status: ${current.phase}/${current.status}`)
      return publicJob(current)
    }
  }
  current.next =
    current.next ??
    "No phase change. Without AUSPEX_WAKE_WEBHOOK resume auspex_job after the human Saves; do not poll await-login for 30 minutes."
  current.nextCall = current.nextCall ?? resumeJobNextCall(current.jobId, current.profile)
  return publicJob(current)
}
