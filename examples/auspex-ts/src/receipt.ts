import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import { packageRoot } from "./check.ts"

export const RUNS_DIR = path.join(packageRoot, ".auspex", "runs")

/** Same script the sandbox runs. argv[1] is the work dir (default /work). */
export const RECEIPT_ASSERT_PY = `import json, sys
from pathlib import Path
from urllib.parse import urlparse

work = Path(sys.argv[1] if len(sys.argv) > 1 else "/work")
man = json.loads((work / "manifest.json").read_text())
png = (work / "screenshot.png").read_bytes()
errors = []
if png[:8] != bytes.fromhex("89504e470d0a1a0a"):
    errors.append("screenshot is not a PNG")
if man.get("ok") is not True:
    errors.append("manifest ok is not true")
if man.get("matched") is not True:
    errors.append("manifest matched is not true")
shot = str(man.get("screenshotPath") or "")
if shot.startswith("/Users/") or (shot.startswith("/") and not shot.startswith("/tmp")):
    errors.append("screenshotPath looks like an operator home path")
url = str(man.get("finalUrl") or "")
host = (urlparse(url).hostname or "").lower()
if "login.microsoftonline.com" in host or host == "login.live.com" or host.endswith(".login.live.com"):
    errors.append("finalUrl still on Microsoft auth")
path = (urlparse(url).path or "/").rstrip("/").lower() or "/"
if path == "/login" or path.startswith("/login/") or path == "/auth" or path.startswith("/auth/"):
    errors.append("finalUrl still on an auth path")
out = {"ok": len(errors) == 0, "errors": errors, "finalUrl": url}
print(json.dumps(out))
sys.exit(0 if out["ok"] else 1)
`

export async function findLatestRun(runsDir = RUNS_DIR): Promise<string> {
  let names: string[]
  try {
    names = await readdir(runsDir)
  } catch {
    throw new Error(`no Auspex runs in ${runsDir}. Run check first.`)
  }
  const dirs = []
  for (const name of names.sort().reverse()) {
    const dir = path.join(runsDir, name)
    const st = await stat(dir).catch(() => undefined)
    if (!st?.isDirectory()) continue
    dirs.push(dir)
  }
  for (const dir of dirs) {
    try {
      await stat(path.join(dir, "manifest.json"))
      await stat(path.join(dir, "screenshot.png"))
      return dir
    } catch {
      continue
    }
  }
  throw new Error(`no complete run (manifest.json + screenshot.png) in ${runsDir}`)
}

export async function loadRunFiles(runDir: string): Promise<{ manifest: string; png: Buffer }> {
  const manifest = await readFile(path.join(runDir, "manifest.json"), "utf8")
  const png = await readFile(path.join(runDir, "screenshot.png"))
  return { manifest, png }
}
