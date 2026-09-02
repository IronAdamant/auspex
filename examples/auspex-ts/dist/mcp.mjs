// src/mcp.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z as z3 } from "zod";

// src/check.ts
import { mkdir, writeFile } from "node:fs/promises";
import path2 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/http-url.ts
import { z } from "zod";
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
var httpUrlSchema = z.string().refine(isHttpOrHttpsUrl, { message: "url must be an http or https URL" });

// src/text.ts
import { z as z2 } from "zod";
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
var expectSchema = z2.string().refine(isNonEmptyExpect, { message: "check requires a non-empty --expect" });

// src/solari.ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Solari, SolariError } from "@solarisdk/browser";
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
  const path4 = (url.pathname.replace(/\/+$/, "") || "/").toLowerCase();
  if (path4 === "/login" || path4.startsWith("/login/") || path4 === "/auth" || path4.startsWith("/auth/")) {
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

// src/check.ts
var packageRoot = path2.resolve(path2.dirname(fileURLToPath2(import.meta.url)), "..");
function toReceiptPath(absPath) {
  return path2.relative(packageRoot, absPath).replaceAll("\\", "/");
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
  requireHttpUrl(opts.url, "url");
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
        boundPromise(
          solari.launch({
            stealth: opts.stealth === true,
            recording: opts.record === true,
            profileId
          }),
          CHROMIUM_CONNECT_TIMEOUT_MS,
          `waiting for Chromium timed out after ${CHROMIUM_CONNECT_TIMEOUT_MS}ms`
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
var packageRoot2 = path3.resolve(path3.dirname(fileURLToPath3(import.meta.url)), "..");
var MAX_IMAGE_BYTES = 2 * 1024 * 1024;
function resolveScreenshotPath(p) {
  return path3.isAbsolute(p) ? p : path3.join(packageRoot2, p);
}
async function buildCheckToolContent(result) {
  const content = [{ type: "text", text: JSON.stringify(result, null, 2) }];
  if (!result.screenshotPath) return { content };
  try {
    const buf = await readFile(resolveScreenshotPath(result.screenshotPath));
    if (buf.length === 0) {
      content.push({ type: "text", text: "PNG omitted: screenshot file is empty" });
      return { content };
    }
    if (buf.length > MAX_IMAGE_BYTES) {
      content.push({
        type: "text",
        text: `PNG omitted: ${buf.length} bytes exceeds ${MAX_IMAGE_BYTES}`
      });
      return { content };
    }
    content.push({
      type: "image",
      mimeType: "image/png",
      data: buf.toString("base64")
    });
  } catch {
  }
  return { content };
}

// src/profiles.ts
var CONSOLE_PROFILES_URL = "https://console.getsolari.com";
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
  const solari = createClient();
  try {
    const existing = (await solari.profiles.list()).find((p) => p.name === name);
    const profile = existing ?? await solari.profiles.create({ name });
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
  ondata = (chunk) => {
    try {
      if (this.buffer.length + chunk.length > _DualStdioServerTransport.MAX_BUFFER_BYTES) {
        throw new Error(
          `ReadBuffer exceeded maximum size of ${_DualStdioServerTransport.MAX_BUFFER_BYTES} bytes`
        );
      }
      this.buffer = Buffer.concat([this.buffer, chunk]);
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
var server = new McpServer({
  name: "auspex",
  version: "0.1.0"
});
server.registerTool(
  "auspex_check",
  {
    description: "Open a live URL in a Solari cloud browser, snapshot the page, and check that expected text is present. Returns JSON plus a PNG (or a note if the PNG exceeds 2 MiB). Always closes the session. Use for post-deploy verification, not raw CDP.",
    inputSchema: {
      url: httpUrlSchema.describe("http or https URL to open"),
      expect: expectSchema.describe("Non-empty substring that must appear in the page text"),
      selector: z3.string().optional().describe("Optional CSS selector to extract instead of body"),
      profile: z3.string().optional().describe("Solari profile name to reuse cookies/storage"),
      stealth: z3.boolean().optional().describe("Launch with Solari stealth (Starter plan)"),
      record: z3.boolean().optional().describe("Record the session for Solari console Replay (sessionId). Does not return a presigned URL"),
      sso: z3.boolean().optional().describe("Click Sign in with Microsoft and the signed-in account picker if they appear")
    }
  },
  async ({ url, expect, selector, profile, stealth, record, sso }) => {
    try {
      const result = await runCheck({
        url,
        expect,
        selector,
        profile,
        stealth,
        record,
        sso
      });
      return await buildCheckToolContent(result);
    } catch (err) {
      throw new Error(explainSolariError(err));
    }
  }
);
server.registerTool(
  "auspex_login",
  {
    description: "Create or reuse a named Solari browser profile, then tell the human to log in via Console \u2192 Profiles \u2192 Open editor \u2192 Save. Does not keep a check session open. After Save, pass this profile to auspex_check.",
    inputSchema: {
      profile: z3.string().describe("Profile name to create or reuse"),
      url: httpUrlSchema.optional().describe("Optional http(s) login URL hint to show the human")
    }
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
server.registerTool(
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
var transport = new DualStdioServerTransport();
await server.connect(transport);
