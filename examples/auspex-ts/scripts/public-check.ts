/**
 * Weekly public consumer loop: Checkpoint + ironadamant.com.
 * Skips with exit 0 when SOLARI_API_KEY is unset (opt-in CI / local).
 * Never --record and never attaches a logged-in ConsistencyHub profile.
 */
import { fileURLToPath } from "node:url"
import path from "node:path"
import { runCheck, type CheckResult } from "../src/check.ts"
import { resolveSavedCheck } from "../src/saved-checks.ts"
import { loadDotEnv } from "../src/solari.ts"

export const PUBLIC_CHECK_NAMES = ["ironadamant", "checkpoint"] as const

export const PUBLIC_CHECKS = PUBLIC_CHECK_NAMES.map((name) => {
  const saved = resolveSavedCheck(name)
  return { name: saved.name, url: saved.url, expect: saved.expect }
})

export type PublicCheckSummary = {
  skipped?: boolean
  reason?: string
  results: Array<{
    url: string
    expect: string
    ok: boolean
    matched: boolean
    finalUrl?: string
  }>
}

export async function runPublicChecks(opts: {
  key?: string
  check?: (url: string, expect: string) => Promise<Pick<CheckResult, "ok" | "matched" | "finalUrl">>
} = {}): Promise<PublicCheckSummary> {
  loadDotEnv()
  const key = opts.key ?? process.env.SOLARI_API_KEY?.trim()
  if (!key) {
    return { skipped: true, reason: "SOLARI_API_KEY is not set", results: [] }
  }
  const check =
    opts.check ??
    (async (url, expect) => {
      const result = await runCheck({ url, expect })
      return { ok: result.ok, matched: result.matched, finalUrl: result.finalUrl }
    })
  const results: PublicCheckSummary["results"] = []
  for (const site of PUBLIC_CHECKS) {
    const result = await check(site.url, site.expect)
    results.push({
      url: site.url,
      expect: site.expect,
      ok: result.ok,
      matched: result.matched,
      finalUrl: result.finalUrl,
    })
  }
  return { results }
}

export function publicCheckExitCode(summary: PublicCheckSummary): number {
  if (summary.skipped) return 0
  return summary.results.every((r) => r.ok && r.matched) ? 0 : 1
}

async function main(): Promise<number> {
  const summary = await runPublicChecks()
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  return publicCheckExitCode(summary)
}

const thisFile = fileURLToPath(import.meta.url)
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : ""
if (invoked === thisFile) {
  process.exit(await main())
}
