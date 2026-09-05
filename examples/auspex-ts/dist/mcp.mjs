// src/mcp.ts
import { McpServer as McpServer2 } from "@modelcontextprotocol/sdk/server/mcp.js";

// src/mcp-tools.ts
import "@modelcontextprotocol/sdk/server/mcp.js";
import { z as z5 } from "zod";

// src/check.ts
import { existsSync as existsSync2 } from "node:fs";
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
    releaseAndWait: (id) => solari.sessions.releaseAndWait(id),
    getStatus: (id) => getSessionStatus(id)
  };
}
function fetchWithIdempotencyKey(base = fetch) {
  return (async (input, init) => {
    const headers = new Headers(init?.headers);
    const method = (init?.method ?? "GET").toUpperCase();
    const url = String(input);
    let path6 = url;
    try {
      path6 = new URL(url, BROWSER_API_BASE).pathname;
    } catch {
    }
    const isVmCreate = method === "POST" && /\/(sandboxes|desktops)\/?$/.test(path6);
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
var OVERALL_TIMEOUT_MS = 12e4;
var BROWSER_API_BASE = "https://api.getsolari.com";
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
  const createP = deps.create({
    stealth: options.stealth,
    recording: options.recording,
    profileId: options.profileId
  });
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
      next: `Open the url (single-use Solari login handoff; no password through the agent).${where} Save when done, then run auspex check with --profile ${profile.name}`
    };
  }
  return {
    profileId: profile.id,
    name: profile.name,
    consoleUrl: CONSOLE_PROFILES_URL,
    next: `Open ${CONSOLE_PROFILES_URL} \u2192 Profiles \u2192 Open editor.${where} Hit Save, then run auspex check with --profile ${profile.name}`
  };
}
async function defaultProfileHttp() {
  const key = requireApiKey();
  return {
    post: async (path6, body) => {
      const res = await fetch(`${BROWSER_API_BASE}${path6}`, {
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
  stealth: z4.boolean().optional().describe("Solari stealth pool. Starter+; Free returns 402 FeatureRequiresPlan (not retryable)"),
  record: z4.boolean().optional().describe(
    "Record for Solari console Replay via sessionId (no presigned replayUrl). Forbidden with profile unless allowRecordProfile"
  ),
  sso: z4.boolean().optional().describe("Click Sign in with Microsoft and the signed-in account picker if they appear"),
  verify: z4.boolean().optional().describe(
    "One-shot: after check, audit the receipt in a headless sandbox and kill that VM. Do not also call auspex_verify"
  ),
  allowRecordProfile: z4.boolean().optional().describe("Override: allow record together with a profile (recordings capture input)")
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
var auspexDesktopInputSchema = z4.object({
  open: z4.string().optional().describe("Optional app name to open on the desktop before screenshot"),
  type: z4.string().optional().describe("Optional text to type after open"),
  clickX: z4.number().optional().describe("Click X (default 640)"),
  clickY: z4.number().optional().describe("Click Y (default 360)")
});

// src/errors.ts
import { SolariError as SolariError2 } from "@solarisdk/browser";
var CLOSE_KILL_RECOVERY = "Not retryable. Free the slot with solari_browser_close / solari_kill (or let Auspex check/verify/desktop finish teardown), then retry.";
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
  const path6 = (url.pathname.replace(/\/+$/, "") || "/").toLowerCase();
  if (path6 === "/login" || path6.startsWith("/login/") || path6 === "/auth" || path6.startsWith("/auth/")) {
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
async function runCheck(opts) {
  requireExpect(opts.expect);
  requireCheckUrl(opts.url, "url");
  assertRecordProfileAllowed(opts);
  if (opts.profile) opts = { ...opts, profile: requireProfileName(opts.profile) };
  const onProgress = opts.onProgress ?? noopProgress;
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
      onProgress("launching");
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
      if (isCancelled()) return;
      const page = await pageForSession(browser);
      if (isCancelled()) return;
      onProgress("goto");
      await page.goto(opts.url, {
        timeout: GOTO_TIMEOUT_MS,
        waitUntil: "domcontentloaded",
        signal
      });
      if (isCancelled()) return;
      if (opts.sso) {
        onProgress("sso");
        await completeMicrosoftSso(page, { isCancelled, signal });
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
      onProgress("screenshot");
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
    if (workError) {
      throw new AuspexError(explainSolariError(workError), {
        issue: classifySolariError(workError),
        sessionId: sessionId || void 0,
        screenshotPath: existsSync2(screenshotAbs) ? screenshotPath : void 0,
        cause: workError
      });
    }
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

// src/content.ts
var packageRoot2 = path3.resolve(path3.dirname(fileURLToPath3(import.meta.url)), "..");
var MAX_IMAGE_BYTES = 2 * 1024 * 1024;
function resolveScreenshotPath(p) {
  return path3.isAbsolute(p) ? p : path3.join(packageRoot2, p);
}
function pngNote(text) {
  return { type: "text", text };
}
async function buildReceiptToolContent(payload, screenshotPath) {
  const content = [{ type: "text", text: JSON.stringify(payload, null, 2) }];
  if (!screenshotPath) return { content };
  try {
    const buf = await readFile(resolveScreenshotPath(screenshotPath));
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
  const packed = await buildReceiptToolContent(payload, extra?.screenshotPath);
  if (extra?.log) {
    packed.content.unshift({ type: "text", text: extra.log });
  }
  return { content: packed.content, isError: true };
}

// src/desktop.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path4 from "node:path";
import { SolariClient } from "@solarisdk/sdk";

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
  const err = opts.errors.length ? ` errors=${opts.errors.join("; ")}` : "";
  return `==> ok=${opts.ok} ready=${opts.ready}${err}
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
function sleep(ms) {
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
var DEFAULT_DESKTOP_CLICK = { x: 640, y: 360 };
function defaultDesktopDeps() {
  return {
    create: async () => {
      const pt = new SolariClient({ apiKey: requireApiKey(), fetch: fetchWithIdempotencyKey() });
      const d = await pt.desktops.create(DESKTOP_CREATE_OPTS);
      return {
        sessionId: d.sessionId,
        connect: () => d.connect(),
        health: () => d.health(),
        screenshot: () => d.screenshot({ format: "png" }),
        kill: () => d.kill(),
        click: (x, y) => d.mouse.click(x, y),
        typeText: (text) => d.keyboard.type(text),
        openApp: (name) => d.open(name).then(() => void 0)
      };
    }
  };
}
function newRunDir() {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  return path4.join(packageRoot, ".auspex", "runs", stamp);
}
async function waitReady(desktop, sleepFn) {
  const deadline = Date.now() + DESKTOP_HEALTH_MS;
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
  const sleepFn = deps.sleep ?? sleep;
  const tui = deps.tui ?? createDesktopTui(status);
  const overview = desktopOverviewText();
  const overallMs = deps.overallMs ?? DESKTOP_OVERALL_MS;
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
        if (isCancelled()) {
          await desktop.kill().catch(() => void 0);
          throw new Error(`desktop review timed out after ${overallMs}ms`);
        }
        tui.setPhase("connecting");
        await desktop.connect();
        tui.setPhase("waiting");
        const ready = await waitReady(desktop, sleepFn);
        tui.setPhase("task");
        const task = deps.task ?? {};
        const clickAt = task.click ?? DEFAULT_DESKTOP_CLICK;
        if (task.open && desktop.openApp) await desktop.openApp(task.open);
        if (task.type && desktop.typeText) await desktop.typeText(task.type);
        if (desktop.click) await desktop.click(clickAt.x, clickAt.y);
        tui.setPhase("screenshot");
        const png = await desktop.screenshot();
        const dir = newRunDir();
        mkdirSync(dir, { recursive: true });
        const abs = path4.join(dir, "screenshot.png");
        writeFileSync(abs, png);
        const desktopId = desktop.sessionId;
        tui.setPhase("killing");
        let killErr;
        try {
          await desktop.kill();
        } catch (err) {
          killErr = `desktop kill failed: ${explainSolariError(err)}`;
        }
        desktop = void 0;
        tui.close();
        const errors = killErr ? [killErr] : [];
        const screenshotPath = toReceiptPath(abs);
        const ok = errors.length === 0;
        const summary = desktopSummary({ ok, ready, screenshotPath, errors });
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

// src/sandbox.ts
import { SolariClient as SolariClient2 } from "@solarisdk/sdk";

// src/receipt.ts
import { readdir, readFile as readFile2, stat } from "node:fs/promises";
import path5 from "node:path";
var RUNS_DIR = path5.join(packageRoot, ".auspex", "runs");
var RECEIPT_ASSERT_PY = `import json, struct, sys, zlib
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
`;
function assertRunDirUnderRuns(runDir2, runsDir = RUNS_DIR) {
  const dir = path5.resolve(runDir2);
  const root = path5.resolve(runsDir);
  if (dir !== root && !dir.startsWith(root + path5.sep)) {
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
    const dir = path5.join(runsDir, name);
    const st = await stat(dir).catch(() => void 0);
    if (!st?.isDirectory()) continue;
    dirs.push(dir);
  }
  for (const dir of dirs) {
    try {
      await stat(path5.join(dir, "manifest.json"));
      await stat(path5.join(dir, "screenshot.png"));
      return dir;
    } catch {
      continue;
    }
  }
  throw new Error(`no complete run (manifest.json + screenshot.png) in ${runsDir}`);
}
async function loadRunFiles(runDir2) {
  const manifest = await readFile2(path5.join(runDir2, "manifest.json"), "utf8");
  const png = await readFile2(path5.join(runDir2, "screenshot.png"));
  return { manifest, png };
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
      const pt = new SolariClient2({ apiKey: requireApiKey(), fetch: fetchWithIdempotencyKey() });
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
          await sandbox.kill();
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
        await sandbox.kill();
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
  const overlap = !deps?.verify;
  const createFn = overlap ? deps?.create ?? defaultVerifyDeps().create : void 0;
  let created;
  const pending = createFn ? createFn().then((s) => {
    created = s;
    return s;
  }) : void 0;
  try {
    onProgress("check");
    const check = deps?.check ? await deps.check({ ...opts, onProgress }) : await runCheck({ ...opts, onProgress });
    const dir = runDirFromResult(check);
    try {
      const verify = deps?.verify ? await deps.verify(dir) : await verifyReceipt(dir, {
        create: async () => {
          if (pending) return pending;
          return (deps?.create ?? defaultVerifyDeps().create)();
        },
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
  } catch (err) {
    if (pending) {
      try {
        const s = created ?? await pending.catch(() => void 0);
        if (s) await s.kill();
      } catch {
      }
    }
    throw err;
  }
}

// src/mcp-tools.ts
var CHECK_DESCRIPTION = "Open a live URL in a Solari cloud browser (fast pool by default), snapshot the page, and check that expected text is present. Always closes/releases the session. Returns JSON plus a downscaled JPEG attach; the on-disk shot stays full-page PNG. Set verify=true for one-shot check-then-sandbox (do not also call auspex_verify). Integrity ok vs claim claimOk are separate: a missed expect can still be a valid receipt. stealth is Starter+ (402 FeatureRequiresPlan, not retryable). record+profile is forbidden unless allowRecordProfile. 429 ConcurrencyLimitExceeded is not retryable \u2014 solari_browser_close / solari_kill leftover sessions, then retry.";
var VERIFY_DESCRIPTION = "After auspex_check without verify=true, upload the on-disk receipt (PNG + JSON) into a headless Solari sandbox, assert integrity (ok) vs claim (claimOk), and kill the VM. Do not call this if you already passed verify=true on auspex_check. 429 is not retryable: solari_kill leftover VMs first.";
var LOGIN_DESCRIPTION = "Create or reuse a named Solari browser profile and return a single-use login-handoff URL for the human (agent never handles the password). Show the url, wait for them to Save, then pass this profile to auspex_check.";
var DESKTOP_DESCRIPTION = "Solari GUI desktop: boot, one computer-use action (default click center; optional open/type), screenshot, kill. Returns ASCII log plus structured JSON and optional PNG. Desktops may 402 FeatureRequiresPlan on Free (not retryable). 429: solari_kill leftovers, do not retry create.";
var PROFILES_DESCRIPTION = "List Solari browser profile names and ids on this account.";
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
    async ({ url, expect, selector, profile, stealth, record, sso, verify, allowRecordProfile }, extra) => {
      try {
        const onProgress = progressFromExtra(extra);
        onProgress("auspex_check");
        const opts = { url, expect, selector, profile, stealth, record, sso, allowRecordProfile, onProgress };
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
    async ({ profile, url }) => {
      try {
        const result = await loginProfile(profile, url);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
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
        return { content: [{ type: "text", text: JSON.stringify(profiles, null, 2) }] };
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
    async ({ open, type, clickX, clickY }, extra) => {
      try {
        const onProgress = progressFromExtra(extra);
        onProgress("auspex_desktop");
        const result = await runDesktopReview({
          ...defaultDesktopDeps(),
          task: {
            open,
            type,
            click: clickX !== void 0 && clickY !== void 0 ? { x: clickX, y: clickY } : void 0
          },
          status: process.stderr
        });
        const packed = await buildReceiptToolContent(
          {
            ok: result.ok,
            ready: result.ready,
            screenshotPath: result.screenshotPath,
            errors: result.errors,
            desktopId: result.desktopId,
            overview: result.overview
          },
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
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
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
