/** CLI flags for auspex_job / auspex_job_status. Copy lives in tool-copy.ts. */

import { takeFlag, takeOption, unexpectedArgs } from "./argv.ts"
import { isCheckUrl, isHttpOrHttpsUrl, LOOPBACK_URL_ERROR } from "./http-url.ts"
import { requireJobId } from "./job-store.ts"
import type { HandoffPacket } from "./profiles.ts"
import type { ProgressFn } from "./progress.ts"
import { isNonEmptyExpect } from "./text.ts"

export { JOB_DESCRIPTION, JOB_STATUS_DESCRIPTION } from "./tool-copy.ts"

export const JOB_INPUT_ERROR = "auspex_job requires jobId, name, or url+expect"

export type JobRunOptions = {
  jobId?: string
  name?: string
  profile?: string
  url?: string
  expect?: string
  skipFinalize?: boolean
  verifyWithProfile?: boolean
  wait?: boolean
  wakeWebhookUrl?: string
  timeoutMs?: number
  onProgress?: ProgressFn
  /** Called once when the door is minted, before the await. Not persisted. Used by `connect`. */
  onMinted?: (minted: { profile: string; handoff: HandoffPacket }) => void
}

export function parseJobFlags(args: string[]): { ok: true; opts: JobRunOptions } | { ok: false; message: string } {
  const rest = [...args]
  const jobId = takeOption(rest, "--job-id")
  const name = takeOption(rest, "--name")
  const profile = takeOption(rest, "--profile")
  const url = takeOption(rest, "--url")
  const expect = takeOption(rest, "--expect")
  const wakeWebhookUrl = takeOption(rest, "--wake-webhook")
  const timeoutRaw = takeOption(rest, "--timeout-ms")
  const skipFinalize = takeFlag(rest, "--skip-finalize")
  const verifyWithProfile = takeFlag(rest, "--verify-with-profile")
  const wait = takeFlag(rest, "--wait")
  const extra = unexpectedArgs(rest)
  if (extra) return { ok: false, message: extra }
  if (url !== undefined && !isHttpOrHttpsUrl(url)) return { ok: false, message: "url must be an http or https URL" }
  if (url !== undefined && !isCheckUrl(url)) return { ok: false, message: LOOPBACK_URL_ERROR }
  if (wakeWebhookUrl !== undefined && !isHttpOrHttpsUrl(wakeWebhookUrl)) {
    return { ok: false, message: "wakeWebhookUrl must be an http or https URL (no userinfo)" }
  }
  let timeoutMs: number | undefined
  if (timeoutRaw !== undefined) {
    const n = Number(timeoutRaw)
    if (!Number.isFinite(n)) return { ok: false, message: "--timeout-ms must be a number" }
    timeoutMs = n
  }
  if (!jobId && !name && (!url || !isNonEmptyExpect(expect ?? ""))) {
    return { ok: false, message: JOB_INPUT_ERROR }
  }
  return {
    ok: true,
    opts: {
      jobId,
      name,
      profile,
      url,
      expect,
      skipFinalize: skipFinalize || undefined,
      verifyWithProfile: verifyWithProfile || undefined,
      wait: wait || undefined,
      wakeWebhookUrl,
      timeoutMs,
    },
  }
}

export function parseJobStatusFlags(
  args: string[],
): { ok: true; jobId: string; waitMs?: number } | { ok: false; message: string } {
  const rest = [...args]
  const jobId = takeOption(rest, "--job-id")
  const waitRaw = takeOption(rest, "--wait-ms")
  const extra = unexpectedArgs(rest)
  if (extra) return { ok: false, message: extra }
  if (!jobId) return { ok: false, message: "job-status requires --job-id <id>" }
  let waitMs: number | undefined
  if (waitRaw !== undefined) {
    const n = Number(waitRaw)
    if (!Number.isFinite(n)) return { ok: false, message: "--wait-ms must be a number" }
    waitMs = n
  }
  try {
    return { ok: true, jobId: requireJobId(jobId), waitMs }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
