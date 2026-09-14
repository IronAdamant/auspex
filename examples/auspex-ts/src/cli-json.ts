import { classifySolariError } from "./errors.ts"
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
} {
  const issue = classifySolariError(err)
  return stampSchema({
    ok: false as const,
    error: issue.message,
    code: issue.code,
    retryable: issue.retryable,
    ...(issue.recovery ? { recovery: issue.recovery } : {}),
    ...(issue.status !== undefined ? { status: issue.status } : {}),
  })
}

export function asAgentJson<T extends object>(obj: T): T & { schemaVersion: number } {
  return stampSchema(obj)
}
