import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { buildCheckToolContent, buildReceiptToolContent, packToolFailure } from "./content.ts"
import { createProgress, type ProgressExtra } from "./progress.ts"
import { readJobStatus } from "./job-store.ts"
import { stampSchema } from "./schema-version.ts"
import {
  AWAIT_LOGIN_DESCRIPTION,
  CHECK_DESCRIPTION,
  DESKTOP_DESCRIPTION,
  FINALIZE_LOGIN_DESCRIPTION,
  JOB_DESCRIPTION,
  JOB_STATUS_DESCRIPTION,
  LOGIN_DESCRIPTION,
  PROFILE_STATUS_DESCRIPTION,
  PROFILES_DESCRIPTION,
  REAP_DESCRIPTION,
  TRACE_DESCRIPTION,
  VERIFY_DESCRIPTION,
} from "./tool-copy.ts"
import {
  auspexAwaitLoginInputSchema,
  auspexCheckInputObject,
  auspexDesktopInputSchema,
  auspexFinalizeLoginInputSchema,
  auspexJobInputObject,
  auspexJobStatusInputSchema,
  auspexLoginInputObject,
  auspexProfileStatusInputSchema,
  auspexProfilesInputSchema,
  auspexReapInputSchema,
  auspexTraceInputSchema,
} from "./tool-schema.ts"

export {
  AWAIT_LOGIN_DESCRIPTION,
  CHECK_DESCRIPTION,
  DESKTOP_DESCRIPTION,
  FINALIZE_LOGIN_DESCRIPTION,
  JOB_DESCRIPTION,
  JOB_STATUS_DESCRIPTION,
  LOGIN_DESCRIPTION,
  PROFILE_STATUS_DESCRIPTION,
  PROFILES_DESCRIPTION,
  REAP_DESCRIPTION,
  TRACE_DESCRIPTION,
  VERIFY_DESCRIPTION,
}

function toolJson(obj: object): string {
  return JSON.stringify(stampSchema(obj), null, 2)
}

function progressFromExtra(extra: unknown) {
  return createProgress({ extra: extra as ProgressExtra })
}

export async function executeAuspexCheck(
  ...args: Parameters<(typeof import("./runners.ts"))["executeAuspexCheck"]>
): ReturnType<(typeof import("./runners.ts"))["executeAuspexCheck"]> {
  const { executeAuspexCheck: run } = await import("./runners.ts")
  return run(...args)
}

