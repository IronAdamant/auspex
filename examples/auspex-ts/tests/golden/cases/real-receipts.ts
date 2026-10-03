// Real data: the redacted receipts and job files from live runs in demo/ (Trello, tldraw, MariaDB,
// Lorari, Chatwoot, OneDrive, ConsistencyHub…). Each one goes through the rules that read a receipt
// or its URLs, so a rule change shows up as a changed row for a site Auspex has actually met.
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { PKG, type GoldenCases } from "../harness.ts"
import { connectOutcome } from "../../../src/connect.ts"
import type { JobReceipt } from "../../../src/job-store.ts"
import { adviseProfileHost } from "../../../src/profile-host-advice.ts"
import { profileSlugFromUrl } from "../../../src/profile-slug.ts"
import { isLoggedOutLanding, isPersistableAppUrl } from "../../../src/profile-storage.ts"
import { parseReceiptV1 } from "../../../src/receipt-schema.ts"
import { shouldFailClosedAuth } from "../../../src/sso.ts"
import { classifySweepReceipt } from "../../../src/sweep.ts"
import type { AgentReceipt } from "../../../src/agent-receipt.ts"
import { isBotChallengePage } from "../../../src/text.ts"
import { isCheckUrl } from "../../../src/http-url.ts"

const demo = path.join(PKG, "demo")
const read = (f: string) => JSON.parse(readFileSync(path.join(demo, f), "utf8")) as Record<string, unknown>

export const cases: GoldenCases = {}
for (const file of readdirSync(demo).filter((f) => f.endsWith("-receipt.json")).sort()) {
  const r = read(file)
  const site = file.replace(/-receipt\.json$/, "")
  const url = String(r.url ?? "")
  const finalUrl = String(r.finalUrl ?? url)
  const hasProfile = Boolean(r.profile) || r.profileSeed !== undefined
  if (r.jobId) {
    cases[`${site}: connect outcome`] = () => connectOutcome(r as unknown as JobReceipt)
    continue
  }
  cases[`${site}: receipt v1 parses`] = () => {
    const p = parseReceiptV1(r)
    return { ok: p.ok, reason: p.reason }
  }
  cases[`${site}: sweep row`] = () =>
    classifySweepReceipt({ name: site, url, expect: String(r.expect) }, r as unknown as AgentReceipt, hasProfile)
  cases[`${site}: bot wall`] = () => isBotChallengePage(String(r.title ?? ""), String(r.excerpt ?? ""))
  cases[`${site}: url rules`] = () => ({
    browserMayOpen: isCheckUrl(url),
    slug: profileSlugFromUrl(url),
    hostAdvice: adviseProfileHost({ profile: profileSlugFromUrl(url), url }),
    persistable: isPersistableAppUrl(finalUrl),
    loggedOutLanding: isLoggedOutLanding(finalUrl.replace(/<user>/g, "user")),
    signInPage: shouldFailClosedAuth(new URL(finalUrl.replace(/<user>/g, "user")), { profile: "saved" }),
  })
}

// The connect runs list one outcome per app; keep the counts honest.
for (const file of readdirSync(demo).filter((f) => f.startsWith("connect-run-")).sort()) {
  cases[`${file}: summary`] = () => read(file).summary
}
