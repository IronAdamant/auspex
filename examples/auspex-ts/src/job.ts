/** Durable agent job: mint → await → finalize → check. Local JSON under .auspex/jobs. */

import { toAgentReceipt, type AgentReceipt } from "./agent-receipt.ts"
import { runCheck, runFinalizeLogin, type CheckResult } from "./check.ts"
import { classifySolariError } from "./errors.ts"
import { shouldVerifyCheck } from "./fail-closed.ts"
import { isHttpOrHttpsUrl } from "./http-url.ts"
import { JOB_INPUT_ERROR, type JobRunOptions } from "./job-cli.ts"
import {
  jobIso,
  newJobId,
  publicJob,
  readJobRecord,
  resumeJobNextCall,
  slimJobReceipt,
  writeJobRecord,
  type JobReceipt,
  type JobRecord,
} from "./job-store.ts"
import { remintLoginNextCall } from "./next-call.ts"
import { postJobWake, resolveWakeWebhookUrl, type JobWakeEvent, type JobWakeResult } from "./job-wake.ts"
import { preserveAwaitLiveHost } from "./live-host-change.ts"
import { stampAwaitLoginHost, stampLoginHost } from "./profile-host-advice.ts"
import { liveAwaitLogin, type AwaitLoginResult } from "./profile-persist.ts"
import { loginProfile, requireProfileName, type LoginResult } from "./profiles.ts"
import { resolveLoginProfile } from "./profile-slug.ts"
import { reapLeftovers, type ReapResult } from "./reap.ts"
import { applySavedCheckName, savedCheckForProfile } from "./saved-checks.ts"
import { checkThenVerify } from "./sandbox.ts"
import { isNonEmptyExpect } from "./text.ts"

export {
  JOB_ID_ERROR,
  JOB_PHASES,
  JOB_STATUS_MAX_WAIT_MS,
  JOB_STATUS_POLL_MS,
  jobFilePath,
  jobsDir,
  newJobId,
  readJobRecord,
  readJobStatus,
  requireJobId,
  writeJobRecord,
  type JobHandoff,
  type JobPhase,
  type JobReceipt,
  type JobRecord,
  type JobStatus,
  type JobStatusDeps,
  type JobStatusOptions,
} from "./job-store.ts"

export { JOB_DESCRIPTION, JOB_INPUT_ERROR, JOB_STATUS_DESCRIPTION, parseJobFlags, parseJobStatusFlags, type JobRunOptions } from "./job-cli.ts"

export type JobCheckResult = { receipt: AgentReceipt; verified: boolean }

export type JobDeps = {
  jobsDir?: string
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
  login?: (name: string, url?: string, opts?: { profileDerived?: boolean }) => Promise<LoginResult>
  awaitLogin?: (
    name: string,
    opts: { sinceVersion?: number; timeoutMs?: number; saveEditor?: boolean; url?: string },
  ) => Promise<AwaitLoginResult>
  finalize?: (opts: { profile: string; url?: string; expect?: string }) => Promise<CheckResult>
  check?: (opts: {
    name?: string
    url?: string
    expect?: string
    profile?: string
    verifyWithProfile?: boolean
  }) => Promise<JobCheckResult>
  reap?: () => Promise<ReapResult>
  wake?: (payload: object, url?: string) => Promise<JobWakeResult>
}

function isConcurrency(err: unknown): boolean {
  const issue = classifySolariError(err)
  return issue.code === "ConcurrencyLimitExceeded" || issue.status === 429
}

async function defaultJobCheck(opts: {
  name?: string
  url?: string
  expect?: string
  profile?: string
  verifyWithProfile?: boolean
}): Promise<JobCheckResult> {
  const merged = applySavedCheckName(opts)
  const url = merged.url
  const expect = merged.expect
  if (!url || !expect) throw new Error("auspex_job check requires name or url+expect")
  const checkOpts = { url, expect, profile: merged.profile, verifyWithProfile: opts.verifyWithProfile }
  const verified = shouldVerifyCheck({
    name: merged.name,
    profile: checkOpts.profile,
    url,
    verifyWithProfile: opts.verifyWithProfile,
  })
  if (verified) {
    const both = await checkThenVerify(checkOpts)
    return { receipt: toAgentReceipt(both.check, { verify: both.verify }), verified: true }
  }
  return { receipt: toAgentReceipt(await runCheck(checkOpts)), verified: false }
}

