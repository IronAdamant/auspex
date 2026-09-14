/** Agent receipt schema. Bump when adding required fields; never remove ok/reason/url/expect/screenshotPath. */
export const SCHEMA_VERSION = 1 as const

export type SchemaVersion = typeof SCHEMA_VERSION

export function stampSchema<T extends object>(obj: T): T & { schemaVersion: number } {
  const rest = { ...obj } as T & { schemaVersion?: number }
  delete rest.schemaVersion
  return { schemaVersion: SCHEMA_VERSION, ...(rest as T) }
}
