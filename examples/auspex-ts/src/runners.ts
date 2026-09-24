/** Shared CLI/MCP runners. MCP loads this via dynamic import() so light tools stay light. */

import { toAgentReceipt } from "./agent-receipt.ts"
import { runCheck, runFinalizeLogin, type CheckOptions, type CheckResult } from "./check.ts"
import { shouldVerifyCheck } from "./fail-closed.ts"
import { attachMatchedPurgeNext, noteAfterSignupWait, SIGNUP_BUSY_MS } from "./operator-session.ts"
import { attachHandoffQr, listProfiles, loginProfile, qrPayloadForHandoff, withOperatorSession } from "./profiles.ts"
import { loginWaitPublicFields, preserveAwaitLiveHost } from "./live-host-change.ts"
import { stampAwaitLoginHost, stampLoginHost, stampProfileHostAdvice } from "./profile-host-advice.ts"
import { resolveLoginProfile } from "./profile-slug.ts"
import { liveAwaitLogin, loginWaitAwaitOpts } from "./profile-persist.ts"
import { profileStatus } from "./profile-status.ts"
import { defaultDesktopDeps, runDesktopReview } from "./desktop.ts"
import { generateQRCode } from "./qr-gen.ts"
import { ensureRunDir } from "./paths.ts"
import { reapLeftovers } from "./reap.ts"
import { readLoginTrace } from "./login-trace.ts"
import { checkThenVerify, defaultVerifyDeps, verifyReceipt } from "./sandbox.ts"
import { assertPageActionsAllowed } from "./page-actions.ts"
import { applySavedCheckName } from "./saved-checks.ts"
import { stampSchema } from "./schema-version.ts"
import { assertRecordNotLoggedIn, assertRecordProfileAllowed } from "./tool-schema.ts"
import { readJobStatus, type JobStatusOptions } from "./job-store.ts"
import { runJob, type JobRunOptions } from "./job.ts"
import type { ProgressFn } from "./progress.ts"
import type { SsoProvider } from "./sso.ts"

export type AuspexCheckArgs = {
  name?: string
  url?: string
  expect?: string
  verify?: boolean
  verifyWithProfile?: boolean
  [key: string]: unknown
}

export type AuspexCheckDeps = {
  checkThenVerify?: typeof checkThenVerify
  runCheck?: (opts: CheckOptions) => Promise<CheckResult>
}

export async function executeAuspexCheck(
  args: AuspexCheckArgs,
  deps?: AuspexCheckDeps,
): Promise<{ receipt: ReturnType<typeof toAgentReceipt>; verified: boolean }> {
  const merged = applySavedCheckName(args)
  const url = merged.url
  const expect = merged.expect
  if (!url || !expect) {
    throw new Error("auspex_check requires name or url+expect")
  }
  const { verify, name, ...rest } = merged
  const opts = { ...rest, url, expect } as CheckOptions
  assertPageActionsAllowed({ ...opts, name })
  assertRecordProfileAllowed({ ...opts, name })
  assertRecordNotLoggedIn(opts)
  const verified = shouldVerifyCheck({
    name,
    profile: opts.profile,
    url,
    verify,
    verifyWithProfile: opts.verifyWithProfile,
  })
  if (verified) {
    const both = await (deps?.checkThenVerify ?? checkThenVerify)(opts)
    return { receipt: toAgentReceipt(both.check, { verify: both.verify }), verified: true }
  }
  const result = await (deps?.runCheck ?? runCheck)(opts)
  return { receipt: toAgentReceipt(result), verified: false }
}

export async function runCheckDoor(opts: AuspexCheckArgs) {
  const named = applySavedCheckName(opts)
  const book = await withOperatorSession({
    note: named.profile ? { profile: named.profile, site: named.url } : undefined,
  })
  const { receipt } = await executeAuspexCheck(opts)
  return attachMatchedPurgeNext(receipt, book.agent)
}

export async function runLoginDoor(opts: {
  profile: string
  url?: string
  wait?: boolean
  profileDerived?: boolean
}) {
  const book = await withOperatorSession({
    note: { profile: opts.profile, site: opts.url, busyMs: SIGNUP_BUSY_MS },
  })
  const runDir = await ensureRunDir()
  const result = await loginProfile(opts.profile, opts.url, undefined, undefined, {
    profileDerived: opts.profileDerived,
  })
  if (result.handoff?.url) {
    const qr = await generateQRCode(qrPayloadForHandoff(result.handoff), runDir)
    if (qr.qrPath) attachHandoffQr(result, qr.qrPath, opts.url)
  }
  const shown = stampLoginHost(result, opts.url)
  if (!opts.wait) {
    return stampSchema({ ok: true, ...shown, operator: book.agent })
  }
  const rawWait = await liveAwaitLogin(opts.profile, loginWaitAwaitOpts({ sinceVersion: result.sinceVersion, url: opts.url }))
  const waited = preserveAwaitLiveHost(
    stampProfileHostAdvice(rawWait, { profile: opts.profile, url: opts.url }),
    rawWait,
  )
  const finished = await withOperatorSession({
    note: noteAfterSignupWait({ profile: opts.profile, site: opts.url, status: waited.status }),
  })
  return stampSchema({
    ...shown,
    ...loginWaitPublicFields(waited),
    wait: waited,
    operator: finished.agent,
  })
}

