"""Sandbox receipt auditor.

Integrity = PNG is a real decodeable screenshot and the URL is not leftover auth.
Claim = independent check of `expect` via fetch and optional Tesseract OCR.
Never treats manifest ok/matched as proof the text was on the page.
"""
from __future__ import annotations

import json
import re
import shutil
import struct
import subprocess
import sys
import zlib
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import ProxyHandler, Request, build_opener


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
        ln = struct.unpack(">I", png[i : i + 4])[0]
        typ = png[i + 4 : i + 8]
        data = png[i + 8 : i + 8 + ln]
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


def host_is(h, domain):
    return h == domain or h.endswith("." + domain)


def normalize(text):
    return re.sub(r"\s+", " ", text or "").strip()


def haystack_matches(raw, expect):
    return normalize(expect) in normalize(raw) if expect.strip() else False


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__()
        self._skip = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)


def html_to_text(raw_html):
    parser = VisibleText()
    try:
        parser.feed(raw_html)
        parser.close()
    except Exception:
        return re.sub(r"<[^>]+>", " ", raw_html)
    return " ".join(parser.parts)


def fetch_url(url, timeout=12):
    req = Request(url, headers={"User-Agent": "AuspexReceiptAudit/1.0"})
    opener = build_opener(ProxyHandler({}))
    with opener.open(req, timeout=timeout) as resp:
        raw = resp.read(2_000_000)
        charset = resp.headers.get_content_charset() or "utf-8"
        return raw.decode(charset, errors="replace")


def ocr_png(path):
    if not shutil.which("tesseract"):
        return None
    try:
        out = subprocess.run(
            ["tesseract", str(path), "stdout"],
            capture_output=True,
            timeout=30,
            check=False,
        )
    except Exception:
        return None
    if out.returncode != 0:
        return None
    return (out.stdout or b"").decode("utf-8", errors="replace")


def auth_integrity_errors(url):
    errors = []
    host = (urlparse(url).hostname or "").lower()
    if (
        host_is(host, "login.microsoftonline.com")
        or host_is(host, "login.live.com")
        or host_is(host, "accounts.google.com")
    ):
        errors.append("finalUrl still on an identity provider")
    path = (urlparse(url).path or "/").rstrip("/").lower() or "/"
    if path == "/login" or path.startswith("/login/") or path == "/auth" or path.startswith("/auth/"):
        errors.append("finalUrl still on an auth path")
    return errors


def audit_claim(man, work, skip_fetch, skip_all):
    if skip_all:
        return []
    expect = str(man.get("expect") or "")
    if not expect.strip():
        return ["manifest has no expect to audit"]
    found = False
    notes = []
    url = str(man.get("finalUrl") or "")
    if not skip_fetch:
        parsed = urlparse(url)
        if parsed.scheme in ("http", "https"):
            try:
                text = html_to_text(fetch_url(url))
                if haystack_matches(text, expect):
                    found = True
                else:
                    notes.append("fetched page text does not contain expect")
            except Exception as exc:
                notes.append("fetch failed: " + type(exc).__name__)
        else:
            notes.append("finalUrl is not http(s); cannot fetch")
    ocr = ocr_png(work / "screenshot.png")
    if ocr is not None:
        if haystack_matches(ocr, expect):
            found = True
        elif not found:
            notes.append("ocr of screenshot does not contain expect")
    elif not found and notes:
        notes.append("ocr unavailable (tesseract not installed)")
    if found:
        return []
    if not notes:
        notes.append("expect not found via fetch or ocr")
    return notes


def main(argv):
    work = Path(argv[1] if len(argv) > 1 else "/work")
    skip_anonymous_claim = "--skip-anonymous-claim" in argv
    man = json.loads((work / "manifest.json").read_text())
    png = (work / "screenshot.png").read_bytes()
    integrity = []
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
            msg = str(exc)
            integrity.append(msg if msg.startswith("screenshot") else "screenshot PNG pixels are invalid")
    shot = str(man.get("screenshotPath") or "")
    if shot.startswith("/Users/") or (shot.startswith("/") and not shot.startswith("/tmp")):
        integrity.append("screenshotPath looks like an operator home path")
    url = str(man.get("finalUrl") or "")
    auth_errs = auth_integrity_errors(url)
    integrity.extend(auth_errs)
    claim = audit_claim(man, work, skip_fetch=bool(auth_errs), skip_all=skip_anonymous_claim)
    out = {
        "ok": len(integrity) == 0,
        "errors": integrity,
        "claimOk": len(claim) == 0,
        "claimErrors": claim,
        "finalUrl": url,
        "anonymousClaimSkipped": skip_anonymous_claim,
    }
    print(json.dumps(out))
    sys.exit(0 if out["ok"] else 1)


if __name__ == "__main__":
    main(sys.argv)
