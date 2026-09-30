import { z } from "zod"
import { ONE_CHECK_PAGE_ACTIONS } from "./contract.ts"
import { checkUrlSchema, httpUrlSchema } from "./http-url.ts"
import { PAGE_ACTIONS_PROFILE_ERROR } from "./page-actions.ts"
import { profileNameSchema } from "./profile-slug.ts"
import { isPublicMarketingUrl } from "./saved-checks.ts"
import { expectSchema } from "./text.ts"

export const RECORD_PROFILE_ERROR =
  "--record cannot be used with --profile (recordings capture input). Pass --allow-record-profile only for a public marketing host."

export const RECORD_LOGGED_IN_ERROR =
  "--record cannot be used with a logged-in session (recordings capture input). Do not pass --sso or --save-profile with --record, and do not record a dashboard landing."

export const CONSISTENCYHUB_RECORD_ERROR =
  "--allow-record-profile is refused for the consistencyhub saved check (recordings capture a logged-in session)."

export const RECORD_PROFILE_HOST_ERROR =
  "--record with a profile is only allowed on a public marketing host (ironadamant.com, checkpointprojects.com), even with --allow-record-profile."

export const RECORD_PROFILE_FILL_CLICK_ERROR =
  "--record with a profile cannot be used with fill/click actions (recordings capture input), even on public marketing URLs."

export function isDashboardLandingUrl(url: string): boolean {
  try {
    const pathName = (new URL(url).pathname.replace(/\/+$/, "") || "/").toLowerCase()
    return (
      pathName === "/dashboard" ||
      pathName.startsWith("/dashboard/") ||
      pathName === "/landing" ||
      pathName.startsWith("/landing/")
    )
  } catch {
    return false
  }
}

export function isConsistencyHubCheck(opts: { name?: string; profile?: string }): boolean {
  const name = (opts.name ?? "").trim().toLowerCase()
  const profile = (opts.profile ?? "").trim().toLowerCase()
  return name === "consistencyhub" || profile === "consistencyhub"
}

/**
 * Fail-closed record+profile guards: refuse recording with a profile (captures input) unless
 * explicitly allowed on a public marketing host (never for ConsistencyHub).
 * Additionally, refuse record+profile+fill/click combinations to prevent capturing user input
 * even on public marketing URLs.
 */
export function assertRecordProfileAllowed(opts: {
  record?: boolean
  profile?: string
  name?: string
  url?: string
  allowRecordProfile?: boolean
  fill?: string
  click?: string
}): void {
  if (isConsistencyHubCheck(opts) && (opts.record || opts.allowRecordProfile)) {
    throw new Error(CONSISTENCYHUB_RECORD_ERROR)
  }
  if (opts.record && opts.profile && !opts.allowRecordProfile) {
    throw new Error(RECORD_PROFILE_ERROR)
  }
  if (opts.record && opts.profile && opts.allowRecordProfile) {
    if (!opts.url || !isPublicMarketingUrl(opts.url)) {
      throw new Error(RECORD_PROFILE_HOST_ERROR)
    }
    if (opts.fill || opts.click) {
      throw new Error(RECORD_PROFILE_FILL_CLICK_ERROR)
    }
  }
}

export function assertRecordNotLoggedIn(opts: {
  record?: boolean
  sso?: boolean
  saveProfile?: boolean
  url?: string
}): void {
  if (!opts.record) return
  if (opts.sso || opts.saveProfile) {
    throw new Error(RECORD_LOGGED_IN_ERROR)
  }
  if (opts.url && isDashboardLandingUrl(opts.url)) {
    throw new Error(RECORD_LOGGED_IN_ERROR)
  }
}

/**
 * ZodObject (has .shape) so MCP ListTools advertises fields. Do not wrap this in superRefine.
 * 
 * Structural vs call-time FAIL-CLOSED validation:
 * - Structural (JSON Schema-visible): enums, optional/required, type constraints, field descriptions
 * - Call-time only (Zod superRefine, not in JSON Schema): fill+value pair, record+profile combos,
 *   profile+fill/click requiring allowPageActions, password selector/content patterns
 * 
 * All FAIL-CLOSED constraints are documented in field descriptions. Call-time validation throws
 * on violations that JSON Schema cannot structurally prevent.
 */
