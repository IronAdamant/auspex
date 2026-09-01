// src/mcp.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// src/check.ts
import { mkdir, writeFile } from "node:fs/promises";
import path2 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/solari.ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Solari, SolariError } from "@solarisdk/browser";
var GOTO_TIMEOUT_MS = 45e3;
var NETWORKIDLE_TIMEOUT_MS = 15e3;
var OVERALL_TIMEOUT_MS = 12e4;
var REPLAY_ATTEMPTS = 10;
var REPLAY_DELAY_MS = 3e3;
var DOTENV_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
function loadDotEnv(file = DOTENV_PATH) {
  if (process.env.SOLARI_API_KEY) return;
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
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
  const existing = (await solari.profiles.list()).find((p) => p.name === name);
  const profile = existing ?? await solari.profiles.create({ name });
  return profile.id;
}
async function pageForSession(browser) {
  const state = browser.session.storageState;
  const hasState = Boolean(state?.cookies?.length || state?.origins?.length);
  const ctx = hasState && state ? await browser.newContext({ storageState: state }) : browser.contexts()[0] ?? await browser.newContext();
  return ctx.pages()[0] ?? ctx.newPage();
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function waitForReplayUrl(solari, sessionId) {
  for (let attempt = 1; attempt <= REPLAY_ATTEMPTS; attempt++) {
    await sleep(REPLAY_DELAY_MS);
    try {
      const replay = await solari.sessions.getReplayUrl(sessionId);
      return replay.url;
    } catch (err) {
      const status = err instanceof SolariError ? err.status : void 0;
      if (status === 404) continue;
      throw err;
    }
  }
  return void 0;
}

// src/sso.ts
function stillOnAuth(url) {
  const host = url.hostname;
  if (host.includes("login.microsoftonline.com") || host.includes("login.live.com")) return true;
  if (url.pathname === "/login" || url.pathname.startsWith("/auth/")) return true;
  return false;
}
async function completeMicrosoftSso(page) {
  const msBtn = page.getByRole("button", { name: /sign in with microsoft/i });
  if (await msBtn.count() === 0) return;
  await msBtn.first().click({ timeout: 1e4 });
  await page.waitForURL(/login\.microsoftonline\.com|login\.live\.com/, { timeout: 3e4 }).catch(() => void 0);
  await page.waitForLoadState("domcontentloaded", { timeout: 45e3 }).catch(() => void 0);
  const picker = page.getByText(/pick an account/i);
  await picker.waitFor({ timeout: 2e4 }).catch(() => void 0);
  if (await picker.count() === 0) {
    await page.waitForTimeout(3e3);
  }
  const signedIn = page.getByText(/^Signed in$/i);
  if (await signedIn.count() > 0) {
    await signedIn.first().click({ timeout: 1e4 });
  } else {
    const tile = page.locator("[data-test-id='native-tile'], .tile, [role='button']").filter({
      hasText: /signed in/i
    });
    if (await tile.count() > 0) await tile.first().click({ timeout: 1e4 });
  }
  const yes = page.getByRole("button", { name: /^yes$/i });
  if (await yes.count() > 0) {
    await yes.first().click({ timeout: 8e3 }).catch(() => void 0);
  }
  await page.waitForURL((url) => !stillOnAuth(url), { timeout: 45e3 }).catch(() => void 0);
  await page.waitForLoadState("networkidle", { timeout: 15e3 }).catch(() => void 0);
}

// src/check.ts
var rootDir = path2.resolve(path2.dirname(fileURLToPath2(import.meta.url)), "..");
function runDir() {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  return path2.join(rootDir, ".auspex", "runs", stamp);
}
function excerptOf(text, max = 500) {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max)}\u2026`;
}
async function extractText(page, selector) {
  if (selector) {
    return page.locator(selector).first().innerText({ timeout: 1e4 });
  }
  return page.locator("body").innerText();
}
async function runCheck(opts) {
  const solari = createClient();
  let browser;
  let sessionId = "";
  const outDir = runDir();
  await mkdir(outDir, { recursive: true });
  const screenshotPath = path2.join(outDir, "screenshot.png");
  let title = "";
  let finalUrl = "";
  let excerpt = "";
  let matched = false;
  const work = async () => {
    const profileId = opts.profile ? await resolveProfileId(solari, opts.profile) : void 0;
    browser = await solari.launch({
      stealth: opts.stealth === true,
      recording: opts.record === true,
      profileId
    });
    sessionId = browser.id;
    const page = await pageForSession(browser);
    await page.goto(opts.url, { timeout: GOTO_TIMEOUT_MS, waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: NETWORKIDLE_TIMEOUT_MS }).catch(() => void 0);
    if (opts.sso) {
      await completeMicrosoftSso(page);
    }
    title = await page.title();
    finalUrl = page.url();
    const raw = await extractText(page, opts.selector);
    excerpt = excerptOf(raw);
    matched = raw.includes(opts.expect);
    await page.screenshot({ path: screenshotPath, type: "png" });
  };
  try {
    try {
      await Promise.race([
        work(),
        new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error(`auspex check timed out after ${OVERALL_TIMEOUT_MS}ms`)),
            OVERALL_TIMEOUT_MS
          );
        })
      ]);
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
        }
      }
    }
    let replayUrl;
    if (opts.record && sessionId) {
      replayUrl = await waitForReplayUrl(solari, sessionId);
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
      replayUrl
    };
    await writeFile(path2.join(outDir, "manifest.json"), `${JSON.stringify(result, null, 2)}
