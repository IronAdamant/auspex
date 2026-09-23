/** CLI flags for auspex_job / auspex_job_status. Copy lives in tool-copy.ts. */

import { isHttpOrHttpsUrl } from "./http-url.ts"
import { requireJobId } from "./job-store.ts"
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
}

export function parseJobFlags(args: string[]): { ok: true; opts: JobRunOptions } | { ok: false; message: string } {
  const rest = [...args]
  const takeFlag = (name: string) => {
    const i = rest.indexOf(name)
    if (i === -1) return false
    rest.splice(i, 1)
    return true
  }
  const takeOption = (name: string) => {
    const i = rest.indexOf(name)
    if (i === -1) return undefined
    const value = rest[i + 1]
    if (value === undefined || (value.length > 0 && value.startsWith("-"))) return undefined
    rest.splice(i, 2)
    return value
  }
  const jobId = takeOption("--job-id")
  const name = takeOption("--name")
  const profile = takeOption("--profile")
  const url = takeOption("--url")
  const expect = takeOption("--expect")
  const wakeWebhookUrl = takeOption("--wake-webhook")
  const timeoutRaw = takeOption("--timeout-ms")
  const skipFinalize = takeFlag("--skip-finalize")
  const verifyWithProfile = takeFlag("--verify-with-profile")
  const wait = takeFlag("--wait")
  if (rest.length > 0) return { ok: false, message: `unexpected arguments: ${rest.join(" ")}` }
  if (url !== undefined && !isHttpOrHttpsUrl(url)) return { ok: false, message: "url must be an http or https URL" }
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
  const takeOption = (name: string) => {
    const i = rest.indexOf(name)
    if (i === -1) return undefined
    const value = rest[i + 1]
    if (value === undefined || (value.length > 0 && value.startsWith("-"))) return undefined
    rest.splice(i, 2)
    return value
  }
  const jobId = takeOption("--job-id")
  const waitRaw = takeOption("--wait-ms")
  if (rest.length > 0) return { ok: false, message: `unexpected arguments: ${rest.join(" ")}` }
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