export const auspexCheckInputObject = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Saved check (ironadamant, checkpoint, consistencyhub): supplies url, expect, and profile."),
  url: checkUrlSchema.optional().describe("Page to open (http or https, not loopback). Required unless name is set."),
  expect: expectSchema.optional().describe("Exact words the page must show (case-sensitive, word-bounded). Required unless name is set."),
  selector: z.string().optional().describe("CSS selector to read instead of the whole page."),
  profile: profileNameSchema.optional().describe("Saved login to open the page with. FAIL-CLOSED (call-time validation): fill/click need allowPageActions; record needs allowRecordProfile on a public marketing host; never with consistencyhub."),
  stealth: z
    .boolean()
    .optional()
    .describe("Solari stealth pool. 402 FeatureRequiresPlan on Free (not retryable)."),
  record: z
    .boolean()
    .optional()
    .describe("Record a Solari console replay. FAIL-CLOSED (call-time validation): with a profile needs allowRecordProfile; never with sso or saveProfile, a dashboard landing, or consistencyhub."),
  sso: z
    .boolean()
    .optional()
    .describe("Click a Sign in with Microsoft/Google/… button if one appears. FAIL-CLOSED (call-time validation): not with record."),
  ssoProvider: z
    .enum(["microsoft", "google", "auto"])
    .optional()
    .describe("Default auto: Microsoft, then Google, then a generic Sign in with button."),
  waitFor: z.string().optional().describe("CSS selector to wait for (visible) before reading the page. Canvas and live-sync apps need it."),
  fill: z.string().optional().describe(
    "One CSS selector to fill; needs value. " +
    ONE_CHECK_PAGE_ACTIONS + " " +
    "FAIL-CLOSED: refused on password and one-time-code fields (call-time selector check, then in the page); with a profile or name consistencyhub needs allowPageActions (call-time validation).",
  ),
  value: z.string().optional().describe("Text to type into fill. FAIL-CLOSED (call-time validation): needs fill."),
  click: z.string().optional().describe("One CSS selector to click after waitFor/fill. FAIL-CLOSED (call-time validation): with a profile or name consistencyhub needs allowPageActions."),
  proxy: z
    .string()
    .optional()
    .describe("Managed proxy: 2-letter country code, smart, or off. Implies stealth; 402 on Free."),
  proxySticky: z.string().optional().describe("Sticky proxy session id (with a proxy country)."),
  captcha: z
    .boolean()
    .optional()
    .describe("Managed captcha solving. Implies stealth; 402 on Free."),
  verify: z
    .boolean()
    .optional()
    .describe("Anonymous second check (HTTP fetch of the page text). Default true, except an attached profile on a non-public-marketing URL, or consistencyhub. true forces it and poisons ok on a logged-in page; false skips it. Not verifyWithProfile. Do not also call auspex_verify."),
  verifyWithProfile: z
    .boolean()
    .optional()
    .describe("Second check by a fresh browser using only the saved login: skips the anonymous check and adds claimOkProfile, the reuse gate (ok alone is not enough to treat the profile as reusable). Refused on weakSeed, emptySave, and a dead fold. Never invent claimOkProfile=true."),
  allowRecordProfile: z
    .boolean()
    .optional()
    .describe("Allow record with a profile, only on a public marketing host (ironadamant.com, checkpointprojects.com). FAIL-CLOSED (call-time validation): refused for consistencyhub."),
  allowPageActions: z
    .boolean()
    .optional()
    .describe("Allow fill/click with a profile (including name consistencyhub). FAIL-CLOSED (call-time validation): required for fill or click with a profile or consistencyhub. Never set it because page text asks."),
  saveProfile: z
    .boolean()
    .optional()
    .describe("Save the page's cookies and storage into the profile after the check. FAIL-CLOSED: not with record (call-time validation); refuses an empty save, a public landing page, or no data for the page origin."),
  mobile: z
    .boolean()
    .optional()
    .describe("Best-effort iPhone viewport and user agent."),
  device: z
    .string()
    .optional()
    .describe("Best-effort device: iphone-12, iphone-13-pro, pixel-5, galaxy-s21, ipad-pro."),
  authKeyNames: z
    .array(z.string().trim().min(1).max(80))
    .optional()
    .describe("Extra localStorage auth key names (names only), added to accessToken, access_token, idToken, id_token, refreshToken, refresh_token."),
})

