// src/mcp.ts
import { McpServer as McpServer2 } from "@modelcontextprotocol/sdk/server/mcp.js";

// src/mcp-tools.ts
import "@modelcontextprotocol/sdk/server/mcp.js";
import { z as z5 } from "zod";

// src/schema-version.ts
var SCHEMA_VERSION = 1;
function stampSchema(obj) {
  const rest = { ...obj };
  delete rest.schemaVersion;
  return { schemaVersion: SCHEMA_VERSION, ...rest };
}

// src/check-reason.ts
var CHECK_REASONS = [
  "matched",
  "loggedOut",
  "needsHuman",
  "mismatch",
  "network",
  "recordedLoggedIn"
];
function deriveCheckReason(input) {
  if (input.needsHuman || input.special === "needsHuman") return "needsHuman";
  if (input.special === "loggedOut") return "loggedOut";
  if (input.special === "recordedLoggedIn") return "recordedLoggedIn";
  if (!input.finalUrl || !input.screenshotOk) return "network";
  if (!input.matched) {
    if (!input.networkIdle && !input.excerpt.trim()) return "network";
    return "mismatch";
  }
  return "matched";
}
function overlayVerifyReason(reason, verify) {
  if (reason !== "matched") return reason;
  if (verify.ok && verify.claimOk) return "matched";
  const blob = [...verify.errors ?? [], ...verify.claimErrors ?? []].join(" ").toLowerCase();
  if (!verify.claimOk && /expect|mismatch|not found|missing/i.test(blob)) return "mismatch";
  if (/fetch|network|timeout|econn|http|dns/i.test(blob)) return "network";
  if (!verify.claimOk) return "mismatch";
  return "network";
}
function agentReceiptOk(opts) {
  if (!opts.protocolOk) return false;
  if (opts.reason !== "matched") return false;
  if (opts.verify && !opts.verify.skipped) return opts.verify.ok && opts.verify.claimOk;
  return true;
}

