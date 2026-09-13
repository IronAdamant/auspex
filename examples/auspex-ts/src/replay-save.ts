import { writeFile } from "node:fs/promises"
import path from "node:path"
import type { Solari } from "@solarisdk/browser"
import { downloadReplayWhenReady, waitForReplayUrl, type ReplayRetryOpts } from "./solari.ts"

/** After release, poll until replay exists. Writes ndjson beside the receipt. Never returns a presigned URL. */
export async function attachRecordedReplay(
  solari: Solari,
  sessionId: string,
  outDir: string,
  opts: ReplayRetryOpts = {},
): Promise<boolean> {
  const url = await waitForReplayUrl(solari, sessionId, opts.deadlineMs ?? Date.now() + 3_000)
  if (!url) return false
  try {
    const blob = await downloadReplayWhenReady((id) => solari.sessions.downloadReplay(id), sessionId, opts)
    await writeFile(path.join(outDir, "replay.ndjson"), Buffer.from(blob))
  } catch {
    /* console still has the recording via sessionId */
  }
  return true
}
