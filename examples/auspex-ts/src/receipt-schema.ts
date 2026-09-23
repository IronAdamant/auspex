import { CHECK_REASONS, type CheckReason } from "./check-reason.ts"
import type { ProfileSaveResult, ProfileSeed } from "./profile-persist.ts"
import type { ReceiptDiff } from "./receipt-diff.ts"
import type { VerifyResult } from "./sandbox.ts"
import type { NextCall } from "./next-call.ts"
import { SCHEMA_VERSION } from "./schema-version.ts"

export { SCHEMA_VERSION }

/** Frozen v1 required keys. Do not grow this list without bumping schemaVersion. */
export const RECEIPT_V1_REQUIRED_KEYS = [
  "schemaVersion",
  "ok",
  "reason",
  "url",
  "expect",
  "screenshotPath",
] as const

export const RECEIPT_V1_OPTIONAL_STRING_KEYS = [
  "title",
  "finalUrl",
  "excerpt",
  "sessionId",
  "waitedFor",
  "filled",
  "clicked",
  "next",
  "suggestedProfile",
  "suggestedUrl",
] as const

export const RECEIPT_V1_OPTIONAL_BOOLEAN_KEYS = [
  "matched",
  "networkIdle",
  "replayReady",
  "needsHuman",
  "profileHostMatch",
  "hostChanged",
] as const

export const RECEIPT_V1_OPTIONAL_OBJECT_KEYS = [
  "diff",
  "verify",
  "profileSeed",
  "profileSaved",
  "nextCall",
] as const

export const RECEIPT_V1_OPTIONAL_KEYS = [
  ...RECEIPT_V1_OPTIONAL_STRING_KEYS,
  ...RECEIPT_V1_OPTIONAL_BOOLEAN_KEYS,
  ...RECEIPT_V1_OPTIONAL_OBJECT_KEYS,
] as const

export type ReceiptV1RequiredKey = (typeof RECEIPT_V1_REQUIRED_KEYS)[number]
export type ReceiptV1OptionalKey = (typeof RECEIPT_V1_OPTIONAL_KEYS)[number]

/** Check receipt. Extra JSON keys are allowed and stay optional. */
export type ReceiptV1 = {
  schemaVersion: typeof SCHEMA_VERSION
  ok: boolean
  reason: CheckReason
  url: string
  expect: string
  screenshotPath: string
  title?: string
  finalUrl?: string
  matched?: boolean
  excerpt?: string
  sessionId?: string
  networkIdle?: boolean
  replayReady?: boolean
  waitedFor?: string
  filled?: string
  clicked?: string
  needsHuman?: boolean
  next?: string
  /** Login / await-login / finalize-login host compare. Omitted when there is no URL. */
  profileHostMatch?: boolean
  /** Host slug. Present only when profileHostMatch is false. */
  suggestedProfile?: string
  /** Live remote https host diverged from the minted profile host. ok is false. */
  hostChanged?: boolean
  /** https origin of that live site. Remint login with this URL. */
  suggestedUrl?: string
  nextCall?: NextCall
  diff?: ReceiptDiff
  verify?: VerifyResult
  profileSeed?: ProfileSeed
  profileSaved?: ProfileSaveResult
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isCheckReason(value: unknown): value is CheckReason {
  return typeof value === "string" && (CHECK_REASONS as readonly string[]).includes(value)
}

/** Parse a check receipt. Required keys only; documented optionals type-checked if present. */
export function parseReceiptV1(input: unknown): ReceiptV1 {
  if (!isPlainObject(input)) throw new Error("receipt must be a JSON object")
  for (const key of RECEIPT_V1_REQUIRED_KEYS) {
    if (input[key] === undefined) throw new Error(`receipt missing required ${key}`)
  }
  if (input.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`receipt schemaVersion must be ${SCHEMA_VERSION}`)
  }
  if (typeof input.ok !== "boolean") throw new Error("receipt ok must be a boolean")
  if (!isCheckReason(input.reason)) {
    throw new Error("receipt reason must be a known CheckReason")
  }
  for (const key of ["url", "expect", "screenshotPath"] as const) {
    if (typeof input[key] !== "string") throw new Error(`receipt ${key} must be a string`)
  }
  for (const key of RECEIPT_V1_OPTIONAL_STRING_KEYS) {
    const value = input[key]
    if (value !== undefined && typeof value !== "string") {
      throw new Error(`receipt ${key} must be a string`)
    }
  }
  for (const key of RECEIPT_V1_OPTIONAL_BOOLEAN_KEYS) {
    const value = input[key]
    if (value !== undefined && typeof value !== "boolean") {
      throw new Error(`receipt ${key} must be a boolean`)
    }
  }
  for (const key of RECEIPT_V1_OPTIONAL_OBJECT_KEYS) {
    const value = input[key]
    if (value !== undefined && !isPlainObject(value)) {
      throw new Error(`receipt ${key} must be an object`)
    }
  }
  return input as ReceiptV1
}
