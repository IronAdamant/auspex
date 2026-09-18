import { SCHEMA_VERSION } from "./schema-version.ts"
import { parseReceiptV1, type ReceiptV1 } from "./receipt-schema.ts"
import type { CheckResult } from "./check.ts"
import { agentReceiptOk, overlayVerifyReason, type CheckReason } from "./check-reason.ts"
import type { VerifyResult } from "./sandbox.ts"

export type AgentReceipt = ReceiptV1

export function toAgentReceipt(
  check: CheckResult,
  extras?: { verify?: VerifyResult },
): AgentReceipt {
  const verify = extras?.verify
  const reason: CheckReason =
    verify && !verify.skipped ? overlayVerifyReason(check.reason, verify) : check.reason
  const ok = agentReceiptOk({
    protocolOk: check.ok,
    reason,
    verify,
  })
  
  let next = check.next
  if (
    check.matched &&
    verify &&
    !verify.skipped &&
    verify.ok &&
    !verify.claimOk
  ) {
    const claimBlob = (verify.claimErrors ?? []).join(" ").toLowerCase()
    const isFetchOnly = /fetched page|does not contain|anonymous|fetch/i.test(claimBlob)
    const hasOcrNote = /ocr|screenshot|tesseract/i.test(claimBlob)
    if (isFetchOnly && !hasOcrNote) {
      const hint = next ? `${next} ` : ""
      next = `${hint}Live matched; independent fetch cannot see auth-gated content. For profile session checks, use --no-verify (or rely on OCR when available). Anonymous sandbox verify is honest: do not auto-retry.`
    }
  }
  
  const receipt: Record<string, unknown> = {
    schemaVersion: SCHEMA_VERSION,
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
  }
  const optional: Record<string, unknown> = {
    replayReady: check.replayReady,
    waitedFor: check.waitedFor,
    filled: check.filled,
    clicked: check.clicked,
    needsHuman: check.needsHuman,
    next,
    diff: check.diff,
    verify,
    profileSeed: check.profileSeed,
    profileSaved: check.profileSaved,
  }
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) receipt[key] = value
  }
  return parseReceiptV1(receipt)
}
