/** Build the rrweb player from committed replay.ndjson. Pages CI and local preview only — do not commit the generated file over the stub. */
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { CONSISTENCYHUB_MICROSOFT_REPLAY_COPY, replayHtmlFromNdjson } from "./save-demo-receipt.ts"
import { packageRoot } from "../src/paths.ts"

const demoDir = path.join(packageRoot, "demo")

export async function generateReplayHtml(dest = path.join(demoDir, "replay.html")): Promise<string> {
  const ndjson = await readFile(path.join(demoDir, "replay.ndjson"), "utf8")
  const html = replayHtmlFromNdjson(ndjson, CONSISTENCYHUB_MICROSOFT_REPLAY_COPY)
  await writeFile(dest, html)
  return dest
}

const thisFile = fileURLToPath(import.meta.url)
if (path.resolve(process.argv[1] ?? "") === thisFile) {
  void generateReplayHtml().then((dest) => {
    process.stdout.write(`wrote ${dest}\n`)
  })
}
