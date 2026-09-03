/**
 * Refresh demo/ from a public --record check (ironadamant.com).
 * Does not write replayUrl (presigned, ~15 min). Does not record logins.
 */
import { copyFile, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { gunzipSync } from "node:zlib"
import { fileURLToPath } from "node:url"
import { runCheck, packageRoot } from "../src/check.ts"
import { createClient, downloadReplayWhenReady } from "../src/solari.ts"

const RRWEB_CSS =
  "https://cdn.jsdelivr.net/npm/rrweb-player@1.0.0-alpha.4/dist/style.css"
const RRWEB_JS =
  "https://cdn.jsdelivr.net/npm/rrweb-player@1.0.0-alpha.4/dist/index.js"
const RRWEB_CSS_SRI = "sha384-KkV3xosCYjwvyxFBgSDymv2R75UVsSEajt5pp/ANxMkGCES+Gx+0thrpA8yjOKcP"
const RRWEB_JS_SRI = "sha384-8wpRIGXF6jLCcei4LQ/8mu1JVvFjyIJIPUNShjd7Z0xt3k421PeGOmVJSouiUMt0"
const GUNZIP_MAX = 8 * 1024 * 1024

const demoDir = path.join(packageRoot, "demo")
const thisFile = fileURLToPath(import.meta.url)

export function asNdjson(raw: Uint8Array): string {
  if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
    return gunzipSync(raw, { maxOutputLength: GUNZIP_MAX }).toString("utf8")
  }
  return Buffer.from(raw).toString("utf8")
}

export function replayHtmlFromNdjson(ndjson: string): string {
  const events = ndjson
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown)
  const payload = JSON.stringify(events).replaceAll("<", "\\u003c")
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Auspex — Solari cloud Chrome replay (ironadamant.com)</title>
  <link rel="stylesheet" href="${RRWEB_CSS}" integrity="${RRWEB_CSS_SRI}" crossorigin="anonymous"/>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #111; color: #eee; }
    header { padding: 12px 16px; font-size: 14px; }
    header a { color: #9cf; }
    #player { display: flex; justify-content: center; padding: 0 0 24px; }
  </style>
</head>
<body>
  <header>
    <strong>Auspex</strong> — recorded Solari cloud Chrome on
    <a href="https://ironadamant.com/">ironadamant.com</a>
    (public JS page, not a login). rrweb player; no window on the author's Mac.
  </header>
  <div id="player"></div>
  <script src="${RRWEB_JS}" integrity="${RRWEB_JS_SRI}" crossorigin="anonymous"></script>
  <script type="application/json" id="events">${payload}</script>
  <script>
    const events = JSON.parse(document.getElementById("events").textContent);
    new rrwebPlayer({
      target: document.getElementById("player"),
      props: { events: events, autoPlay: true, showController: true, width: 1024, height: 576 }
    });
  </script>
</body>
</html>
`
}

export async function saveDemoReceipt(): Promise<void> {
  const result = await runCheck({
    url: "https://ironadamant.com",
    expect: "Build it.",
    record: true,
  })
  if (!result.ok || !result.sessionId) {
    throw new Error(`demo check failed: ok=${result.ok} sessionId=${result.sessionId}`)
  }

  await mkdir(demoDir, { recursive: true })
  const shotAbs = path.isAbsolute(result.screenshotPath)
    ? result.screenshotPath
    : path.join(packageRoot, result.screenshotPath)
  const staging = await mkdtemp(path.join(packageRoot, ".demo-staging-"))
  const solari = createClient()
  try {
    const blob = await downloadReplayWhenReady(
      (id) => solari.sessions.downloadReplay(id),
      result.sessionId,
    )
    const ndjson = asNdjson(blob)
    const text = ndjson.endsWith("\n") ? ndjson : `${ndjson}\n`
    const receipt = {
      ok: result.ok,
      expect: result.expect,
      matched: result.matched,
      title: result.title,
      finalUrl: result.finalUrl,
      excerpt: result.excerpt,
      sessionId: result.sessionId,
      networkIdle: result.networkIdle,
      note: "Presigned replay URLs are not returned or committed. Watch in https://console.getsolari.com → Sessions → this sessionId → Replay, or open demo/replay.html.",
    }
    await copyFile(shotAbs, path.join(staging, "ironadamant.png"))
    await writeFile(path.join(staging, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`)
    await writeFile(path.join(staging, "replay.ndjson"), text)
    await writeFile(path.join(staging, "replay.html"), replayHtmlFromNdjson(text))
    for (const name of ["ironadamant.png", "receipt.json", "replay.ndjson", "replay.html"]) {
      await rename(path.join(staging, name), path.join(demoDir, name))
    }
  } finally {
    await rm(staging, { recursive: true, force: true })
    await solari.close()
  }
}

async function main(): Promise<void> {
  await saveDemoReceipt()
}

if (path.resolve(process.argv[1] ?? "") === thisFile) {
  void main()
}
