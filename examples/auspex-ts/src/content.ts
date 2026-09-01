import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { CheckResult } from "./check.ts"

export type ToolTextContent = { type: "text"; text: string }
export type ToolImageContent = { type: "image"; mimeType: "image/png"; data: string }
export type ToolContent = ToolTextContent | ToolImageContent

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

export function resolveScreenshotPath(p: string): string {
  return path.isAbsolute(p) ? p : path.join(packageRoot, p)
}

export async function buildCheckToolContent(
  result: CheckResult,
): Promise<{ content: ToolContent[] }> {
  const content: ToolContent[] = [{ type: "text", text: JSON.stringify(result, null, 2) }]
  if (!result.screenshotPath) return { content }
  try {
    const buf = await readFile(resolveScreenshotPath(result.screenshotPath))
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return { content }
    content.push({
      type: "image",
      mimeType: "image/png",
      data: buf.toString("base64"),
    })
  } catch {
    // JSON receipt still stands if the PNG is missing.
  }
  return { content }
}
