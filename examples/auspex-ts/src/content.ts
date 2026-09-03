import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { CheckResult } from "./check.ts"
import { fitPngUnderCap } from "./png-fit.ts"

export type ToolTextContent = { type: "text"; text: string }
export type ToolImageContent = { type: "image"; mimeType: "image/png"; data: string }
export type ToolContent = ToolTextContent | ToolImageContent

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

export function resolveScreenshotPath(p: string): string {
  return path.isAbsolute(p) ? p : path.join(packageRoot, p)
}

function pngNote(text: string): ToolTextContent {
  return { type: "text", text }
}

export async function buildCheckToolContent(
  result: CheckResult,
): Promise<{ content: ToolContent[] }> {
  const content: ToolContent[] = [{ type: "text", text: JSON.stringify(result, null, 2) }]
  if (!result.screenshotPath) return { content }
  try {
    const buf = await readFile(resolveScreenshotPath(result.screenshotPath))
    if (buf.length === 0) {
      content.push(pngNote("PNG omitted: screenshot file is empty"))
      return { content }
    }
    const attach = buf.length <= MAX_IMAGE_BYTES ? buf : fitPngUnderCap(buf, MAX_IMAGE_BYTES)
    if (attach.length > MAX_IMAGE_BYTES) {
      content.push(pngNote(`PNG omitted: ${buf.length} bytes exceeds ${MAX_IMAGE_BYTES}`))
      return { content }
    }
    content.push({
      type: "image",
      mimeType: "image/png",
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
