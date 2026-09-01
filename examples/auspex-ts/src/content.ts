import { readFile } from "node:fs/promises"
import type { CheckResult } from "./check.ts"

export type ToolTextContent = { type: "text"; text: string }
export type ToolImageContent = { type: "image"; mimeType: "image/png"; data: string }
export type ToolContent = ToolTextContent | ToolImageContent

export async function buildCheckToolContent(
  result: CheckResult,
): Promise<{ content: ToolContent[] }> {
  const content: ToolContent[] = [{ type: "text", text: JSON.stringify(result, null, 2) }]
  if (!result.screenshotPath) return { content }
  try {
    const buf = await readFile(result.screenshotPath)
    if (buf.length === 0) return { content }
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