function resolveCreateInput(opts: JobRunOptions): {
  profile: string
  url?: string
  expect?: string
  name?: string
  profileDerived: boolean
} {
  const merged = applySavedCheckName({
    name: opts.name,
    url: opts.url,
    expect: opts.expect,
    profile: opts.profile,
  })
  if (!merged.name && (!merged.url || !isNonEmptyExpect(merged.expect ?? ""))) {
    throw new Error(JOB_INPUT_ERROR)
  }
  if (merged.url && !isHttpOrHttpsUrl(merged.url)) {
    throw new Error("url must be an http or https URL")
  }
  const resolved = resolveLoginProfile({ profile: merged.profile, url: merged.url })
  return {
    profile: requireProfileName(resolved.name),
    url: merged.url,
    expect: merged.expect,
    name: merged.name,
    profileDerived: resolved.derived,
  }
}

function copyReceiptMeta(record: JobRecord, receipt: AgentReceipt): void {
  record.receipt = slimJobReceipt(receipt)
  record.next = receipt.next
  record.nextCall = receipt.nextCall
  record.hostChanged = receipt.hostChanged
  record.profileHostMatch = receipt.profileHostMatch
  record.suggestedProfile = receipt.suggestedProfile
  record.suggestedUrl = receipt.suggestedUrl
  record.reason = String(receipt.reason)
}

/** Fail-closed finalize/check reasons. Does not grant claimOkProfile. */
function applyFailClosedReceipt(record: JobRecord, receipt: AgentReceipt): boolean {
  copyReceiptMeta(record, receipt)
  if (receipt.reason === "hostChanged" || receipt.hostChanged) {
    record.status = "host-changed"
    record.phase = "failed"
    record.ok = false
    record.reason = "hostChanged"
    if (receipt.verify?.claimOkProfile !== undefined) record.claimOkProfile = false
    return true
  }
  if (receipt.reason === "expectMatchedPublicLanding") {
    record.status = "expectMatchedPublicLanding"
    record.phase = "failed"
    record.ok = false
    return true
  }
  if (receipt.reason === "needsHuman") {
    record.status = "needsHuman"
    record.phase = "failed"
    record.ok = false
    return true
  }
  if (receipt.reason === "loggedOut") {
    record.status = "loggedOut"
    record.phase = "failed"
    record.ok = false
    return true
  }
  if (receipt.reason === "stream-expired") {
    record.status = "stream-expired"
    record.phase = "failed"
    record.reason = "stream-expired"
    record.ok = false
    record.nextCall = receipt.nextCall ?? remintLoginNextCall(record.profile)
    return true
  }
  return false
}

function applyCheckOutcome(record: JobRecord, receipt: AgentReceipt): JobRecord {
  if (applyFailClosedReceipt(record, receipt)) return record
  copyReceiptMeta(record, receipt)
  const claim = receipt.verify?.claimOkProfile
  if (claim !== undefined) record.claimOkProfile = claim
  record.ok = receipt.ok === true && receipt.reason === "matched"
  if (record.ok) {
    record.phase = "completed"
    record.status = "completed"
    return record
  }
  record.phase = "failed"
  record.status = receipt.reason === "network" ? "network" : "mismatch"
  record.ok = false
  return record
}

function applyAwaitOutcome(record: JobRecord, waited: AwaitLoginResult): JobRecord {
  record.sinceVersion = waited.version || record.sinceVersion
  record.next = waited.next
  record.nextCall = waited.nextCall
  record.hostChanged = waited.hostChanged
  record.profileHostMatch = waited.profileHostMatch
  record.suggestedProfile = waited.suggestedProfile
  record.suggestedUrl = waited.suggestedUrl
  if (waited.status === "completed") {
    record.phase = record.skipFinalize ? "check" : "finalize"
    record.status = "running"
    record.reason = "await-completed"
    return record
  }
  if (waited.status === "stream-expired") {
    record.phase = "failed"
    record.status = "stream-expired"
    record.reason = "stream-expired"
    record.ok = false
    record.nextCall = waited.nextCall ?? remintLoginNextCall(record.profile)
    return record
  }
  if (waited.status === "host-changed") {
    record.phase = "failed"
    record.status = "host-changed"
    record.reason = "hostChanged"
    record.ok = false
    record.hostChanged = true
    return record
  }
  if (waited.status === "editor-save-hung") {
    record.phase = "failed"
    record.status = "editor-save-hung"
    record.reason = "editor-save-hung"
    record.ok = false
    return record
  }
  if (waited.status === "profile-busy") {
    record.phase = "failed"
    record.status = "profile-busy"
    record.reason = "profile-busy"
    record.ok = false
    return record
  }
  if (waited.status === "empty-save") {
    record.phase = "failed"
    record.status = "empty-save"
    record.reason = "empty-save"
    record.ok = false
    return record
  }
  record.phase = "await"
  record.status = waited.status === "timeout" ? "timeout" : "waiting"
  record.reason = waited.status
  record.ok = false
  record.nextCall = waited.nextCall ?? resumeJobNextCall(record.jobId, record.profile)
  return record
}