// src/receipt-schema.ts
var RECEIPT_V1_REQUIRED_KEYS = [
  "schemaVersion",
  "ok",
  "reason",
  "url",
  "expect",
  "screenshotPath"
];
var RECEIPT_V1_OPTIONAL_STRING_KEYS = [
  "title",
  "finalUrl",
  "excerpt",
  "sessionId",
  "waitedFor",
  "filled",
  "clicked"
];
var RECEIPT_V1_OPTIONAL_BOOLEAN_KEYS = [
  "matched",
  "networkIdle",
  "replayReady",
  "needsHuman"
];
var RECEIPT_V1_OPTIONAL_OBJECT_KEYS = [
  "diff",
  "verify",
  "profileSeed",
  "profileSaved"
];
var RECEIPT_V1_OPTIONAL_KEYS = [
  ...RECEIPT_V1_OPTIONAL_STRING_KEYS,
  ...RECEIPT_V1_OPTIONAL_BOOLEAN_KEYS,
  ...RECEIPT_V1_OPTIONAL_OBJECT_KEYS
];
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isCheckReason(value) {
  return typeof value === "string" && CHECK_REASONS.includes(value);
}
function parseReceiptV1(input) {
  if (!isPlainObject(input)) throw new Error("receipt must be a JSON object");
  for (const key of RECEIPT_V1_REQUIRED_KEYS) {
    if (input[key] === void 0) throw new Error(`receipt missing required ${key}`);
  }
  if (input.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`receipt schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (typeof input.ok !== "boolean") throw new Error("receipt ok must be a boolean");
  if (!isCheckReason(input.reason)) {
    throw new Error("receipt reason must be a known CheckReason");
  }
  for (const key of ["url", "expect", "screenshotPath"]) {
    if (typeof input[key] !== "string") throw new Error(`receipt ${key} must be a string`);
  }
  for (const key of RECEIPT_V1_OPTIONAL_STRING_KEYS) {
    const value = input[key];
    if (value !== void 0 && typeof value !== "string") {
      throw new Error(`receipt ${key} must be a string`);
    }
  }
  for (const key of RECEIPT_V1_OPTIONAL_BOOLEAN_KEYS) {
    const value = input[key];
    if (value !== void 0 && typeof value !== "boolean") {
      throw new Error(`receipt ${key} must be a boolean`);
    }
  }
  for (const key of RECEIPT_V1_OPTIONAL_OBJECT_KEYS) {
    const value = input[key];
    if (value !== void 0 && !isPlainObject(value)) {
      throw new Error(`receipt ${key} must be an object`);
    }
  }
  return input;
}

// src/agent-receipt.ts
function toAgentReceipt(check, extras) {
  const verify = extras?.verify;
  const reason = verify && !verify.skipped ? overlayVerifyReason(check.reason, verify) : check.reason;
  const ok = agentReceiptOk({
    protocolOk: check.ok,
    reason,
    verify
  });
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    ok,
    reason,
    url: check.url || check.finalUrl,
    expect: check.expect,
    screenshotPath: check.screenshotPath,
    title: check.title,
    finalUrl: check.finalUrl,
    matched: check.matched,
    excerpt: check.excerpt,
    sessionId: check.sessionId,
    networkIdle: check.networkIdle
  };
  const optional = {
    replayReady: check.replayReady,
    waitedFor: check.waitedFor,
    filled: check.filled,
    clicked: check.clicked,
    needsHuman: check.needsHuman,
    diff: check.diff,
    verify,
    profileSeed: check.profileSeed,
    profileSaved: check.profileSaved
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== void 0) receipt[key] = value;
  }
  return parseReceiptV1(receipt);
}

// src/check.ts
import { existsSync as existsSync2 } from "node:fs";
import { mkdir as mkdir3, readFile as readFile5, writeFile as writeFile3 } from "node:fs/promises";
import path8 from "node:path";

// src/http-url.ts
import { z } from "zod";
var LOOPBACK_URL_ERROR = "url is a loopback address; Solari cloud Chrome cannot see the agent machine";
function isLoopbackHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0:0:0:0:0:0:0:1";
}
function isHttpOrHttpsUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.username !== "" || u.password !== "") return false;
    return true;
  } catch {
    return false;
  }
}
function requireHttpUrl(value, label = "url") {
  if (!isHttpOrHttpsUrl(value)) {
    throw new Error(`${label} must be an http or https URL`);
  }
  return value;
}
function requireCheckUrl(value, label = "url") {
  requireHttpUrl(value, label);
  if (isLoopbackHost(new URL(value).hostname)) {
    throw new Error(LOOPBACK_URL_ERROR);
  }
  return value;
}
var httpUrlSchema = z.string().refine(isHttpOrHttpsUrl, { message: "url must be an http or https URL" });
var checkUrlSchema = z.string().superRefine((value, ctx) => {
  if (!isHttpOrHttpsUrl(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "url must be an http or https URL" });
    return;
  }
  if (isLoopbackHost(new URL(value).hostname)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: LOOPBACK_URL_ERROR });
  }
});

// src/launch-options.ts
var PROXY_FLAG_ERROR = "--proxy must be a 2-letter country code, smart, or off";
function parseProxyFlag(raw, sticky) {
  const pin = sticky?.trim();
  if (!raw) {
    if (!pin) return void 0;
    return { country: "us", session: pin };
  }
  const v = raw.trim().toLowerCase();
  if (v === "off") return "off";
  if (v === "smart") {
    if (pin) throw new Error("--proxy-sticky cannot be used with --proxy smart");
    return "smart";
  }
  if (!/^[a-z]{2}$/.test(v)) throw new Error(PROXY_FLAG_ERROR);
  return pin ? { country: v, session: pin } : v;
}
function sessionCreateFromCheck(opts) {
  const proxy = parseProxyFlag(opts.proxy, opts.proxySticky);
  const captcha = opts.captcha === true;
  const proxyOn = proxy !== void 0 && proxy !== "off";
  return {
    stealth: opts.stealth === true || proxyOn || captcha,
    recording: opts.record === true,
    profileId: opts.profileId,
    captcha: captcha || void 0,
    proxy: proxyOn ? proxy : void 0
  };
}

// src/page-actions.ts
var PAGE_ACTION_TIMEOUT_MS = 15e3;
function assertFillPair(opts) {
  if (opts.fill && opts.value === void 0) {
    throw new Error("check --fill requires --value");
  }
  if (opts.value !== void 0 && !opts.fill) {
    throw new Error("check --value requires --fill <css>");
  }
}
async function runPageActions(page, opts, signal) {
  assertFillPair(opts);
  const out = {};
  const timeout = PAGE_ACTION_TIMEOUT_MS;
  if (opts.waitFor) {
    await page.waitForSelector(opts.waitFor, { state: "visible", timeout, signal });
    out.waitedFor = opts.waitFor;
  }
  if (opts.fill && opts.value !== void 0) {
    await page.locator(opts.fill).fill(opts.value, { timeout, signal });
    out.filled = opts.fill;
  }
  if (opts.click) {
    await page.locator(opts.click).click({ timeout, signal });
    out.clicked = opts.click;
  }
  return out;
}

// src/png-fit.ts
import { deflateSync, inflateSync } from "node:zlib";
var PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
var CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 4294967295;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function unfilter(data, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    if (src >= data.length) throw new Error("PNG IDAT truncated");
    const filter = data[src++];
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y === 0 ? void 0 : out.subarray((y - 1) * stride, y * stride);
    for (let i = 0; i < stride; i++) {
      if (src >= data.length) throw new Error("PNG IDAT truncated");
      const raw = data[src++];
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let val;
      switch (filter) {
        case 0:
          val = raw;
          break;
        case 1:
          val = raw + a & 255;
          break;
        case 2:
          val = raw + b & 255;
          break;
        case 3:
          val = raw + (a + b >> 1) & 255;
          break;
        case 4:
          val = raw + paeth(a, b, c) & 255;
          break;
        default:
          throw new Error(`unsupported PNG filter ${filter}`);
      }
      row[i] = val;
    }
  }
  return out;
}
function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) {
    throw new Error("not a PNG");
  }
  let i = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats = [];
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString("ascii");
    const data = buf.subarray(i + 8, i + 8 + len);
    i += 12 + len;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8) throw new Error("PNG bit depth must be 8");
      if (interlace !== 0) throw new Error("interlaced PNG is not supported");
      if (colorType !== 2 && colorType !== 6) throw new Error("PNG color type must be RGB or RGBA");
    } else if (type === "IDAT") {
      idats.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
  }
  if (!width || !height) throw new Error("PNG missing IHDR");
  const bpp = colorType === 6 ? 4 : 3;
  const inflated = inflateSync(Buffer.concat(idats));
  const pixels = unfilter(inflated, width, height, bpp);
  return { width, height, bpp, pixels };
}
function encodePng(width, height, pixels, bpp) {
  const stride = width * bpp;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = bpp === 4 ? 6 : 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    PNG_SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}
function resize(pixels, sw, sh, dw, dh, bpp) {
  const out = Buffer.alloc(dw * dh * bpp);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y + 0.5) * sh / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x + 0.5) * sw / dw));
      const si = (sy * sw + sx) * bpp;
      pixels.copy(out, (y * dw + x) * bpp, si, si + bpp);
    }
  }
  return out;
}
function fitPngUnderCap(png, cap) {
  if (png.length <= cap) return png;
  const decoded = decodePng(png);
  let scale = Math.min(1, Math.sqrt(cap / png.length) * 0.9);
  for (let i = 0; i < 12; i++) {
    const dw = Math.max(1, Math.floor(decoded.width * scale));
    const dh = Math.max(1, Math.floor(decoded.height * scale));
    const pixels2 = resize(decoded.pixels, decoded.width, decoded.height, dw, dh, decoded.bpp);
    const out = encodePng(dw, dh, pixels2, decoded.bpp);
    if (out.length <= cap) return out;
    scale *= 0.7;
  }
  const pixels = resize(decoded.pixels, decoded.width, decoded.height, 1, 1, decoded.bpp);
  const tiny = encodePng(1, 1, pixels, decoded.bpp);
  if (tiny.length > cap) throw new Error("PNG could not be scaled under cap");
  return tiny;
}
var MAX_IMAGE_BYTES = 2 * 1024 * 1024;
var MCP_ATTACH_MAX_SIDE = 1024;
var MCP_ATTACH_MAX_BYTES = 180 * 1024;
function fitMcpAttach(png, cap = MCP_ATTACH_MAX_BYTES) {
  const decoded = decodePng(png);
  const scale = Math.min(0.9, MCP_ATTACH_MAX_SIDE / Math.max(decoded.width, decoded.height, 1));
  const dw = Math.max(1, Math.floor(decoded.width * scale));
  const dh = Math.max(1, Math.floor(decoded.height * scale));
  const pixels = resize(decoded.pixels, decoded.width, decoded.height, dw, dh, decoded.bpp);
  const pngOut = fitPngUnderCap(encodePng(dw, dh, pixels, decoded.bpp), cap);
  decodePng(pngOut);
  return { buf: pngOut, mimeType: "image/png" };
}

// src/profile-lock.ts
import { open, mkdir, readFile, stat, unlink } from "node:fs/promises";
import path3 from "node:path";

// src/paths.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
var packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// src/profiles.ts
import { z as z2 } from "zod";

// src/solari.ts
import { existsSync, readFileSync } from "node:fs";
import path2 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import {
  BrowserSession,
  Solari,
  SolariError
} from "@solarisdk/browser";
import { chromium } from "patchright-core";

// src/timeout.ts
var CLOSE_TIMEOUT_MS = 15e3;
var LAUNCH_SETTLE_MS = 5e4;
var CHROMIUM_CONNECT_TIMEOUT_MS = 45e3;
var SCREENSHOT_TIMEOUT_MS = 3e4;
async function boundPromise(p, ms, message) {
  return raceWithTimeout(async () => p, ms, message);
}
async function observeAbort(p, signal) {
  if (signal.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error("aborted");
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      }
    );
  });
}
async function closeThenRelease(close, release, ms) {
  try {
    await boundPromise(close(), ms, `session close timed out after ${ms}ms`);
  } catch (err) {
    try {
      await boundPromise(release(), ms, `session release timed out after ${ms}ms`);
    } catch {
    }
    throw err;
  }
}
var ReadyRelease = class {
  mark;
  ready;
  fn;
  constructor() {
    this.ready = new Promise((r) => {
      this.mark = r;
    });
  }
  set(fn) {
    this.fn = fn;
    this.mark();
  }
  skip() {
    this.mark();
  }
  async release(settleMs = LAUNCH_SETTLE_MS) {
    await boundPromise(this.ready, settleMs, `session ready timed out after ${settleMs}ms`).catch(
      () => void 0
    );
    if (this.fn) await this.fn();
  }
};
async function raceWithTimeout(work, ms, message) {
  let timer;
  let cancelled = false;
  const ac = new AbortController();
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      cancelled = true;
      ac.abort();
      reject(new Error(message));
    }, ms);
  });
  const pending = work(() => cancelled, ac.signal);
  void pending.catch(() => {
  });
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// src/sso.ts
var SSO_RETURN_TIMEOUT_MS = 12e4;
var SSO_POLL_MS = 500;
var PASSWORD_WALL = /enter (your )?password/i;
var OTP_WALL = /enter (the )?code|one-time|authenticator app|approve a sign[- ]in|approve sign[- ]in|verify your identity|texted a code/i;
function hostIs(hostname, domain) {
  const h = hostname.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}
function microsoftAuthHost(hostname) {
  return hostIs(hostname, "login.microsoftonline.com") || hostIs(hostname, "login.live.com");
}
function stillOnAuth(url) {
  if (microsoftAuthHost(url.hostname) || hostIs(url.hostname, "accounts.google.com")) {
    return true;
  }
  const path13 = (url.pathname.replace(/\/+$/, "") || "/").toLowerCase();
  if (path13 === "/login" || path13.startsWith("/login/") || path13 === "/auth" || path13.startsWith("/auth/")) {
    return true;
  }
  return false;
}
function shouldFailClosedAuth(url, opts) {
  if (!stillOnAuth(url)) return false;
  if (microsoftAuthHost(url.hostname) || hostIs(url.hostname, "accounts.google.com")) {
    return true;
  }
  return Boolean(opts.sso || opts.profile);
}
function describeAuthWall(opts) {
  let parsed;
  try {
    parsed = new URL(opts.url);
  } catch {
    return { needsHuman: false };
  }
  const text = opts.text ?? "";
  const ms = microsoftAuthHost(parsed.hostname);
  if (ms && (opts.hasPasswordInput || PASSWORD_WALL.test(text))) {
    return { needsHuman: true, wall: "password", url: opts.url };
  }
  if (ms && OTP_WALL.test(text)) {
    return { needsHuman: true, wall: "otp", url: opts.url };
  }
  return { needsHuman: false };
}
function stopped(cancel) {
  return Boolean(cancel.isCancelled?.() || cancel.signal?.aborted);
}
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason ?? new Error("aborted"));
      },
      { once: true }
    );
  });
}
async function probeSsoWall(page) {
  let hasPassword = false;
  let text = "";
  try {
    const snap = await page.evaluate(() => ({
      hasPassword: Boolean(document.querySelector('input[type="password"]')),
      text: document.body?.innerText ?? ""
    }));
    hasPassword = Boolean(snap.hasPassword);
    text = snap.text ?? "";
  } catch {
  }
  return describeAuthWall({ url: page.url(), hasPasswordInput: hasPassword, text });
}
async function clickFirst(page, name, signal) {
  const btn = page.getByRole("button", { name });
  if (await btn.count() === 0) return false;
  await btn.first().click({ timeout: 1e4, signal });
  return true;
}
async function finishMicrosoftPicker(page, cancel) {
  const signal = cancel.signal;
  await page.waitForURL((url) => microsoftAuthHost(url.hostname), { timeout: 3e4, signal }).catch(() => void 0);
  if (stopped(cancel)) return { needsHuman: false };
  const wallNow = await probeSsoWall(page);
  if (wallNow.needsHuman) return wallNow;
  const picker = page.getByText(/pick an account/i);
  await picker.waitFor({ timeout: 2e4, signal }).catch(() => void 0);
  if (stopped(cancel)) return { needsHuman: false };
  const signedIn = page.getByText(/^Signed in$/i);
  const tile = page.locator("[data-test-id='native-tile']").filter({ hasText: /signed in/i });
  if (await signedIn.count() > 0) {
    await signedIn.first().click({ timeout: 1e4, signal });
  } else if (await tile.count() > 0) {
    await tile.first().click({ timeout: 1e4, signal });
  } else {
    const blocked = await probeSsoWall(page);
    if (blocked.needsHuman) return blocked;
  }
  if (stopped(cancel)) return { needsHuman: false };
  const afterPick = await probeSsoWall(page);
  if (afterPick.needsHuman) return afterPick;
  const yes = page.getByRole("button", { name: /^yes$/i });
  if (await yes.count() > 0) {
    await yes.first().click({ timeout: 8e3, signal }).catch(() => void 0);
  }
  return probeSsoWall(page);
}
async function finishGooglePicker(page, cancel) {
  const signal = cancel.signal;
  await page.waitForURL((url) => hostIs(url.hostname, "accounts.google.com"), { timeout: 3e4, signal }).catch(() => void 0);
  if (stopped(cancel)) return;
  const account = page.getByRole("link", { name: /@/ }).or(page.getByRole("button", { name: /@/ }));
  if (await account.count() > 0) {
    await account.first().click({ timeout: 1e4, signal }).catch(() => void 0);
  }
}
async function waitForSsoReturn(page, cancel) {
  const deadline = Date.now() + SSO_RETURN_TIMEOUT_MS;
  while (!stopped(cancel) && Date.now() < deadline) {
    const wall2 = await probeSsoWall(page);
    if (wall2.needsHuman) return wall2;
    try {
      if (!stillOnAuth(new URL(page.url()))) return { needsHuman: false };
    } catch {
    }
    try {
      await sleep(SSO_POLL_MS, cancel.signal);
    } catch {
      return { needsHuman: false };
    }
  }
  const wall = await probeSsoWall(page);
  if (wall.needsHuman) return wall;
  return { needsHuman: false };
}
async function completeSso(page, opts = {}) {
  if (stopped(opts)) return { needsHuman: false };
  const already = await probeSsoWall(page);
  if (already.needsHuman) return already;
  const provider = opts.provider ?? "auto";
  const signal = opts.signal;
  const tryMs = provider === "auto" || provider === "microsoft";
  const tryGoogle = provider === "auto" || provider === "google";
  let clicked = false;
  if (tryMs && await clickFirst(page, /sign in with microsoft/i, signal)) {
    clicked = true;
    if (stopped(opts)) return { needsHuman: false };
    const wall = await finishMicrosoftPicker(page, opts);
    if (wall.needsHuman) return wall;
  } else if (tryGoogle && await clickFirst(page, /sign in with google/i, signal)) {
    clicked = true;
    if (stopped(opts)) return { needsHuman: false };
    await finishGooglePicker(page, opts);
  } else if (provider === "auto" && await clickFirst(page, /sign in with /i, signal)) {
    clicked = true;
  }
  if (!clicked) return probeSsoWall(page);
  if (stopped(opts)) return { needsHuman: false };
  return waitForSsoReturn(page, opts);
}

// src/profile-storage.ts
var SESSION_STORAGE_PREFIX = "__auspex_ss__:";
var PUBLIC_PROFILE_SAVE_ERROR = "refusing to save a public /landing session over the profile";
function originOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return void 0;
    return u.origin;
  } catch {
    return void 0;
  }
}
function isPersistableAppUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (stillOnAuth(parsed)) return false;
  const path13 = (parsed.pathname.replace(/\/+$/, "") || "/").toLowerCase();
  if (path13 === "/" || path13 === "/landing" || path13 === "/login" || path13 === "/signup" || path13.startsWith("/auth")) {
    return false;
  }
  return true;
}
function isLoggedOutLanding(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (stillOnAuth(parsed)) return true;
  const path13 = (parsed.pathname.replace(/\/+$/, "") || "/").toLowerCase();
  return path13 === "/landing" || path13.startsWith("/landing/");
}
function cookiesForOrigin(cookies, origin) {
  let host;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return [];
  }
  return (cookies ?? []).filter((c) => {
    if (!c?.name) return false;
    const d = (c.domain ?? "").replace(/^\./, "").toLowerCase();
    if (!d) return false;
    return host === d || host.endsWith(`.${d}`);
  });
}
function originStoreCounts(state, origin) {
  const cookies = cookiesForOrigin(state.cookies, origin).length;
  const rec = (state.origins ?? []).find((o) => o.origin === origin);
  let localStorage2 = 0;
  let sessionStorage2 = 0;
  for (const row of rec?.localStorage ?? []) {
    if (!row?.name) continue;
    if (row.name.startsWith(SESSION_STORAGE_PREFIX)) sessionStorage2 += 1;
    else localStorage2 += 1;
  }
  return { cookies, localStorage: localStorage2, sessionStorage: sessionStorage2 };
}
function originHasLandedBytes(state, origin) {
  const c = originStoreCounts(state, origin);
  return c.cookies + c.localStorage + c.sessionStorage > 0;
}
function sessionItemsByOrigin(state, prefix = SESSION_STORAGE_PREFIX) {
  const out = {};
  for (const o of state.origins ?? []) {
    if (!o?.origin) continue;
    const items = {};
    for (const row of o.localStorage ?? []) {
      if (!row?.name?.startsWith(prefix)) continue;
      const name = row.name.slice(prefix.length);
      if (name) items[name] = row.value ?? "";
    }
    if (Object.keys(items).length) out[o.origin] = items;
  }
  return out;
}
function cookieKey(c) {
  return `${c.domain ?? ""}\0${c.name}\0${c.path ?? "/"}`;
}
function mergeStorageStates(base, extra) {
  const cookies = /* @__PURE__ */ new Map();
  for (const c of [...base.cookies ?? [], ...extra.cookies ?? []]) {
    if (!c?.name) continue;
    cookies.set(cookieKey(c), c);
  }
  const origins = /* @__PURE__ */ new Map();
  for (const o of [...base.origins ?? [], ...extra.origins ?? []]) {
    if (!o?.origin) continue;
    const prev = origins.get(o.origin) ?? { origin: o.origin, localStorage: [] };
    const items = /* @__PURE__ */ new Map();
    for (const row of [...prev.localStorage ?? [], ...o.localStorage ?? []]) {
      if (!row?.name) continue;
      items.set(row.name, row.value ?? "");
    }
    origins.set(o.origin, {
      origin: o.origin,
      localStorage: [...items.entries()].map(([name, value]) => ({ name, value })),
      indexedDB: o.indexedDB ?? prev.indexedDB
    });
  }
  return { cookies: [...cookies.values()], origins: [...origins.values()] };
}
function foldSessionStorage(state, origin, items, prefix = SESSION_STORAGE_PREFIX) {
  if (!origin || items.length === 0) return state;
  const extra = {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: items.filter((row) => row.name).map((row) => ({ name: `${prefix}${row.name}`, value: row.value ?? "" }))
      }
    ]
  };
  return mergeStorageStates(state, extra);
}
function hydrateSessionStorageSource(itemsByOrigin = {}, prefix = SESSION_STORAGE_PREFIX) {
  return `(() => { try { const baked = ${JSON.stringify(itemsByOrigin)}; const items = baked[location.origin]; if (items) { for (const [k, v] of Object.entries(items)) { if (sessionStorage.getItem(k) == null) sessionStorage.setItem(k, String(v)); } } const prefix = ${JSON.stringify(prefix)}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!k || !k.startsWith(prefix)) continue; const name = k.slice(prefix.length); if (name && sessionStorage.getItem(name) == null) sessionStorage.setItem(name, localStorage.getItem(k) ?? ""); } } catch {} })()`;
}
async function installSessionStorageRestore(ctx, state, page) {
  const payload = {
    baked: state ? sessionItemsByOrigin(state) : {},
    prefix: SESSION_STORAGE_PREFIX
  };
  const content = hydrateSessionStorageSource(payload.baked, payload.prefix);
  const ctxInstall = ctx.addInitScript;
  if (typeof ctxInstall === "function") {
    await ctxInstall({ content }).catch(() => void 0);
  }
  const pageInstall = page?.addInitScript;
  if (typeof pageInstall === "function") {
    await pageInstall({ content }).catch(() => void 0);
  }
  return payload;
}
async function hydrateSessionStorage(page) {
  return page.evaluate((prefix) => {
    let n = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const name = k.slice(prefix.length);
        if (!name || sessionStorage.getItem(name) != null) continue;
        sessionStorage.setItem(name, localStorage.getItem(k) ?? "");
        n += 1;
      }
    } catch {
    }
    return n;
  }, SESSION_STORAGE_PREFIX);
}
async function readSessionItems(frame) {
  try {
    const rows = await frame.evaluate(() => {
      const out = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const name = sessionStorage.key(i);
        if (name) out.push({ name, value: sessionStorage.getItem(name) ?? "" });
      }
      return out;
    });
    return Array.isArray(rows) ? rows.filter((row) => row?.name) : [];
  } catch {
    return [];
  }
}
async function captureContext(ctx) {
  let state = { cookies: [], origins: [] };
  try {
    state = await ctx.storageState({ indexedDB: true });
  } catch {
    try {
      state = await ctx.storageState();
    } catch {
      state = { cookies: [], origins: [] };
    }
  }
  if (typeof ctx.cookies === "function") {
    try {
      const extra = await ctx.cookies();
      state = mergeStorageStates(state, { cookies: extra, origins: [] });
    } catch {
    }
  }
  const pages = ctx.pages?.() ?? [];
  for (const page of pages) {
    const frames = [page, ...typeof page.frames === "function" ? page.frames() : []];
    for (const frame of frames) {
      const origin = originOf(frame.url());
      if (!origin) continue;
      const items = await readSessionItems(frame);
      state = foldSessionStorage(state, origin, items);
    }
  }
  return state;
}
async function captureStorageState(browser) {
  let merged = { cookies: [], origins: [] };
  for (const ctx of browser.contexts()) {
    merged = mergeStorageStates(merged, await captureContext(ctx));
  }
  return merged;
}

// src/solari.ts
var CHROMIUM_CONNECT_OPTS = { timeout: CHROMIUM_CONNECT_TIMEOUT_MS };
function defaultLaunchDeps(solari) {
  return {
    create: (opts) => solari.sessions.create(opts),
    connect: (ws, opts) => chromium.connect(ws, opts),
    wrap: (session, browser) => new BrowserSession(solari, session, browser),
    releaseAndWait: (id) => solari.sessions.releaseAndWait(id),
    getStatus: (id) => getSessionStatus(id)
  };
}
function fetchWithIdempotencyKey(base = fetch) {
  return (async (input, init) => {
    const headers = new Headers(init?.headers);
    const method = (init?.method ?? "GET").toUpperCase();
    const url = String(input);
    let path13 = url;
    try {
      path13 = new URL(url, BROWSER_API_BASE).pathname;
    } catch {
    }
    const isVmCreate = method === "POST" && /\/(sandboxes|desktops)\/?$/.test(path13);
    if (isVmCreate && !headers.has("Idempotency-Key")) {
      headers.set("Idempotency-Key", crypto.randomUUID());
    }
    return base(input, { ...init, headers });
  });
}
async function getSessionStatus(id, fetchImpl = fetch) {
  const res = await fetchImpl(`${BROWSER_API_BASE}/sessions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${requireApiKey()}` }
  });
  if (!res.ok) throw new Error(`session status ${res.status}`);
  return await res.json();
}
async function waitUntilReleased(id, opts = {}) {
  const getStatus = opts.getStatus ?? ((sid) => getSessionStatus(sid));
  const sleepFn = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const deadline = opts.deadlineMs ?? Date.now() + 5e3;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const { status } = await getStatus(id);
      last = status ?? "";
      if (status === "released" || status === "expired") return;
    } catch {
    }
    await sleepFn(200);
  }
  if (last && last !== "released") {
    throw new Error(`session ${id} not released (status=${last})`);
  }
}
var GOTO_TIMEOUT_MS = 45e3;
var NETWORKIDLE_TIMEOUT_MS = 15e3;
var OVERALL_TIMEOUT_MS = 12e4;
var PROFILE_CHECK_TIMEOUT_MS = 3e5;
function checkOverallTimeoutMs(opts) {
  return opts.sso || opts.saveProfile ? PROFILE_CHECK_TIMEOUT_MS : OVERALL_TIMEOUT_MS;
}
var REPLAY_ATTEMPTS = 6;
var REPLAY_DELAY_MS = 500;
var BROWSER_API_BASE = "https://api.getsolari.com";
var DOTENV_PATH = path2.resolve(path2.dirname(fileURLToPath2(import.meta.url)), "..", ".env");
var REPO_DOTENV_PATH = path2.resolve(path2.dirname(fileURLToPath2(import.meta.url)), "../../..", ".env");
function toPlaywrightStorageState(state) {
  const cookies = [];
  for (const c of state.cookies ?? []) {
    if (!c.name) continue;
    const domain = c.domain;
    if (!domain) continue;
    const sameSite = c.sameSite === "Strict" || c.sameSite === "Lax" || c.sameSite === "None" ? c.sameSite : "Lax";
    cookies.push({
      name: c.name,
      value: c.value,
      domain,
      path: c.path ?? "/",
      expires: c.expires ?? -1,
      httpOnly: c.httpOnly ?? false,
      secure: c.secure ?? false,
      sameSite
    });
  }
  const origins = (state.origins ?? []).map((o) => {
    const indexedDB = o.indexedDB;
    return {
      origin: o.origin,
      localStorage: o.localStorage ?? [],
      ...indexedDB !== void 0 ? { indexedDB } : {}
    };
  });
  return { cookies, origins };
}
function storageStateIsPopulated(pw) {
  return pw.cookies.length > 0 || pw.origins.length > 0;
}
function findProfileId(profiles, name) {
  const want = name.trim();
  const existing = profiles.find((p) => p.name.trim() === want);
  if (!existing) {
    throw new Error(`Solari profile not found: ${want}. Run login --profile ${want} first.`);
  }
  return existing.id;
}
function readSolariKeyFromFile(file) {
  if (!existsSync(file)) return void 0;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    let line = raw;
    if (line.charCodeAt(0) === 65279) line = line.slice(1);
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trim();
    const cut = line.indexOf("=");
    if (cut <= 0) continue;
    const name = line.slice(0, cut).trim();
    let value = line.slice(cut + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (name === "SOLARI_API_KEY" && value) return value;
  }
  return void 0;
}
function loadDotEnv(file = DOTENV_PATH) {
  if (process.env.SOLARI_API_KEY) return;
  const files = file === DOTENV_PATH ? [DOTENV_PATH, REPO_DOTENV_PATH] : [file];
  for (const f of files) {
    const value = readSolariKeyFromFile(f);
    if (value) {
      process.env.SOLARI_API_KEY = value;
      return;
    }
  }
}
function requireApiKey() {
  loadDotEnv();
  const key = process.env.SOLARI_API_KEY;
  if (!key) {
    throw new Error(
      "SOLARI_API_KEY is not set. Export SOLARI_API_KEY (https://console.getsolari.com) in the process that runs Auspex. Never commit the key."
    );
  }
  return key;
}
function createClient() {
  return new Solari({ apiKey: requireApiKey() });
}
async function launchBrowser(solari, options = {}, signal, deps = defaultLaunchDeps(solari)) {
  const closeMs = deps.closeTimeoutMs ?? CLOSE_TIMEOUT_MS;
  const createP = deps.create(options);
  let session;
  if (signal) {
    try {
      session = await observeAbort(createP, signal);
    } catch (err) {
      void createP.then((s) => deps.releaseAndWait(s.id).catch(() => void 0));
      throw err;
    }
  } else {
    session = await createP;
  }
  const release = async () => {
    await boundPromise(
      deps.releaseAndWait(session.id),
      closeMs,
      `session release timed out after ${closeMs}ms`
    ).catch(() => void 0);
    if (deps.getStatus) {
      await waitUntilReleased(session.id, {
        getStatus: deps.getStatus,
        deadlineMs: Date.now() + 2e3
      }).catch(() => void 0);
    }
  };
  if (signal?.aborted) {
    await release();
    throw new Error("aborted");
  }
  try {
    const browser = await deps.connect(session.wsEndpoint, {
      timeout: CHROMIUM_CONNECT_OPTS.timeout
    });
    if (signal?.aborted) {
      const held = deps.wrap(session, browser);
      await closeThenRelease(() => held.close(), () => deps.releaseAndWait(session.id), closeMs).catch(
        () => void 0
      );
      throw new Error("aborted");
    }
    return deps.wrap(session, browser);
  } catch (err) {
    if (err instanceof Error && err.message === "aborted") throw err;
    await release();
    throw err;
  }
}
async function resolveProfileId(solari, name) {
  return findProfileId(await solari.profiles.list(), name);
}
async function pageForSession(browser) {
  const existing = browser.contexts()[0];
  const state = browser.session.storageState;
  const raw = state ? toPlaywrightStorageState(state) : { cookies: [], origins: [] };
  const pw = {
    cookies: raw.cookies,
    origins: raw.origins.map((o) => ({
      origin: o.origin,
      localStorage: o.localStorage,
      ...o.indexedDB !== void 0 ? { indexedDB: o.indexedDB } : {}
    }))
  };
  const hasState = storageStateIsPopulated(pw);
  let ctx = existing;
  if (!ctx) {
    ctx = await browser.newContext(hasState ? { storageState: pw } : {});
  }
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await installSessionStorageRestore(ctx, state, page);
  return page;
}
function sleep2(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function replayStatus(err) {
  if (err instanceof SolariError) return err.status;
  if (err && typeof err === "object" && "status" in err) {
    const s = err.status;
    return typeof s === "number" ? s : void 0;
  }
  return void 0;
}
async function retryReplay404(op, opts = {}) {
  const now = opts.now ?? Date.now;
  const sleepFn = opts.sleep ?? sleep2;
  const deadlineMs = opts.deadlineMs ?? now() + REPLAY_ATTEMPTS * REPLAY_DELAY_MS;
  let lastErr;
  for (let attempt = 1; attempt <= REPLAY_ATTEMPTS; attempt++) {
    if (now() >= deadlineMs) break;
    try {
      return await op();
    } catch (err) {
      if (replayStatus(err) !== 404) throw err;
      lastErr = err;
    }
    const remain = deadlineMs - now();
    if (remain <= 0) break;
    await sleepFn(Math.min(REPLAY_DELAY_MS, remain));
  }
  if (lastErr) throw lastErr;
  throw new Error("replay was not ready before deadline");
}
async function downloadReplayWhenReady(download, sessionId, opts = {}) {
  return retryReplay404(() => download(sessionId), opts);
}
async function waitForReplayUrl(solari, sessionId, deadlineMs = Date.now() + REPLAY_ATTEMPTS * REPLAY_DELAY_MS) {
  try {
    return await retryReplay404(async () => {
      const replay = await solari.sessions.getReplayUrl(sessionId);
      return replay.url;
    }, { deadlineMs });
  } catch (err) {
    if (replayStatus(err) === 404) return void 0;
    throw err;
  }
}

// src/profiles.ts
var CONSOLE_PROFILES_URL = "https://console.getsolari.com";
var PROFILE_NAME_ERROR = "profile name must be non-empty";
function requireProfileName(value) {
  const name = value.trim();
  if (!name) throw new Error(PROFILE_NAME_ERROR);
  return name;
}
var profileNameSchema = z2.string().trim().min(1, { message: PROFILE_NAME_ERROR });
function loginInstructions(profile, urlHint, handoff) {
  const where = urlHint ? ` Sign in at ${urlHint}.` : " Sign in.";
  if (handoff?.url) {
    return {
      profileId: profile.id,
      name: profile.name,
      consoleUrl: CONSOLE_PROFILES_URL,
      url: handoff.url,
      handoffId: handoff.handoffId,
      expiresAt: handoff.expiresAt,
      sinceVersion: handoff.version,
      next: `Open the url (single-use Solari login handoff; no password through the agent).${where} Save when done (must store cookies or origins), then auspex_await_login or check --profile ${profile.name}`
    };
  }
  return {
    profileId: profile.id,
    name: profile.name,
    consoleUrl: CONSOLE_PROFILES_URL,
    sinceVersion: handoff?.version,
    next: `Open ${CONSOLE_PROFILES_URL} \u2192 Profiles \u2192 Open editor.${where} Hit Save (must store cookies or origins), then auspex_await_login or check --profile ${profile.name}`
  };
}
async function defaultProfileHttp() {
  const key = requireApiKey();
  return {
    post: async (path13, body) => {
      const res = await fetch(`${BROWSER_API_BASE}${path13}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body ?? {})
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = typeof json.error === "string" ? json.error : `login-handoff ${res.status}`;
        throw new Error(err);
      }
      return json;
    }
  };
}
async function requestLoginHandoff(profileId, reason, http) {
  const json = await http.post(`/profiles/${encodeURIComponent(profileId)}/login-handoff`, { reason });
  const url = typeof json.url === "string" ? json.url : "";
  if (!url) throw new Error("login-handoff returned no url");
  return {
    url,
    handoffId: typeof json.handoffId === "string" ? json.handoffId : void 0,
    expiresAt: typeof json.expiresAt === "string" ? json.expiresAt : void 0,
    version: typeof json.version === "number" ? json.version : void 0
  };
}
async function ensureProfile(name) {
  const want = requireProfileName(name);
  const solari = createClient();
  try {
    const existing = (await solari.profiles.list()).find((p) => p.name.trim() === want);
    const profile = existing ?? await solari.profiles.create({ name: want });
    return { id: profile.id, name: profile.name };
  } finally {
    await solari.close();
  }
}
async function loginProfile(name, urlHint, http) {
  const profile = await ensureProfile(name);
  const client = http ?? await defaultProfileHttp();
  const handoff = await requestLoginHandoff(
    profile.id,
    `Auspex login for profile ${profile.name}`,
    client
  );
  return loginInstructions(profile, urlHint, handoff);
}
async function listProfiles() {
  const solari = createClient();
  try {
    return (await solari.profiles.list()).map((p) => {
      const version = asFiniteNumber(p.version);
      const sizeBytes = asFiniteNumber(p.sizeBytes);
      const s3 = p.storageStateS3Key;
      return {
        id: p.id,
        name: p.name,
        version,
        sizeBytes,
        populated: Boolean(s3) || sizeBytes !== void 0 && sizeBytes > 0
      };
    });
  } finally {
    await solari.close();
  }
}

