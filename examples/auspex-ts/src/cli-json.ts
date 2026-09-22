import { solariFailurePayload } from "./errors.ts"
import type { NextCall } from "./next-call.ts"
import { SCHEMA_VERSION, stampSchema } from "./schema-version.ts"

export { SCHEMA_VERSION, stampSchema }

export function writeStdoutJson(obj: object): void {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`)
}

export function exitFromOk(ok: boolean): number {
  return ok ? 0 : 1
}

export function usageErrorReceipt(message: string): {
  ok: false
  schemaVersion: number
  error: string
  code: string
} {
  return stampSchema({ ok: false as const, error: message, code: "UsageError" })
}

export function failureReceipt(err: unknown): {
  ok: false
  schemaVersion: number
  error: string
  code: string
  retryable: boolean
  recovery?: string
  status?: number
  nextCall?: NextCall
} {
  const body = solariFailurePayload(err)
  const reap = body.code === "ConcurrencyLimitExceeded" || body.status === 429
  return stampSchema({
    ...body,
    ...(reap ? { nextCall: body.nextCall ?? { tool: "auspex_reap" } } : {}),
  })
}

