/** Persist durable job records under .auspex/jobs (gitignored). */

import { randomBytes } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import type { AgentReceipt } from "./agent-receipt.ts"
import { scrubJobValue } from "./job-wake.ts"
import type { JobWakeResult } from "./job-wake.ts"
import type { NextCall } from "./next-call.ts"
import { packageRoot } from "./paths.ts"
import type { VerifyResult } from "./sandbox.ts"
import { stampSchema } from "./schema-version.ts"

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
  | "empty-save"
  | "timeout"
  | "expectMatchedPublicLanding"
  | "needsHuman"
  | "loggedOut"
  | "concurrency-limited"
  | "mismatch"
  | "network"

export type JobHandoff = { url?: string; mobileUrl?: string; desktopUrl?: string }

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
  handoff?: JobHandoff
  hostChanged?: boolean
  profileHostMatch?: boolean
  suggestedProfile?: string
  suggestedUrl?: string
  claimOkProfile?: boolean
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

export function resumeJobNextCall(jobId: string, profile: string): NextCall {
  const nextCall: NextCall = { tool: "auspex_job", jobId }
  if (profile.trim()) nextCall.profile = profile.trim()
  return nextCall
}

export function slimJobReceipt(receipt: AgentReceipt): Record<string, unknown> {
  const verify = receipt.verify as (VerifyResult & { anonymousClaimSkipped?: boolean }) | undefined
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
