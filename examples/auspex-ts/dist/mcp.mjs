// src/mcp.ts
import { McpServer as McpServer2 } from "@modelcontextprotocol/sdk/server/mcp.js";

// src/mcp-tools.ts
import "@modelcontextprotocol/sdk/server/mcp.js";
import { z as z5 } from "zod";

// src/check.ts
import { mkdir, writeFile } from "node:fs/promises";
import path2 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

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

// src/profiles.ts
import { z as z2 } from "zod";

// src/solari.ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserSession, Solari, SolariError } from "@solarisdk/browser";
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

// src/solari.ts
var CHROMIUM_CONNECT_OPTS = { timeout: CHROMIUM_CONNECT_TIMEOUT_MS };
function defaultLaunchDeps(solari) {
  return {
    create: (opts) => solari.sessions.create(opts),
    connect: (ws, opts) => chromium.connect(ws, opts),
    wrap: (session, browser) => new BrowserSession(solari, session, browser),
    releaseAndWait: (id) => solari.sessions.releaseAndWait(id)
  };
}
var GOTO_TIMEOUT_MS = 45e3;
var NETWORKIDLE_TIMEOUT_MS = 15e3;
var OVERALL_TIMEOUT_MS = 12e4;
var DOTENV_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
function toPlaywrightStorageState(state) {
  const cookies = [];
  for (const c of state.cookies ?? []) {
    if (!c.domain || !c.name) continue;
    const sameSite = c.sameSite === "Strict" || c.sameSite === "Lax" || c.sameSite === "None" ? c.sameSite : "Lax";
    cookies.push({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path ?? "/",
      expires: c.expires ?? -1,
      httpOnly: c.httpOnly ?? true,
      secure: c.secure ?? true,
      sameSite
    });
  }
  const origins = (state.origins ?? []).map((o) => ({
    origin: o.origin,
    localStorage: o.localStorage ?? []
  }));
  return { cookies, origins };
}
function findProfileId(profiles, name) {
  const want = name.trim();
  const existing = profiles.find((p) => p.name.trim() === want);
  if (!existing) {
    throw new Error(`Solari profile not found: ${want}. Run login --profile ${want} first.`);
  }
  return existing.id;
}
function loadDotEnv(file = DOTENV_PATH) {
  if (process.env.SOLARI_API_KEY) return;
  if (!existsSync(file)) return;
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
    if (name === "SOLARI_API_KEY" && value) {
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
      "SOLARI_API_KEY is not set. Put slr_live_\u2026 in examples/auspex-ts/.env (gitignored) or export it in the same process that runs Auspex/Grok."
    );
  }
  return key;
}
function createClient() {
  return new Solari({ apiKey: requireApiKey() });
}
async function launchBrowser(solari, options = {}, signal, deps = defaultLaunchDeps(solari)) {
  const closeMs = deps.closeTimeoutMs ?? CLOSE_TIMEOUT_MS;
  const session = await deps.create({
    stealth: options.stealth,
    recording: options.recording,
    profileId: options.profileId
  });
  const release = () => boundPromise(
    deps.releaseAndWait(session.id),
    closeMs,
    `session release timed out after ${closeMs}ms`
  ).catch(() => void 0);
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
  const state = browser.session.storageState;
  const pw = state ? toPlaywrightStorageState(state) : { cookies: [], origins: [] };
  const hasState = pw.cookies.length > 0 || pw.origins.length > 0;
  const ctx = hasState ? await browser.newContext({ storageState: pw }) : browser.contexts()[0] ?? await browser.newContext();
  return ctx.pages()[0] ?? ctx.newPage();
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
function loginInstructions(profile, urlHint) {
  const where = urlHint ? ` Log in at ${urlHint}.` : " Log in.";
  return {
    profileId: profile.id,
    name: profile.name,
    consoleUrl: CONSOLE_PROFILES_URL,
    next: `Open ${CONSOLE_PROFILES_URL} \u2192 Profiles \u2192 Open editor.${where} Hit Save, then run auspex check with --profile ${profile.name}`
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
async function loginProfile(name, urlHint) {
  const profile = await ensureProfile(name);
  return loginInstructions(profile, urlHint);
}
async function listProfiles() {
  const solari = createClient();
  try {
    return (await solari.profiles.list()).map((p) => ({ id: p.id, name: p.name }));
  } finally {
    await solari.close();
  }
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

// src/tool-schema.ts
import { z as z4 } from "zod";
var RECORD_PROFILE_ERROR = "--record cannot be used with --profile (recordings capture input). Pass --allow-record-profile to override.";
function assertRecordProfileAllowed(opts) {
  if (opts.record && opts.profile && !opts.allowRecordProfile) {
    throw new Error(RECORD_PROFILE_ERROR);
  }
}
var auspexCheckInputObject = z4.object({
  url: checkUrlSchema.describe("http or https URL to open (not loopback)"),
  expect: expectSchema.describe("Non-empty substring that must appear in the page text"),
  selector: z4.string().optional().describe("Optional CSS selector to extract instead of body"),
  profile: profileNameSchema.optional().describe("Solari profile name to reuse cookies/storage"),
  stealth: z4.boolean().optional().describe("Launch with Solari stealth (Starter plan)"),
  record: z4.boolean().optional().describe("Record the session for Solari console Replay (sessionId). Does not return a presigned URL"),
  sso: z4.boolean().optional().describe("Click Sign in with Microsoft and the signed-in account picker if they appear"),
  verify: z4.boolean().optional().describe("After check, audit the receipt in a headless sandbox and kill the VM"),
  allowRecordProfile: z4.boolean().optional().describe("Override: allow --record together with a profile (recordings capture input)")
});
var auspexCheckInputSchema = auspexCheckInputObject.superRefine((val, ctx) => {
  if (val.record && val.profile && !val.allowRecordProfile) {
    ctx.addIssue({ code: z4.ZodIssueCode.custom, message: RECORD_PROFILE_ERROR, path: ["record"] });
  }
});
var auspexLoginInputSchema = z4.object({
  profile: profileNameSchema.describe("Profile name to create or reuse"),
  url: httpUrlSchema.optional().describe("Optional http(s) login URL hint to show the human")
});

// src/errors.ts
import { SolariError as SolariError2 } from "@solarisdk/browser";
function redactSecrets(text) {
  return text.replace(/slr_[a-z]+_[A-Za-z0-9_\-]+/gi, "slr_\u2026").replace(/\bsk-[A-Za-z0-9]{10,}\b/g, "sk-\u2026").replace(/\bAKIA[A-Z0-9]{16}\b/g, "AKIA\u2026").replace(/Bearer\s+\S+/gi, "Bearer \u2026");
}
function explainSolariError(err) {
  let msg;
  if (err instanceof SolariError2) {
    if (err.code === "FeatureRequiresPlan" || err.status === 402) {
      msg = "Solari 402 FeatureRequiresPlan: stealth, proxy, captcha, or desktops need Starter or higher.";
    } else if (err.code === "ConcurrencyLimitExceeded" || err.status === 429) {
      msg = "Solari 429 ConcurrencyLimitExceeded: kill leftover sessions in the console, then retry.";
    } else if (err.code === "PlanLimitExceeded" || err.status === 403) {
      msg = "Solari 403 PlanLimitExceeded: this account is at a plan limit (profiles, minutes, or storage).";
    } else if (err.code === "BrowserUnhealthy") {
      msg = "Solari BrowserUnhealthy: the cloud Chrome failed its health probe; retry the check.";
    } else if (err.code === "InvalidSessionId") {
      msg = "Solari InvalidSessionId: that session id is unknown or not this account's; it was not released.";
    } else {
      msg = err.message;
    }
  } else {
    msg = err instanceof Error ? err.message : String(err);
  }
  return redactSecrets(msg);
}

// src/sso.ts
function hostIs(hostname, domain) {
  const h = hostname.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}
function stillOnAuth(url) {
  if (hostIs(url.hostname, "login.microsoftonline.com") || hostIs(url.hostname, "login.live.com")) {
    return true;
  }
  const path5 = (url.pathname.replace(/\/+$/, "") || "/").toLowerCase();
  if (path5 === "/login" || path5.startsWith("/login/") || path5 === "/auth" || path5.startsWith("/auth/")) {
    return true;
  }
  return false;
}
function shouldFailClosedAuth(url, opts) {
  if (!stillOnAuth(url)) return false;
  if (hostIs(url.hostname, "login.microsoftonline.com") || hostIs(url.hostname, "login.live.com")) {
    return true;
  }
  return Boolean(opts.sso || opts.profile);
}
function stopped(cancel) {
  return Boolean(cancel.isCancelled?.() || cancel.signal?.aborted);
}
async function completeMicrosoftSso(page, cancel = {}) {
  if (stopped(cancel)) return;
  const signal = cancel.signal;
  const msBtn = page.getByRole("button", { name: /sign in with microsoft/i });
  if (await msBtn.count() === 0) return;
  await msBtn.first().click({ timeout: 1e4, signal });
  if (stopped(cancel)) return;
  await page.waitForURL(
    (url) => hostIs(url.hostname, "login.microsoftonline.com") || hostIs(url.hostname, "login.live.com"),
    { timeout: 3e4, signal }
  ).catch(() => void 0);
  if (stopped(cancel)) return;
  await page.waitForLoadState("domcontentloaded", { timeout: 45e3, signal }).catch(() => void 0);
  if (stopped(cancel)) return;
  const picker = page.getByText(/pick an account/i);
  await picker.waitFor({ timeout: 2e4, signal }).catch(() => void 0);
  if (stopped(cancel)) return;
  const signedIn = page.getByText(/^Signed in$/i);
  const tile = page.locator("[data-test-id='native-tile']").filter({ hasText: /signed in/i });
  if (await signedIn.count() > 0) {
    await signedIn.first().click({ timeout: 1e4, signal });
  } else if (await tile.count() > 0) {
    await tile.first().click({ timeout: 1e4, signal });
  }
  if (stopped(cancel)) return;
  const yes = page.getByRole("button", { name: /^yes$/i });
  if (await yes.count() > 0) {
    await yes.first().click({ timeout: 8e3, signal }).catch(() => void 0);
  }
  if (stopped(cancel)) return;
  await page.waitForURL((url) => !stillOnAuth(url), { timeout: 45e3, signal }).catch(() => void 0);
  if (stopped(cancel)) return;
  await page.waitForLoadState("networkidle", { timeout: 15e3, signal }).catch(() => void 0);
}

// src/check.ts
var packageRoot = path2.resolve(path2.dirname(fileURLToPath2(import.meta.url)), "..");
function toReceiptPath(absPath) {
  return path2.relative(packageRoot, absPath).replaceAll("\\", "/");
}
function runDirFromResult(result) {
  const abs = path2.isAbsolute(result.screenshotPath) ? result.screenshotPath : path2.join(packageRoot, result.screenshotPath);
  return path2.dirname(abs);
}
function runDir() {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  return path2.join(packageRoot, ".auspex", "runs", stamp);
}
async function extractText(page, selector, signal) {
  if (selector) {
    return page.locator(selector).first().innerText({ timeout: 1e4, signal });
  }
  return page.locator("body").innerText({ timeout: 3e4, signal });
}
async function waitNetworkIdle(page, signal) {
  try {
    await page.waitForLoadState("networkidle", { timeout: NETWORKIDLE_TIMEOUT_MS, signal });
    return true;
  } catch {
    return false;
  }
}
async function runCheck(opts) {
  requireExpect(opts.expect);
  requireCheckUrl(opts.url, "url");
  assertRecordProfileAllowed(opts);
  if (opts.profile) opts = { ...opts, profile: requireProfileName(opts.profile) };
  const solari = createClient();
  const closer = new ReadyRelease();
  let sessionId = "";
  const outDir = runDir();
  await mkdir(outDir, { recursive: true });
  const screenshotAbs = path2.join(outDir, "screenshot.png");
  const screenshotPath = toReceiptPath(screenshotAbs);
  let title = "";
  let finalUrl = "";
  let excerpt = "";
  let matched = false;
  let networkIdle = false;
  let workError;
  const work = async (isCancelled, signal) => {
    try {
      const profileId = opts.profile ? await resolveProfileId(solari, opts.profile) : void 0;
      if (isCancelled()) return;
      const browser = await observeAbort(
        launchBrowser(
          solari,
          {
            stealth: opts.stealth === true,
            recording: opts.record === true,
            profileId
          },
          signal
        ),
        signal
      );
      closer.set(async () => {
        await closeThenRelease(
          () => browser.close(),
          () => solari.sessions.releaseAndWait(browser.id),
          CLOSE_TIMEOUT_MS
        );
      });
      sessionId = browser.id;
      if (isCancelled()) return;
      const page = await pageForSession(browser);
      if (isCancelled()) return;
      await page.goto(opts.url, {
        timeout: GOTO_TIMEOUT_MS,
        waitUntil: "domcontentloaded",
        signal
      });
      networkIdle = await waitNetworkIdle(page, signal);
      if (isCancelled()) return;
      if (opts.sso) {
        await completeMicrosoftSso(page, { isCancelled, signal });
        networkIdle = await waitNetworkIdle(page, signal);
      }
      if (isCancelled()) return;
      title = await observeAbort(page.title(), signal);
      finalUrl = page.url();
      let raw = "";
      try {
        raw = await extractText(page, opts.selector, signal);
        const haystack = normalizeHaystack(raw);
        excerpt = excerptOf(haystack);
        matched = haystackMatches(raw, opts.expect);
      } catch (extractErr) {
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
      await page.screenshot({
        path: screenshotAbs,
        type: "png",
        fullPage: true,
        signal,
        timeout: SCREENSHOT_TIMEOUT_MS
      });
    } finally {
      closer.skip();
    }
  };
  try {
    try {
      await raceWithTimeout(
        work,
        OVERALL_TIMEOUT_MS,
        `auspex check timed out after ${OVERALL_TIMEOUT_MS}ms`
      );
    } catch (err) {
      workError = err;
    } finally {
      try {
        await closer.release();
      } catch (closeErr) {
        const closeMsg = `session close failed: ${explainSolariError(closeErr)}`;
        if (workError) throw new Error(`${explainSolariError(workError)}; ${closeMsg}`);
        throw new Error(closeMsg);
      }
    }
    if (workError) throw new Error(explainSolariError(workError));
    const result = {
      title,
      finalUrl,
      ok: matched,
      expect: opts.expect,
      matched,
      excerpt,
      screenshotPath,
      sessionId,
      networkIdle
    };
    await writeFile(path2.join(outDir, "manifest.json"), `${JSON.stringify(result, null, 2)}
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
import { readFile } from "node:fs/promises";
import path3 from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";

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

// src/content.ts
var packageRoot2 = path3.resolve(path3.dirname(fileURLToPath3(import.meta.url)), "..");
var MAX_IMAGE_BYTES = 2 * 1024 * 1024;
function resolveScreenshotPath(p) {
  return path3.isAbsolute(p) ? p : path3.join(packageRoot2, p);
}
function pngNote(text) {
  return { type: "text", text };
}
async function buildCheckToolContent(result) {
  const content = [{ type: "text", text: JSON.stringify(result, null, 2) }];
  if (!result.screenshotPath) return { content };
  try {
    const buf = await readFile(resolveScreenshotPath(result.screenshotPath));
    if (buf.length === 0) {
      content.push(pngNote("PNG omitted: screenshot file is empty"));
      return { content };
    }
    const attach = buf.length <= MAX_IMAGE_BYTES ? buf : fitPngUnderCap(buf, MAX_IMAGE_BYTES);
    if (attach.length > MAX_IMAGE_BYTES) {
      content.push(pngNote(`PNG omitted: ${buf.length} bytes exceeds ${MAX_IMAGE_BYTES}`));
      return { content };
    }
    content.push({
      type: "image",
      mimeType: "image/png",
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

// src/sandbox.ts
import { SolariClient } from "@solarisdk/sdk";

// src/receipt.ts
import { readdir, readFile as readFile2, stat } from "node:fs/promises";
import path4 from "node:path";
var RUNS_DIR = path4.join(packageRoot, ".auspex", "runs");
var RECEIPT_ASSERT_PY = `import json, sys
from pathlib import Path
from urllib.parse import urlparse

work = Path(sys.argv[1] if len(sys.argv) > 1 else "/work")
man = json.loads((work / "manifest.json").read_text())
png = (work / "screenshot.png").read_bytes()
integrity = []
claim = []
if png[:8] != bytes.fromhex("89504e470d0a1a0a"):
    integrity.append("screenshot is not a PNG")
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
`;
function assertRunDirUnderRuns(runDir2, runsDir = RUNS_DIR) {
  const dir = path4.resolve(runDir2);
  const root = path4.resolve(runsDir);
  if (dir !== root && !dir.startsWith(root + path4.sep)) {
    throw new Error("runDir must be under .auspex/runs");
  }
  return dir;
}
async function findLatestRun(runsDir = RUNS_DIR) {
  let names;
  try {
    names = await readdir(runsDir);
  } catch {
    throw new Error(`no Auspex runs in ${runsDir}. Run check first.`);
  }
  const dirs = [];
  for (const name of names.sort().reverse()) {
    const dir = path4.join(runsDir, name);
    const st = await stat(dir).catch(() => void 0);
    if (!st?.isDirectory()) continue;
    dirs.push(dir);
  }
  for (const dir of dirs) {
    try {
      await stat(path4.join(dir, "manifest.json"));
      await stat(path4.join(dir, "screenshot.png"));
      return dir;
    } catch {
      continue;
    }
  }
  throw new Error(`no complete run (manifest.json + screenshot.png) in ${runsDir}`);
}
async function loadRunFiles(runDir2) {
  const manifest = await readFile2(path4.join(runDir2, "manifest.json"), "utf8");
  const png = await readFile2(path4.join(runDir2, "screenshot.png"));
  return { manifest, png };
}

// src/sandbox.ts
var SANDBOX_ASSERT_TIMEOUT_MS = 6e4;
var CHECK_THEN_VERIFY_WORST_MS = OVERALL_TIMEOUT_MS + CLOSE_TIMEOUT_MS + SANDBOX_ASSERT_TIMEOUT_MS;
function defaultVerifyDeps() {
  return {
    create: async () => {
      const pt = new SolariClient({ apiKey: requireApiKey() });
      return pt.sandboxes.create({
        template: "base",
        timeoutMs: 5 * 6e4,
        lifecycle: { onTimeout: "kill" }
      });
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
  const dir = assertRunDirUnderRuns(runDir2 ? runDir2 : await findLatestRun());
  const { manifest, png } = await loadRunFiles(dir);
  assertReceiptUploadSize(manifest, png);
  const sandbox = await deps.create();
  try {
    await sandbox.connect();
    await sandbox.files.mkdir("/work");
    await sandbox.files.write("/work/manifest.json", manifest);
    await sandbox.files.write("/work/screenshot.png", png);
    await sandbox.files.write("/work/assert.py", RECEIPT_ASSERT_PY);
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
    try {
      await sandbox.kill();
    } catch (killErr) {
      const msg = `sandbox kill failed: ${explainSolariError(killErr)}`;
      return { ...result, ok: false, errors: [...result.errors, msg] };
    }
    return result;
  } catch (err) {
    try {
      await sandbox.kill();
    } catch {
    }
    throw new Error(explainSolariError(err));
  }
}
async function checkThenVerify(opts, deps) {
  const check = deps?.check ? await deps.check(opts) : await runCheck(opts);
  const dir = runDirFromResult(check);
  try {
    const verify = deps?.verify ? await deps.verify(dir) : await verifyReceipt(dir, deps?.create ? { create: deps.create } : void 0);
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
function registerAuspexTools(server2) {
  server2.registerTool(
    "auspex_check",
    {
      description: "Open a live URL in a Solari cloud browser, snapshot the page, and check that expected text is present. Returns JSON plus a PNG (on-disk shot stays full-page; MCP attach is downscaled to 2 MiB if needed). Always closes the session. Set verify=true to then audit the receipt in a headless sandbox and kill the VM. Use for post-deploy verification, not raw CDP.",
      inputSchema: auspexCheckInputObject
    },
    async ({ url, expect, selector, profile, stealth, record, sso, verify, allowRecordProfile }) => {
      try {
        const opts = { url, expect, selector, profile, stealth, record, sso, allowRecordProfile };
        assertRecordProfileAllowed(opts);
        if (verify) {
          const both = await checkThenVerify(opts);
          const packed = await buildCheckToolContent(both.check);
          packed.content[0] = { type: "text", text: JSON.stringify(both, null, 2) };
          return packed;
        }
        const result = await runCheck(opts);
        return await buildCheckToolContent(result);
      } catch (err) {
        throw new Error(explainSolariError(err));
      }
    }
  );
  server2.registerTool(
    "auspex_login",
    {
      description: "Create or reuse a named Solari browser profile, then tell the human to log in via Console \u2192 Profiles \u2192 Open editor \u2192 Save. Does not keep a check session open. After Save, pass this profile to auspex_check.",
      inputSchema: auspexLoginInputSchema
    },
    async ({ profile, url }) => {
      try {
        const result = await loginProfile(profile, url);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        throw new Error(explainSolariError(err));
      }
    }
  );
  server2.registerTool(
    "auspex_profiles",
    {
      description: "List Solari browser profile names and ids on this account.",
      inputSchema: {}
    },
    async () => {
      try {
        const profiles = await listProfiles();
        return { content: [{ type: "text", text: JSON.stringify(profiles, null, 2) }] };
      } catch (err) {
        throw new Error(explainSolariError(err));
      }
    }
  );
  server2.registerTool(
    "auspex_verify",
    {
      description: "After auspex_check, upload the receipt (PNG + JSON) into a headless Solari sandbox, assert it, and kill the VM. Login stays on the browser profile editor. Optional runDir; default is the latest .auspex/runs stamp.",
      inputSchema: {
        runDir: z5.string().optional().describe("Optional path to an .auspex/runs/<stamp> directory")
      }
    },
    async ({ runDir: runDir2 }) => {
      try {
        const result = await verifyReceipt(runDir2);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        throw new Error(explainSolariError(err));
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