// src/profile-lock.ts
var PROFILE_BUSY_CODE = "ProfileBusy";
var ProfileBusyError = class extends Error {
  code = PROFILE_BUSY_CODE;
  profile;
  constructor(profile) {
    super(
      `profile ${profile} is locked by another Auspex process (refusing to save over it). Do not retry in a loop.`
    );
    this.name = "ProfileBusyError";
    this.profile = profile;
  }
};
function defaultLockDir() {
  return path3.join(packageRoot, ".auspex", "locks");
}
function lockFileName(profile) {
  const safe = requireProfileName(profile).replace(/[^A-Za-z0-9._-]+/g, "_");
  return `${safe}.lock`;
}
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function stealIfDead(lockPath) {
  try {
    const raw = await readFile(lockPath, "utf8");
    const pid = Number((raw.split("\n")[0] ?? "").trim());
    if (pidAlive(pid)) return false;
    await unlink(lockPath);
    return true;
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    if (code === "ENOENT") return true;
    return false;
  }
}
async function withProfileLock(profile, work, opts = {}) {
  const name = requireProfileName(profile);
  const dir = opts.lockDir ?? defaultLockDir();
  await mkdir(dir, { recursive: true });
  const lockPath = path3.join(dir, lockFileName(name));
  let fh;
  try {
    fh = await open(lockPath, "wx");
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    if (code !== "EEXIST") throw err;
    if (await stealIfDead(lockPath)) {
      try {
        fh = await open(lockPath, "wx");
      } catch (retryErr) {
        const retryCode = retryErr && typeof retryErr === "object" && "code" in retryErr ? String(retryErr.code) : "";
        if (retryCode === "EEXIST") throw new ProfileBusyError(name);
        throw retryErr;
      }
    } else {
      throw new ProfileBusyError(name);
    }
  }
  try {
    await fh.writeFile(`${process.pid}
${Date.now()}
`);
    return await work();
  } finally {
    await fh.close().catch(() => void 0);
    await unlink(lockPath).catch(() => void 0);
  }
}

// src/profile-persist.ts
var EMPTY_PROFILE_SEED_ERROR = "profile has 0 cookies and 0 origins (empty Save). A version bump with no storage is not a login. Re-login, Save, then retry.";
var EMPTY_PROFILE_SAVE_ERROR = "refusing to save an empty storage state over a Solari profile (would wipe cookies)";
var EMPTY_ORIGIN_SAVE_ERROR = "refusing to save: no cookies, localStorage, or sessionStorage landed for the page origin";
var PROFILE_EDITOR_OPEN_ERROR = "profile editor is open; close it, then --save-profile with the live session";
var HANDOFF_POLL_MS = 2e3;
var AWAIT_LOGIN_DEFAULT_MS = 3e5;
function seedFromStorageState(state) {
  return {
    cookies: (state?.cookies ?? []).filter((c) => Boolean(c?.name)).length,
    origins: (state?.origins ?? []).filter((o) => Boolean(o?.origin)).length
  };
}
function isEmptySeed(seed) {
  return seed.cookies === 0 && seed.origins === 0;
}
function emptyProfileSeedError(name) {
  const n = name.trim();
  return `profile ${n} ${EMPTY_PROFILE_SEED_ERROR}`;
}
function asFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return void 0;
}
async function persistLiveProfile(opts) {
  const seed = seedFromStorageState(opts.state);
  try {
    return await withProfileLock(
      opts.lockName ?? opts.profileId,
      () => persistProfileState({
        profileId: opts.profileId,
        state: opts.state,
        origin: opts.origin,
        save: (id, state) => opts.solari.profiles.save(id, state)
      }),
      { lockDir: opts.lockDir }
    );
  } catch (err) {
    if (err instanceof ProfileBusyError) {
      return { ok: false, cookies: seed.cookies, origins: seed.origins, error: err.message };
    }
    throw err;
  }
}
async function persistProfileState(opts) {
  const seed = seedFromStorageState(opts.state);
  if (isEmptySeed(seed)) {
    return { ok: false, cookies: 0, origins: 0, error: EMPTY_PROFILE_SAVE_ERROR };
  }
  if (opts.origin && !originHasLandedBytes(opts.state, opts.origin)) {
    return { ok: false, ...seed, error: EMPTY_ORIGIN_SAVE_ERROR };
  }
  try {
    const written = await opts.save(opts.profileId, opts.state);
    if (!written.sizeBytes) {
      return {
        ok: false,
        version: written.version,
        sizeBytes: written.sizeBytes,
        cookies: seed.cookies,
        origins: seed.origins,
        via: "profiles.save",
        error: EMPTY_PROFILE_SAVE_ERROR
      };
    }
    return {
      ok: true,
      version: written.version,
      sizeBytes: written.sizeBytes,
      cookies: seed.cookies,
      origins: seed.origins,
      via: "profiles.save"
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/\b409\b|editor is open/i.test(msg)) {
      return { ok: false, ...seed, error: PROFILE_EDITOR_OPEN_ERROR };
    }
    throw err;
  }
}
async function inspectProfileSeed(solari, profileId) {
  const session = await solari.sessions.create({ profileId });
  try {
    return seedFromStorageState(session.storageState);
  } finally {
    await solari.sessions.releaseAndWait(session.id).catch(() => void 0);
  }
}
function awaitNext(status, profile, version, seed) {
  if (status === "completed") {
    return `Saved v${version} with ${seed.cookies} cookies and ${seed.origins} origins. Run auspex check with --profile ${profile.name}`;
  }
  if (status === "empty-save") {
    return `Save bumped the profile to v${version} but stored no cookies or origins. Do not reuse --profile ${profile.name} until a non-empty Save.`;
  }
  return `No non-empty Save yet for ${profile.name}. Keep the handoff open, Save, then retry auspex_await_login.`;
}
async function waitForProfileSave(name, opts) {
  const want = name.trim();
  if (!want) throw new Error("profile name must be non-empty");
  const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? AWAIT_LOGIN_DEFAULT_MS, 5e3), 6e5);
  const sleepFn = opts.deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.deps.now ?? Date.now;
  const deadline = now() + timeoutMs;
  let profile = (await opts.deps.list()).find((p) => p.name.trim() === want);
  if (!profile) throw new Error(`Solari profile not found: ${want}. Run login --profile ${want} first.`);
  const since = opts.sinceVersion ?? profile.version ?? 0;
  let version = profile.version ?? since;
  let seed = { cookies: 0, origins: 0 };
  let status = "timeout";
  while (now() < deadline) {
    const rows = await opts.deps.list();
    profile = rows.find((p) => p.name.trim() === want);
    if (!profile) throw new Error(`profile ${want} no longer exists`);
    version = profile.version ?? since;
    if (version > since) {
      seed = await opts.deps.inspect(profile.id);
      status = isEmptySeed(seed) ? "empty-save" : "completed";
      break;
    }
    const remain = deadline - now();
    if (remain <= 0) break;
    await sleepFn(Math.min(HANDOFF_POLL_MS, remain));
  }
  return {
    status,
    profileId: profile.id,
    name: profile.name,
    version,
    cookies: seed.cookies,
    origins: seed.origins,
    next: awaitNext(status, profile, version, seed)
  };
}
async function liveAwaitLogin(name, opts = {}) {
  const solari = createClient();
  try {
    return await waitForProfileSave(name, {
      sinceVersion: opts.sinceVersion,
      timeoutMs: opts.timeoutMs,
      deps: {
        list: async () => (await solari.profiles.list()).map((p) => ({
          id: p.id,
          name: p.name,
          version: asFiniteNumber(p.version)
        })),
        inspect: (id) => inspectProfileSeed(solari, id)
      }
    });
  } finally {
    await solari.close().catch(() => void 0);
  }
}