`);
    return result;
  } finally {
    await solari.close();
  }
}

// src/content.ts
import { readFile } from "node:fs/promises";
async function buildCheckToolContent(result) {
  const content = [{ type: "text", text: JSON.stringify(result, null, 2) }];
  if (!result.screenshotPath) return { content };
  try {
    const buf = await readFile(result.screenshotPath);
    if (buf.length === 0) return { content };
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
var DualStdioServerTransport = class {
  constructor(stdin = process2.stdin, stdout = process2.stdout) {
    this.stdin = stdin;
    this.stdout = stdout;
  }
  onclose;
  onerror;
  onmessage;
  started = false;
  buffer = Buffer.alloc(0);
  replyContentLength = false;
  ondata = (chunk) => {
    try {
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
    const cl = asText.match(/^Content-Length:\s*(\d+)/i);
    if (cl || asText.toLowerCase().startsWith("content-length:")) {
      this.replyContentLength = true;
      let sep = this.buffer.indexOf("\r\n\r\n");
      let sepLen = 4;
      if (sep === -1) {
        sep = this.buffer.indexOf("\n\n");
        sepLen = 2;
      }
      if (sep === -1) return null;
      const header = this.buffer.subarray(0, sep).toString("utf8");
      const lenMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lenMatch) {
        throw new Error(`stdio header missing Content-Length: ${header.slice(0, 80)}`);
      }
      const n = Number(lenMatch[1]);
      const start = sep + sepLen;
      if (this.buffer.length < start + n) return null;
      const json = this.buffer.subarray(start, start + n).toString("utf8");
      this.buffer = this.buffer.subarray(start + n);
      return JSON.parse(json);
    }
    const nl = this.buffer.indexOf("\n");
    if (nl === -1) return null;
    const line = this.buffer.subarray(0, nl).toString("utf8").replace(/\r$/, "");
    this.buffer = this.buffer.subarray(nl + 1);
    if (!line.trim()) return this.readOne();
    return JSON.parse(line);
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
    return new Promise((resolve) => {
      if (this.stdout.write(payload)) resolve();
      else this.stdout.once("drain", resolve);
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
    description: "Open a live URL in a Solari cloud browser, snapshot the page, and check that expected text is present. Returns JSON plus a PNG. Always closes the session. Use for post-deploy verification, not raw CDP.",
    inputSchema: {
      url: z.string().describe("https URL to open"),
      expect: z.string().describe("Substring that must appear in the page text"),
      selector: z.string().optional().describe("Optional CSS selector to extract instead of body"),
      profile: z.string().optional().describe("Solari profile name to reuse cookies/storage"),
      stealth: z.boolean().optional().describe("Launch with Solari stealth (Starter plan)"),
      record: z.boolean().optional().describe("Record the session and return a replay URL"),
      sso: z.boolean().optional().describe("Click Sign in with Microsoft and the signed-in account picker if they appear")
    }
  },
  async ({ url, expect, selector, profile, stealth, record, sso }) => {
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
  }
);
server.registerTool(
  "auspex_login",
  {
    description: "Create or reuse a named Solari browser profile, then tell the human to log in via Console \u2192 Profiles \u2192 Open editor \u2192 Save. Does not keep a check session open. After Save, pass this profile to auspex_check.",
    inputSchema: {
      profile: z.string().describe("Profile name to create or reuse"),
      url: z.string().optional().describe("Optional login URL hint to show the human")
    }
  },
  async ({ profile, url }) => {
    const result = await loginProfile(profile, url);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);
server.registerTool(
  "auspex_profiles",
  {
    description: "List Solari browser profile names and ids on this account.",
    inputSchema: {}
  },
  async () => {
    const profiles = await listProfiles();
    return { content: [{ type: "text", text: JSON.stringify(profiles, null, 2) }] };
  }
);
var transport = new DualStdioServerTransport();
await server.connect(transport);
