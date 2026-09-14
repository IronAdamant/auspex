import type { CheckResult } from "./check.ts"
import {
  agentReceiptOk,
  overlayVerifyReason,
  type CheckReason,
} from "./check-reason.ts"
import type { ReceiptDiff } from "./receipt-diff.ts"
import type { VerifyResult } from "./sandbox.ts"

export type AgentReceipt = {
  ok: boolean
  reason: CheckReason
  url: string
  expect: string
  screenshotPath: string
  title: string
  finalUrl: string
  matched: boolean
  excerpt: string
  sessionId: string
  networkIdle: boolean
  replayReady?: boolean
  waitedFor?: string
  filled?: string
  clicked?: string
  needsHuman?: boolean
  diff?: ReceiptDiff
  verify?: VerifyResult
  profileSeed?: CheckResult["profileSeed"]
  profileSaved?: CheckResult["profileSaved"]
}

export function toAgentReceipt(
  check: CheckResult,
  extras?: { verify?: VerifyResult },
): AgentReceipt {
  const reason = extras?.verify ? overlayVerifyReason(check.reason, extras.verify) : check.reason
  const ok = agentReceiptOk({
    protocolOk: check.ok,
    reason,
    verify: extras?.verify,
  })
  return {
    ok,
    reason,
    url: check.url || check.finalUrl,
    expect: check.expect,
    screenshotPath: check.screenshotPath,
    title: check.title,
    finalUrl: check.finalUrl,
    matched: check.matched,
    excerpt: check.excerpt,
    sessionId: check.sessionId,
    networkIdle: check.networkIdle,
    replayReady: check.replayReady,
    waitedFor: check.waitedFor,
    filled: check.filled,
    clicked: check.clicked,
    needsHuman: check.needsHuman,
    diff: check.diff,
    verify: extras?.verify,
    profileSeed: check.profileSeed,
    profileSaved: check.profileSaved,
  }
}
