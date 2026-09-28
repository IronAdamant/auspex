import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { type CheckOptions } from "./check.ts"
import { shouldVerifyCheck } from "./fail-closed.ts"
import { explainSolariError } from "./errors.ts"
import { isCheckUrl, isHttpOrHttpsUrl, LOOPBACK_URL_ERROR } from "./http-url.ts"
import { parseProxyFlag } from "./launch-options.ts"
import { assertPageActionsAllowed } from "./page-actions.ts"
import { requireProfileName, resolveLoginProfile } from "./profile-slug.ts"
import { applySavedCheckName } from "./saved-checks.ts"
import { type SsoProvider } from "./sso.ts"
import { isNonEmptyExpect } from "./text.ts"
import { isDashboardLandingUrl, RECORD_LOGGED_IN_ERROR, assertRecordProfileAllowed } from "./tool-schema.ts"
import {
  exitFromOk,
  failureReceipt,
  usageErrorReceipt,
  writeStdoutJson,
} from "./cli-json.ts"
import { parseJobFlags, parseJobStatusFlags, type JobRunOptions } from "./job-cli.ts"
import { CONNECT_NEEDS_TTY, parseConnectFlags, type ConnectOptions } from "./connect.ts"
import { parseAuthKeyNames } from "./cookie-save.ts"
import { ONE_CHECK_PAGE_ACTIONS } from "./contract.ts"
import { KEY_ENV_REFUSE, LONG_RUN_CLI_LINE, PROFILES_MAP_LINE } from "./door-await-contract.ts"
import { createProgress } from "./progress.ts"

