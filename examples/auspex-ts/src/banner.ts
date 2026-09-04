/** Human-only terminal overview. Agents read stdout JSON, not this. */
export const REVIEW_START = "Agent is using Solari to review"
export const REVIEW_DONE =
  "Solari closed, all operations completed per request. Agent sending output..."

export function writeHumanStatus(stream: NodeJS.WritableStream, line: string): void {
  stream.write(`${line}\n`)
}
