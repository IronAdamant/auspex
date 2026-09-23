var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// src/paths.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
var packageRoot;
var init_paths = __esm({
  "src/paths.ts"() {
    "use strict";
    packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  }
});

// src/sso.ts
var init_sso = __esm({
  "src/sso.ts"() {
    "use strict";
  }
});

// src/profile-storage.ts
var FOLDED_EXPIRES_ON_SKEW_MS;
var init_profile_storage = __esm({
  "src/profile-storage.ts"() {
    "use strict";
    init_sso();
    FOLDED_EXPIRES_ON_SKEW_MS = 5 * 60 * 1e3;
  }
});

// src/login-trace.ts
import path2 from "node:path";
var LOGIN_TRACE_PATH, LOGIN_TRACE_ACTIVE_PATH;
var init_login_trace = __esm({
  "src/login-trace.ts"() {
    "use strict";
    init_profile_storage();
    init_paths();
    init_sso();
    LOGIN_TRACE_PATH = path2.join(packageRoot, ".auspex", "trace", "login.jsonl");
    LOGIN_TRACE_ACTIVE_PATH = path2.join(packageRoot, ".auspex", "trace", "active.json");
  }
});

// src/editor-fold.ts
var init_editor_fold = __esm({
  "src/editor-fold.ts"() {
    "use strict";
    init_profile_storage();
  }
});

// src/http-url.ts
import { isIP } from "node:net";
import { z } from "zod";
function stripBrackets(hostname) {
  return hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}
function parseIPv4Loose(host) {
  if (!/^[0-9.]+$/.test(host)) return void 0;
  const parts = host.split(".");
  if (parts.length < 1 || parts.length > 4) return void 0;
  const nums = [];
  for (const p of parts) {
    if (p === "" || !/^\d+$/.test(p)) return void 0;
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return void 0;
    nums.push(n);
  }
  if (parts.length === 1) return [0, 0, 0, nums[0]];
  if (parts.length === 2) return [nums[0], 0, 0, nums[1]];
  if (parts.length === 3) return [nums[0], nums[1], 0, nums[2]];
  return [nums[0], nums[1], nums[2], nums[3]];
}
function ipv4Blocked(octets) {
  const [a, b] = octets;
  if (a === 0) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  return false;
}
function ipv4FromMappedIPv6(host) {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){0,3})$/i.exec(host);
  if (dotted) return parseIPv4Loose(dotted[1]);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host);
  if (!hex) return void 0;
  const hi = Number.parseInt(hex[1], 16);
  const lo = Number.parseInt(hex[2], 16);
  return [hi >> 8 & 255, hi & 255, lo >> 8 & 255, lo & 255];
}
function ipv6LinkLocalOrUnspecified(host) {
  if (host === "::" || host === "0:0:0:0:0:0:0:0") return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  const head = host.split(":")[0] ?? "";
  if (/^fe[89ab]/i.test(head)) return true;
  return false;
}
function isForbiddenCheckHost(hostname) {
  const h = stripBrackets(hostname);
  if (h === "localhost" || h.endsWith(".localhost") || h === "localhost.localdomain") return true;
  const mapped = ipv4FromMappedIPv6(h);
  if (mapped && ipv4Blocked(mapped)) return true;
  const v4 = parseIPv4Loose(h);
  if (v4 && ipv4Blocked(v4)) return true;
  const ip = isIP(h);
  if (ip === 4) {
    const parsed = parseIPv4Loose(h);
    return Boolean(parsed && ipv4Blocked(parsed));
  }
  if (ip === 6) return ipv6LinkLocalOrUnspecified(h);
  return false;
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
var LOOPBACK_URL_ERROR, httpUrlSchema, checkUrlSchema;
var init_http_url = __esm({
  "src/http-url.ts"() {
    "use strict";
    LOOPBACK_URL_ERROR = "url is a loopback address, link-local, or cloud-metadata address; Solari cloud Chrome cannot see the agent machine";
    httpUrlSchema = z.string().refine(isHttpOrHttpsUrl, { message: "url must be an http or https URL" });
    checkUrlSchema = z.string().superRefine((value, ctx) => {
      if (!isHttpOrHttpsUrl(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "url must be an http or https URL" });
        return;
      }
      if (isForbiddenCheckHost(new URL(value).hostname)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: LOOPBACK_URL_ERROR });
      }
    });
  }
});

// src/text.ts
import { z as z2 } from "zod";
function isNonEmptyExpect(value) {
  return value.trim().length > 0;
}
var expectSchema;
var init_text = __esm({
  "src/text.ts"() {
    "use strict";
    expectSchema = z2.string().refine(isNonEmptyExpect, { message: "check requires a non-empty --expect" });
  }
});