function wakeEventFor(record: JobRecord, kind: "phase" | "terminal"): JobWakeEvent | undefined {
  if (record.status === "stream-expired") return "stream-expired"
  if (record.status === "host-changed" || record.reason === "hostChanged") return "hostChanged"
  if (record.status === "editor-save-hung") return "editor-save-hung"
  if (record.status === "profile-busy") return "profile-busy"
  if (kind === "phase" && record.reason === "awaiting-save") return "awaiting-save"
  if (kind === "phase" && record.reason === "await-completed") return "profile-saved"
  if (record.phase === "completed" && record.claimOkProfile === true) return "profile-claimable"
  if (record.phase === "completed") return "completed"
  if (record.phase === "failed") return "failed"
  return undefined
}

export async function runJob(opts: JobRunOptions, deps: JobDeps = {}): Promise<JobReceipt> {
  const now = deps.now ?? (() => new Date())
  const dir = deps.jobsDir
  const progress = opts.onProgress ?? (() => undefined)
  let wakeUrl: string | undefined
  try {
    wakeUrl = resolveWakeWebhookUrl(opts.wakeWebhookUrl)
  } catch (err) {
    const failed: JobRecord = {
      schemaVersion: 1,
      jobId: opts.jobId ?? "job-invalid",
      phase: "failed",
      status: "failed",
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      profile: opts.profile ?? "",
      createdAt: jobIso(now),
      updatedAt: jobIso(now),
    }
    return publicJob(failed)
  }

  let record: JobRecord
  if (opts.jobId) {
    record = await readJobRecord(opts.jobId, dir)
    if (opts.skipFinalize !== undefined) record.skipFinalize = opts.skipFinalize
    if (opts.verifyWithProfile !== undefined) record.verifyWithProfile = opts.verifyWithProfile
    if (opts.timeoutMs !== undefined) record.timeoutMs = opts.timeoutMs
    if (opts.url) record.url = opts.url
    if (opts.expect) record.expect = opts.expect
    if (opts.wait) record.wait = true
  } else {
    const created = resolveCreateInput(opts)
    record = {
      schemaVersion: 1,
      jobId: newJobId(now),
      phase: "mint",
      status: "running",
      ok: false,
      reason: "mint",
      profile: created.profile,
      url: created.url,
      expect: created.expect,
      name: created.name,
      skipFinalize: opts.skipFinalize,
      verifyWithProfile: opts.verifyWithProfile,
      wait: opts.wait,
      timeoutMs: opts.timeoutMs,
      profileDerived: created.profileDerived || undefined,
      createdAt: jobIso(now),
      updatedAt: jobIso(now),
    }
  }

  const persist = async () => {
    record.updatedAt = jobIso(now)
    await writeJobRecord(record, dir)
  }
  const wake = async (event: JobWakeEvent) => {
    const payload = {
      schemaVersion: 1,
      event,
      jobId: record.jobId,
      phase: record.phase,
      status: record.status,
      ok: record.ok,
      reason: record.reason,
      profile: record.profile,
      url: record.url,
      expect: record.expect,
      nextCall: record.nextCall,
      at: jobIso(now),
    }
    return (deps.wake ?? ((body, url) => postJobWake(body, { url })))(payload, wakeUrl)
  }

  const fail429 = async (err: unknown): Promise<JobReceipt> => {
    progress("job:reap")
    try {
      await (deps.reap ?? (() => reapLeftovers({})))()
      record.reaped = true
    } catch {
      record.reaped = false
    }
    const issue = classifySolariError(err)
    record.phase = record.phase === "completed" ? "failed" : record.phase
    record.status = "concurrency-limited"
    record.ok = false
    record.reason = issue.message
    record.next =
      "Solari 429 ConcurrencyLimitExceeded. Ledger reap ran (not accountWide). Resume this job; do not retry create while the slot is held."
    record.nextCall = resumeJobNextCall(record.jobId, record.profile)
    await persist()
    const posted = await wake("failed")
    return publicJob(record, { wake: posted })
  }

  try {
    if (record.phase === "completed" || (record.phase === "failed" && record.status !== "concurrency-limited")) {
      await persist()
      return publicJob(record)
    }

    if (record.phase === "mint") {
      progress("job:mint")
      const minted = stampLoginHost(
        await (deps.login ?? ((name, url, extra) => loginProfile(name, url, undefined, undefined, extra)))(
          record.profile,
          record.url,
          { profileDerived: record.profileDerived },
        ),
        record.url,
      )
      record.sinceVersion = minted.sinceVersion
      record.profileHostMatch = minted.profileHostMatch
      record.suggestedProfile = minted.suggestedProfile
      if (minted.handoff && (minted.handoff.url || minted.handoff.mobileUrl)) {
        record.handoff = {
          url: minted.handoff.url,
          mobileUrl: minted.handoff.mobileUrl,
          desktopUrl: minted.handoff.desktopUrl,
        }
        record.phase = "await"
        record.status = "waiting"
        record.reason = "awaiting-save"
        record.next =
          `${minted.next ?? ""} Resume with auspex_job --job-id ${record.jobId} after Save (or pass wait:true). ` +
          `Without AUSPEX_WAKE_WEBHOOK use auspex_job_status, not a 30-minute await-login poll.`
        record.nextCall = resumeJobNextCall(record.jobId, record.profile)
        await persist()
        const posted = await wake("awaiting-save")
        progress(`job:minted ${record.profile}`)
        if (!record.wait) return publicJob(record, { wake: posted })
      } else {
        record.phase = "failed"
        record.status = "failed"
        record.reason = "no-handoff"
        record.next = minted.next
        record.nextCall = minted.nextCall ?? remintLoginNextCall(record.profile)
        await persist()
        return publicJob(record, { wake: await wake("failed") })
      }
    }

    if (record.phase === "await") {
      progress("job:await")
      const raw = await (deps.awaitLogin ?? liveAwaitLogin)(record.profile, {
        sinceVersion: record.sinceVersion,
        timeoutMs: record.timeoutMs,
        saveEditor: true,
        url: record.url,
      })
      const waited = preserveAwaitLiveHost(
        await stampAwaitLoginHost(raw, { profile: record.profile, url: record.url }),
        raw,
      ) as AwaitLoginResult
      const afterAwait = applyAwaitOutcome(record, waited)
      await persist()
      const awaitStopped = afterAwait.phase === "failed" || afterAwait.phase === "await"
      const event = awaitStopped ? wakeEventFor(afterAwait, "terminal") : "profile-saved"
      const posted = event ? await wake(event) : undefined
      if (awaitStopped) return publicJob(afterAwait, { wake: posted })
    }

    if (record.phase === "finalize") {
      if (!record.skipFinalize) {
        progress("job:finalize")
        if (!record.url || !record.expect) {
          if (!savedCheckForProfile(record.profile)) {
            throw new Error("finalize-login requires --url and --expect unless --profile matches a saved check")
          }
        }
        const finalized = await (deps.finalize ?? runFinalizeLogin)({
          profile: record.profile,
          url: record.url,
          expect: record.expect,
        })
        const finalizedReceipt = toAgentReceipt(finalized)
        if (applyFailClosedReceipt(record, finalizedReceipt)) {
          await persist()
          const event = wakeEventFor(record, "terminal")
          return publicJob(record, { wake: event ? await wake(event) : undefined })
        }
        record.phase = "check"
        record.status = "running"
        record.reason = "finalize-completed"
        record.ok = false
        record.receipt = slimJobReceipt(finalizedReceipt)
        await persist()
        await wake("profile-saved")
      } else {
        record.phase = "check"
      }
    }

    if (record.phase === "check") {
      progress("job:check")
      const checked = await (deps.check ?? defaultJobCheck)({
        name: record.name,
        url: record.url,
        expect: record.expect,
        profile: record.profile,
        verifyWithProfile: record.verifyWithProfile,
      })
      applyCheckOutcome(record, checked.receipt)
      if (record.verifyWithProfile !== true) delete record.claimOkProfile
      else if (checked.receipt.verify?.claimOkProfile === undefined) delete record.claimOkProfile
      await persist()
      const event = wakeEventFor(record, "terminal")
      return publicJob(record, { wake: event ? await wake(event) : undefined })
    }

    await persist()
    return publicJob(record)
  } catch (err) {
    if (isConcurrency(err)) return fail429(err)
    record.phase = "failed"
    record.status = "failed"
    record.ok = false
    record.reason = classifySolariError(err).message
    record.nextCall = record.nextCall ?? resumeJobNextCall(record.jobId, record.profile)
    await persist()
    return publicJob(record, { wake: await wake("failed") })
  }
}

