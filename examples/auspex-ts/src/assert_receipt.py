"""Sandbox receipt auditor.

Integrity = PNG is a real decodeable screenshot and the URL is not leftover auth.
Claim = independent check of `expect` via fetch and optional Tesseract OCR.
Never treats manifest ok/matched as proof the text was on the page.
"""
from __future__ import annotations

import ipaddress
import json
import re
import shutil
import socket
import struct
import subprocess
import sys
import zlib
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener


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


def _word_char(ch):
    return bool(ch) and (ch.isalnum() or ch == "_")


def haystack_matches(raw, expect):
    """Case-sensitive, word-bounded, like text.ts: Dashboard does not match Dashboards."""
    needle = normalize(expect)
    if not needle:
        return False
    hay = normalize(raw)
    start = hay.find(needle)
    while start >= 0:
        before = hay[start - 1] if start > 0 else ""
        end = start + len(needle)
        after = hay[end] if end < len(hay) else ""
        if not _word_char(before) and not _word_char(after):
            return True
        start = hay.find(needle, start + 1)
    return False


# Not page text: code, styles, the tab title (example.com keeps "Example Domain" only there),
# and inert <template> content.
SKIP_TAGS = ("script", "style", "noscript", "title", "template")
# A button drawn by <input type="submit" value="Send to Today"> shows its value as its label. Text a
# user typed into a field is not page text (an agent could "find" words it filled in itself).
BUTTON_INPUT_TYPES = ("submit", "button", "reset")


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__()
        self._skip = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in SKIP_TAGS:
            self._skip += 1
        elif tag == "input" and not self._skip:
            a = {k.lower(): (v or "") for k, v in attrs}
            if a.get("type", "").lower() in BUTTON_INPUT_TYPES and a.get("value") and "hidden" not in a:
                self.parts.append(a["value"])

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS and self._skip:
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


FORBIDDEN_REDIRECT = "redirect to a link-local or cloud-metadata address; not followed"


class RefuseForbiddenRedirect(HTTPRedirectHandler):
    """Follow redirects, but never to a link-local or cloud-metadata address (by name or by DNS)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if forbidden_host(newurl) or resolves_forbidden(newurl):
            raise URLError(FORBIDDEN_REDIRECT)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_url(url, timeout=12):
    req = Request(url, headers={"User-Agent": "AuspexReceiptAudit/1.0"})
    opener = build_opener(ProxyHandler({}), RefuseForbiddenRedirect)
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


def validate_url_origin(requested_url, final_url):
    """Validate finalUrl origin matches requested URL origin or is a prefix-anchored www-flip."""
    errors = []
    req_parsed = urlparse(requested_url)
    final_parsed = urlparse(final_url)

    req_origin = f"{req_parsed.scheme}://{req_parsed.hostname or ''}"
    final_origin = f"{final_parsed.scheme}://{final_parsed.hostname or ''}"

    if req_origin != final_origin:
        req_host = re.sub(r"^www\.", "", (req_parsed.hostname or "").lower())
        final_host = re.sub(r"^www\.", "", (final_parsed.hostname or "").lower())
        if req_host != final_host:
            errors.append(f"finalUrl origin {final_origin} does not match requested origin {req_origin}")

    return errors


def forbidden_host(url):
    """Link-local and cloud-metadata hosts: never fetched, even after a redirect.
    Loopback is the sandbox itself here, not the cloud's infrastructure, so it is not listed."""
    host = (urlparse(url).hostname or "").lower().strip("[]")
    if host in ("metadata", "metadata.google.internal", "fd00:ec2::254") or host.startswith("fe80:"):
        return True
    parts = host.split(".")
    if len(parts) == 4 and all(p.isdigit() for p in parts):
        return int(parts[0]) == 169 and int(parts[1]) == 254
    return False


def forbidden_ip(text):
    """Link-local (169.254/16, fe80::/10, including IPv4-mapped) or the AWS IPv6 metadata address."""
    try:
        ip = ipaddress.ip_address(text.split("%")[0])
    except ValueError:
        return False
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        ip = mapped
    return ip.is_link_local or str(ip) == "fd00:ec2::254"


def resolves_forbidden(url):
    """A public-looking name whose DNS points at link-local or cloud metadata. Lookup failure is not."""
    host = (urlparse(url).hostname or "").strip("[]")
    if not host:
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except (OSError, UnicodeError):
        return False
    return any(forbidden_ip(info[4][0]) for info in infos)


def audit_claim(man, work, skip_fetch, skip_all):
    if skip_all:
        return ["anonymous claim skipped"]
    expect = str(man.get("expect") or "")
    if not expect.strip():
        return ["manifest has no expect to audit"]
    found = False
    notes = []
    url = str(man.get("finalUrl") or "")
    if not skip_fetch:
        parsed = urlparse(url)
        if forbidden_host(url) or resolves_forbidden(url):
            notes.append("finalUrl is a link-local or cloud-metadata address; not fetched")
        elif parsed.scheme in ("http", "https"):
            try:
                text = html_to_text(fetch_url(url))
                if haystack_matches(text, expect):
                    found = True
                else:
                    notes.append("fetched page text does not contain expect")
            except Exception as exc:
                if FORBIDDEN_REDIRECT in str(exc):
                    notes.append("finalUrl redirected to a link-local or cloud-metadata address; not followed")
                else:
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
    if re.match(r"^(/Users/|/home/|/root(/|$)|[A-Za-z]:[\\/]Users[\\/])", shot):
        integrity.append("screenshotPath looks like an operator home path")
    url = str(man.get("finalUrl") or "")
    auth_errs = auth_integrity_errors(url)
    integrity.extend(auth_errs)
    
    requested_url = str(man.get("url") or "")
    if requested_url and url:
        origin_errs = validate_url_origin(requested_url, url)
        integrity.extend(origin_errs)
    
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