export function registerAuspexTools(server: McpServer): void {
  server.registerTool(
    "auspex_check",
    { description: CHECK_DESCRIPTION, inputSchema: auspexCheckInputObject },
    async (args, extra) => {
      try {
        const onProgress = progressFromExtra(extra)
        onProgress("auspex_check")
        const { runCheckDoor } = await import("./runners.ts")
        const receipt = await runCheckDoor({ ...args, onProgress })
        const packed = await buildCheckToolContent(receipt)
        packed.content[0] = { type: "text", text: toolJson(receipt) }
        return packed
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_login",
    { description: LOGIN_DESCRIPTION, inputSchema: auspexLoginInputObject },
    async ({ profile, url, wait }) => {
      try {
        const { resolveLoginProfile } = await import("./profile-slug.ts")
        const { runLoginDoor } = await import("./runners.ts")
        const resolved = resolveLoginProfile({ profile, url })
        const payload = await runLoginDoor({
          profile: resolved.name,
          url,
          wait,
          profileDerived: resolved.derived,
        })
        return buildReceiptToolContent(payload, (payload as { handoff?: { qrPath?: string } }).handoff?.qrPath)
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_await_login",
    { description: AWAIT_LOGIN_DESCRIPTION, inputSchema: auspexAwaitLoginInputSchema },
    async ({ profile, sinceVersion, timeoutMs, saveEditor, url }) => {
      try {
        const { runAwaitLoginDoor } = await import("./runners.ts")
        const payload = await runAwaitLoginDoor({ profile, sinceVersion, timeoutMs, saveEditor, url })
        return { content: [{ type: "text" as const, text: toolJson(payload) }] }
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_finalize_login",
    { description: FINALIZE_LOGIN_DESCRIPTION, inputSchema: auspexFinalizeLoginInputSchema },
    async ({ profile, url, expect, ssoProvider }, extra) => {
      try {
        const onProgress = progressFromExtra(extra)
        onProgress("auspex_finalize_login")
        const { runFinalizeLoginDoor } = await import("./runners.ts")
        const receipt = await runFinalizeLoginDoor({ profile, url, expect, ssoProvider, onProgress })
        const packed = await buildCheckToolContent(receipt)
        packed.content[0] = { type: "text", text: toolJson(receipt) }
        return packed
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_profiles",
    { description: PROFILES_DESCRIPTION, inputSchema: auspexProfilesInputSchema },
    async ({ purge, humanAgree }) => {
      try {
        const { runProfilesDoor } = await import("./runners.ts")
        return { content: [{ type: "text" as const, text: toolJson(await runProfilesDoor({ purge, humanAgree })) }] }
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_profile_status",
    { description: PROFILE_STATUS_DESCRIPTION, inputSchema: auspexProfileStatusInputSchema },
    async (args) => {
      try {
        const { runProfileStatusDoor } = await import("./runners.ts")
        return { content: [{ type: "text" as const, text: toolJson(await runProfileStatusDoor(args)) }] }
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_desktop",
    { description: DESKTOP_DESCRIPTION, inputSchema: auspexDesktopInputSchema },
    async ({ open, type, clickX, clickY, expect }, extra) => {
      try {
        const onProgress = progressFromExtra(extra)
        onProgress("auspex_desktop")
        const { defaultDesktopDeps, runDesktopReview } = await import("./desktop.ts")
        const result = await runDesktopReview({
          ...defaultDesktopDeps(),
          task: {
            open,
            type,
            expect,
            click: clickX !== undefined && clickY !== undefined ? { x: clickX, y: clickY } : undefined,
          },
          status: process.stderr,
        })
        const packed = await buildReceiptToolContent(
          stampSchema({
            ok: result.ok,
            ready: result.ready,
            processOk: result.processOk,
            windowOk: result.windowOk,
            clicked: result.clicked,
            click: result.click,
            matched: result.matched,
            screenshotPath: result.screenshotPath,
            errors: result.errors,
            desktopId: result.desktopId,
            streamUrl: result.streamUrl,
            overview: result.overview,
          }),
          result.screenshotPath,
        )
        packed.content.unshift({ type: "text", text: result.log })
        return packed
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_verify",
    {
      description: VERIFY_DESCRIPTION,
      inputSchema: {
        runDir: z.string().optional().describe("Optional path to an .auspex/runs/<stamp> directory"),
      },
    },
    async ({ runDir }, extra) => {
      try {
        const onProgress = progressFromExtra(extra)
        onProgress("auspex_verify")
        const { runVerifyDoor } = await import("./runners.ts")
        return { content: [{ type: "text" as const, text: toolJson(await runVerifyDoor(runDir, onProgress)) }] }
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_reap",
    { description: REAP_DESCRIPTION, inputSchema: auspexReapInputSchema },
    async (args) => {
      try {
        const { runReapDoor } = await import("./runners.ts")
        return { content: [{ type: "text" as const, text: toolJson(await runReapDoor(args)) }] }
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_trace",
    { description: TRACE_DESCRIPTION, inputSchema: auspexTraceInputSchema },
    async ({ profile, limit, all }) => {
      try {
        const { runTraceDoor } = await import("./runners.ts")
        return { content: [{ type: "text" as const, text: toolJson(await runTraceDoor({ profile, limit, all })) }] }
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_job",
    { description: JOB_DESCRIPTION, inputSchema: auspexJobInputObject },
    async (args, extra) => {
      try {
        const onProgress = progressFromExtra(extra)
        onProgress("auspex_job")
        const { runJobDoor } = await import("./runners.ts")
        return { content: [{ type: "text" as const, text: toolJson(await runJobDoor({ ...args, onProgress })) }] }
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )

  server.registerTool(
    "auspex_job_status",
    { description: JOB_STATUS_DESCRIPTION, inputSchema: auspexJobStatusInputSchema },
    async ({ jobId, waitMs }, extra) => {
      try {
        const onProgress = progressFromExtra(extra)
        onProgress("auspex_job_status")
        const result = await readJobStatus({ jobId, waitMs, onProgress })
        return { content: [{ type: "text" as const, text: toolJson(result) }] }
      } catch (err) {
        return packToolFailure(err)
      }
    },
  )
}
