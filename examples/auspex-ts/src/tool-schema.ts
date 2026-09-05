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
    .describe("Click Sign in with Microsoft and the signed-in account picker if they appear"),
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
})

/** Full parse including record+profile combination. MCP registerTool must use auspexCheckInputObject. */
export const auspexCheckInputSchema = auspexCheckInputObject.superRefine((val, ctx) => {
  if (val.record && val.profile && !val.allowRecordProfile) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: RECORD_PROFILE_ERROR, path: ["record"] })
  }
})

export const auspexLoginInputSchema = z.object({
  profile: profileNameSchema.describe("Profile name to create or reuse"),
  url: httpUrlSchema.optional().describe("Optional http(s) login URL hint to show the human"),
})

export const auspexDesktopInputSchema = z.object({
  open: z.string().optional().describe("Optional app name to open on the desktop before screenshot"),
  type: z.string().optional().describe("Optional text to type after open"),
  clickX: z.number().optional().describe("Click X (default 640)"),
  clickY: z.number().optional().describe("Click Y (default 360)"),
})
