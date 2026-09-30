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
import { parseConnectFlags, type ConnectCommand } from "./connect.ts"
import { parseAuthKeyNames } from "./cookie-save.ts"
import { ONE_CHECK_PAGE_ACTIONS } from "./contract.ts"
import { KEY_ENV_REFUSE, LONG_RUN_CLI_LINE, PROFILES_MAP_LINE } from "./door-await-contract.ts"
import { createProgress } from "./progress.ts"
import { takeFlag, takeOption, unexpectedArgs } from "./argv.ts"
import { releaseOwnSessionsOnSignal } from "./shutdown.ts"

export const USAGE = `Usage:
  npx auspex login --url <https> [--profile <name>] [--wait]
  npx auspex check <url>|--url <url> --expect <string> [--selector <css>] [--profile <name>] [--sso] [--sso-provider microsoft|google|auto] [--wait-for <css>] [--save-profile] [--verify|--no-verify] [--verify-with-profile] [--auth-keys <names>] [--mobile] [--device <name>]
  npx auspex await-login --profile <name> [--since-version <n>] [--timeout-ms <n>] [--save-editor] [--url <https>] [--expect <string>] [--no-chain-finalize] [--auth-keys <names>]
  npx auspex finalize-login --profile <name> [--url <url>] [--expect <string>]
  npx auspex profiles [--purge <name>] [--yes] [--keep <name>] [--unkeep <name>]
  npx auspex profile-status [--profile <name>] [--name <saved>] [--url <hint>] [--expect <string>] [--auth-keys <names>]
  npx auspex solari-health
  npx auspex job [--job-id <id>] [--name <saved>] [--profile <name>] [--url <https>] [--expect <string>] [--skip-finalize] [--verify-with-profile] [--wait] [--wake-webhook <url>] [--timeout-ms <n>]
  npx auspex job-status --job-id <id> [--wait-ms <n>]
  npx auspex connect <https> [--expect <words>] [--profile <name>] [--verbose]
  npx auspex connect --save <profile>
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
connect is one command for a person at a terminal: it shows the phone door link, Enter is Save, then it runs the job chain with --verify-with-profile and prints one plain sentence. In a terminal, Enter is Save. Without one (an agent), pass --expect; after the human taps Save, run connect --save <profile>. The wait ends with Solari's typing window.
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
  | { cmd: "connect"; connect: ConnectCommand }
  | { cmd: "job-status"; jobId: string; waitMs?: number }
  | { cmd: "sweep"; planPath: string; notify?: string }

export type ParseResult =
  | { status: "ok"; command: CliCommand }
  | { status: "error"; message: string }

function parseSsoProvider(raw: string | undefined): SsoProvider | undefined {
  if (!raw) return undefined
  const v = raw.trim().toLowerCase()
  if (v === "microsoft" || v === "google" || v === "auto") return v
  return undefined
}

/** A usage error: parseArgv returns its message as `{ status: "error" }`. */
function fail(message: string): never {
  throw new Error(message)
}

function noExtraArgs(args: readonly string[]): void {
  const extra = unexpectedArgs(args)
  if (extra) fail(extra)
}

function numberOption(raw: string | undefined, flag: string): number | undefined {
  if (raw === undefined) return undefined
  const n = Number(raw)
  if (!Number.isFinite(n)) fail(`${flag} must be a number`)
  return n
}

/** A URL the cloud browser will open: http(s), and not loopback, link-local or cloud metadata. */
function browserUrlOption(url: string | undefined): void {
  if (url === undefined) return
  if (!isHttpOrHttpsUrl(url)) fail("url must be an http or https URL")
  if (!isCheckUrl(url)) fail(LOOPBACK_URL_ERROR)
}

function ssoProviderOption(raw: string | undefined): SsoProvider | undefined {
  const provider = parseSsoProvider(raw)
  if (raw && !provider) fail("--sso-provider must be microsoft, google, or auto")
  return provider
}

function authKeysOption(args: string[]): string[] | undefined {
  const raw = takeOption(args, "--auth-keys", { rejectHttp: true })
  return raw === undefined ? undefined : parseAuthKeyNames(raw)
}

export function parseArgv(argv: string[]): ParseResult {
  const args = [...argv]
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    return { status: "ok", command: { cmd: "help" } }
  }
  const cmd = args.shift()!
  try {
    return { status: "ok", command: parseCommand(cmd, args) }
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) }
  }
}

function parseCommand(cmd: string, args: string[]): CliCommand {
  if (cmd === "mcp") {
    noExtraArgs(args)
    return { cmd: "mcp" }
  }
  if (cmd === "check") return parseCheck(args)
  if (cmd === "finalize-login") {
    const profile = takeOption(args, "--profile")
    const url = takeOption(args, "--url")
    const expect = takeOption(args, "--expect", { rejectHttp: true })
    const ssoProviderRaw = takeOption(args, "--sso-provider")
    noExtraArgs(args)
    if (!profile) fail("finalize-login requires --profile <name>")
    const profileName = requireProfileName(profile)
    browserUrlOption(url)
    const ssoProvider = ssoProviderOption(ssoProviderRaw)
    return { cmd: "finalize-login", profile: profileName, url, expect, ssoProvider }
  }
  if (cmd === "login") {
    const profile = takeOption(args, "--profile")
    const url = takeOption(args, "--url")
    const wait = takeFlag(args, "--wait")
    noExtraArgs(args)
    browserUrlOption(url)
    const resolved = resolveLoginProfile({ profile, url })
    return { cmd: "login", profile: requireProfileName(resolved.name), url, wait, profileDerived: resolved.derived }
  }
  if (cmd === "await-login") {
    const profile = takeOption(args, "--profile")
    const sinceRaw = takeOption(args, "--since-version")
    const timeoutRaw = takeOption(args, "--timeout-ms")
    const saveEditor = takeFlag(args, "--save-editor")
    const url = takeOption(args, "--url")
    const expect = takeOption(args, "--expect")
    const chainFinalize = takeFlag(args, "--no-chain-finalize") ? false : undefined
    const authKeyNames = authKeysOption(args)
    noExtraArgs(args)
    browserUrlOption(url)
    if (!profile) fail("await-login requires --profile <name>")
    const profileName = requireProfileName(profile)
    const sinceVersion = numberOption(sinceRaw, "--since-version")
    const timeoutMs = numberOption(timeoutRaw, "--timeout-ms")
    return { cmd: "await-login", profile: profileName, sinceVersion, timeoutMs, saveEditor, url, expect, chainFinalize, authKeyNames }
  }
  if (cmd === "verify") {
    const runDir = args.shift()
    noExtraArgs(args)
    if (runDir?.startsWith("-")) fail("verify takes an optional run directory")
    return { cmd: "verify", runDir }
  }
  if (cmd === "profiles") {
    const purgeRaw = takeOption(args, "--purge")
    const humanAgree = takeFlag(args, "--yes")
    const keepRaw = takeOption(args, "--keep")
    const unkeepRaw = takeOption(args, "--unkeep")
    noExtraArgs(args)
    if (humanAgree && !purgeRaw) fail("--yes requires --purge <name> after the human agrees")
    const purge = purgeRaw ? requireProfileName(purgeRaw) : undefined
    const keep = keepRaw ? requireProfileName(keepRaw) : undefined
    const unkeep = unkeepRaw ? requireProfileName(unkeepRaw) : undefined
    if (keep && unkeep) fail("pass only one of --keep or --unkeep")
    return { cmd: "profiles", purge, humanAgree, keep, unkeep }
  }
  if (cmd === "profile-status") {
    const profileRaw = takeOption(args, "--profile")
    const name = takeOption(args, "--name")
    const url = takeOption(args, "--url")
    const expect = takeOption(args, "--expect", { rejectHttp: true })
    const authKeyNames = authKeysOption(args)
    noExtraArgs(args)
    if (!profileRaw && !name) fail("profile-status requires --profile <name> or --name <saved>")
    const profile = profileRaw ? requireProfileName(profileRaw) : undefined
    browserUrlOption(url)
    if (expect !== undefined && !isNonEmptyExpect(expect)) fail("profile-status --expect must be a non-empty string")
    return { cmd: "profile-status", profile, name, url, expect, authKeyNames }
  }
  if (cmd === "solari-health") {
    noExtraArgs(args)
    return { cmd: "solari-health" }
  }
  if (cmd === "reap") {
    const dryRun = takeFlag(args, "--dry-run")
    const sessionId = takeOption(args, "--session")
    const vmId = takeOption(args, "--vm")
    const packReceipts = takeFlag(args, "--pack-receipts")
    const accountWide = takeFlag(args, "--account-wide")
    noExtraArgs(args)
    return { cmd: "reap", dryRun, sessionId, vmId, packReceipts, accountWide }
  }
  if (cmd === "desktop") {
    const open = takeOption(args, "--open")
    const type = takeOption(args, "--type")
    const expect = takeOption(args, "--expect")
    const clickRaw = takeOption(args, "--click")
    let click: { x: number; y: number } | undefined
    if (clickRaw) {
      const parts = clickRaw.split(",").map((p) => Number(p.trim()))
      if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) fail("--click must be x,y")
      click = { x: parts[0]!, y: parts[1]! }
    }
    noExtraArgs(args)
    return { cmd: "desktop", open, type, click, expect }
  }
  if (cmd === "trace") {
    const profileRaw = takeOption(args, "--profile")
    const limitRaw = takeOption(args, "--limit")
    const all = takeFlag(args, "--all")
    noExtraArgs(args)
    const profile = profileRaw ? requireProfileName(profileRaw) : undefined
    return { cmd: "trace", profile, limit: numberOption(limitRaw, "--limit"), all }
  }
  if (cmd === "job") {
    const parsed = parseJobFlags(args)
    if (!parsed.ok) fail(parsed.message)
    return { cmd: "job", opts: parsed.opts }
  }
  if (cmd === "connect") {
    const parsed = parseConnectFlags(args)
    if (!parsed.ok) fail(parsed.message)
    const { ok: _ok, ...connect } = parsed
    return { cmd: "connect", connect }
  }
  if (cmd === "job-status") {
    const parsed = parseJobStatusFlags(args)
    if (!parsed.ok) fail(parsed.message)
    return { cmd: "job-status", jobId: parsed.jobId, waitMs: parsed.waitMs }
  }
  if (cmd === "sweep") {
    const planPath = takeOption(args, "--plan")
    const notify = takeOption(args, "--notify")
    noExtraArgs(args)
    if (!planPath) fail("sweep requires --plan <plan.json>")
    if (notify !== undefined && !isHttpOrHttpsUrl(notify)) fail("--notify must be an http or https URL (no userinfo)")
    return { cmd: "sweep", planPath, notify }
  }
  return fail(`unknown command: ${cmd}`)
}

function parseCheck(args: string[]): CliCommand {
  // The URL is positional or --url (login, job, connect and the docs all spell it --url).
  const urlOpt = takeOption(args, "--url")
  const expectOpt = takeOption(args, "--expect", { rejectHttp: true })
  const name = takeOption(args, "--name", { rejectHttp: true })
  const selector = takeOption(args, "--selector", { rejectHttp: true })
  const profile = takeOption(args, "--profile", { rejectHttp: true })
  const profileIdx = args.indexOf("--profile")
  const profileTok = profileIdx >= 0 ? args[profileIdx + 1] : undefined
  if (profileTok && /^https?:\/\//i.test(profileTok)) fail("--profile value must not be a URL")
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
  const authKeyNames = authKeysOption(args)
  if (noVerify && verifyFlag) fail("pass only one of --verify or --no-verify")
  let url = urlOpt ?? (args[0] && !args[0].startsWith("-") ? args.shift() : undefined)
  noExtraArgs(args)
  let expect = expectOpt
  let profileName = profile !== undefined ? requireProfileName(profile) : undefined
  if (name) {
    const merged = applySavedCheckName({ name, url, expect, profile: profileName })
    url = merged.url
    expect = merged.expect
    profileName = merged.profile
  }
  const verify = noVerify ? false : verifyFlag ? true : undefined
  const verifyAfter = shouldVerifyCheck({ name, profile: profileName, url, verify, verifyWithProfile })
  if (!url || url.startsWith("-")) fail("check requires a URL or --name")
  if (!isHttpOrHttpsUrl(url)) fail("url must be an http or https URL")
  if (!isCheckUrl(url)) fail(LOOPBACK_URL_ERROR)
  if (!expect || !isNonEmptyExpect(expect)) fail("check requires --expect <string> or --name")
  const ssoProvider = ssoProviderOption(ssoProviderRaw)
  if (record && (sso || Boolean(ssoProvider) || saveProfile || isDashboardLandingUrl(url))) fail(RECORD_LOGGED_IN_ERROR)
  parseProxyFlag(proxy, proxySticky)
  assertPageActionsAllowed({ profile: profileName, name, fill, value, click, allowPageActions })
  assertRecordProfileAllowed({ record, profile: profileName, name, url, allowRecordProfile, fill, click })
  return {
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
    verify,
  }
}

/** The usage lines for one command (every command's line when it is unknown), not the whole help. */
export function usageFor(cmd: string | undefined): string {
  const lines = USAGE.split("\n").filter((line) => /^  npx auspex [a-z]/.test(line))
  const own = lines.filter((line) => line.startsWith(`  npx auspex ${cmd} `) || line === `  npx auspex ${cmd}`)
  return `Usage:\n${(own.length > 0 ? own : lines).join("\n")}\nFull help: --help\n`
}

export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgv(argv.slice(2))
  if (parsed.status === "error") {
    process.stderr.write(`${parsed.message}\n${usageFor(argv[2])}`)
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
  releaseOwnSessionsOnSignal()
  try {
    const runners = await import("./runners.ts")
    const cmd = parsed.command
    if (cmd.cmd === "check") {
      const receipt = await runners.runCheckDoor({
        ...cmd.opts,
        verify: cmd.verify,
        onProgress: createProgress(),
      })
      writeStdoutJson(receipt)
      return exitFromOk(receipt.ok)
    }
    if (cmd.cmd === "finalize-login") {
      const receipt = await runners.runFinalizeLoginDoor({ ...cmd, onProgress: createProgress() })
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
      const { runConnect, runConnectSave } = await import("./connect.ts")
      if (cmd.connect.mode === "save") {
        const saved = await runConnectSave(cmd.connect.profile)
        process.stdout.write(`${saved.message}\n`)
        return saved.ok ? 0 : 1
      }
      const result = await runConnect(cmd.connect.opts, { stdin: process.stdin, stdout: process.stdout }, {
        runJob: (opts) => runners.runJobDoor(opts),
      })
      if (result.error) {
        process.stderr.write(`${result.error}\n`)
        writeStdoutJson(usageErrorReceipt(result.error))
      }
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
      const plan = await runners.readSweepPlanFile(cmd.planPath)
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