// src/replay-save.ts
import { writeFile } from "node:fs/promises";
import path4 from "node:path";
async function attachRecordedReplay(solari, sessionId, outDir, opts = {}) {
  const url = await waitForReplayUrl(solari, sessionId, opts.deadlineMs ?? Date.now() + 3e3);
  if (!url) return false;
  try {
    const blob = await downloadReplayWhenReady((id) => solari.sessions.downloadReplay(id), sessionId, opts);
    await writeFile(path4.join(outDir, "replay.ndjson"), Buffer.from(blob));
  } catch {
  }
  return true;
}

// src/session-ledger.ts
import { mkdir as mkdir2, readFile as readFile2, writeFile as writeFile2 } from "node:fs/promises";
import path5 from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
var packageRoot2 = path5.resolve(path5.dirname(fileURLToPath3(import.meta.url)), "..");
var LIVE_LEDGER_PATH = path5.join(packageRoot2, ".auspex", "live.json");
function empty() {
  return { browser: [], sandbox: [], desktop: [] };
}
async function readLiveLedger(file = LIVE_LEDGER_PATH) {
  try {
    const parsed = JSON.parse(await readFile2(file, "utf8"));
    return {
      browser: Array.isArray(parsed.browser) ? parsed.browser.filter(Boolean) : [],
      sandbox: Array.isArray(parsed.sandbox) ? parsed.sandbox.filter(Boolean) : [],
      desktop: Array.isArray(parsed.desktop) ? parsed.desktop.filter(Boolean) : []
    };
  } catch {
    return empty();
  }
}
async function writeLiveLedger(ledger, file = LIVE_LEDGER_PATH) {
  await mkdir2(path5.dirname(file), { recursive: true });
  await writeFile2(file, `${JSON.stringify(ledger, null, 2)}
`);
}
async function rememberLive(kind, id, file = LIVE_LEDGER_PATH) {
  if (!id) return;
  const ledger = await readLiveLedger(file);
  if (!ledger[kind].includes(id)) ledger[kind].push(id);
  await writeLiveLedger(ledger, file);
}
async function forgetLive(kind, id, file = LIVE_LEDGER_PATH) {
  if (!id) return;
  const ledger = await readLiveLedger(file);
  ledger[kind] = ledger[kind].filter((x) => x !== id);
  await writeLiveLedger(ledger, file);
}