export const USAGE = `Usage:
  npx auspex login --url <https> [--profile <name>] [--wait]
  npx auspex check <url> --expect <string> [--selector <css>] [--profile <name>] [--sso] [--sso-provider microsoft|google|auto] [--wait-for <css>] [--save-profile] [--verify|--no-verify] [--verify-with-profile] [--auth-keys <names>] [--mobile] [--device <name>]
  npx auspex await-login --profile <name> [--since-version <n>] [--timeout-ms <n>] [--save-editor] [--url <https>] [--expect <string>] [--no-chain-finalize] [--auth-keys <names>]
  npx auspex finalize-login --profile <name> [--url <url>] [--expect <string>]
  npx auspex profiles [--purge <name>] [--yes] [--keep <name>] [--unkeep <name>]
  npx auspex profile-status [--profile <name>] [--name <saved>] [--url <hint>] [--expect <string>] [--auth-keys <names>]
  npx auspex solari-health
  npx auspex job [--job-id <id>] [--name <saved>] [--profile <name>] [--url <https>] [--expect <string>] [--skip-finalize] [--verify-with-profile] [--wait] [--wake-webhook <url>] [--timeout-ms <n>]
  npx auspex job-status --job-id <id> [--wait-ms <n>]
  npx auspex connect <https> [--expect <words>] [--profile <name>] [--verbose]
  npx auspex sweep --plan <plan.json> [--notify <url>]
  npx auspex reap [--dry-run] [--session <id>] [--vm <id>] [--pack-receipts] [--account-wide]
  npx auspex trace [--profile <name>] [--limit <n>] [--all]
  npx auspex verify [runDir]
  npx auspex desktop [--open <app>] [--type <text>] [--click <x,y>] [--expect <string>]
  npx auspex mcp
  npx tsx src/cli.ts <command>   # same CLI, from examples/auspex-ts

Optional dogfood saved checks (not the stranger path):
  npx auspex check --name <ironadamant|checkpoint|consistencyhub>

Leave alone (not first-line tools):
  --stealth --proxy <cc|smart> --proxy-sticky <id> --captcha — 402 FeatureRequiresPlan is not retryable.
  --record --allow-record-profile — never --record a logged-in session.
  --fill <css> --value <text> --click <css> --allow-page-actions — ${ONE_CHECK_PAGE_ACTIONS} Never type a password. filled is set only when visible text contains --value. Prefer #save-document; text=Save can match Unsaved chrome. fill/click with a profile needs --allow-page-actions.

CLI and MCP are the same contract. Stdout is one JSON object (schemaVersion 1 frozen plus ok). Exit 0 only when ok is true. --help is human text.
Fail-closed reasons: matched | loggedOut | needsHuman | mismatch | network | recordedLoggedIn | expectMatchedPublicLanding | hostChanged | stream-expired. Await also: editor-save-hung | profile-busy | save-signaled | sibling-saved.
ok is not claimOk and not claimOkProfile. claimOkProfile only after --verify-with-profile (reuse gate). They are not the same.
${LONG_RUN_CLI_LINE}
429: auspex_reap leftover ledger sessions (not --account-wide by default), then retry. 402 FeatureRequiresPlan is not retryable.
solari-health asks if Solari answers with this key (GET /profiles, one try, 8s). It does not log in, mint a browser, or say the app is logged in. profile-status is the jar check.
Never type passwords. Never --record a logged-in session. FAIL-CLOSED --type refuses password/OTP-like strings.
Profiles: after a saved login has been used and tested, ask whether testing is done and the login may be purged. An idle saved profile is deleted on the next command after 30 minutes without use. Voluntary --purge <name> --yes stops the editor first; if that name is not wiped, ok is false and wipeFailed lists it. Keys are not included in the agent message.
${PROFILES_MAP_LINE}
sweep is read-only check over an operator-written plan (JSON: profile, optional keepProfile, pages of url+expect; no fill, click, or save). Each page is pass, fail, or could-not-tell; could-not-tell is never a pass. A re-gate or 429 stops the sweep. Report: .auspex/sweeps/<stamp>/report.md and report.json. --notify or AUSPEX_WAKE_WEBHOOK posts a scrubbed summary.
connect is one command for a person at a terminal: it shows the phone door link, Enter is Save, then it runs the job chain with --verify-with-profile and prints one plain sentence. It needs a real terminal; agents use job.
job is durable mint→await→finalize→check (not a fourth primitive). Optional --wake-webhook or AUSPEX_WAKE_WEBHOOK. Mint lead-up is traced to .auspex/trace/login.jsonl.
login --wait blocks until Save is signaled, then runs --save-editor. It does not POST editor/save before that signal. handoff.url is the phone door (phone.html).
await-login --save-editor POSTs Solari editor/save when Save is signaled. If one await is already running, this call signals it and does not kill it. If another path already owns that Save, status is sibling-saved (not stream-expired). Clipboard Save is not the jar. Progress is stderr lines that start with :: . Stdout stays one JSON object.
Requires SOLARI_API_KEY. ${KEY_ENV_REFUSE} Detail: AGENTS.md, docs/ops-runbook.md, and docs/door-card-api.md.
`

export type CliCommand =
  | { cmd: "help" }
  | { cmd: "mcp" }
  | { cmd: "check"; opts: CheckOptions; verifyAfter?: boolean; verify?: boolean }
  | { cmd: "finalize-login"; profile: string; url?: string; expect?: string; ssoProvider?: SsoProvider }
  | { cmd: "login"; profile: string; url?: string; wait?: boolean; profileDerived?: boolean }
  | { cmd: "await-login"; profile: string; sinceVersion?: number; timeoutMs?: number; saveEditor?: boolean; url?: string; expect?: string; chainFinalize?: boolean; authKeyNames?: string[] }
  | { cmd: "profiles"; purge?: string; humanAgree?: boolean; keep?: string; unkeep?: string }
  | { cmd: "profile-status"; profile?: string; name?: string; url?: string; expect?: string; authKeyNames?: string[] }
  | { cmd: "solari-health" }
  | { cmd: "verify"; runDir?: string }
  | { cmd: "desktop"; open?: string; type?: string; click?: { x: number; y: number }; expect?: string }
  | { cmd: "reap"; dryRun?: boolean; sessionId?: string; vmId?: string; packReceipts?: boolean; accountWide?: boolean }
  | { cmd: "trace"; profile?: string; limit?: number; all?: boolean }
  | { cmd: "job"; opts: JobRunOptions }
  | { cmd: "connect"; opts: ConnectOptions }
  | { cmd: "job-status"; jobId: string; waitMs?: number }
  | { cmd: "sweep"; planPath: string; notify?: string }