export async function runAwaitLoginDoor(opts: {
  profile: string
  sinceVersion?: number
  timeoutMs?: number
  saveEditor?: boolean
  url?: string
  expect?: string
  chainFinalize?: boolean
  ssoProvider?: SsoProvider
}) {
  await withOperatorSession({
    note: { profile: opts.profile, site: opts.url, busyMs: Math.max(SIGNUP_BUSY_MS, opts.timeoutMs ?? 0) },
  })
  const rawWait = await liveAwaitLogin(opts.profile, {
    sinceVersion: opts.sinceVersion,
    timeoutMs: opts.timeoutMs,
    saveEditor: opts.saveEditor,
    url: opts.url,
    expect: opts.expect,
    chainFinalize: opts.chainFinalize,
  })
  const result = preserveAwaitLiveHost(
    await stampAwaitLoginHost(rawWait, { profile: opts.profile, url: opts.url }),
    rawWait,
  )
  const finished = await withOperatorSession({
    note: noteAfterSignupWait({ profile: opts.profile, status: result.status }),
  })
  if (result.chainFinalize && result.nextCall?.tool === "auspex_finalize_login" && result.nextCall.url && result.nextCall.expect) {
    const finalized = await runFinalizeLogin({
      profile: result.name,
      url: opts.url ?? result.nextCall.url,
      expect: opts.expect ?? result.nextCall.expect,
      ssoProvider: opts.ssoProvider,
    })
    const receipt = toAgentReceipt(finalized)
    return stampSchema({
      ...receipt,
      chainedFinalize: true,
      awaitLogin: {
        status: result.status,
        foldMiss: result.foldMiss,
        editorSave: result.editorSave,
        editorFold: result.editorFold,
        next: result.next,
        nextCall: result.nextCall,
      },
      operator: finished.agent,
    })
  }
  const ok = result.status === "completed" && result.foldMiss !== true
  return stampSchema({ ok, ...result, operator: finished.agent })
}

export async function runFinalizeLoginDoor(opts: {
  profile: string
  url?: string
  expect?: string
  ssoProvider?: SsoProvider
  onProgress?: ProgressFn
}) {
  const book = await withOperatorSession({ note: { profile: opts.profile, site: opts.url } })
  const result = await runFinalizeLogin(opts)
  return attachMatchedPurgeNext(toAgentReceipt(result), book.agent)
}

export async function runProfilesDoor(opts: { purge?: string; humanAgree?: boolean }) {
  const book = await withOperatorSession({
    humanAgree: opts.humanAgree,
    voluntary: opts.purge ? [opts.purge] : [],
  })
  const profiles = await listProfiles()
  return stampSchema({ ok: true, profiles, operator: book.agent, wiped: book.wiped })
}

export async function runProfileStatusDoor(opts: { profile?: string; name?: string; url?: string }) {
  const named = applySavedCheckName(opts)
  const book = await withOperatorSession({
    note: named.profile ? { profile: named.profile, site: named.url } : undefined,
  })
  return stampSchema({ ...(await profileStatus(opts)), operator: book.agent })
}

export async function runVerifyDoor(runDir?: string, onProgress?: ProgressFn) {
  return stampSchema(await verifyReceipt(runDir, { ...defaultVerifyDeps(), onProgress }))
}

export async function runReapDoor(opts: {
  dryRun?: boolean
  sessionId?: string
  vmId?: string
  packReceipts?: boolean
  accountWide?: boolean
}) {
  return stampSchema(await reapLeftovers(opts))
}

export async function runDesktopDoor(opts: {
  open?: string
  type?: string
  click?: { x: number; y: number }
  expect?: string
  onProgress?: ProgressFn
}) {
  return stampSchema(
    await runDesktopReview({
      ...defaultDesktopDeps(),
      status: process.stderr,
      task: { open: opts.open, type: opts.type, click: opts.click, expect: opts.expect },
    }),
  )
}

export async function runTraceDoor(opts: { profile?: string; limit?: number; all?: boolean }) {
  return stampSchema({ ok: true, ...(await readLoginTrace(opts)) })
}

export async function runJobDoor(opts: JobRunOptions) {
  const named = applySavedCheckName({
    name: opts.name,
    url: opts.url,
    expect: opts.expect,
    profile: opts.profile,
  })
  const resolved = named.url || named.profile ? resolveLoginProfile({ profile: named.profile, url: named.url }) : undefined
  const book = await withOperatorSession({
    note: resolved ? { profile: resolved.name, site: named.url, busyMs: SIGNUP_BUSY_MS } : undefined,
  })
  const result = await runJob(opts)
  return stampSchema({ ...result, operator: book.agent })
}

export async function runJobStatusDoor(opts: JobStatusOptions) {
  return readJobStatus(opts)
}