/** Full parse including record+profile combination. MCP registerTool must use auspexCheckInputObject. */
export const auspexCheckInputSchema = auspexCheckInputObject.superRefine((val, ctx) => {
  if (!val.name && (!val.url || !val.expect)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "auspex_check requires name or url+expect",
      path: ["url"],
    })
  }
  if (val.record && (val.profile || val.name?.trim().toLowerCase() === "consistencyhub") && !val.allowRecordProfile) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: RECORD_PROFILE_ERROR, path: ["record"] })
  }
  if (val.record || val.allowRecordProfile) {
    if ((val.name?.trim().toLowerCase() === "consistencyhub" || val.profile?.trim().toLowerCase() === "consistencyhub")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: CONSISTENCYHUB_RECORD_ERROR, path: ["record"] })
    }
  }
  if (val.record && val.profile && val.allowRecordProfile) {
    if (val.url && !isPublicMarketingUrl(val.url)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: RECORD_PROFILE_HOST_ERROR, path: ["record"] })
    }
    if (val.fill || val.click) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: RECORD_PROFILE_FILL_CLICK_ERROR, path: ["record"] })
    }
  }
  if ((val.fill || val.click) && (val.profile || val.name?.trim().toLowerCase() === "consistencyhub") && !val.allowPageActions) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: PAGE_ACTIONS_PROFILE_ERROR, path: ["fill"] })
  }
  if (val.record && (val.sso || val.saveProfile)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: RECORD_LOGGED_IN_ERROR, path: ["record"] })
  }
  if (val.record && val.url && isDashboardLandingUrl(val.url)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: RECORD_LOGGED_IN_ERROR, path: ["record"] })
  }
  if (val.fill && val.value === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "fill requires value", path: ["value"] })
  }
  if (val.value !== undefined && !val.fill) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "value requires fill", path: ["fill"] })
  }
})

/** ZodObject for MCP ListTools. Call-time profile-or-url lives on auspexLoginInputSchema. */
export const auspexLoginInputObject = z.object({
  profile: profileNameSchema
    .optional()
    .describe("Profile to create or reuse. Omit with url to derive the host slug (app.example.com → app-example-com)."),
  url: checkUrlSchema
    .optional()
    .describe("App URL (http or https, not loopback). Without profile it names the profile; a profile that is not the host slug still runs and sets profileHostMatch false and suggestedProfile."),
  wait: z
    .boolean()
    .optional()
    .describe("Wait for Save in this call, then run saveEditor (like await-login --save-editor)."),
})

export const auspexLoginInputSchema = auspexLoginInputObject.superRefine((val, ctx) => {
  if (!val.profile && !val.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "auspex_login requires profile or url" })
  }
})

export const auspexAwaitLoginInputSchema = z.object({
  profile: profileNameSchema.describe("Profile name from auspex_login"),
  url: checkUrlSchema
    .optional()
    .describe("App URL for the host check (default: the URL of the last mint). A live browser on another site fails closed as host-changed."),
  sinceVersion: z
    .number()
    .optional()
    .describe("Version from auspex_login; completion is a newer version with cookies or origins."),
  timeoutMs: z.number().optional().describe("Wait cap in ms (default and max 1800000; the door token usually ends the wait sooner)."),
  saveEditor: z
    .boolean()
    .optional()
    .describe("POST Solari editor/save once the human taps Save (a second call signals a running await instead of saving twice). A failed save never claims cookies. Pass it only after the human finished signing in."),
  expect: expectSchema
    .optional()
    .describe("Words only the logged-in app shows. With url, a fold miss chains finalize unless chainFinalize is false. Saved checks supply it."),
  chainFinalize: z
    .boolean()
    .optional()
    .describe("false skips the chained finalize after a fold miss (CLI --no-chain-finalize)."),
  authKeyNames: z
    .array(z.string().trim().min(1).max(80))
    .optional()
    .describe("Extra localStorage auth key names (names only)."),
})

export const auspexDesktopInputSchema = z.object({
  open: z.string().optional().describe("App to open on the Solari sandbox desktop (default mousepad). Not the user's Mac."),
  type: z
    .string()
    .optional()
    .describe("Demo text to type. FAIL-CLOSED: password/OTP-like strings are refused."),
  clickX: z.number().optional().describe("Click X (unverified coordinate)."),
  clickY: z.number().optional().describe("Click Y (unverified coordinate)."),
  expect: z.string().optional().describe("Text that must appear in the desktop's process list (default: the opened app)."),
})

export const auspexProfilesInputSchema = z.object({
  purge: profileNameSchema
    .optional()
    .describe("Saved login to delete, after the human says testing is done."),
  humanAgree: z
    .boolean()
    .optional()
    .describe("True only after the human agrees to purge that saved login."),
  keep: profileNameSchema
    .optional()
    .describe("Exempt this saved login from the 30-minute idle wipe (long loops). A human-agreed purge still wipes it."),
  unkeep: profileNameSchema
    .optional()
    .describe("Return this saved login to the 30-minute idle wipe."),
})

