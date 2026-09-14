import { z } from "zod"
import { checkUrlSchema, httpUrlSchema } from "./http-url.ts"
import { profileNameSchema } from "./profiles.ts"
import { expectSchema } from "./text.ts"

export const RECORD_PROFILE_ERROR =
  "--record cannot be used with --profile (recordings capture input). Pass --allow-record-profile to override."

export function assertRecordProfileAllowed(opts: {
  record?: boolean
  profile?: string
  allowRecordProfile?: boolean
}): void {
  if (opts.record && opts.profile && !opts.allowRecordProfile) {
    throw new Error(RECORD_PROFILE_ERROR)
  }
}

/** ZodObject (has .shape) so MCP ListTools advertises url/expect. Do not wrap this in superRefine. */
export const auspexCheckInputObject = z.object({
  url: checkUrlSchema.describe("http or https URL to open (not loopback)"),
  expect: expectSchema.describe("Non-empty substring that must appear in the page text"),
  selector: z.string().optional().describe("Optional CSS selector to extract instead of body"),
  profile: profileNameSchema.optional().describe("Solari profile name to reuse cookies/storage"),
  stealth: z
    .boolean()
    .optional()
    .describe("Solari stealth pool. Starter+; Free returns 402 FeatureRequiresPlan (not retryable)"),
  record: z
    .boolean()
    .optional()
    .describe(
      "Record for Solari console Replay via sessionId (no presigned replayUrl). Forbidden with profile unless allowRecordProfile",
    ),
  sso: z
    .boolean()
    .optional()
    .describe("Click Sign in with Microsoft/Google (or another Sign in with … button) if they appear"),
  ssoProvider: z
    .enum(["microsoft", "google", "auto"])
    .optional()
    .describe("SSO vendor. Default auto tries Microsoft, then Google, then a generic Sign in with button"),
  waitFor: z.string().optional().describe("CSS selector to wait until visible before extract"),
  fill: z.string().optional().describe("CSS selector to fill; requires value"),
  value: z.string().optional().describe("Text to type into fill"),
  click: z.string().optional().describe("CSS selector to click after wait/fill"),
  proxy: z
    .string()
    .optional()
    .describe("Managed proxy: 2-letter country, smart, or off. Implies stealth. Starter+ (402 on Free)"),
  proxySticky: z.string().optional().describe("Sticky proxy session id (with proxy country)"),
  captcha: z
    .boolean()
    .optional()
    .describe("Managed captcha solving. Implies stealth. Starter+ (402 on Free)"),
  verify: z
    .boolean()
    .optional()
    .describe(
      "One-shot: after check, audit the receipt in a headless sandbox and kill that VM. Do not also call auspex_verify",
    ),
  allowRecordProfile: z
    .boolean()
    .optional()
    .describe("Override: allow record together with a profile (recordings capture input)"),
  saveProfile: z
    .boolean()
    .optional()
    .describe(
      "After the check, persist cookies, localStorage, and sessionStorage into the named profile via POST /profiles/:id/save. Refuses an empty seed or a public /landing session so a 0-cookie Save cannot wipe a login.",
    ),
})

/** Full parse including record+profile combination. MCP registerTool must use auspexCheckInputObject. */
export const auspexCheckInputSchema = auspexCheckInputObject.superRefine((val, ctx) => {
  if (val.record && val.profile && !val.allowRecordProfile) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: RECORD_PROFILE_ERROR, path: ["record"] })
  }
  if (val.fill && val.value === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "fill requires value", path: ["value"] })
  }
  if (val.value !== undefined && !val.fill) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "value requires fill", path: ["fill"] })
  }
})

export const auspexLoginInputSchema = z.object({
  profile: profileNameSchema.describe("Profile name to create or reuse"),
  url: httpUrlSchema.optional().describe("Optional http(s) login URL hint to show the human"),
  wait: z
    .boolean()
    .optional()
    .describe("If true, block until Save stores cookies or origins (empty Save is not success)"),
})

export const auspexAwaitLoginInputSchema = z.object({
  profile: profileNameSchema.describe("Profile name from auspex_login"),
  sinceVersion: z
    .number()
    .optional()
    .describe("Version from auspex_login; completion is a newer version with cookies or origins"),
  timeoutMs: z.number().optional().describe("Cap wait in ms (default 300000, max 600000)"),
})

export const auspexDesktopInputSchema = z.object({
  open: z.string().optional().describe("App to open (default mousepad)"),
  type: z.string().optional().describe("Optional text to type after focusing the window"),
  clickX: z.number().optional().describe("Click X. Default 320 when opening mousepad; no silent center-click"),
  clickY: z.number().optional().describe("Click Y. Default 300 when opening mousepad"),
  expect: z.string().optional().describe("Substring that must appear in desktop process list after the task"),
})

export const auspexReapInputSchema = z.object({
  dryRun: z.boolean().optional().describe("List leftover sessions/VMs without closing them"),
  sessionId: z.string().optional().describe("Extra browser session id to release"),
  vmId: z.string().optional().describe("Extra sandbox/desktop id to kill"),
})