// src/saved-checks.ts
import path3 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var packageRoot2;
var init_saved_checks = __esm({
  "src/saved-checks.ts"() {
    "use strict";
    init_http_url();
    init_profiles();
    init_sso();
    init_text();
    packageRoot2 = path3.resolve(path3.dirname(fileURLToPath2(import.meta.url)), "..");
  }
});

// src/profile-persist.ts
var DEAD_FOLD_VWP_BAN, SAVE_NOT_FOLD_NOW;
var init_profile_persist = __esm({
  "src/profile-persist.ts"() {
    "use strict";
    init_editor_fold();
    init_profile_lock();
    init_solari();
    init_login_trace();
    init_profile_storage();
    init_saved_checks();
    init_sso();
    DEAD_FOLD_VWP_BAN = "Do not run check --verify-with-profile on this seed \u2014 claimOkProfile will not pass on a dead fold.";
    SAVE_NOT_FOLD_NOW = "Save is not fold: --save-editor did not refresh folded sessionStorage. Finalize-login NOW while the token is live. " + DEAD_FOLD_VWP_BAN + " Remint auspex_login if finalize-login returns needsHuman.";
  }
});

// src/profile-slug.ts
var init_profile_slug = __esm({
  "src/profile-slug.ts"() {
    "use strict";
  }
});

// src/operator-session.ts
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
function readOperatorKey(file) {
  if (!existsSync(file)) return void 0;
  const lines = readFileSync(file, "utf8").split("\n").map((line2) => line2.trim()).filter((line2) => line2 && !line2.startsWith("#"));
  const line = lines[0];
  if (!line) return void 0;
  if (line.startsWith("SOLARI_API_KEY=")) {
    let value = line.slice("SOLARI_API_KEY=".length).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    return value || void 0;
  }
  if (line.includes("=")) return void 0;
  return line;
}
var OPERATOR_IDLE_MS, PHONE_LIST_MS, SIGNUP_BUSY_MS, OPERATOR_PURGE_QUESTION, OPERATOR_HELP;
var init_operator_session = __esm({
  "src/operator-session.ts"() {
    "use strict";
    OPERATOR_IDLE_MS = 30 * 60 * 1e3;
    PHONE_LIST_MS = 10 * 60 * 1e3;
    SIGNUP_BUSY_MS = 30 * 60 * 1e3;
    OPERATOR_PURGE_QUESTION = "After a saved login has been used and tested, ask the human whether testing is done and the login may be purged. Purge only after the human agrees. An idle saved profile is deleted on the next Auspex command after 30 minutes without use. A use resets that profile's 30-minute clock. There is no live 30-minute timer on the typing field. Other profiles stay. One site at a time. Keys typed on the door pages go into Solari remote Chrome (and the site). They stay off agent chat, MCP, and receipts. The local field clears on paste, Save, or lock. They are not included in the agent message. The Solari key in the browser or .auspex/operator-key is not that wipe.";
    OPERATOR_HELP = OPERATOR_PURGE_QUESTION + " auspex profiles lists those saved logins (site and profile name only). npx auspex profiles --purge <name> --yes wipes one saved login only after the human agrees. humanAgree is that same yes on MCP. No agent tool accepts a username, a password, or the Solari key. One mint opens docs/door.html (chooser). Phone is docs/phone.html; desktop is docs/desktop.html. Same hash. One typing field: click the remote login field, then paste. Keys go into remote Chrome and the site; they stay off agent chat, MCP, and receipts. The desktop Solari key stays in that browser, or in gitignored .auspex/operator-key. It is not echoed to the agent and is not the 30-minute profile wipe.";
  }
});

// src/phone-expiry.ts
var init_phone_expiry = __esm({
  "src/phone-expiry.ts"() {
    "use strict";
  }
});

// src/handoff-doors.ts
var init_handoff_doors = __esm({
  "src/handoff-doors.ts"() {
    "use strict";
    init_phone_expiry();
  }
});

