/**
 * Refresh demo/ stills + ndjson from a public --record check (ironadamant.com),
 * or write watch ndjson from AUSPEX_WATCH_SESSION_ID (ConsistencyHub Microsoft wall).
 * Does not write replayUrl (presigned, ~15 min). Does not record logins.
 * Does not overwrite the committed demo/replay.html stub — Pages/local preview uses npm run generate:replay.
 * Watch replay is redacted: emails and password/email field values are stripped.
 */
import { copyFile, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { gunzipSync } from "node:zlib"
import { fileURLToPath } from "node:url"
import { runCheck, packageRoot, runDirFromResult } from "../src/check.ts"
import { assertNoCredentialLeak, redactRrwebNdjson } from "../src/replay-redact.ts"
import { verifyReceipt } from "../src/sandbox.ts"
import { createClient } from "../src/solari.ts"

const RRWEB_CSS =
  "https://cdn.jsdelivr.net/npm/rrweb-player@1.0.0-alpha.4/dist/style.css"
const RRWEB_JS =
  "https://cdn.jsdelivr.net/npm/rrweb-player@1.0.0-alpha.4/dist/index.js"
const RRWEB_CSS_SRI = "sha384-KkV3xosCYjwvyxFBgSDymv2R75UVsSEajt5pp/ANxMkGCES+Gx+0thrpA8yjOKcP"
const RRWEB_JS_SRI = "sha384-8wpRIGXF6jLCcei4LQ/8mu1JVvFjyIJIPUNShjd7Z0xt3k421PeGOmVJSouiUMt0"
const GUNZIP_MAX = 8 * 1024 * 1024

const demoDir = path.join(packageRoot, "demo")
const thisFile = fileURLToPath(import.meta.url)

/** Public demo receipt must never commit a live Solari sessionId. */
export const DEMO_SYNTHETIC_SESSION_ID = "demo_synthetic_session_ironadamant_public_marketing_page"

export function asNdjson(raw: Uint8Array): string {
  if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
    return gunzipSync(raw, { maxOutputLength: GUNZIP_MAX }).toString("utf8")
  }
  return Buffer.from(raw).toString("utf8")
}

export type ReplayPageCopy = {
  title?: string
  href?: string
  hostLabel?: string
  note?: string
}

export const IRONADAMANT_REPLAY_COPY: Required<ReplayPageCopy> = {
  title: "Auspex — Solari cloud Chrome replay (ironadamant.com)",
  href: "https://ironadamant.com/",
  hostLabel: "ironadamant.com",
  note: "public JS page, not a login. rrweb player; no window on the author's Mac.",
}

export const CONSISTENCYHUB_MICROSOFT_REPLAY_COPY: Required<ReplayPageCopy> = {
  title: "Auspex — Solari cloud Chrome replay (consistencyhub.io)",
  href: "https://consistencyhub.io/",
  hostLabel: "consistencyhub.io",
  note: "Sign in with Microsoft, then the empty box. Emails and passwords stripped.",
}

export function replayHtmlFromNdjson(ndjson: string, copy: ReplayPageCopy = {}): string {
  const title = copy.title ?? IRONADAMANT_REPLAY_COPY.title
  const href = copy.href ?? IRONADAMANT_REPLAY_COPY.href
  const hostLabel = copy.hostLabel ?? IRONADAMANT_REPLAY_COPY.hostLabel
  const note = copy.note ?? IRONADAMANT_REPLAY_COPY.note
  const redacted = redactRrwebNdjson(ndjson)
  const leaks = assertNoCredentialLeak(redacted)
  if (leaks.length) {
    throw new Error(`refusing to write a replay that still has credentials: ${leaks.join(", ")}`)
  }
  const events = redacted
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
  <title>${title}</title>
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
    <a href="${href}">${hostLabel}</a>
    (${note})
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

/** Check's default replay poll is ~3s; replay upload is often still in flight then. */
const DEMO_REPLAY_DEADLINE_MS = 180_000
const DEMO_REPLAY_POLL_MS = 3_000

function replayHttpStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: unknown }).status
    return typeof status === "number" ? status : undefined
  }
  return undefined
}

