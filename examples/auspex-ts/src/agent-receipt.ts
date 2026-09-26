import { existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { SCHEMA_VERSION, stampSchema } from "./schema-version.ts"
import { parseReceiptV1, type ReceiptV1 } from "./receipt-schema.ts"
import type { CheckResult } from "./check.ts"
import { agentReceiptOk, overlayVerifyReason, type CheckReason } from "./check-reason.ts"
import { packageRoot } from "./paths.ts"
import { classifySeedReadiness } from "./cookie-save.ts"
import { claimOkProfileReuseNext } from "./profile-persist.ts"
import type { VerifyResult } from "./sandbox.ts"

export type AgentReceipt = ReceiptV1

export function checkProtocolOk(check: CheckResult): boolean {
  return check.protocolOk ?? check.ok
}

export function toAgentReceipt(
  check: CheckResult,
  extras?: { verify?: VerifyResult },
): AgentReceipt {
  const hostChanged = check.hostChanged === true || check.reason === "hostChanged"
  const verify = extras?.verify && hostChanged ? { ...extras.verify, claimOkProfile: false } : extras?.verify
  const reason: CheckReason =
    verify && !verify.skipped ? overlayVerifyReason(check.reason, verify) : check.reason
  const ok = agentReceiptOk({
    protocolOk: checkProtocolOk(check),
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
    const isFetchOnly = /fetched page|does not contain|fetch failed/i.test(claimBlob)
    const hasOcrAttempt = /ocr of screenshot does not contain/i.test(claimBlob)
    const ocrUnavailable = /ocr unavailable|tesseract not installed/i.test(claimBlob)
    if (isFetchOnly && !hasOcrAttempt) {
      const hint = next ? `${next} ` : ""
      const ocrNote = ocrUnavailable ? " OCR was unavailable (tesseract missing in sandbox)." : ""
      next = `${hint}Live matched; independent fetch cannot see auth-gated content. For profile session checks, use --no-verify (or rely on OCR when available).${ocrNote} Anonymous sandbox verify is honest: do not auto-retry.`
    }
  }
  if (!hostChanged) next = claimOkProfileReuseNext(verify, next)
  const nextCall = check.nextCall
  const seedReadiness =
    check.seedReadiness ??
    (check.profileSeed
      ? classifySeedReadiness({
          url: check.url,
          cookies: check.profileSeed.cookies,
          origins: check.profileSeed.origins,
          sessionStorage: check.profileSeed.sessionStorage,
          sessionStorageStale: check.profileSeed.sessionStorageStale,
          cookieHosts: check.profileSeed.cookieHosts,
          liveHost: check.profileSeed.liveHost,
          appOriginCookieCount: check.profileSeed.appOriginCookieCount,
          localStorageCount: check.profileSeed.localStorageCount,
          localStorageAuthKeyNames: check.profileSeed.localStorageAuthKeyNames,
        })
      : undefined)

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
    nextCall,
    profileHostMatch: check.profileHostMatch,
    suggestedProfile: check.suggestedProfile,
    hostChanged: check.hostChanged,
    suggestedUrl: check.suggestedUrl,
    diff: check.diff,
    verify,
    profileSeed: check.profileSeed,
    seedReadiness,
    profileSaved: check.profileSaved,
    protocolOk: check.protocolOk,
    vwpRefused: verify?.vwpRefused,
  }
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) receipt[key] = value
  }
  return parseReceiptV1(receipt)
}

/** On-disk manifest uses the same agent-success `ok` as stdout/MCP. */
export async function persistAgentManifest(
  check: CheckResult,
  extras?: { verify?: VerifyResult },
): Promise<void> {
  const abs = path.isAbsolute(check.screenshotPath)
    ? check.screenshotPath
    : path.join(packageRoot, check.screenshotPath)
  const dir = path.dirname(abs)
  if (!existsSync(dir)) return
  const receipt = toAgentReceipt(check, extras)
  await writeFile(path.join(dir, "manifest.json"), `${JSON.stringify(stampSchema(receipt), null, 2)}\n`)
}