export type ParseResult =
  | { status: "ok"; command: CliCommand }
  | { status: "error"; message: string }

function takeFlag(args: string[], name: string): boolean {
  const i = args.indexOf(name)
  if (i === -1) return false
  args.splice(i, 1)
  return true
}

/** `--flag` or `-x` is the next option, not a value. `-20% off` and `-1` are values. */
function looksLikeFlag(value: string): boolean {
  return /^--/.test(value) || /^-[A-Za-z]/.test(value)
}

function takeOption(
  args: string[],
  name: string,
  opts: { rejectHttp?: boolean } = {},
): string | undefined {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  const value = args[i + 1]
  if (value === undefined || looksLikeFlag(value)) return undefined
  if (opts.rejectHttp && /^https?:\/\//i.test(value)) return undefined
  args.splice(i, 2)
  return value
}

function parseSsoProvider(raw: string | undefined): SsoProvider | undefined {
  if (!raw) return undefined
  const v = raw.trim().toLowerCase()
  if (v === "microsoft" || v === "google" || v === "auto") return v
  return undefined
}

export function parseArgv(argv: string[]): ParseResult {
  const args = [...argv]
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    return { status: "ok", command: { cmd: "help" } }
  }
  const cmd = args.shift()
  if (cmd === "mcp") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    return { status: "ok", command: { cmd: "mcp" } }
  }
  if (cmd === "check") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const expectOpt = takeOption(args, "--expect", { rejectHttp: true })
    const name = takeOption(args, "--name", { rejectHttp: true })
    const selector = takeOption(args, "--selector", { rejectHttp: true })
    const profile = takeOption(args, "--profile", { rejectHttp: true })
    const profileIdx = args.indexOf("--profile")
    const profileTok = profileIdx >= 0 ? args[profileIdx + 1] : undefined
    if (profileTok && /^https?:\/\//i.test(profileTok)) {
      return { status: "error", message: "--profile value must not be a URL" }
    }
    const stealth = takeFlag(args, "--stealth")
    const record = takeFlag(args, "--record")
    const allowRecordProfile = takeFlag(args, "--allow-record-profile")
    const allowPageActions = takeFlag(args, "--allow-page-actions")
    const sso = takeFlag(args, "--sso")
    const ssoProviderRaw = takeOption(args, "--sso-provider")
    const waitFor = takeOption(args, "--wait-for", { rejectHttp: true })
    const fill = takeOption(args, "--fill", { rejectHttp: true })
    const value = takeOption(args, "--value")
    const click = takeOption(args, "--click", { rejectHttp: true })
    const proxy = takeOption(args, "--proxy", { rejectHttp: true })
    const proxySticky = takeOption(args, "--proxy-sticky", { rejectHttp: true })
    const captcha = takeFlag(args, "--captcha")
    const saveProfile = takeFlag(args, "--save-profile")
    const verifyWithProfile = takeFlag(args, "--verify-with-profile")
    const noVerify = takeFlag(args, "--no-verify")
    const verifyFlag = takeFlag(args, "--verify")
    const mobile = takeFlag(args, "--mobile")
    const device = takeOption(args, "--device", { rejectHttp: true })
    const authRaw = takeOption(args, "--auth-keys", { rejectHttp: true })
    let authKeyNames: string[] | undefined
    if (authRaw !== undefined) {
      try {
        authKeyNames = parseAuthKeyNames(authRaw)
      } catch (err) {
        return { status: "error", message: err instanceof Error ? err.message : String(err) }
      }
    }
    if (noVerify && verifyFlag) {
      return { status: "error", message: "pass only one of --verify or --no-verify" }
    }
    let url = args[0] && !args[0].startsWith("-") ? args.shift() : undefined
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    let expect = expectOpt
    let profileName = profile
    if (profileName !== undefined) {
      try {
        profileName = requireProfileName(profileName)
      } catch (err) {
        return { status: "error", message: err instanceof Error ? err.message : String(err) }
      }
    }
    if (name) {
      try {
        const merged = applySavedCheckName({
          name,
          url,
          expect,
          profile: profileName,
        })
        url = merged.url
        expect = merged.expect
        profileName = merged.profile
      } catch (err) {
        return { status: "error", message: err instanceof Error ? err.message : String(err) }
      }
    }
    const verifyAfter = shouldVerifyCheck({
      name,
      profile: profileName,
      url,
      verify: noVerify ? false : verifyFlag ? true : undefined,
      verifyWithProfile,
    })
    if (!url || url.startsWith("-")) return { status: "error", message: "check requires a URL or --name" }
    if (!isHttpOrHttpsUrl(url)) return { status: "error", message: "url must be an http or https URL" }
    if (!isCheckUrl(url)) return { status: "error", message: LOOPBACK_URL_ERROR }
    if (!expect || !isNonEmptyExpect(expect)) {
      return { status: "error", message: "check requires --expect <string> or --name" }
    }
    const ssoProvider = parseSsoProvider(ssoProviderRaw)
    if (ssoProviderRaw && !ssoProvider) {
      return { status: "error", message: "--sso-provider must be microsoft, google, or auto" }
    }
    if (record && (sso || Boolean(ssoProvider) || saveProfile || isDashboardLandingUrl(url))) {
      return { status: "error", message: RECORD_LOGGED_IN_ERROR }
    }
    try {
      parseProxyFlag(proxy, proxySticky)
      assertPageActionsAllowed({
        profile: profileName,
        name,
        fill,
        value,
        click,
        allowPageActions,
      })
      assertRecordProfileAllowed({
        record,
        profile: profileName,
        name,
        url,
        allowRecordProfile,
        fill,
        click,
      })
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) }
    }
    return {
      status: "ok",
      command: {
        cmd: "check",
        opts: {
          url,
          expect,
          selector,
          profile: profileName,
          stealth,
          record,
          sso: sso || Boolean(ssoProvider),
          ssoProvider,
          allowRecordProfile,
          allowPageActions,
          waitFor,
          fill,
          value,
          click,
          proxy,
          proxySticky,
          captcha,
          saveProfile,
          verifyWithProfile,
          mobile,
          device,
          authKeyNames,
        },
        verifyAfter,
        verify: noVerify ? false : verifyFlag ? true : undefined,
      },
    }
  }
  if (cmd === "finalize-login") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const profile = takeOption(args, "--profile")
    const url = takeOption(args, "--url")
    const expect = takeOption(args, "--expect", { rejectHttp: true })
    const ssoProviderRaw = takeOption(args, "--sso-provider")
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    if (!profile) return { status: "error", message: "finalize-login requires --profile <name>" }
    let profileName: string
    try {
      profileName = requireProfileName(profile)
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) }
    }
    if (url !== undefined && !isHttpOrHttpsUrl(url)) {
      return { status: "error", message: "url must be an http or https URL" }
    }
    const ssoProvider = parseSsoProvider(ssoProviderRaw)
    if (ssoProviderRaw && !ssoProvider) {
      return { status: "error", message: "--sso-provider must be microsoft, google, or auto" }
    }
    return { status: "ok", command: { cmd: "finalize-login", profile: profileName, url, expect, ssoProvider } }
  }
  if (cmd === "login") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const profile = takeOption(args, "--profile")
    const url = takeOption(args, "--url")
    const wait = takeFlag(args, "--wait")
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    if (url !== undefined && !isHttpOrHttpsUrl(url)) {
      return { status: "error", message: "url must be an http or https URL" }
    }
    let profileName: string
    let profileDerived = false
    try {
      const resolved = resolveLoginProfile({ profile, url })
      profileName = requireProfileName(resolved.name)
      profileDerived = resolved.derived
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) }
    }
    return { status: "ok", command: { cmd: "login", profile: profileName, url, wait, profileDerived } }
  }
  if (cmd === "await-login") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const profile = takeOption(args, "--profile")
    const sinceRaw = takeOption(args, "--since-version")
    const timeoutRaw = takeOption(args, "--timeout-ms")
    const saveEditor = takeFlag(args, "--save-editor")
    const url = takeOption(args, "--url")
    const expect = takeOption(args, "--expect")
    const chainFinalize = takeFlag(args, "--no-chain-finalize") ? false : undefined
    const authRaw = takeOption(args, "--auth-keys", { rejectHttp: true })
    let authKeyNames: string[] | undefined
    if (authRaw !== undefined) {
      try {
        authKeyNames = parseAuthKeyNames(authRaw)
      } catch (err) {
        return { status: "error", message: err instanceof Error ? err.message : String(err) }
      }
    }
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    if (url !== undefined && !isHttpOrHttpsUrl(url)) {
      return { status: "error", message: "url must be an http or https URL" }
    }
    if (!profile) return { status: "error", message: "await-login requires --profile <name>" }
    let profileName: string
    try {
      profileName = requireProfileName(profile)
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) }
    }
    let sinceVersion: number | undefined
    if (sinceRaw !== undefined) {
      const n = Number(sinceRaw)
      if (!Number.isFinite(n)) return { status: "error", message: "--since-version must be a number" }
      sinceVersion = n
    }
    let timeoutMs: number | undefined
    if (timeoutRaw !== undefined) {
      const n = Number(timeoutRaw)
      if (!Number.isFinite(n)) return { status: "error", message: "--timeout-ms must be a number" }
      timeoutMs = n
    }
    return { status: "ok", command: { cmd: "await-login", profile: profileName, sinceVersion, timeoutMs, saveEditor, url, expect, chainFinalize, authKeyNames } }
  }
  if (cmd === "verify") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const runDir = args.shift()
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    if (runDir?.startsWith("-")) return { status: "error", message: "verify takes an optional run directory" }
    return { status: "ok", command: { cmd: "verify", runDir } }
  }
  if (cmd === "profiles") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const purgeRaw = takeOption(args, "--purge")
    const humanAgree = takeFlag(args, "--yes")
    const keepRaw = takeOption(args, "--keep")
    const unkeepRaw = takeOption(args, "--unkeep")
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    if (humanAgree && !purgeRaw) {
      return { status: "error", message: "--yes requires --purge <name> after the human agrees" }
    }
    let purge: string | undefined
    if (purgeRaw) {
      try {
        purge = requireProfileName(purgeRaw)
      } catch (err) {
        return { status: "error", message: err instanceof Error ? err.message : String(err) }
      }
    }
    let keep: string | undefined
    let unkeep: string | undefined
    try {
      if (keepRaw) keep = requireProfileName(keepRaw)
      if (unkeepRaw) unkeep = requireProfileName(unkeepRaw)
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) }
    }
    if (keep && unkeep) return { status: "error", message: "pass only one of --keep or --unkeep" }
    return { status: "ok", command: { cmd: "profiles", purge, humanAgree, keep, unkeep } }
  }
  if (cmd === "profile-status") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const profileRaw = takeOption(args, "--profile")
    const name = takeOption(args, "--name")
    const url = takeOption(args, "--url")
    const expect = takeOption(args, "--expect", { rejectHttp: true })
    const authRaw = takeOption(args, "--auth-keys", { rejectHttp: true })
    let authKeyNames: string[] | undefined
    if (authRaw !== undefined) {
      try {
        authKeyNames = parseAuthKeyNames(authRaw)
      } catch (err) {
        return { status: "error", message: err instanceof Error ? err.message : String(err) }
      }
    }
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    if (!profileRaw && !name) {
      return { status: "error", message: "profile-status requires --profile <name> or --name <saved>" }
    }
    let profile: string | undefined
    if (profileRaw) {
      try {
        profile = requireProfileName(profileRaw)
      } catch (err) {
        return { status: "error", message: err instanceof Error ? err.message : String(err) }
      }
    }
    if (url !== undefined && !isHttpOrHttpsUrl(url)) {
      return { status: "error", message: "url must be an http or https URL" }
    }
    if (expect !== undefined && !isNonEmptyExpect(expect)) {
      return { status: "error", message: "profile-status --expect must be a non-empty string" }
    }
    return { status: "ok", command: { cmd: "profile-status", profile, name, url, expect, authKeyNames } }
  }
  if (cmd === "solari-health") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    return { status: "ok", command: { cmd: "solari-health" } }
  }
  if (cmd === "reap") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const dryRun = takeFlag(args, "--dry-run")
    const sessionId = takeOption(args, "--session")
    const vmId = takeOption(args, "--vm")
    const packReceipts = takeFlag(args, "--pack-receipts")
    const accountWide = takeFlag(args, "--account-wide")
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    return { status: "ok", command: { cmd: "reap", dryRun, sessionId, vmId, packReceipts, accountWide } }
  }
  if (cmd === "desktop") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const open = takeOption(args, "--open")
    const type = takeOption(args, "--type")
    const expect = takeOption(args, "--expect")
    const clickRaw = takeOption(args, "--click")
    let click: { x: number; y: number } | undefined
    if (clickRaw) {
      const parts = clickRaw.split(",").map((p) => Number(p.trim()))
      if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
        return { status: "error", message: "--click must be x,y" }
      }
      click = { x: parts[0]!, y: parts[1]! }
    }
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    return { status: "ok", command: { cmd: "desktop", open, type, click, expect } }
  }
  if (cmd === "trace") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const profileRaw = takeOption(args, "--profile")
    const limitRaw = takeOption(args, "--limit")
    const all = takeFlag(args, "--all")
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    let profile: string | undefined
    if (profileRaw) {
      try {
        profile = requireProfileName(profileRaw)
      } catch (err) {
        return { status: "error", message: err instanceof Error ? err.message : String(err) }
      }
    }
    let limit: number | undefined
    if (limitRaw !== undefined) {
      const n = Number(limitRaw)
      if (!Number.isFinite(n)) return { status: "error", message: "--limit must be a number" }
      limit = n
    }
    return { status: "ok", command: { cmd: "trace", profile, limit, all } }
  }
  if (cmd === "job") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const parsed = parseJobFlags(args)
    if (!parsed.ok) return { status: "error", message: parsed.message }
    return { status: "ok", command: { cmd: "job", opts: parsed.opts } }
  }
  if (cmd === "connect") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const parsed = parseConnectFlags(args)
    if (!parsed.ok) return { status: "error", message: parsed.message }
    return { status: "ok", command: { cmd: "connect", opts: parsed.opts } }
  }
  if (cmd === "job-status") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const parsed = parseJobStatusFlags(args)
    if (!parsed.ok) return { status: "error", message: parsed.message }
    return { status: "ok", command: { cmd: "job-status", jobId: parsed.jobId, waitMs: parsed.waitMs } }
  }
  if (cmd === "sweep") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const planPath = takeOption(args, "--plan")
    const notify = takeOption(args, "--notify")
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    if (!planPath) return { status: "error", message: "sweep requires --plan <plan.json>" }
    if (notify !== undefined && !isHttpOrHttpsUrl(notify)) {
      return { status: "error", message: "--notify must be an http or https URL (no userinfo)" }
    }
    return { status: "ok", command: { cmd: "sweep", planPath, notify } }
  }
  return { status: "error", message: `unknown command: ${cmd}` }
}

