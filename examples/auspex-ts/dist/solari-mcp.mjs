// src/solari-mcp-entry.ts
import { spawn } from "node:child_process";
import { existsSync as existsSync3 } from "node:fs";
import path2 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/solari.ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserSession, Solari, SolariError } from "@solarisdk/browser";
import { chromium } from "patchright-core";
var DOTENV_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
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

// src/solari-mcp-gate.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
function solariKeyReady(env = process.env, dotenvFile = env.AUSPEX_DOTENV_PATH || DOTENV_PATH) {
  if (env.SOLARI_API_KEY?.trim()) return true;
  if (!dotenvFile || !existsSync2(dotenvFile)) return false;
  for (const raw of readFileSync2(dotenvFile, "utf8").split("\n")) {
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
var root = path2.resolve(path2.dirname(fileURLToPath2(import.meta.url)), "..");
loadDotEnv(process.env.AUSPEX_DOTENV_PATH);
if (!solariKeyReady()) {
  console.error(
    "solari MCP not started: no SOLARI_API_KEY (export it or put it in examples/auspex-ts/.env)"
  );
  process.exit(1);
}
var cli = path2.join(root, "node_modules", "@solarisdk", "mcp", "dist", "cli.js");
if (!existsSync3(cli)) {
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