// src/text.ts
import { z as z3 } from "zod";
function normalizeHaystack(text) {
  return text.replace(/\s+/g, " ").trim();
}
function excerptOf(text, max = 500) {
  const collapsed = normalizeHaystack(text);
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max)}\u2026`;
}
function isNonEmptyExpect(value) {
  return value.trim().length > 0;
}
function requireExpect(value) {
  if (!isNonEmptyExpect(value)) {
    throw new Error("check requires a non-empty --expect");
  }
  return value;
}
function haystackMatches(raw, expect) {
  return normalizeHaystack(raw).includes(normalizeHaystack(expect));
}
var expectSchema = z3.string().refine(isNonEmptyExpect, { message: "check requires a non-empty --expect" });

// src/receipt-diff.ts
import { readFile as readFile4 } from "node:fs/promises";
import path7 from "node:path";

// src/receipt.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { readdir, readFile as readFile3, stat as stat2 } from "node:fs/promises";
import path6 from "node:path";
import { fileURLToPath as fileURLToPath4 } from "node:url";
var ASSERT_RECEIPT_PY_PATH = path6.join(path6.dirname(fileURLToPath4(import.meta.url)), "assert_receipt.py");
var RECEIPT_ASSERT_PY = readFileSync2(ASSERT_RECEIPT_PY_PATH, "utf8");
var RUNS_DIR = path6.join(packageRoot, ".auspex", "runs");
function assertRunDirUnderRuns(runDir2, runsDir = RUNS_DIR) {
  const dir = path6.resolve(runDir2);
  const root = path6.resolve(runsDir);
  if (dir !== root && !dir.startsWith(root + path6.sep)) {
    throw new Error("runDir must be under .auspex/runs");
  }
  return dir;
}
async function listCompleteRunDirs(runsDir = RUNS_DIR) {
  let names;
  try {
    names = await readdir(runsDir);
  } catch {
    return [];
  }
  const dirs = [];
  for (const name of names) {
    const dir = path6.join(runsDir, name);
    const st = await stat2(dir).catch(() => void 0);
    if (!st?.isDirectory()) continue;
    try {
      await stat2(path6.join(dir, "manifest.json"));
      await stat2(path6.join(dir, "screenshot.png"));
      dirs.push({ dir, mtime: st.mtimeMs, name });
    } catch {
      continue;
    }
  }
  dirs.sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name));
  return dirs.map((d) => d.dir);
}
async function findLatestRun(runsDir = RUNS_DIR) {
  const dirs = await listCompleteRunDirs(runsDir);
  const latest = dirs[0];
  if (!latest) throw new Error(`no complete run (manifest.json + screenshot.png) in ${runsDir}`);
  return latest;
}
async function loadRunFiles(runDir2) {
  const manifest = await readFile3(path6.join(runDir2, "manifest.json"), "utf8");
  const png = await readFile3(path6.join(runDir2, "screenshot.png"));
  return { manifest, png };
}

// src/receipt-diff.ts
function canonicalCheckUrl(url) {
  const u = new URL(url);
  const host = u.hostname.toLowerCase();
  const pathName = u.pathname.replace(/\/+$/, "") || "/";
  return `${u.protocol}//${host}${pathName}`;
}
function receiptUrlKey(manifest) {
  const raw = typeof manifest.url === "string" && manifest.url ? manifest.url : typeof manifest.finalUrl === "string" ? manifest.finalUrl : void 0;
  if (!raw) return void 0;
  try {
    return canonicalCheckUrl(raw);
  } catch {
    return raw;
  }
}
async function readManifest(dir) {
  try {
    const raw = await readFile4(path7.join(dir, "manifest.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : void 0;
  } catch {
    return void 0;
  }
}
async function findPreviousReceiptForUrl(opts) {
  let want;
  try {
    want = canonicalCheckUrl(opts.url);
  } catch {
    return void 0;
  }
  const dirs = await listCompleteRunDirs(opts.runsDir ?? RUNS_DIR);
  const exclude = opts.excludeDir ? path7.resolve(opts.excludeDir) : void 0;
  for (const dir of dirs) {
    if (exclude && path7.resolve(dir) === exclude) continue;
    const manifest = await readManifest(dir);
    if (!manifest) continue;
    const key = receiptUrlKey(manifest);
    if (key === want) return { dir, manifest };
  }
  return void 0;
}
async function diffAgainstLastReceipt(opts) {
  const previous = await findPreviousReceiptForUrl(opts);
  if (!previous) {
    return { urlChanged: false, excerptChanged: false, sameUrl: false };
  }
  const previousUrl = typeof previous.manifest.finalUrl === "string" ? previous.manifest.finalUrl : typeof previous.manifest.url === "string" ? previous.manifest.url : void 0;
  const previousExcerpt = typeof previous.manifest.excerpt === "string" ? previous.manifest.excerpt : void 0;
  const previousReason = typeof previous.manifest.reason === "string" ? previous.manifest.reason : void 0;
  const landed = opts.finalUrl || opts.url;
  let urlChanged = false;
  if (previousUrl && landed) {
    try {
      urlChanged = canonicalCheckUrl(previousUrl) !== canonicalCheckUrl(landed);
    } catch {
      urlChanged = previousUrl !== landed;
    }
  }
  const excerptChanged = (previousExcerpt ?? "") !== (opts.excerpt ?? "");
  return {
    previousRunDir: previous.dir,
    previousUrl,
    previousExcerpt,
    previousReason,
    urlChanged,
    excerptChanged,
    sameUrl: true
  };
}

// src/tool-schema.ts
import { z as z4 } from "zod";
var RECORD_PROFILE_ERROR = "--record cannot be used with --profile (recordings capture input). Pass --allow-record-profile to override.";
var RECORD_LOGGED_IN_ERROR = "--record cannot be used with a logged-in session (recordings capture input). Do not pass --sso or --save-profile with --record, and do not record a dashboard landing.";
function isDashboardLandingUrl(url) {
  try {
    const pathName = (new URL(url).pathname.replace(/\/+$/, "") || "/").toLowerCase();
    return pathName === "/dashboard" || pathName.startsWith("/dashboard/") || pathName === "/landing" || pathName.startsWith("/landing/");
  } catch {
    return false;
  }
}
function assertRecordProfileAllowed(opts) {
  if (opts.record && opts.profile && !opts.allowRecordProfile) {
    throw new Error(RECORD_PROFILE_ERROR);
  }
}
function assertRecordNotLoggedIn(opts) {
  if (!opts.record) return;
  if (opts.sso || opts.saveProfile) {
    throw new Error(RECORD_LOGGED_IN_ERROR);
  }
  if (opts.url && isDashboardLandingUrl(opts.url)) {
    throw new Error(RECORD_LOGGED_IN_ERROR);
  }
}
var auspexCheckInputObject = z4.object({
  name: z4.string().trim().min(1).optional().describe(
    "Saved check name from auspex.yml (ironadamant, checkpoint, consistencyhub). Supplies url/expect/profile so the agent does not reconstruct flags."
  ),
  url: checkUrlSchema.optional().describe("http or https URL to open (not loopback). Required unless name is set."),
  expect: expectSchema.optional().describe("Non-empty substring that must appear in the page text. Required unless name is set."),
  selector: z4.string().optional().describe("Optional CSS selector to extract instead of body"),
  profile: profileNameSchema.optional().describe("Solari profile name to reuse cookies/storage"),
  stealth: z4.boolean().optional().describe("Solari stealth pool. Starter+; Free returns 402 FeatureRequiresPlan (not retryable)"),
  record: z4.boolean().optional().describe(
    "Record for Solari console Replay via sessionId (no presigned replayUrl). Forbidden with profile unless allowRecordProfile. Never with --sso, --save-profile, or a dashboard landing."
  ),
  sso: z4.boolean().optional().describe("Click Sign in with Microsoft/Google (or another Sign in with \u2026 button) if they appear"),
  ssoProvider: z4.enum(["microsoft", "google", "auto"]).optional().describe("SSO vendor. Default auto tries Microsoft, then Google, then a generic Sign in with button"),
  waitFor: z4.string().optional().describe("CSS selector to wait until visible before extract"),
  fill: z4.string().optional().describe("CSS selector to fill; requires value"),
  value: z4.string().optional().describe("Text to type into fill"),
  click: z4.string().optional().describe("CSS selector to click after wait/fill"),
  proxy: z4.string().optional().describe("Managed proxy: 2-letter country, smart, or off. Implies stealth. Starter+ (402 on Free)"),
  proxySticky: z4.string().optional().describe("Sticky proxy session id (with proxy country)"),
  captcha: z4.boolean().optional().describe("Managed captcha solving. Implies stealth. Starter+ (402 on Free)"),
  verify: z4.boolean().optional().describe(
    "Default true: after check, audit the receipt in a headless sandbox (HTTP fetch + OCR). Pass false to skip. Do not also call auspex_verify when this is true."
  ),
  allowRecordProfile: z4.boolean().optional().describe("Override: allow record together with a profile (recordings capture input)"),
  saveProfile: z4.boolean().optional().describe(
    "After the check, persist cookies, localStorage, and sessionStorage into the named profile via POST /profiles/:id/save. Refuses an empty seed, a public /landing session, or a save with no bytes for the page origin."
  )
});
var auspexCheckInputSchema = auspexCheckInputObject.superRefine((val, ctx) => {
  if (!val.name && (!val.url || !val.expect)) {
    ctx.addIssue({
      code: z4.ZodIssueCode.custom,
      message: "auspex_check requires name or url+expect",
      path: ["url"]
    });
  }
  if (val.record && val.profile && !val.allowRecordProfile) {
    ctx.addIssue({ code: z4.ZodIssueCode.custom, message: RECORD_PROFILE_ERROR, path: ["record"] });
  }
  if (val.record && (val.sso || val.saveProfile)) {
    ctx.addIssue({ code: z4.ZodIssueCode.custom, message: RECORD_LOGGED_IN_ERROR, path: ["record"] });
  }
  if (val.record && val.url && isDashboardLandingUrl(val.url)) {
    ctx.addIssue({ code: z4.ZodIssueCode.custom, message: RECORD_LOGGED_IN_ERROR, path: ["record"] });
  }
  if (val.fill && val.value === void 0) {
    ctx.addIssue({ code: z4.ZodIssueCode.custom, message: "fill requires value", path: ["value"] });
  }
  if (val.value !== void 0 && !val.fill) {
    ctx.addIssue({ code: z4.ZodIssueCode.custom, message: "value requires fill", path: ["fill"] });
  }
});
var auspexLoginInputSchema = z4.object({
  profile: profileNameSchema.describe("Profile name to create or reuse"),
  url: httpUrlSchema.optional().describe("Optional http(s) login URL hint to show the human"),
  wait: z4.boolean().optional().describe("If true, block until Save stores cookies or origins (empty Save is not success)")
});
var auspexAwaitLoginInputSchema = z4.object({
  profile: profileNameSchema.describe("Profile name from auspex_login"),
  sinceVersion: z4.number().optional().describe("Version from auspex_login; completion is a newer version with cookies or origins"),
  timeoutMs: z4.number().optional().describe("Cap wait in ms (default 300000, max 600000)")
});
var auspexDesktopInputSchema = z4.object({
  open: z4.string().optional().describe("App to open on the named Solari sandbox desktop demo (default mousepad). Not the user's Mac."),
  type: z4.string().optional().describe("Optional text to type after focusing the window"),
  clickX: z4.number().optional().describe("Click X. Unverified coordinate; omitted unless you pass it. Default demo only opens the app."),
  clickY: z4.number().optional().describe("Click Y. Unverified; no silent Mousepad click."),
  expect: z4.string().optional().describe("Substring that must appear in the same process haystack used for wait/ok (processList + ps). Default is the opened app name.")
});
var auspexReapInputSchema = z4.object({
  dryRun: z4.boolean().optional().describe("List leftover sessions/VMs without closing them"),
  sessionId: z4.string().optional().describe("Extra browser session id to release"),
  vmId: z4.string().optional().describe("Extra sandbox/desktop id to kill"),
  packReceipts: z4.boolean().optional().describe("Copy last receipts per URL into .auspex/pack for an agent to attach to a PR")
});
var auspexProfileStatusInputSchema = z4.object({
  profile: profileNameSchema.optional().describe("Solari profile name"),
  name: z4.string().trim().min(1).optional().describe("Saved check name (supplies profile and url, e.g. consistencyhub)"),
  url: httpUrlSchema.optional().describe("Optional URL to probe with the profile (no --sso, no --record)")
});

// src/errors.ts
import { SolariError as SolariError2 } from "@solarisdk/browser";
var CLOSE_KILL_RECOVERY = "Not retryable. Free the slot with auspex_reap (or solari_browser_close / solari_kill if that MCP is loaded), then retry.";
var AuspexError = class extends Error {
  issue;
  sessionId;
  screenshotPath;
  log;
  receipt;
  constructor(message, extra = {}) {
    super(redactSecrets(message));
    this.name = "AuspexError";
    this.issue = {
      message: this.message,
      code: extra.issue?.code ?? "AuspexError",
      retryable: extra.issue?.retryable === true,
      recovery: extra.issue?.recovery,
      status: extra.issue?.status
    };
    this.sessionId = extra.sessionId;
    this.screenshotPath = extra.screenshotPath;
    this.log = extra.log;
    this.receipt = extra.receipt;
    if (extra.cause !== void 0) {
      ;
      this.cause = extra.cause;
    }
  }
};
function redactSecrets(text) {
  return text.replace(/slr_[a-z]+_[A-Za-z0-9_\-]+/gi, "slr_\u2026").replace(/\bsk-[A-Za-z0-9]{10,}\b/g, "sk-\u2026").replace(/\bAKIA[A-Z0-9]{16}\b/g, "AKIA\u2026").replace(/Bearer\s+\S+/gi, "Bearer \u2026");
}
function codeOf(err) {
  return typeof err.code === "string" && err.code ? err.code : void 0;
}
function classifySolariError(err) {
  if (err instanceof AuspexError) return err.issue;
  if (err instanceof ProfileBusyError) {
    return {
      message: redactSecrets(err.message),
      code: err.code,
      retryable: false,
      recovery: "Wait for the other agent to finish. Do not retry in a loop."
    };
  }
  if (err instanceof SolariError2) {
    const code = codeOf(err);
    if (code === "FeatureRequiresPlan" || err.status === 402) {
      return {
        message: redactSecrets(
          "Solari 402 FeatureRequiresPlan: stealth, proxy, captcha, or desktops need Starter or higher."
        ),
        code: "FeatureRequiresPlan",
        retryable: false,
        recovery: "Drop stealth/proxy/captcha/desktop or upgrade the plan. Do not retry the same call.",
        status: 402
      };
    }
    if (code === "ConcurrencyLimitExceeded" || err.status === 429) {
      return {
        message: redactSecrets(
          "Solari 429 ConcurrencyLimitExceeded: leftover sessions still hold a slot."
        ),
        code: "ConcurrencyLimitExceeded",
        retryable: false,
        recovery: CLOSE_KILL_RECOVERY,
        status: 429
      };
    }
    if (code === "PlanLimitExceeded" || err.status === 403) {
      return {
        message: redactSecrets(
          "Solari 403 PlanLimitExceeded: this account is at a plan limit (profiles, minutes, or storage)."
        ),
        code: "PlanLimitExceeded",
        retryable: false,
        status: err.status
      };
    }
    if (code === "BrowserUnhealthy") {
      return {
        message: redactSecrets(
          "Solari BrowserUnhealthy: the cloud Chrome failed its health probe; retry the check."
        ),
        code: "BrowserUnhealthy",
        retryable: true
      };
    }
    if (code === "InvalidSessionId") {
      return {
        message: redactSecrets(
          "Solari InvalidSessionId: that session id is unknown or not this account's; it was not released."
        ),
        code: "InvalidSessionId",
        retryable: false,
        status: err.status
      };
    }
    return {
      message: redactSecrets(err.message),
      code: code ?? "SolariError",
      retryable: false,
      status: err.status
    };
  }
  const message = redactSecrets(err instanceof Error ? err.message : String(err));
  return { message, code: "AuspexError", retryable: false };
}
function explainSolariError(err) {
  const issue = classifySolariError(err);
  return issue.recovery ? `${issue.message} ${issue.recovery}` : issue.message;
}

// src/progress.ts
function createProgress(opts = {}) {
  const stream = opts.stream ?? process.stderr;
  return (phase) => {
    stream.write(`:: ${phase}
`);
    const send = opts.extra?.sendNotification;
    if (!send) return;
    void send({
      method: "notifications/progress",
      params: { progressToken: "auspex", progress: 1, message: phase }
    }).catch(() => void 0);
  };
}
var noopProgress = () => void 0;

// src/check.ts
function toReceiptPath(absPath) {
  return path8.relative(packageRoot, absPath).replaceAll("\\", "/");
}
function runDirFromResult(result) {
  const abs = path8.isAbsolute(result.screenshotPath) ? result.screenshotPath : path8.join(packageRoot, result.screenshotPath);
  return path8.dirname(abs);
}
function runDir() {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  return path8.join(packageRoot, ".auspex", "runs", stamp);
}
async function extractPage(page, selector, signal) {
  return observeAbort(
    page.evaluate((sel) => {
      const el = sel ? document.querySelector(sel) : document.body;
      return {
        title: document.title,
        finalUrl: location.href,
        raw: el?.innerText ?? ""
      };
    }, selector ?? null),
    signal
  );
}
async function writeFittedScreenshot(abs) {
  const png = await readFile5(abs);
  const fitted = fitPngUnderCap(png, MAX_IMAGE_BYTES);
  if (fitted !== png) await writeFile3(abs, fitted);
}
async function runCheck(opts) {
  requireExpect(opts.expect);
  requireCheckUrl(opts.url, "url");
  assertRecordProfileAllowed(opts);
  assertRecordNotLoggedIn(opts);
  if (opts.profile) opts = { ...opts, profile: requireProfileName(opts.profile) };
  const onProgress = opts.onProgress ?? noopProgress;
  const solari = createClient();
  const closer = new ReadyRelease();
  let sessionId = "";
  const outDir = runDir();
  await mkdir3(outDir, { recursive: true });
  const screenshotAbs = path8.join(outDir, "screenshot.png");
  const screenshotPath = toReceiptPath(screenshotAbs);
  let title = "";
  let finalUrl = "";
  let excerpt = "";
  let matched = false;
  let networkIdle = false;
  let replayReady = false;
  let waitedFor;
  let filled;
  let clicked;
  let profileSeed;
  let profileSaved;
  let needsHuman = false;
  let special;
  let workError;
  const work = async (isCancelled, signal) => {
    try {
      onProgress("launching");
      const profileId = opts.profile ? await resolveProfileId(solari, opts.profile) : void 0;
      if (isCancelled()) return;
      const browser = await observeAbort(
        launchBrowser(solari, sessionCreateFromCheck({ ...opts, profileId }), signal),
        signal
      );
      closer.set(async () => {
        onProgress("closing");
        await closeThenRelease(
          () => browser.close(),
          async () => {
            await solari.sessions.releaseAndWait(browser.id);
            await waitUntilReleased(browser.id).catch(() => void 0);
          },
          CLOSE_TIMEOUT_MS
        );
      });
      sessionId = browser.id;
      await rememberLive("browser", sessionId).catch(() => void 0);
      if (isCancelled()) return;
      profileSeed = seedFromStorageState(browser.session.storageState);
      if (opts.profile && !opts.sso && isEmptySeed(profileSeed)) {
        throw new Error(emptyProfileSeedError(opts.profile));
      }
      const page = await pageForSession(browser);
      if (isCancelled()) return;
      onProgress("goto");
      await page.goto(opts.url, {
        timeout: GOTO_TIMEOUT_MS,
        waitUntil: "domcontentloaded",
        signal
      });
      if (isCancelled()) return;
      const restored = await hydrateSessionStorage(page);
      if (opts.profile && restored > 0 && !isPersistableAppUrl(page.url())) {
        await page.goto(opts.url, {
          timeout: GOTO_TIMEOUT_MS,
          waitUntil: "domcontentloaded",
          signal
        });
      }
      if (isCancelled()) return;
      if (opts.sso) {
        onProgress("sso");
        const sso = await completeSso(page, { provider: opts.ssoProvider ?? "auto", isCancelled, signal });
        if (sso.needsHuman) {
          needsHuman = true;
          special = "needsHuman";
        }
      }
      if (isCancelled()) return;
      if (!needsHuman) {
        const actions = await runPageActions(page, opts, signal);
        waitedFor = actions.waitedFor;
        filled = actions.filled;
        clicked = actions.clicked;
      }
      onProgress("settle");
      try {
        await page.waitForLoadState("networkidle", { timeout: NETWORKIDLE_TIMEOUT_MS, signal });
        networkIdle = true;
      } catch {
        networkIdle = false;
      }
      if (opts.profile && !needsHuman) {
        await page.waitForURL((url) => isPersistableAppUrl(url.toString()), { timeout: 2e4, signal }).catch(() => void 0);
      }
      if (isCancelled()) return;
      onProgress("extract");
      let raw = "";
      try {
        const extracted = await extractPage(page, opts.selector, signal);
        title = extracted.title;
        finalUrl = extracted.finalUrl || page.url();
        raw = extracted.raw;
        const haystack = normalizeHaystack(raw);
        excerpt = excerptOf(haystack);
        matched = haystackMatches(raw, opts.expect);
      } catch (extractErr) {
        title = title || await observeAbort(page.title(), signal).catch(() => "");
        finalUrl = page.url();
        const authUrl = new URL(finalUrl);
        if (shouldFailClosedAuth(authUrl, opts)) {
          matched = false;
          excerpt = `still on ${finalUrl}. ${extractErr instanceof Error ? extractErr.message : String(extractErr)}`;
        } else {
          throw extractErr;
        }
      }
      if (finalUrl && shouldFailClosedAuth(new URL(finalUrl), opts)) {
        matched = false;
        excerpt = `still on ${finalUrl}. ${excerpt}`;
      }
      if (needsHuman) {
        matched = false;
        excerpt = `needsHuman: Microsoft password or OTP wall at ${finalUrl || page.url()}. ${excerpt}`;
      } else if (opts.profile && finalUrl && isLoggedOutLanding(finalUrl)) {
        special = "loggedOut";
        matched = false;
        excerpt = `loggedOut: landed on ${finalUrl}. ${excerpt}`;
      }
      onProgress("screenshot");
      await page.screenshot({
        path: screenshotAbs,
        type: "png",
        fullPage: true,
        signal,
        timeout: SCREENSHOT_TIMEOUT_MS
      });
      await writeFittedScreenshot(screenshotAbs);
      if (opts.saveProfile && profileId && !isCancelled() && !needsHuman) {
        onProgress("save-profile");
        const liveUrl = finalUrl || page.url();
        if (!isPersistableAppUrl(liveUrl)) {
          profileSaved = {
            ok: false,
            cookies: 0,
            origins: 0,
            error: PUBLIC_PROFILE_SAVE_ERROR
          };
        } else {
          const state = await captureStorageState(browser);
          const origin = originOf(liveUrl);
          profileSaved = await persistLiveProfile({
            solari,
            profileId,
            sessionId,
            state,
            origin,
            lockName: opts.profile
          });
        }
      }
    } finally {
      closer.skip();
    }
  };
  try {
    try {
      await raceWithTimeout(
        work,
        checkOverallTimeoutMs(opts),
        `auspex check timed out after ${checkOverallTimeoutMs(opts)}ms`
      );
    } catch (err) {
      workError = err;
    } finally {
      try {
        await closer.release();
        if (sessionId) await forgetLive("browser", sessionId).catch(() => void 0);
      } catch (closeErr) {
        const closeMsg = `session close failed: ${explainSolariError(closeErr)}`;
        if (workError) throw new Error(`${explainSolariError(workError)}; ${closeMsg}`);
        throw new Error(closeMsg);
      }
    }
    if (workError) {
      throw new AuspexError(explainSolariError(workError), {
        issue: classifySolariError(workError),
        sessionId: sessionId || void 0,
        screenshotPath: existsSync2(screenshotAbs) ? screenshotPath : void 0,
        cause: workError
      });
    }
    if (opts.record && finalUrl && isPersistableAppUrl(finalUrl)) {
      special = "recordedLoggedIn";
    } else if (opts.record && sessionId) {
      onProgress("replay");
      replayReady = await attachRecordedReplay(solari, sessionId, outDir);
    }
    const authFail = Boolean(finalUrl && shouldFailClosedAuth(new URL(finalUrl), opts));
    const loggedOut = special === "loggedOut";
    const blockedHuman = special === "needsHuman" || needsHuman;
    const savedOk = !opts.saveProfile || profileSaved?.ok === true;
    const protocolOk = Boolean(
      finalUrl && existsSync2(screenshotAbs) && !authFail && savedOk && !loggedOut && !blockedHuman && special !== "recordedLoggedIn"
    );
    const reason = deriveCheckReason({
      special,
      needsHuman,
      matched,
      networkIdle,
      finalUrl,
      excerpt,
      screenshotOk: existsSync2(screenshotAbs)
    });
    const diff = await diffAgainstLastReceipt({
      url: opts.url,
      excerpt,
      finalUrl,
      excludeDir: outDir
    });
    const result = {
      ok: protocolOk,
      reason,
      url: opts.url,
      expect: opts.expect,
      screenshotPath,
      title,
      finalUrl,
      matched,
      excerpt,
      sessionId,
      networkIdle,
      replayReady: opts.record ? replayReady : void 0,
      waitedFor,
      filled,
      clicked,
      needsHuman: needsHuman || void 0,
      diff,
      profileSeed,
      profileSaved
    };
    await writeFile3(path8.join(outDir, "manifest.json"), `${JSON.stringify(stampSchema(result), null, 2)}
`);
    return result;
  } finally {
    try {
      await boundPromise(
        solari.close(),
        CLOSE_TIMEOUT_MS,
        `solari close timed out after ${CLOSE_TIMEOUT_MS}ms`
      );
    } catch {
    }
  }
}

// src/content.ts
import { readFile as readFile6 } from "node:fs/promises";
import path9 from "node:path";
import { fileURLToPath as fileURLToPath5 } from "node:url";
var packageRoot3 = path9.resolve(path9.dirname(fileURLToPath5(import.meta.url)), "..");
function resolveScreenshotPath(p) {
  return path9.isAbsolute(p) ? p : path9.join(packageRoot3, p);
}
function pngNote(text) {
  return { type: "text", text };
}
async function buildReceiptToolContent(payload, screenshotPath) {
  const content = [{ type: "text", text: JSON.stringify(payload, null, 2) }];
  if (!screenshotPath) return { content };
  try {
    const buf = await readFile6(resolveScreenshotPath(screenshotPath));
    if (buf.length === 0) {
      content.push(pngNote("PNG omitted: screenshot file is empty"));
      return { content };
    }
    const { buf: attach, mimeType } = buf.length <= MAX_IMAGE_BYTES ? fitMcpAttach(buf) : (() => {
      const scaled = fitPngUnderCap(buf, MAX_IMAGE_BYTES);
      return fitMcpAttach(scaled);
    })();
    if (attach.length > MAX_IMAGE_BYTES) {
      content.push(pngNote(`PNG omitted: ${buf.length} bytes exceeds ${MAX_IMAGE_BYTES}`));
      return { content };
    }
    content.push({
      type: "image",
      mimeType,
      data: attach.toString("base64")
    });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    if (code === "ENOENT") {
      content.push(pngNote("PNG omitted: screenshot file is missing"));
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      content.push(pngNote(`PNG omitted: ${msg}`));
    }
  }
  return { content };
}
async function buildCheckToolContent(result) {
  return buildReceiptToolContent(result, result.screenshotPath);
}
async function packToolFailure(err) {
  const issue = classifySolariError(err);
  const extra = err instanceof AuspexError ? err : void 0;
  const payload = {
    ok: false,
    error: issue.message,
    code: issue.code,
    retryable: issue.retryable
  };
  if (issue.recovery) payload.recovery = issue.recovery;
  if (issue.status !== void 0) payload.status = issue.status;
  if (extra?.sessionId) payload.sessionId = extra.sessionId;
  if (extra?.screenshotPath) payload.screenshotPath = extra.screenshotPath;
  if (extra?.receipt && typeof extra.receipt === "object") {
    Object.assign(payload, extra.receipt);
  }
  const packed = await buildReceiptToolContent(stampSchema(payload), extra?.screenshotPath);
  if (extra?.log) {
    packed.content.unshift({ type: "text", text: extra.log });
  }
  return { content: packed.content, isError: true };
}

// src/desktop.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path10 from "node:path";
import { SolariClient } from "@solarisdk/sdk";

// src/desktop-probe.ts
var PS_ARGS = ["-c", "ps -A -o args="];
var WMCTRL_ARGS = ["-c", "wmctrl -l"];
var XDOTOOL_ARGS = ["-c", "xdotool search --onlyvisible --name ."];
function desktopNeedleMatches(haystack, needle) {
  return haystackMatches(haystack.toLowerCase(), needle.toLowerCase());
}
function processHaystack(procs) {
  return procs.map((p) => `${p.name} ${p.cmd ?? ""}`).join("\n");
}
async function collectProcessSignal(desktop) {
  const chunks = [];
  const via = [];
  if (desktop.processList) {
    try {
      chunks.push(processHaystack(await desktop.processList()));
      via.push("processList");
    } catch {
    }
  }
  if (desktop.exec) {
    try {
      const out = await desktop.exec("sh", { args: PS_ARGS });
      chunks.push(out.stdout || "");
      via.push("ps");
    } catch {
    }
  }
  return { haystack: chunks.join("\n"), via };
}
async function collectWindowSignal(desktop) {
  if (desktop.windowList) {
    try {
      const names = await desktop.windowList();
      if (Array.isArray(names)) return { haystack: names.join("\n"), via: "windowList" };
    } catch {
    }
  }
  if (!desktop.exec) return null;
  for (const [via, args] of [
    ["wmctrl", WMCTRL_ARGS],
    ["xdotool", XDOTOOL_ARGS]
  ]) {
    try {
      const out = await desktop.exec("sh", { args: [...args] });
      if (out.exitCode === 0 && (out.stdout || "").trim()) {
        return { haystack: out.stdout || "", via };
      }
    } catch {
    }
  }
  return null;
}
async function waitForProcess(desktop, needle, sleepFn, windowMs) {
  const deadline = Date.now() + windowMs;
  let signal = await collectProcessSignal(desktop);
  if (signal.via.length > 0 && desktopNeedleMatches(signal.haystack, needle)) {
    return { processOk: true, signal };
  }
  while (Date.now() < deadline) {
    await sleepFn(500);
    signal = await collectProcessSignal(desktop);
    if (signal.via.length === 0) continue;
    if (desktopNeedleMatches(signal.haystack, needle)) return { processOk: true, signal };
  }
  signal = await collectProcessSignal(desktop);
  return {
    processOk: signal.via.length > 0 && desktopNeedleMatches(signal.haystack, needle),
    signal
  };
}
function expectOnProcessSignal(signal, expect) {
  return signal.via.length > 0 && desktopNeedleMatches(signal.haystack, expect);
}

// src/banner.ts
var REVIEW_START = "Agent is using Solari to review";
var REVIEW_DONE = "Solari closed, all operations completed per request. Agent sending output...";

// src/tui.ts
function desktopOverviewText() {
  return `auspex_desktop
${REVIEW_START}
${REVIEW_DONE}`;
}
function desktopLogLine(phase) {
  if (phase === "done") return `==> ${REVIEW_DONE}`;
  return `:: ${phase}`;
}
function desktopLogHeader() {
  return `:: Starting Solari desktop review
==> ${REVIEW_START}`;
}
function desktopSummary(opts) {
  const proc = opts.processOk === void 0 ? "" : ` processOk=${opts.processOk}`;
  const win = opts.windowOk === void 0 ? "" : ` windowOk=${opts.windowOk}`;
  const err = opts.errors.length ? ` errors=${opts.errors.join("; ")}` : "";
  return `==> ok=${opts.ok} ready=${opts.ready}${proc}${win}${err}
==> path=${opts.screenshotPath}`;
}
function createDesktopTui(stream) {
  let started = false;
  const lines = [];
  const write = (s) => {
    for (const line of s.split("\n")) {
      lines.push(line);
      stream.write(`${line}
`);
    }
  };
  return {
    setPhase: (phase) => {
      if (phase === "done") {
        write(desktopLogLine("done"));
        return;
      }
      if (!started) {
        started = true;
        write(desktopLogHeader());
      }
      write(desktopLogLine(phase));
    },
    close: () => write(desktopLogLine("done")),
    transcript: () => lines.join("\n")
  };
}

// src/desktop.ts
var DESKTOP_OVERALL_MS = 9e4;
var DESKTOP_HEALTH_MS = 3e4;
var WINDOW_MAP_MS = 8e3;
var DEFAULT_DESKTOP_TASK = { open: "mousepad" };
function sleep3(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
var DESKTOP_CREATE_OPTS = {
  template: "default",
  resolution: "1280x720",
  cpu: 1,
  memMb: 2048,
  timeoutMs: 5 * 6e4,
  lifecycle: { onTimeout: "kill" }
};
function resolveDesktopTask(task) {
  if (task?.open || task?.type || task?.click || task?.expect) return { ...task };
  return { ...DEFAULT_DESKTOP_TASK };
}
function clickForTask(task) {
  return task.click;
}
function desktopNeedle(task) {
  const open2 = task.open?.trim();
  const expect = task.expect?.trim();
  return open2 || expect || void 0;
}
function defaultDesktopDeps() {
  return {
    create: async () => {
      const pt = new SolariClient({ apiKey: requireApiKey(), fetch: fetchWithIdempotencyKey() });
      const d = await pt.desktops.create(DESKTOP_CREATE_OPTS);
      return {
        sessionId: d.sessionId,
        streamUrl: d.streamUrl,
        connect: () => d.connect(),
        health: () => d.health(),
        screenshot: () => d.screenshot({ format: "png" }),
        kill: () => d.kill(),
        click: (x, y) => d.mouse.click(x, y),
        typeText: (text) => d.keyboard.type(text),
        openApp: (name) => d.open(name).then(() => void 0),
        exec: (cmd, opts) => d.exec(cmd, { args: opts?.args }),
        processList: () => d.process.list()
      };
    }
  };
}
function newRunDir() {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  return path10.join(packageRoot, ".auspex", "runs", stamp);
}
async function waitReady(desktop, sleepFn, healthMs = DESKTOP_HEALTH_MS) {
  const deadline = Date.now() + healthMs;
  while (Date.now() < deadline) {
    try {
      const health = await desktop.health();
      if (health.ready) return true;
    } catch {
    }
    await sleepFn(1e3);
  }
  return false;
}
async function runDesktopReview(deps = defaultDesktopDeps()) {
  const status = deps.status ?? process.stderr;
  const sleepFn = deps.sleep ?? sleep3;
  const tui = deps.tui ?? createDesktopTui(status);
  const overview = desktopOverviewText();
  const overallMs = deps.overallMs ?? DESKTOP_OVERALL_MS;
  const task = resolveDesktopTask(deps.task);
  const needle = desktopNeedle(task);
  tui.setPhase("booting");
  let desktop;
  const createP = deps.create();
  try {
    return await raceWithTimeout(
      async (isCancelled, signal) => {
        try {
          desktop = await observeAbort(createP, signal);
        } catch (err) {
          void createP.then((d) => d.kill().catch(() => void 0));
          throw err;
        }
        await rememberLive("desktop", desktop.sessionId).catch(() => void 0);
        if (isCancelled()) {
          await desktop.kill().catch(() => void 0);
          throw new Error(`desktop review timed out after ${overallMs}ms`);
        }
        tui.setPhase("connecting");
        await desktop.connect();
        tui.setPhase("waiting");
        const ready = await waitReady(desktop, sleepFn, deps.healthMs);
        tui.setPhase("task");
        let processOk;
        let windowOk;
        let processSignal = { haystack: "", via: [] };
        if (task.open && desktop.openApp) {
          await desktop.openApp(task.open);
        }
        if (needle) {
          const waited = await waitForProcess(desktop, needle, sleepFn, deps.windowMs ?? WINDOW_MAP_MS);
          processOk = waited.processOk;
          processSignal = waited.signal;
          const windows = await collectWindowSignal(desktop);
          if (windows) windowOk = desktopNeedleMatches(windows.haystack, needle);
        }
        const clickAt = clickForTask(task);
        let click;
        if (clickAt && desktop.click) {
          await desktop.click(clickAt.x, clickAt.y);
          click = { x: clickAt.x, y: clickAt.y, verified: false };
        }
        if (task.type && desktop.typeText) await desktop.typeText(task.type);
        tui.setPhase("screenshot");
        const png = await desktop.screenshot();
        const dir = newRunDir();
        mkdirSync(dir, { recursive: true });
        const abs = path10.join(dir, "screenshot.png");
        writeFileSync(abs, png);
        const desktopId = desktop.sessionId;
        const streamUrl = desktop.streamUrl;
        let matched = true;
        const errors = [];
        if (!ready) errors.push("desktop X11 was not ready");
        if (needle && processOk === false) errors.push(`process for ${needle} did not appear`);
        if (windowOk === false) errors.push(`window for ${needle} did not appear`);
        if (task.expect) {
          matched = expectOnProcessSignal(processSignal, task.expect);
          if (!matched) errors.push(`expect not found on desktop: ${task.expect}`);
        } else if (needle) {
          matched = processOk === true;
        }
        tui.setPhase("killing");
        try {
          await desktop.kill();
          await forgetLive("desktop", desktopId).catch(() => void 0);
        } catch (err) {
          errors.push(`desktop kill failed: ${explainSolariError(err)}`);
        }
        desktop = void 0;
        tui.close();
        const screenshotPath = toReceiptPath(abs);
        const ok = errors.length === 0;
        const summary = desktopSummary({ ok, ready, processOk, windowOk, screenshotPath, errors });
        status.write(`${summary}
`);
        const log = `${tui.transcript()}
${summary}`;
        return {
          ok,
          errors,
          desktopId,
          screenshotPath,
          ready,
          processOk,
          windowOk,
          click,
          matched,
          expect: task.expect ?? needle,
          streamUrl,
          overview,
          log
        };
      },
      overallMs,
      `desktop review timed out after ${overallMs}ms`
    );
  } catch (err) {
    if (desktop) {
      try {
        await desktop.kill();
        await forgetLive("desktop", desktop.sessionId).catch(() => void 0);
      } catch {
      }
    } else {
      void createP.then((d) => d.kill().catch(() => void 0));
    }
    tui.close();
    throw new AuspexError(explainSolariError(err), {
      issue: classifySolariError(err),
      log: tui.transcript(),
      cause: err
    });
  }
}

// src/saved-checks.ts
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "node:fs";
import path11 from "node:path";
import { fileURLToPath as fileURLToPath6 } from "node:url";
var packageRoot4 = path11.resolve(path11.dirname(fileURLToPath6(import.meta.url)), "..");
var DEFAULT_SAVED_CHECKS = [
  { name: "ironadamant", url: "https://ironadamant.com", expect: "One office job." },
  { name: "checkpoint", url: "https://checkpointprojects.com", expect: "Checkpoint" },
  {
    name: "consistencyhub",
    url: "https://consistencyhub.io",
    expect: "Document Editor",
    profile: "consistencyhub"
  }
];
function canonicalSavedCheckName(name) {
  const key = name.trim().toLowerCase();
  if (key === "checkpoint") return "checkpoint";
  if (key === "consistencyhub") return "consistencyhub";
  if (key === "ironadamant") return "ironadamant";
  return key;
}
function defaultConfigPath() {
  return path11.join(packageRoot4, "auspex.yml");
}
function resolveConfigPath(explicit) {
  if (explicit) return explicit;
  const env = process.env.AUSPEX_CONFIG?.trim();
  if (env) return env;
  const cwdPath = path11.resolve("auspex.yml");
  if (existsSync3(cwdPath)) return cwdPath;
  const packed = defaultConfigPath();
  if (existsSync3(packed)) return packed;
  return void 0;
}
function unquote(value) {
  const t = value.trim();
  if (t.length >= 2) {
    const a = t[0];
    const b = t[t.length - 1];
    if (a === '"' && b === '"' || a === "'" && b === "'") return t.slice(1, -1);
  }
  return t;
}
function asBool(value) {
  const v = unquote(value).toLowerCase();
  if (v === "true" || v === "yes" || v === "1") return true;
  if (v === "false" || v === "no" || v === "0" || v === "") return false;
  throw new Error(`invalid boolean in auspex.yml: ${value}`);
}
function parseSavedChecksYaml(text) {
  const out = {};
  let inChecks = false;
  let current;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, "  ");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed === "checks:") {
      inChecks = true;
      current = void 0;
      continue;
    }
    const nameMatch = /^  ([A-Za-z][\w-]*):\s*$/.exec(line);
    if (inChecks && nameMatch) {
      current = canonicalSavedCheckName(nameMatch[1]);
      out[current] = out[current] ?? {};
      continue;
    }
    const fieldMatch = /^    (url|expect|profile|sso|record):\s*(.*)$/.exec(line);
    if (inChecks && current && fieldMatch) {
      const key = fieldMatch[1];
      const val = fieldMatch[2] ?? "";
      if (key === "sso" || key === "record") {
        out[current][key] = asBool(val);
      } else if (key === "url" || key === "expect" || key === "profile") {
        out[current][key] = unquote(val);
      }
      continue;
    }
    throw new Error(`invalid auspex.yml line: ${trimmed}`);
  }
  return out;
}
function assertSavedCheckSafe(name, raw) {
  const canon = canonicalSavedCheckName(name);
  if (canon === "consistencyhub") {
    if (raw.sso) throw new Error("saved check consistencyhub must not set sso");
    if (raw.record) throw new Error("saved check consistencyhub must not set record");
  }
  if (raw.sso) throw new Error(`saved check ${canon} must not set sso (human SSO is a separate login)`);
  if (raw.record) throw new Error(`saved check ${canon} must not set record`);
}
function materializeSavedCheck(name, raw) {
  const canon = canonicalSavedCheckName(name);
  assertSavedCheckSafe(canon, raw);
  const url = requireCheckUrl(raw.url ?? "", "url");
  const expect = requireExpect(raw.expect ?? "");
  const profile = raw.profile ? requireProfileName(raw.profile) : void 0;
  return { name: canon, url, expect, profile };
}
function builtinSavedChecks() {
  const out = {};
  for (const row of DEFAULT_SAVED_CHECKS) {
    out[row.name] = { ...row };
  }
  return out;
}
function loadSavedChecks(configPath) {
  const merged = builtinSavedChecks();
  const file = resolveConfigPath(configPath);
  if (!file || !existsSync3(file)) return merged;
  const parsed = parseSavedChecksYaml(readFileSync3(file, "utf8"));
  for (const [name, raw] of Object.entries(parsed)) {
    const base = merged[name] ?? {};
    merged[name] = materializeSavedCheck(name, { ...base, ...raw });
  }
  return merged;
}
function listSavedCheckNames(checks) {
  return Object.keys(checks ?? loadSavedChecks()).sort();
}
function resolveSavedCheck(name, checks) {
  const catalog = checks ?? loadSavedChecks();
  const canon = canonicalSavedCheckName(name);
  const found = catalog[canon];
  if (!found) {
    throw new Error(
      `unknown saved check ${name.trim() || "(empty)"}. Known: ${listSavedCheckNames(catalog).join(", ")}`
    );
  }
  return found;
}
function savedCheckForProfile(profile, checks) {
  const want = profile.trim().toLowerCase();
  return Object.values(checks ?? loadSavedChecks()).find((c) => c.profile?.toLowerCase() === want);
}
function applySavedCheckName(args, checks) {
  if (!args.name?.trim()) return args;
  const saved = resolveSavedCheck(args.name, checks);
  return {
    ...args,
    url: args.url || saved.url,
    expect: args.expect || saved.expect,
    profile: args.profile || saved.profile
  };
}