export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgv(argv.slice(2))
  if (parsed.status === "error") {
    process.stderr.write(`${parsed.message}\n${USAGE}`)
    writeStdoutJson(usageErrorReceipt(parsed.message))
    return 1
  }
  if (parsed.command.cmd === "help") {
    process.stdout.write(USAGE)
    return 0
  }
  if (parsed.command.cmd === "mcp") {
    await import("./mcp.ts")
    return 0
  }
  try {
    const runners = await import("./runners.ts")
    const cmd = parsed.command
    if (cmd.cmd === "check") {
      const receipt = await runners.runCheckDoor({
        ...cmd.opts,
        verify: cmd.verify,
      })
      writeStdoutJson(receipt)
      return exitFromOk(receipt.ok)
    }
    if (cmd.cmd === "finalize-login") {
      const receipt = await runners.runFinalizeLoginDoor(cmd)
      writeStdoutJson(receipt)
      return exitFromOk(receipt.ok)
    }
    if (cmd.cmd === "login") {
      const payload = await runners.runLoginDoor({
        profile: cmd.profile,
        url: cmd.url,
        wait: cmd.wait,
        profileDerived: cmd.profileDerived,
        onProgress: createProgress(),
      })
      writeStdoutJson(payload)
      return exitFromOk(payload.ok === true)
    }
    if (cmd.cmd === "await-login") {
      const payload = await runners.runAwaitLoginDoor({
        profile: cmd.profile,
        sinceVersion: cmd.sinceVersion,
        timeoutMs: cmd.timeoutMs,
        saveEditor: cmd.saveEditor,
        url: cmd.url,
        expect: cmd.expect,
        chainFinalize: cmd.chainFinalize,
        authKeyNames: cmd.authKeyNames,
        onProgress: createProgress(),
      })
      writeStdoutJson(payload)
      return exitFromOk(payload.ok === true)
    }
    if (cmd.cmd === "verify") {
      const result = await runners.runVerifyDoor(cmd.runDir)
      writeStdoutJson(result)
      return exitFromOk(result.ok)
    }
    if (cmd.cmd === "reap") {
      const result = await runners.runReapDoor(cmd)
      writeStdoutJson(result)
      return exitFromOk(result.ok)
    }
    if (cmd.cmd === "desktop") {
      const result = await runners.runDesktopDoor(cmd)
      writeStdoutJson(result)
      return exitFromOk(result.ok)
    }
    if (cmd.cmd === "profile-status") {
      const result = await runners.runProfileStatusDoor(cmd)
      writeStdoutJson(result)
      return exitFromOk(result.ok)
    }
    if (cmd.cmd === "solari-health") {
      const result = await runners.runSolariHealthDoor()
      process.stderr.write(`${result.next}\n`)
      writeStdoutJson(result)
      return exitFromOk(result.ok)
    }
    if (cmd.cmd === "trace") {
      writeStdoutJson(await runners.runTraceDoor(cmd))
      return 0
    }
    if (cmd.cmd === "job") {
      const result = await runners.runJobDoor({ ...cmd.opts, onProgress: createProgress() })
      writeStdoutJson(result)
      return exitFromOk(result.ok)
    }
    if (cmd.cmd === "connect") {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        process.stderr.write(`${CONNECT_NEEDS_TTY}\n`)
        writeStdoutJson(usageErrorReceipt(CONNECT_NEEDS_TTY))
        return 1
      }
      const { runConnect } = await import("./connect.ts")
      const result = await runConnect(cmd.opts, { stdin: process.stdin, stdout: process.stdout }, {
        runJob: (opts) => runners.runJobDoor(opts),
      })
      return result.ok ? 0 : 1
    }
    if (cmd.cmd === "job-status") {
      const result = await runners.runJobStatusDoor({
        jobId: cmd.jobId,
        waitMs: cmd.waitMs,
        onProgress: createProgress(),
      })
      writeStdoutJson(result)
      return exitFromOk(result.ok)
    }
    if (cmd.cmd === "sweep") {
      let plan: unknown
      try {
        plan = JSON.parse(await readFile(path.resolve(process.env.AUSPEX_CALLER_CWD || process.cwd(), cmd.planPath), "utf8"))
      } catch (err) {
        throw new Error(`sweep --plan ${cmd.planPath} is not readable JSON: ${err instanceof Error ? err.message : String(err)}`)
      }
      const result = await runners.runSweepDoor({ plan, notify: cmd.notify, onProgress: createProgress() })
      process.stderr.write(`${result.next}\n`)
      writeStdoutJson(result)
      return exitFromOk(result.ok)
    }
    writeStdoutJson(await runners.runProfilesDoor(cmd))
    return 0
  } catch (err) {
    writeStdoutJson(failureReceipt(err))
    process.stderr.write(`${explainSolariError(err)}\n`)
    return 1
  }
}

const thisFile = fileURLToPath(import.meta.url)
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : ""
if (invoked === thisFile) {
  process.exit(await main(process.argv))
}
