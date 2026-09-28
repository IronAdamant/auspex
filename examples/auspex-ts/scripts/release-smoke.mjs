#!/usr/bin/env node
// Release smoke: run the MCP server exactly as a stranger installs it (npx, empty folder),
// then drive it over stdio. Catches what repo tests cannot see: a tarball without dist/,
// a bundle that cannot find its files, a receipt path that sandbox verify rejects.
//
//   node scripts/release-smoke.mjs                          # auspex-solari@latest, no key needed
//   node scripts/release-smoke.mjs --spec ./auspex-solari-0.1.9.tgz
//   SOLARI_API_KEY=… node scripts/release-smoke.mjs --live  # also health + a verified public check
//
// Prints one JSON summary. Exit 0 only when every step passed. Never prints the key.

import { spawn } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const option = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

const spec = path.isAbsolute(option("--spec", "")) || option("--spec", "").startsWith(".")
  ? path.resolve(option("--spec", ""))
  : option("--spec", "auspex-solari@latest")
const live = flag("--live")
const timeoutMs = Number(option("--timeout-ms", "480000"))
// Core tools every release since 0.1.5 exposes. Newer releases add more (auspex_sweep).
const requiredTools = ["auspex_check", "auspex_login", "auspex_profile_status", "auspex_solari_health", "auspex_trace", "auspex_job"]
// Same rule as assert_receipt.py: receipts must never carry a home directory.
const HOME_PATH = /^(\/Users\/|\/home\/|\/root(\/|$)|[A-Za-z]:[\\/]Users[\\/])/

const steps = []
const record = (name, ok, detail = {}) => steps.push({ name, ok, ...detail })

const cwd = mkdtempSync(path.join(tmpdir(), "auspex-smoke-"))
const child = spawn("npx", ["-y", "-p", spec, "auspex-mcp"], {
  cwd,
  env: process.env,
  stdio: ["pipe", "pipe", "pipe"],
  shell: process.platform === "win32",
})

let buffer = ""
let stderr = ""
const waiters = new Map()
child.stdout.on("data", (chunk) => {
  buffer += chunk
  let nl
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl)
    buffer = buffer.slice(nl + 1)
    try {
      const msg = JSON.parse(line)
      waiters.get(msg.id)?.(msg)
    } catch {
      /* non-JSON line (e.g. a DistMissing banner); the failed request reports it */
    }
  }
})
child.stderr.on("data", (chunk) => {
  stderr = (stderr + chunk).slice(-4000)
})

let nextId = 0
function request(method, params, ms = 120_000) {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => {
      waiters.delete(id)
      reject(new Error(`${method} timed out after ${ms}ms`))
    }, ms)
    waiters.set(id, (msg) => {
      clearTimeout(timer)
      waiters.delete(id)
      resolve(msg)
    })
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`)
  })
}

async function callTool(name, args, ms) {
  const msg = await request("tools/call", { name, arguments: args }, ms)
  const content = msg.result?.content ?? []
  const text = content.find((c) => c.type === "text")?.text
  let json
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = undefined
  }
  return { isError: msg.result?.isError === true, kinds: content.map((c) => c.type), json, error: msg.error }
}

const overall = setTimeout(() => finish(new Error(`smoke timed out after ${timeoutMs}ms`)), timeoutMs)

async function run() {
  const init = await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "auspex-release-smoke", version: "1" },
  }, 240_000)
  const server = init.result?.serverInfo
  record("initialize", Boolean(server), { server })
  if (!server) return
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`)

  const tools = (await request("tools/list", {})).result?.tools?.map((t) => t.name) ?? []
  const missing = requiredTools.filter((t) => !tools.includes(t))
  record("tools/list", missing.length === 0, { count: tools.length, ...(missing.length ? { missing } : {}) })

  // Loads the runner chain (receipt.ts reads assert_receipt.py at import). No key needed.
  const trace = await callTool("auspex_trace", {})
  record("auspex_trace", trace.json?.ok === true, trace.json?.ok === true ? {} : { error: trace.json?.error ?? trace.error })

  if (!live) return
  if (!process.env.SOLARI_API_KEY) {
    record("live", false, { error: "--live needs SOLARI_API_KEY in the environment" })
    return
  }
  const health = await callTool("auspex_solari_health", {})
  record("auspex_solari_health", health.json?.ok === true, { reason: health.json?.reason })
  if (health.json?.ok !== true) return

  const check = await callTool("auspex_check", { name: "ironadamant" }, 360_000)
  const r = check.json ?? {}
  const shot = String(r.screenshotPath ?? "")
  record("auspex_check", r.ok === true && r.reason === "matched" && r.verify?.claimOk === true, {
    reason: r.reason,
    claimOk: r.verify?.claimOk,
    verifyErrors: r.verify?.errors,
  })
  record("receipt screenshotPath has no home dir", Boolean(shot) && !HOME_PATH.test(shot), { screenshotPath: shot })
  record("check returns an image", check.kinds.includes("image"))
}

let done = false
function finish(err) {
  if (done) return
  done = true
  clearTimeout(overall)
  if (err) record("error", false, { error: err.message })
  const ok = steps.length > 0 && steps.every((s) => s.ok)
  const summary = { ok, spec, live, steps }
  if (!ok && stderr.trim()) summary.serverStderrTail = stderr.trim().split("\n").slice(-8)
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  child.kill()
  process.exit(ok ? 0 : 1)
}

child.on("exit", (code) => {
  if (!done) finish(new Error(`server exited early (code ${code})`))
})
run().then(() => finish(), finish)