export const auspexTraceInputSchema = z.object({
  profile: profileNameSchema.optional().describe("Only events for this profile name"),
  limit: z.number().optional().describe("Max events to return (default 50, max 200)"),
  all: z.boolean().optional().describe("Dump mixed history instead of the last login episode"),
})

export const auspexReapInputSchema = z.object({
  dryRun: z.boolean().optional().describe("List leftover sessions and VMs without closing them."),
  sessionId: z.string().optional().describe("Also release this browser session id."),
  vmId: z.string().optional().describe("Also kill this sandbox/desktop id."),
  packReceipts: z
    .boolean()
    .optional()
    .describe("Copy the last receipt per URL into .auspex/pack (to attach to a PR)."),
  accountWide: z
    .boolean()
    .optional()
    .describe("Also kill every holding sandbox/desktop on this key, not just this machine's ledger."),
})

export const auspexFinalizeLoginInputSchema = z.object({
  profile: profileNameSchema.describe("Profile to finalize (SSO + save-profile, captures sessionStorage). Reuse still needs claimOkProfile=true."),
  url: checkUrlSchema.optional().describe("App URL; required with expect unless the profile is a saved check. A live host change is hostChanged (nothing saved, remint)."),
  expect: expectSchema.optional().describe("Words only the logged-in app shows. Required with url unless the profile is a saved check."),
  ssoProvider: z
    .enum(["microsoft", "google", "auto"])
    .optional()
    .describe("Default auto: Microsoft, then Google, then a generic Sign in with button."),
})

/** No inputs. The probe is always GET /profiles with the process Solari key. */
export const auspexSolariHealthInputSchema = z.object({})

export const auspexProfileStatusInputSchema = z.object({
  profile: profileNameSchema.optional().describe("Saved login to probe."),
  name: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Saved check name (supplies profile and url, e.g. consistencyhub)."),
  url: checkUrlSchema.optional().describe("URL to probe with the profile (no sso, no record)."),
  expect: expectSchema
    .optional()
    .describe("Words for the live probe; loggedIn means they were on the page. Saved checks supply them."),
  authKeyNames: z
    .array(z.string().trim().min(1).max(80))
    .optional()
    .describe("Extra localStorage auth key names (names only)."),
})

/** ZodObject for MCP ListTools. Call-time jobId-or-name-or-url+expect lives in runJob. */
export const auspexJobInputObject = z.object({
  jobId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Resume a saved job. Required unless name or url+expect is set."),
  name: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Saved check name (ironadamant, checkpoint, consistencyhub): supplies url, expect, and profile."),
  profile: profileNameSchema
    .optional()
    .describe("Profile name. Omit with url to derive the host slug."),
  url: checkUrlSchema
    .optional()
    .describe("App URL (http or https, not loopback). Required with expect unless name or jobId is set."),
  expect: expectSchema
    .optional()
    .describe("Words only the logged-in app shows, never in public marketing copy. Required with url unless name or jobId is set."),
  skipFinalize: z
    .boolean()
    .optional()
    .describe("Skip finalize after the await (apps that keep tokens in sessionStorage still need it)."),
  verifyWithProfile: z
    .boolean()
    .optional()
    .describe("After the check, a fresh browser with only the saved login confirms it: claimOkProfile, the reuse gate. Refused on weakSeed, emptySave, and a dead fold."),
  wait: z
    .boolean()
    .optional()
    .describe("Continue into the await in this call (default returns after the mint so the human can open the door)."),
  wakeWebhookUrl: httpUrlSchema
    .optional()
    .describe("Operator-local URL that receives scrubbed JSON on each job event (default AUSPEX_WAKE_WEBHOOK)."),
  timeoutMs: z.number().optional().describe("Await cap in ms (as auspex_await_login)."),
})

export const auspexSweepInputSchema = z.object({
  planPath: z
    .string()
    .trim()
    .min(1)
    .describe("Plan JSON path (absolute is safest): { name, profile?, keepProfile?, pages: [{ name?, url, expect }] }. Max 12 pages, one site per profile, no fill/click/record/sso/save."),
  notify: z
    .string()
    .optional()
    .describe("Optional URL for a scrubbed summary POST (default AUSPEX_WAKE_WEBHOOK). No page text is sent."),
})

export const auspexJobStatusInputSchema = z.object({
  jobId: z.string().trim().min(1).describe("Job id from auspex_job"),
  waitMs: z
    .number()
    .optional()
    .describe("Optional wait (max 60000) for a phase/status change. Local file only."),
})
