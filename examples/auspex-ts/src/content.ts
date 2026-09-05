import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { CheckResult } from "./check.ts"
import { AuspexError, classifySolariError } from "./errors.ts"
import { fitMcpAttach, fitPngUnderCap } from "./png-fit.ts"

export type ToolTextContent = { type: "text"; text: string }
export type ToolImageContent = { type: "image"; mimeType: "image/png" | "image/jpeg"; data: string }
export type ToolContent = ToolTextContent | ToolImageContent

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

export function resolveScreenshotPath(p: string): string {
  return path.isAbsolute(p) ? p : path.join(packageRoot, p)
}

function pngNote(text: string): ToolTextContent {
  return { type: "text", text }
}

export async function buildReceiptToolContent(
  payload: object,
  screenshotPath?: string,
): Promise<{ content: ToolContent[] }> {
  const content: ToolContent[] = [{ type: "text", text: JSON.stringify(payload, null, 2) }]
  if (!screenshotPath) return { content }
  try {
    const buf = await readFile(resolveScreenshotPath(screenshotPath))
    if (buf.length === 0) {
      content.push(pngNote("PNG omitted: screenshot file is empty"))
      return { content }
    }
    const { buf: attach, mimeType } =
      buf.length <= MAX_IMAGE_BYTES
        ? fitMcpAttach(buf)
        : (() => {
            const scaled = fitPngUnderCap(buf, MAX_IMAGE_BYTES)
            return fitMcpAttach(scaled)
          })()
    if (attach.length > MAX_IMAGE_BYTES) {
      content.push(pngNote(`PNG omitted: ${buf.length} bytes exceeds ${MAX_IMAGE_BYTES}`))
      return { content }
    }
    content.push({
      type: "image",
      mimeType,
      data: attach.toString("base64"),
    })
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : ""
    if (code === "ENOENT") {
      content.push(pngNote("PNG omitted: screenshot file is missing"))
    } else {
      const msg = err instanceof Error ? err.message : String(err)
      content.push(pngNote(`PNG omitted: ${msg}`))
    }
  }
  return { content }
}

export async function buildCheckToolContent(
  result: CheckResult,
): Promise<{ content: ToolContent[] }> {
  return buildReceiptToolContent(result, result.screenshotPath)
}

/** MCP failure payload: structured issue plus any receipt/log/sessionId already produced. */
export async function packToolFailure(err: unknown): Promise<{ content: ToolContent[]; isError: true }> {
  const issue = classifySolariError(err)
  const extra = err instanceof AuspexError ? err : undefined
  const payload: Record<string, unknown> = {
    ok: false,
    error: issue.message,
    code: issue.code,
    retryable: issue.retryable,
  }
  if (issue.recovery) payload.recovery = issue.recovery
  if (issue.status !== undefined) payload.status = issue.status
  if (extra?.sessionId) payload.sessionId = extra.sessionId
  if (extra?.screenshotPath) payload.screenshotPath = extra.screenshotPath
  if (extra?.receipt && typeof extra.receipt === "object") {
    Object.assign(payload, extra.receipt)
  }
  const packed = await buildReceiptToolContent(payload, extra?.screenshotPath)
  if (extra?.log) {
    packed.content.unshift({ type: "text", text: extra.log })
  }
  return { content: packed.content, isError: true }
}