// src/profile-status.ts
function resolveStatusTarget(opts, deps) {
  let profile = opts.profile?.trim();
  let url = opts.url?.trim();
  let expect;
  if (opts.name?.trim()) {
    const saved = deps?.savedForName ? deps.savedForName(opts.name) : resolveSavedCheck(opts.name);
    profile = profile || saved.profile;
    url = url || saved.url;
    expect = saved.expect;
  }
  if (!profile) {
    throw new Error("profile-status requires --profile or --name");
  }
  profile = requireProfileName(profile);
  if (!url) {
    const byProfile = deps?.savedForProfile ? deps.savedForProfile(profile) : savedCheckForProfile(profile);
    url = byProfile?.url;
    expect = expect ?? byProfile?.expect;
  }
  return { profile, url, expect };
}
async function profileStatus(opts, deps) {
  const { profile, url, expect } = resolveStatusTarget(opts, deps);
  const list = deps?.listProfiles ?? listProfiles;
  const rows = await list();
  const row = rows.find((p) => p.name.trim() === profile);
  if (!row || row.populated === false || row.populated === void 0 && !(row.sizeBytes && row.sizeBytes > 0)) {
    const missing = !row;
    return {
      ok: false,
      reason: "loggedOut",
      profile,
      url,
      populated: false,
      live: false,
      skippedLive: true,
      skipReason: missing ? `profile ${profile} not found. Human SSO once (agent never types a password).` : `profile ${profile} is empty. Human SSO once (agent never types a password).`
    };
  }
  if (!url) {
    return {
      ok: false,
      reason: "loggedOut",
      profile,
      populated: true,
      live: false,
      skippedLive: true,
      skipReason: "no url to probe; pass --url or --name. Not pinging the user."
    };
  }
  const check = deps?.runCheck ?? runCheck;
  let result;
  try {
    result = await check({
      url,
      expect: expect && expect.trim() ? expect : ".",
      profile
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/0 cookies|empty Save|profile not found/i.test(msg)) {
      return {
        ok: false,
        reason: "loggedOut",
        profile,
        url,
        populated: row.populated,
        live: false,
        skippedLive: true,
        skipReason: `${msg} Human SSO once (agent never types a password).`
      };
    }
    throw err;
  }
  if (result.needsHuman || result.reason === "needsHuman") {
    return {
      ok: false,
      reason: "needsHuman",
      profile,
      url,
      populated: true,
      live: true,
      skippedLive: true,
      skipReason: "Microsoft password/OTP wall. Skip live; human SSO once. Agent never types a password.",
      finalUrl: result.finalUrl,
      excerpt: result.excerpt,
      screenshotPath: result.screenshotPath
    };
  }
  const landed = result.finalUrl || "";
  let auth = false;
  try {
    auth = Boolean(landed) && stillOnAuth(new URL(landed));
  } catch {
    auth = false;
  }
  if (result.reason === "loggedOut" || landed && isLoggedOutLanding(landed) || auth) {
    return {
      ok: false,
      reason: "loggedOut",
      profile,
      url,
      populated: true,
      live: true,
      finalUrl: landed,
      excerpt: result.excerpt,
      screenshotPath: result.screenshotPath
    };
  }
  return {
    ok: true,
    reason: "loggedIn",
    profile,
    url,
    populated: true,
    live: true,
    finalUrl: landed,
    excerpt: result.excerpt,
    screenshotPath: result.screenshotPath
  };
}

// src/reap.ts
import { SolariClient as SolariClient2 } from "@solarisdk/sdk";

// src/receipt-pack.ts
import { copyFile, mkdir as mkdir4, readFile as readFile7, writeFile as writeFile4 } from "node:fs/promises";
import path12 from "node:path";
function relToPackage(abs) {
  return path12.relative(packageRoot, abs).replaceAll("\\", "/");
}
function packDirRoot() {
  return path12.join(packageRoot, ".auspex", "pack");
}
async function packLastReceipts(opts) {
  const runsDir = opts?.runsDir ?? RUNS_DIR;
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const packDir = opts?.destDir ?? path12.join(packDirRoot(), stamp);
  await mkdir4(packDir, { recursive: true });
  const dirs = await listCompleteRunDirs(runsDir);
  const chosen = [];
  const seenUrl = /* @__PURE__ */ new Set();
  for (const dir of dirs) {
    const raw = await readFile7(path12.join(dir, "manifest.json"), "utf8").catch(() => "");
    let manifest = {};
    try {
      manifest = JSON.parse(raw);
    } catch {
      manifest = {};
    }
    const key = receiptUrlKey(manifest);
    if (!key) continue;
    if (seenUrl.has(key)) continue;
    seenUrl.add(key);
    chosen.push(dir);
  }
  const packed = [];
  for (const dir of chosen) {
    const dest = path12.join(packDir, path12.basename(dir));
    await mkdir4(dest, { recursive: true });
    const manifestAbs = path12.join(dest, "manifest.json");
    const shotAbs = path12.join(dest, "screenshot.png");
    await copyFile(path12.join(dir, "manifest.json"), manifestAbs);
    await copyFile(path12.join(dir, "screenshot.png"), shotAbs);
    const raw = await readFile7(manifestAbs, "utf8");
    let manifest = {};
    try {
      manifest = JSON.parse(raw);
    } catch {
      manifest = {};
    }
    packed.push({
      url: typeof manifest.url === "string" && manifest.url || typeof manifest.finalUrl === "string" && manifest.finalUrl || "",
      expect: typeof manifest.expect === "string" ? manifest.expect : void 0,
      reason: typeof manifest.reason === "string" ? manifest.reason : void 0,
      screenshotPath: relToPackage(shotAbs),
      manifestPath: relToPackage(manifestAbs),
      runDir: relToPackage(dest)
    });
  }
  await writeFile4(path12.join(packDir, "index.json"), `${JSON.stringify({ packed }, null, 2)}
`);
  return { packDir: relToPackage(packDir), packed };
}

// src/reap.ts
var HOLDING = /* @__PURE__ */ new Set(["starting", "running", "paused"]);
async function defaultReapDeps() {
  const key = requireApiKey();
  const headers = { Authorization: `Bearer ${key}` };
  const pt = new SolariClient2({ apiKey: key, fetch: fetchWithIdempotencyKey() });
  return {
    listVms: async () => {
      const rows = [];
      for (const state of ["starting", "running", "paused"]) {
        const page = await pt.sandboxes.list({ state, limit: 100 });
        for (const s of page.sandboxes) {
          rows.push({ id: s.sandboxId, kind: s.kind, state: s.state });
        }
      }
      return rows;
    },
    deleteVm: (id) => pt.sandboxes.kill(id),
    releaseBrowser: async (id) => {
      const res = await fetch(`${BROWSER_API_BASE}/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers
      });
      if (res.status === 404) throw new Error(`browser session refused (404 InvalidSessionId): ${id}`);
      if (!res.ok && res.status !== 204) throw new Error(`browser release ${res.status}`);
    },
    ledger: () => readLiveLedger()
  };
}
async function reapLeftovers(opts = {}, deps) {
  const d = deps ?? await defaultReapDeps();
  const dryRun = opts.dryRun === true;
  const errors = [];
  const released = [];
  const killed = [];
  const ledger = d.ledger ? await d.ledger() : { browser: [], sandbox: [], desktop: [] };
  const browsers = [.../* @__PURE__ */ new Set([...opts.sessionId ? [opts.sessionId] : [], ...ledger.browser])];
  let vms = await d.listVms();
  if (opts.vmId) {
    const extra = vms.find((v) => v.id === opts.vmId);
    if (!extra) vms = [...vms, { id: opts.vmId, kind: "sandbox", state: "running" }];
  }
  vms = vms.filter((v) => HOLDING.has(v.state) || v.id === opts.vmId);
  if (!dryRun) {
    for (const id of browsers) {
      try {
        await d.releaseBrowser(id);
        released.push(id);
        await forgetLive("browser", id).catch(() => void 0);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    for (const vm of vms) {
      try {
        await d.deleteVm(vm.id);
        killed.push(vm.id);
        const kind = vm.kind === "desktop" ? "desktop" : "sandbox";
        await forgetLive(kind, vm.id).catch(() => void 0);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }
  const result = {
    ok: errors.length === 0,
    dryRun,
    browsers,
    vms,
    released,
    killed,
    errors
  };
  if (opts.packReceipts) {
    try {
      const pack = await (d.packReceipts ?? packLastReceipts)();
      result.packed = pack.packed;
      result.packDir = pack.packDir;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(msg);
      result.ok = false;
    }
  }
  return result;
}

// src/sandbox.ts
import { SolariClient as SolariClient3 } from "@solarisdk/sdk";

// src/fail-closed.ts
function isNoRetryReason(reason) {
  return reason === "loggedOut" || reason === "needsHuman";
}
function mayRetryCheck(reason) {
  return !isNoRetryReason(reason);
}
function shouldVerifyAfterCheck(reason) {
  return mayRetryCheck(reason) && reason !== "recordedLoggedIn";
}

// src/sandbox.ts
var SANDBOX_ASSERT_TIMEOUT_MS = 6e4;
var VERIFY_OVERALL_MS = 9e4;
var CHECK_THEN_VERIFY_WORST_MS = OVERALL_TIMEOUT_MS + CLOSE_TIMEOUT_MS + VERIFY_OVERALL_MS;
var SANDBOX_CREATE_OPTS = {
  template: "base",
  cpu: 1,
  memMb: 2048,
  timeoutMs: 5 * 6e4,
  lifecycle: { onTimeout: "kill" }
};
function wrapSandboxRestExec(sbx, fetchImpl = fetch) {
  return {
    connect: async () => void 0,
    files: {
      mkdir: async (p) => {
        await sbx.commands.run("mkdir", { args: ["-p", p] });
      },
      write: async (p, data) => {
        const { url } = await sbx.uploadUrl(p);
        const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
        const res = await fetchImpl(url, { method: "PUT", body });
        if (!res.ok) throw new Error(`upload ${p} failed: ${res.status}`);
      }
    },
    commands: sbx.commands,
    kill: () => sbx.kill(),
    sandboxId: sbx.id
  };
}
function defaultVerifyDeps() {
  return {
    create: async () => {
      const pt = new SolariClient3({ apiKey: requireApiKey(), fetch: fetchWithIdempotencyKey() });
      const sbx = await pt.sandboxes.create(SANDBOX_CREATE_OPTS);
      return wrapSandboxRestExec(sbx);
    }
  };
}
function assertReceiptUploadSize(manifest, png, cap = MAX_IMAGE_BYTES) {
  const n = Buffer.byteLength(manifest, "utf8") + png.length;
  if (png.length > cap || n > cap) {
    throw new Error(`receipt exceeds ${cap} bytes`);
  }
}
function parseAssertStdout(stdout) {
  const line = stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
  if (!line) {
    return { ok: false, errors: ["sandbox produced no stdout"], claimOk: false, claimErrors: [] };
  }
  try {
    const parsed = JSON.parse(line);
    return {
      ok: parsed.ok === true,
      errors: Array.isArray(parsed.errors) ? parsed.errors : ["sandbox produced no errors list"],
      claimOk: parsed.claimOk === true,
      claimErrors: Array.isArray(parsed.claimErrors) ? parsed.claimErrors : [],
      finalUrl: parsed.finalUrl
    };
  } catch {
    return { ok: false, errors: ["sandbox stdout was not JSON"], claimOk: false, claimErrors: [] };
  }
}
async function verifyReceipt(runDir2, deps = defaultVerifyDeps()) {
  const onProgress = deps.onProgress ?? noopProgress;
  const overallMs = deps.overallMs ?? VERIFY_OVERALL_MS;
  const dir = assertRunDirUnderRuns(runDir2 ? runDir2 : await findLatestRun());
  const { manifest, png } = await loadRunFiles(dir);
  assertReceiptUploadSize(manifest, png);
  let sandbox;
  const createP = deps.create();
  try {
    return await raceWithTimeout(
      async (isCancelled, signal) => {
        onProgress("sandbox-create");
        try {
          sandbox = await observeAbort(createP, signal);
        } catch (err) {
          void createP.then((s) => s.kill().catch(() => void 0));
          throw err;
        }
        if (isCancelled()) {
          await sandbox.kill().catch(() => void 0);
          throw new Error(`sandbox verify timed out after ${overallMs}ms`);
        }
        if (sandbox.sandboxId) await rememberLive("sandbox", sandbox.sandboxId).catch(() => void 0);
        onProgress("sandbox-upload");
        await sandbox.connect();
        await sandbox.files.mkdir("/work");
        await Promise.all([
          sandbox.files.write("/work/manifest.json", manifest),
          sandbox.files.write("/work/screenshot.png", png),
          sandbox.files.write("/work/assert.py", RECEIPT_ASSERT_PY)
        ]);
        onProgress("sandbox-assert");
        const out = await boundPromise(
          sandbox.commands.run("python3", { args: ["/work/assert.py", "/work"] }),
          SANDBOX_ASSERT_TIMEOUT_MS,
          `sandbox assert timed out after ${SANDBOX_ASSERT_TIMEOUT_MS}ms`
        );
        const parsed = parseAssertStdout(out.stdout || out.stderr || "");
        if (out.exitCode !== 0 && parsed.ok) {
          parsed.ok = false;
          parsed.errors = [...parsed.errors, `python exit ${out.exitCode}`];
        }
        const result = { ...parsed, runDir: dir, sandboxId: sandbox.sandboxId };
        onProgress("sandbox-kill");
        try {
          const killedId = sandbox.sandboxId;
          await sandbox.kill();
          if (killedId) await forgetLive("sandbox", killedId).catch(() => void 0);
          sandbox = void 0;
        } catch (killErr) {
          const msg = `sandbox kill failed: ${explainSolariError(killErr)}`;
          return { ...result, ok: false, errors: [...result.errors, msg] };
        }
        return result;
      },
      overallMs,
      `sandbox verify timed out after ${overallMs}ms`
    );
  } catch (err) {
    if (sandbox) {
      try {
        const killedId = sandbox.sandboxId;
        await sandbox.kill();
        if (killedId) await forgetLive("sandbox", killedId).catch(() => void 0);
      } catch {
      }
    }
    throw new AuspexError(explainSolariError(err), {
      issue: classifySolariError(err),
      cause: err
    });
  }
}
async function checkThenVerify(opts, deps) {
  const onProgress = deps?.onProgress ?? opts.onProgress ?? noopProgress;
  onProgress("check");
  const check = deps?.check ? await deps.check({ ...opts, onProgress }) : await runCheck({ ...opts, onProgress });
  const dir = runDirFromResult(check);
  if (!shouldVerifyAfterCheck(check.reason)) {
    return {
      check,
      verify: {
        ok: false,
        errors: [],
        claimOk: false,
        claimErrors: [],
        runDir: dir,
        skipped: true,
        skipReason: check.reason
      }
    };
  }
  try {
    const verify = deps?.verify ? await deps.verify(dir) : await verifyReceipt(dir, {
      create: deps?.create ?? defaultVerifyDeps().create,
      onProgress
    });
    return { check, verify };
  } catch (err) {
    return {
      check,
      verify: {
        ok: false,
        errors: [explainSolariError(err)],
        claimOk: false,
        claimErrors: [],
        runDir: dir
      }
    };
  }
}

// src/mcp-tools.ts
var CHECK_DESCRIPTION = "Open a live URL in a Solari cloud browser, optional click/fill/wait-for, snapshot, check expected text, close. Verifies by default in a headless sandbox (HTTP fetch + OCR). Pass verify=false to skip; do not also call auspex_verify when verifying. Parseable receipt: schemaVersion 1 is frozen; required schemaVersion, ok, reason (matched|loggedOut|needsHuman|mismatch|network|recordedLoggedIn), url, expect, screenshotPath. Extra keys (diff, verify, \u2026) stay optional. loggedOut/needsHuman skip verify and are not retried. Saved checks: name=ironadamant|checkpoint|consistencyhub (consistencyhub is profile only, no sso/record). JSON plus JPEG attach; on-disk shot is a PNG scaled under 2 MiB. stealth/proxy/captcha are Starter+ (402 not retryable). record+profile forbidden unless allowRecordProfile. Never record a logged-in session (sso/saveProfile/dashboard landing). saveProfile persists cookies/localStorage/sessionStorage via POST /profiles/:id/save (not a public /landing session; origin must have bytes). Concurrent save of the same profile is locked (ProfileBusy, not retryable). Profile reuse that lands on /landing is ok:false reason:loggedOut. Microsoft password/OTP sets needsHuman (never typed). 429: call auspex_reap, then retry.";
var VERIFY_DESCRIPTION = "After auspex_check with verify=false, upload the on-disk receipt into a headless Solari sandbox, independently re-check expect (fetch/OCR, not JSON echo). Integrity ok vs claim claimOk. Kill the VM. Do not call this if auspex_check already verified (the default). 429: auspex_reap leftover VMs first.";
var LOGIN_DESCRIPTION = "Create or reuse a named Solari browser profile and return a single-use login-handoff URL for the human (agent never handles the password). Show the url, then call auspex_await_login (or pass wait=true). A Save with 0 cookies is not success. Do not ping the user.";
var DESKTOP_DESCRIPTION = "Named Solari sandbox desktop demo: boot a cloud GUI VM, wait for X11, open mousepad by default. This is not the user's Mac and not a fourth primitive. Wait/expect/ok share one process haystack (processList + ps). windowOk only if a real window list exists. clicked only if verified. Returns ASCII log, JSON, optional PNG, and streamUrl (VNC). Desktops may 402 on Free. 429: auspex_reap.";
var PROFILES_DESCRIPTION = "List Solari browser profile names, ids, version, and populated (whether a non-empty storage state was saved).";
var PROFILE_STATUS_DESCRIPTION = "Report loggedIn vs loggedOut vs needsHuman for a named Solari profile. Live probe never uses --sso or --record and never types a password. Empty or missing profile is loggedOut (human SSO once). Microsoft password/OTP wall is needsHuman \u2014 skip live, do not ping the user.";
var REAP_DESCRIPTION = "List and close leftover Solari browser sessions (from Auspex's live ledger) and kill holding sandboxes/desktops. Use after 429 ConcurrencyLimitExceeded. dryRun lists without killing. packReceipts copies last receipts per URL into .auspex/pack for an agent to attach to a PR.";
function toolJson(obj) {
  return JSON.stringify(stampSchema(obj), null, 2);
}
function progressFromExtra(extra) {
  return createProgress({ extra });
}
function registerAuspexTools(server2) {
  server2.registerTool(
    "auspex_check",
    {
      description: CHECK_DESCRIPTION,
      inputSchema: auspexCheckInputObject
    },
    async (args, extra) => {
      try {
        const onProgress = progressFromExtra(extra);
        onProgress("auspex_check");
        const merged = applySavedCheckName(args);
        const url = merged.url;
        const expect = merged.expect;
        if (!url || !expect) {
          throw new Error("auspex_check requires name or url+expect");
        }
        const { verify, name: _savedName, ...rest } = merged;
        const opts = { ...rest, url, expect, onProgress };
        assertRecordProfileAllowed(opts);
        assertRecordNotLoggedIn(opts);
        const shouldVerify = verify !== false;
        if (shouldVerify) {
          const both = await checkThenVerify(opts);
          const receipt2 = toAgentReceipt(both.check, { verify: both.verify });
          const packed2 = await buildCheckToolContent(receipt2);
          packed2.content[0] = { type: "text", text: toolJson(receipt2) };
          return packed2;
        }
        const result = await runCheck(opts);
        const receipt = toAgentReceipt(result);
        const packed = await buildCheckToolContent(receipt);
        packed.content[0] = { type: "text", text: toolJson(receipt) };
        return packed;
      } catch (err) {
        return packToolFailure(err);
      }
    }
  );
  server2.registerTool(
    "auspex_login",
    {
      description: LOGIN_DESCRIPTION,
      inputSchema: auspexLoginInputSchema
    },
    async ({ profile, url, wait }) => {
      try {
        const result = await loginProfile(profile, url);
        if (!wait) {
          return { content: [{ type: "text", text: toolJson({ ok: true, ...result }) }] };
        }
        const waited = await liveAwaitLogin(profile, { sinceVersion: result.sinceVersion });
        return {
          content: [{ type: "text", text: toolJson({ ok: waited.status === "completed", ...result, wait: waited }) }]
        };
      } catch (err) {
        return packToolFailure(err);
      }
    }
  );
  server2.registerTool(
    "auspex_await_login",
    {
      description: "Wait until the human Save on an auspex_login handoff stores cookies or origins. A version bump with 0 cookies is empty-save (not success). Then pass this profile to auspex_check. Do not ping the user.",
      inputSchema: auspexAwaitLoginInputSchema
    },
    async ({ profile, sinceVersion, timeoutMs }) => {
      try {
        const result = await liveAwaitLogin(profile, { sinceVersion, timeoutMs });
        return { content: [{ type: "text", text: toolJson({ ok: result.status === "completed", ...result }) }] };
      } catch (err) {
        return packToolFailure(err);
      }
    }
  );
  server2.registerTool(
    "auspex_profiles",
    {
      description: PROFILES_DESCRIPTION,
      inputSchema: {}
    },
    async () => {
      try {
        const profiles = await listProfiles();
        return { content: [{ type: "text", text: toolJson({ ok: true, profiles }) }] };
      } catch (err) {
        return packToolFailure(err);
      }
    }
  );
  server2.registerTool(
    "auspex_profile_status",
    {
      description: PROFILE_STATUS_DESCRIPTION,
      inputSchema: auspexProfileStatusInputSchema
    },
    async (args) => {
      try {
        const result = await profileStatus(args);
        return { content: [{ type: "text", text: toolJson(result) }] };
      } catch (err) {
        return packToolFailure(err);
      }
    }
  );
  server2.registerTool(
    "auspex_desktop",
    {
      description: DESKTOP_DESCRIPTION,
      inputSchema: auspexDesktopInputSchema
    },
    async ({ open: open2, type, clickX, clickY, expect }, extra) => {
      try {
        const onProgress = progressFromExtra(extra);
        onProgress("auspex_desktop");
        const result = await runDesktopReview({
          ...defaultDesktopDeps(),
          task: {
            open: open2,
            type,
            expect,
            click: clickX !== void 0 && clickY !== void 0 ? { x: clickX, y: clickY } : void 0
          },
          status: process.stderr
        });
        const packed = await buildReceiptToolContent(
          stampSchema({
            ok: result.ok,
            ready: result.ready,
            processOk: result.processOk,
            windowOk: result.windowOk,
            clicked: result.clicked,
            click: result.click,
            matched: result.matched,
            screenshotPath: result.screenshotPath,
            errors: result.errors,
            desktopId: result.desktopId,
            streamUrl: result.streamUrl,
            overview: result.overview
          }),
          result.screenshotPath
        );
        packed.content.unshift({ type: "text", text: result.log });
        return packed;
      } catch (err) {
        return packToolFailure(err);
      }
    }
  );
  server2.registerTool(
    "auspex_verify",
    {
      description: VERIFY_DESCRIPTION,
      inputSchema: {
        runDir: z5.string().optional().describe("Optional path to an .auspex/runs/<stamp> directory")
      }
    },
    async ({ runDir: runDir2 }, extra) => {
      try {
        const onProgress = progressFromExtra(extra);
        onProgress("auspex_verify");
        const result = await verifyReceipt(runDir2, { ...defaultVerifyDeps(), onProgress });
        return { content: [{ type: "text", text: toolJson(result) }] };
      } catch (err) {
        return packToolFailure(err);
      }
    }
  );
  server2.registerTool(
    "auspex_reap",
    {
      description: REAP_DESCRIPTION,
      inputSchema: auspexReapInputSchema
    },
    async (args) => {
      try {
        const result = await reapLeftovers(args);
        return { content: [{ type: "text", text: toolJson(result) }] };
      } catch (err) {
        return packToolFailure(err);
      }
    }
  );
}

// src/stdio-transport.ts
import process2 from "node:process";
var CL_PREFIX = "content-length:";
function parseContentLength(raw, maxBytes) {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`stdio Content-Length not an integer: ${raw}`);
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0 || n > maxBytes) {
    throw new Error(`stdio Content-Length out of range: ${n}`);
  }
  return n;
}
var DualStdioServerTransport = class _DualStdioServerTransport {
  constructor(stdin = process2.stdin, stdout = process2.stdout) {
    this.stdin = stdin;
    this.stdout = stdout;
  }
  onclose;
  onerror;
  onmessage;
  static MAX_BUFFER_BYTES = 10 * 1024 * 1024;
  started = false;
  buffer = Buffer.alloc(0);
  replyContentLength = false;
  ondata = (chunk2) => {
    try {
      if (this.buffer.length + chunk2.length > _DualStdioServerTransport.MAX_BUFFER_BYTES) {
        throw new Error(
          `ReadBuffer exceeded maximum size of ${_DualStdioServerTransport.MAX_BUFFER_BYTES} bytes`
        );
      }
      this.buffer = Buffer.concat([this.buffer, chunk2]);
      this.drain();
    } catch (error) {
      this.onerror?.(error instanceof Error ? error : new Error(String(error)));
      void this.close();
    }
  };
  onerr = (error) => {
    this.onerror?.(error);
  };
  drain() {
    while (true) {
      const msg = this.readOne();
      if (!msg) break;
      this.onmessage?.(msg);
    }
  }
  readOne() {
    if (this.buffer.length === 0) return null;
    const asText = this.buffer.toString("utf8");
    const lower = asText.toLowerCase();
    if (this.replyContentLength) {
      if (!lower.startsWith("content-length:")) {
        const firstLine = lower.split(/\r?\n/, 1)[0] ?? "";
        if (CL_PREFIX.startsWith(firstLine) && asText.indexOf("\n") === -1) return null;
        throw new Error("stdio framing error: leftover bytes after Content-Length message");
      }
    }
    if (lower.startsWith("content-length:") || asText.match(/^Content-Length:\s*\d+/i)) {
      this.replyContentLength = true;
      let sep = this.buffer.indexOf("\r\n\r\n");
      let sepLen = 4;
      if (sep === -1) {
        sep = this.buffer.indexOf("\n\n");
        sepLen = 2;
      }
      if (sep === -1) return null;
      const header = this.buffer.subarray(0, sep).toString("utf8");
      const lenMatch = header.match(/Content-Length:\s*(\S+)/i);
      if (!lenMatch) {
        throw new Error(`stdio header missing Content-Length: ${header.slice(0, 80)}`);
      }
      const n = parseContentLength(lenMatch[1] ?? "", _DualStdioServerTransport.MAX_BUFFER_BYTES);
      const start = sep + sepLen;
      if (this.buffer.length < start + n) return null;
      const json = this.buffer.subarray(start, start + n).toString("utf8");
      this.buffer = this.buffer.subarray(start + n);
      if (this.buffer.length > 0) {
        const rest = this.buffer.toString("utf8");
        const restLower = rest.toLowerCase();
        if (!restLower.startsWith("content-length:")) {
          const firstLine = restLower.split(/\r?\n/, 1)[0] ?? "";
          if (!(CL_PREFIX.startsWith(firstLine) && rest.indexOf("\n") === -1)) {
            throw new Error("stdio framing error: leftover bytes after Content-Length message");
          }
        }
      }
      return JSON.parse(json);
    }
    while (true) {
      const nl = this.buffer.indexOf("\n");
      if (nl === -1) return null;
      const line = this.buffer.subarray(0, nl).toString("utf8").replace(/\r$/, "");
      this.buffer = this.buffer.subarray(nl + 1);
      if (!line.trim()) {
        if (this.buffer.length === 0) return null;
        continue;
      }
      return JSON.parse(line);
    }
  }
  async start() {
    if (this.started) throw new Error("DualStdioServerTransport already started");
    this.started = true;
    this.stdin.on("data", this.ondata);
    this.stdin.on("error", this.onerr);
  }
  async close() {
    this.stdin.off("data", this.ondata);
    this.stdin.off("error", this.onerr);
    if (this.stdin.listenerCount("data") === 0) this.stdin.pause();
    this.buffer = Buffer.alloc(0);
    this.onclose?.();
  }
  send(message) {
    const json = JSON.stringify(message);
    const body = Buffer.from(json, "utf8");
    const payload = this.replyContentLength ? Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r
\r
`, "utf8"), body]) : Buffer.from(`${json}
`, "utf8");
    return new Promise((resolve, reject) => {
      const onError = (err) => {
        this.stdout.off("drain", onDrain);
        this.stdout.off("error", onError);
        reject(err);
      };
      const onDrain = () => {
        this.stdout.off("error", onError);
        resolve();
      };
      this.stdout.once("error", onError);
      let ok;
      try {
        ok = this.stdout.write(payload);
      } catch (err) {
        this.stdout.off("error", onError);
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      if (ok) {
        this.stdout.off("error", onError);
        resolve();
      } else {
        this.stdout.once("drain", onDrain);
      }
    });
  }
};

// src/mcp.ts
var server = new McpServer2({
  name: "auspex",
  version: "0.1.0"
});
registerAuspexTools(server);
var transport = new DualStdioServerTransport();
await server.connect(transport);