// src/profiles.ts
import { z as z3 } from "zod";
var PROFILE_NAME_ERROR, profileNameSchema, PHONE_HANDOFF_NOT_TAKEOVER, HANDOFF_PHONE_DOOR_BAN, HANDOFF_OPEN_ON_PHONE, HANDOFF_OPEN_ON_PHONE_NOVNC_FALLBACK;
var init_profiles = __esm({
  "src/profiles.ts"() {
    "use strict";
    init_login_trace();
    init_errors();
    init_profile_persist();
    init_profile_slug();
    init_operator_session();
    init_handoff_doors();
    init_paths();
    init_solari();
    init_handoff_doors();
    PROFILE_NAME_ERROR = "profile name must be non-empty";
    profileNameSchema = z3.string().trim().min(1, { message: PROFILE_NAME_ERROR });
    PHONE_HANDOFF_NOT_TAKEOVER = "Auspex phone.html is a seed/handoff door for off-site typing (IME + Save paste), not a same-session VNC takeover of the agent's live check.";
    HANDOFF_PHONE_DOOR_BAN = "Never type in Solari's remote Chromium / noVNC card on a phone: that stream is a picture of Chrome, so the phone software keyboard will not open. Never open handoff.desktopUrl on a phone. " + PHONE_HANDOFF_NOT_TAKEOVER;
    HANDOFF_OPEN_ON_PHONE = "Phone: open handoff.url (chooser) or handoff.mobileUrl in the phone's own Safari or Chrome. That page has a real text field so the phone keyboard can open. Tap the remote Chrome to click, type or paste in the one field at the bottom (keys go into remote Chrome and the site; they stay off agent chat / MCP / receipts), then tap Save on the phone page (stay there). Save copies a line to the clipboard; paste it in the AI chat. Do not open Solari's handoff page on a phone: GET editor HTTP 401. Then auspex_await_login with saveEditor true. " + HANDOFF_PHONE_DOOR_BAN + " Never paste the password into chat.";
    HANDOFF_OPEN_ON_PHONE_NOVNC_FALLBACK = "Phone: Solari handoff is noVNC (a picture of Chrome). The phone software keyboard will not open there. Use a computer (handoff.desktopUrl, hardware keyboard) or remint auspex_login for the Auspex phone page. " + HANDOFF_PHONE_DOOR_BAN + " Never paste the password into chat.";
  }
});

// src/profile-lock.ts
var init_profile_lock = __esm({
  "src/profile-lock.ts"() {
    "use strict";
    init_paths();
    init_profiles();
  }
});

// src/errors.ts
import { SolariError } from "@solarisdk/browser";
var init_errors = __esm({
  "src/errors.ts"() {
    "use strict";
    init_profile_lock();
  }
});

// src/timeout.ts
var init_timeout = __esm({
  "src/timeout.ts"() {
    "use strict";
  }
});

// src/solari.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import path4 from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
import {
  BrowserSession,
  Solari,
  SolariError as SolariError2
} from "@solarisdk/browser";
import { chromium } from "patchright-core";
function applyOperatorKeyFile(file) {
  if (process.env.SOLARI_API_KEY) return;
  const key = readOperatorKey(file);
  if (key) process.env.SOLARI_API_KEY = key;
}
function readSolariKeyFromFile(file) {
  if (!existsSync2(file)) return void 0;
  for (const raw of readFileSync2(file, "utf8").split("\n")) {
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
  if (file !== DOTENV_PATH) return;
  applyOperatorKeyFile(path4.join(path4.dirname(DOTENV_PATH), ".auspex", "operator-key"));
}
var DOTENV_PATH, REPO_DOTENV_PATH;
var init_solari = __esm({
  "src/solari.ts"() {
    "use strict";
    init_errors();
    init_operator_session();
    init_timeout();
    init_profile_storage();
    DOTENV_PATH = path4.resolve(path4.dirname(fileURLToPath3(import.meta.url)), "..", ".env");
    REPO_DOTENV_PATH = path4.resolve(path4.dirname(fileURLToPath3(import.meta.url)), "../../..", ".env");
  }
});

// src/solari-mcp-entry.ts
init_solari();
import { spawn } from "node:child_process";
import { existsSync as existsSync4 } from "node:fs";
import path5 from "node:path";
import { fileURLToPath as fileURLToPath4 } from "node:url";

// src/solari-mcp-gate.ts
init_solari();
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "node:fs";
function solariKeyReady(env = process.env, dotenvFile = env.AUSPEX_DOTENV_PATH || DOTENV_PATH) {
  if (env.SOLARI_API_KEY?.trim()) return true;
  if (!dotenvFile || !existsSync3(dotenvFile)) return false;
  for (const raw of readFileSync3(dotenvFile, "utf8").split("\n")) {
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
    if (name === "SOLARI_API_KEY" && value) return true;
  }
  return false;
}

// src/solari-mcp-entry.ts
var root = path5.resolve(path5.dirname(fileURLToPath4(import.meta.url)), "..");
loadDotEnv(process.env.AUSPEX_DOTENV_PATH);
if (!solariKeyReady()) {
  console.error(
    "solari MCP not started: no SOLARI_API_KEY (export it or put it in examples/auspex-ts/.env)"
  );
  process.exit(1);
}
var cli = path5.join(root, "node_modules", "@solarisdk", "mcp", "dist", "cli.js");
if (!existsSync4(cli)) {
  console.error("solari MCP not started: @solarisdk/mcp is not installed");
  process.exit(1);
}
var child = spawn(process.execPath, [cli], {
  stdio: "inherit",
  env: process.env,
  cwd: root
});
child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