async function downloadDemoReplay(
  sessionId: string,
  solari: ReturnType<typeof createClient>,
): Promise<Uint8Array> {
  const deadline = Date.now() + DEMO_REPLAY_DEADLINE_MS
  let lastErr: unknown
  while (Date.now() < deadline) {
    try {
      return await solari.sessions.downloadReplay(sessionId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // ReplayUnavailable is also HTTP 404 but is not retryable.
      if (msg.includes("ReplayUnavailable") || replayHttpStatus(err) !== 404) throw err
      lastErr = err
      const remain = deadline - Date.now()
      if (remain <= 0) break
      await new Promise((resolve) => setTimeout(resolve, Math.min(DEMO_REPLAY_POLL_MS, remain)))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("demo replay was not ready before deadline")
}

export async function saveDemoReceipt(): Promise<void> {
  const result = await runCheck({
    url: "https://ironadamant.com",
    expect: "One office job.",
    record: true,
  })
  if (!result.ok || !result.matched || !result.sessionId) {
    throw new Error(
      `demo check failed: ok=${result.ok} matched=${result.matched} sessionId=${result.sessionId}`,
    )
  }

  await mkdir(demoDir, { recursive: true })
  const shotAbs = path.isAbsolute(result.screenshotPath)
    ? result.screenshotPath
    : path.join(packageRoot, result.screenshotPath)
  const staging = await mkdtemp(path.join(packageRoot, ".demo-staging-"))
  const solari = createClient()
  try {
    const blob = await downloadDemoReplay(result.sessionId, solari)
    const verify = await verifyReceipt(runDirFromResult(result))
    if (!verify.ok || !verify.claimOk) {
      throw new Error(
        `demo verify failed: verifyOk=${verify.ok} claimOk=${verify.claimOk} ` +
          `${[...verify.errors, ...verify.claimErrors].join("; ")}`.trim(),
      )
    }
    const ndjson = redactRrwebNdjson(asNdjson(blob))
    const text = ndjson.endsWith("\n") ? ndjson : `${ndjson}\n`
    const leaks = assertNoCredentialLeak(text)
    if (leaks.length) {
      throw new Error(`demo replay still has credentials: ${leaks.join(", ")}`)
    }
    const receipt = {
      ok: result.ok,
      expect: result.expect,
      matched: result.matched,
      title: result.title,
      finalUrl: result.finalUrl,
      excerpt: result.excerpt,
      sessionId: DEMO_SYNTHETIC_SESSION_ID,
      networkIdle: result.networkIdle,
      claimOk: verify.claimOk,
      verifyOk: verify.ok,
      claimErrors: verify.claimErrors,
      note: "Presigned replay URLs are not returned or committed. Watch the Pages player at https://ironadamant.com/auspex/demo/replay.html (CI runs npm run generate:replay from replay.ndjson). The committed demo/replay.html is a stub, not the player. Or watch in https://console.getsolari.com → Sessions → Replay. Demo receipt uses synthetic sessionId placeholder.",
    }
    await copyFile(shotAbs, path.join(staging, "ironadamant.png"))
    await writeFile(path.join(staging, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`)
    await writeFile(path.join(staging, "replay.ndjson"), text)
    for (const name of ["ironadamant.png", "receipt.json", "replay.ndjson"]) {
      await rename(path.join(staging, name), path.join(demoDir, name))
    }
  } finally {
    await rm(staging, { recursive: true, force: true })
    await solari.close()
  }
}

export async function saveWatchReplayFromSession(sessionId: string): Promise<void> {
  const id = sessionId.trim()
  if (!id) throw new Error("AUSPEX_WATCH_SESSION_ID is empty")
  await mkdir(demoDir, { recursive: true })
  const solari = createClient()
  try {
    const blob = await downloadDemoReplay(id, solari)
    const ndjson = redactRrwebNdjson(asNdjson(blob))
    const leaks = assertNoCredentialLeak(ndjson)
    if (leaks.length) {
      throw new Error(`watch replay still has credentials: ${leaks.join(", ")}`)
    }
    await writeFile(path.join(demoDir, "replay.ndjson"), ndjson)
  } finally {
    await solari.close()
  }
}

async function main(): Promise<void> {
  const watchSession = process.env.AUSPEX_WATCH_SESSION_ID?.trim()
  if (watchSession) {
    await saveWatchReplayFromSession(watchSession)
    return
  }
  await saveDemoReceipt()
}

if (path.resolve(process.argv[1] ?? "") === thisFile) {
  void main()
}
