import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import { packageRoot } from "./check.ts"

export const RUNS_DIR = path.join(packageRoot, ".auspex", "runs")

/** Same script the sandbox runs. argv[1] is the work dir (default /work).
 * `ok` / `errors` = receipt integrity (PNG, path, auth URL).
 * `claimOk` / `claimErrors` = check claim (`ok`/`matched`). Integrity can pass when the claim failed.
 */
export const RECEIPT_ASSERT_PY = `import json, struct, sys, zlib
from pathlib import Path
from urllib.parse import urlparse

def paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c

def decode_png_pixels(png):
    if png[:8] != bytes.fromhex("89504e470d0a1a0a"):
        raise ValueError("screenshot is not a PNG")
    i = 8
    w = h = 0
    bit_depth = color_type = interlace = None
    idats = []
    while i + 12 <= len(png):
        ln = struct.unpack(">I", png[i:i+4])[0]
        typ = png[i+4:i+8]
        data = png[i+8:i+8+ln]
        i += 12 + ln
        if typ == b"IHDR":
            w, h = struct.unpack(">II", data[:8])
            bit_depth, color_type, interlace = data[8], data[9], data[12]
        elif typ == b"IDAT":
            idats.append(data)
        elif typ == b"IEND":
            break
    if w < 8 or h < 8:
        raise ValueError("screenshot is too small to be a page capture")
    if bit_depth != 8 or interlace != 0 or color_type not in (2, 6):
        raise ValueError("screenshot PNG is unsupported")
    bpp = 4 if color_type == 6 else 3
    raw = zlib.decompress(b"".join(idats))
    stride = w * bpp
    need = h * (stride + 1)
    if len(raw) < need:
        raise ValueError("screenshot PNG IDAT is truncated")
    out = bytearray(h * stride)
    src = 0
    for y in range(h):
        filt = raw[src]
        src += 1
        for x in range(stride):
            val = raw[src]
            src += 1
            a = out[y * stride + x - bpp] if x >= bpp else 0
            b = out[(y - 1) * stride + x] if y else 0
            c = out[(y - 1) * stride + x - bpp] if y and x >= bpp else 0
            if filt == 0:
                pix = val
            elif filt == 1:
                pix = (val + a) & 255
            elif filt == 2:
                pix = (val + b) & 255
            elif filt == 3:
                pix = (val + ((a + b) >> 1)) & 255
            elif filt == 4:
                pix = (val + paeth(a, b, c)) & 255
            else:
                raise ValueError("screenshot PNG filter is invalid")
            out[y * stride + x] = pix
    return w, h, bytes(out)

work = Path(sys.argv[1] if len(sys.argv) > 1 else "/work")
man = json.loads((work / "manifest.json").read_text())
png = (work / "screenshot.png").read_bytes()
integrity = []
claim = []
if png[:8] != bytes.fromhex("89504e470d0a1a0a"):
    integrity.append("screenshot is not a PNG")
elif len(png) < 64:
    integrity.append("screenshot is empty or tiny")
else:
    try:
        w, h, pixels = decode_png_pixels(png)
        if w < 8 or h < 8 or len(pixels) < 8 * 8 * 3:
            integrity.append("screenshot is too small to be a page capture")
    except Exception as exc:
        integrity.append(str(exc) if str(exc).startswith("screenshot") else "screenshot PNG pixels are invalid")
shot = str(man.get("screenshotPath") or "")
if shot.startswith("/Users/") or (shot.startswith("/") and not shot.startswith("/tmp")):
    integrity.append("screenshotPath looks like an operator home path")
url = str(man.get("finalUrl") or "")
host = (urlparse(url).hostname or "").lower()
def host_is(h, domain):
    return h == domain or h.endswith("." + domain)
if host_is(host, "login.microsoftonline.com") or host_is(host, "login.live.com"):
    integrity.append("finalUrl still on Microsoft auth")
path = (urlparse(url).path or "/").rstrip("/").lower() or "/"
if path == "/login" or path.startswith("/login/") or path == "/auth" or path.startswith("/auth/"):
    integrity.append("finalUrl still on an auth path")
if man.get("ok") is not True:
    claim.append("manifest ok is not true")
if man.get("matched") is not True:
    claim.append("manifest matched is not true")
out = {
    "ok": len(integrity) == 0,
    "errors": integrity,
    "claimOk": len(claim) == 0,
    "claimErrors": claim,
    "finalUrl": url,
}
print(json.dumps(out))
sys.exit(0 if out["ok"] else 1)
`

export function assertRunDirUnderRuns(runDir: string, runsDir = RUNS_DIR): string {
  const dir = path.resolve(runDir)
  const root = path.resolve(runsDir)
  if (dir !== root && !dir.startsWith(root + path.sep)) {
    throw new Error("runDir must be under .auspex/runs")
  }
  return dir
}

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
