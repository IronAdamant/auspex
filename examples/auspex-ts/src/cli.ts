import path from "node:path"
import { fileURLToPath } from "node:url"
import { toAgentReceipt } from "./agent-receipt.ts"
import { runCheck, type CheckOptions } from "./check.ts"
import { explainSolariError } from "./errors.ts"
import { isCheckUrl, isHttpOrHttpsUrl, LOOPBACK_URL_ERROR } from "./http-url.ts"
import { listProfiles, loginProfile, requireProfileName } from "./profiles.ts"
import { liveAwaitLogin } from "./profile-persist.ts"
import { profileStatus } from "./profile-status.ts"
import { defaultDesktopDeps, runDesktopReview } from "./desktop.ts"
import { parseProxyFlag } from "./launch-options.ts"
import { assertPageActionsAllowed } from "./page-actions.ts"
import { reapLeftovers } from "./reap.ts"
import { checkThenVerify, verifyReceipt } from "./sandbox.ts"
import { applySavedCheckName } from "./saved-checks.ts"
import { type SsoProvider } from "./sso.ts"
import { isNonEmptyExpect } from "./text.ts"
import { isDashboardLandingUrl, RECORD_LOGGED_IN_ERROR, assertRecordProfileAllowed } from "./tool-schema.ts"
import {
  exitFromOk,
  failureReceipt,
  stampSchema,
  usageErrorReceipt,
  writeStdoutJson,
} from "./cli-json.ts"

export const USAGE = `Usage:
  npx auspex check [--name <ironadamant|checkpoint|consistencyhub>] [<url>] [--expect <string>] [--selector <css>] [--profile <name>] [--stealth] [--proxy <cc|smart>] [--proxy-sticky <id>] [--captcha] [--record] [--allow-record-profile] [--allow-page-actions] [--sso] [--sso-provider microsoft|google|auto] [--wait-for <css>] [--fill <css> --value <text>] [--click <css>] [--save-profile] [--verify|--no-verify]
  npx auspex verify [runDir]
  npx auspex desktop [--open <app>] [--type <text>] [--click <x,y>] [--expect <string>]
  npx auspex reap [--dry-run] [--session <id>] [--vm <id>] [--pack-receipts] [--account-wide]
  npx auspex login --profile <name> [--url <hint>] [--wait]
  npx auspex await-login --profile <name> [--since-version <n>] [--timeout-ms <n>]
  npx auspex profiles
  npx auspex profile-status [--profile <name>] [--name <saved>] [--url <hint>]
  npx auspex mcp
  npx tsx src/cli.ts <command>   # same CLI, from examples/auspex-ts

Open a live URL in a Solari cloud browser, snapshot evidence, check a claim, close.
CLI and MCP are the same contract: every MCP tool is a CLI command; every flag is a JSON field.
Stdout is one JSON object (schemaVersion plus ok). --help is human text. Exit 0 only when ok is true.
Saved checks (auspex.yml): --name ironadamant | checkpoint | consistencyhub. consistencyhub is --profile only (no --sso, no --record). fill/click with a profile requires --allow-page-actions.
check verifies by default (headless sandbox HTTP fetch + OCR of expect). --no-verify skips the sandbox. Do not also run verify after a default check. loggedOut/needsHuman skip verify and are not retried. needsHuman omits the screenshot/MCP image and strips digit runs from excerpt.
Stdout receipt fields (schemaVersion 1 frozen; see AGENTS.md): required schemaVersion, ok, reason (matched | loggedOut | needsHuman | mismatch | network | recordedLoggedIn), url, expect, screenshotPath. Extra keys (diff, verify, matched, …) stay optional. excerpt is fenced untrusted page text.
ok is protocol success; matched is the expect substring; reason is always set. CLI exit 0 requires agent ok (matched, and verify claim if verifying).
desktop is a named Solari sandbox demo (default mousepad). Not the user's Mac. Wait/expect/ok share one process haystack (processList + ps). streamUrl is live VNC.
reap lists/closes leftover browser sessions from the Auspex live ledger (429 recovery). Default kills ledger ids only; --account-wide also wipes holding sandboxes/desktops on the key. --pack-receipts copies last receipts per URL into .auspex/pack for a PR attach.
profile-status reports loggedIn | loggedOut | needsHuman. Re-seed is human SSO once; the agent never types a password and does not ping the user. Microsoft and Google password/OTP walls are needsHuman. A profile that lands on / is loggedOut unless expect matched.
login creates or reuses a named Solari profile and prints a single-use login-handoff URL (human signs in; agent never handles the password). --wait then blocks until Save stores cookies or origins.
await-login waits for that Save (a version bump with 0 cookies is empty-save, not success).
profiles lists names, ids, version, and whether storage is populated.
--save-profile writes Playwright cookies, localStorage, and sessionStorage into the named profile via POST /profiles/:id/save (never overwrites with an empty seed, a public /landing session, or a save with no bytes for the page origin). A profile directory lock refuses concurrent saves of the same name.
Never --record a logged-in session (--sso, --save-profile, or a dashboard landing). record+profile is forbidden unless --allow-record-profile on a public marketing host. --allow-record-profile is refused for consistencyhub. Recording is not started at session create when a profile is attached unless the URL is ironadamant.com or checkpointprojects.com.
SSO is human-once then reuse. Microsoft and Google password/OTP walls fail closed (needsHuman) and are never typed. A later --profile check that lands on /landing, /login, or / without a matched expect is ok: false reason: loggedOut.

402 FeatureRequiresPlan (stealth/proxy/captcha/desktop on Free) and 429 ConcurrencyLimitExceeded are not retryable.
429: auspex_reap leftover sessions, then retry — do not only use the Solari console. Official solari_browser_close / solari_kill also work if that MCP started.
Requires SOLARI_API_KEY in the environment (https://console.getsolari.com). Always closes browser sessions and kills sandboxes/desktops.
Never commit .env or .auspex/ run artifacts.
`

export type CliCommand =
  | { cmd: "help" }
  | { cmd: "mcp" }
  | { cmd: "check"; opts: CheckOptions; verifyAfter?: boolean }
  | { cmd: "login"; profile: string; url?: string; wait?: boolean }
  | { cmd: "await-login"; profile: string; sinceVersion?: number; timeoutMs?: number }
  | { cmd: "profiles" }
  | { cmd: "profile-status"; profile?: string; name?: string; url?: string }
  | { cmd: "verify"; runDir?: string }
  | { cmd: "desktop"; open?: string; type?: string; click?: { x: number; y: number }; expect?: string }
  | { cmd: "reap"; dryRun?: boolean; sessionId?: string; vmId?: string; packReceipts?: boolean; accountWide?: boolean }

export type ParseResult =
  | { status: "ok"; command: CliCommand }
  | { status: "error"; message: string }

function takeFlag(args: string[], name: string): boolean {
  const i = args.indexOf(name)
  if (i === -1) return false
  args.splice(i, 1)
  return true
}

function takeOption(
  args: string[],
  name: string,
  opts: { rejectHttp?: boolean } = {},
): string | undefined {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  const value = args[i + 1]
  if (value === undefined || (value.length > 0 && value.startsWith("-"))) return undefined
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
    const noVerify = takeFlag(args, "--no-verify")
    const verifyFlag = takeFlag(args, "--verify")
    if (noVerify && verifyFlag) {
      return { status: "error", message: "pass only one of --verify or --no-verify" }
    }
    const verifyAfter = !noVerify
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
        },
        verifyAfter,
      },
    }
  }
  if (cmd === "login") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const profile = takeOption(args, "--profile")
    const url = takeOption(args, "--url")
    const wait = takeFlag(args, "--wait")
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    if (!profile) return { status: "error", message: "login requires --profile <name>" }
    let profileName: string
    try {
      profileName = requireProfileName(profile)
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) }
    }
    if (url !== undefined && !isHttpOrHttpsUrl(url)) {
      return { status: "error", message: "url must be an http or https URL" }
    }
    return { status: "ok", command: { cmd: "login", profile: profileName, url, wait } }
  }
  if (cmd === "await-login") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const profile = takeOption(args, "--profile")
    const sinceRaw = takeOption(args, "--since-version")
    const timeoutRaw = takeOption(args, "--timeout-ms")
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
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
    return { status: "ok", command: { cmd: "await-login", profile: profileName, sinceVersion, timeoutMs } }
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
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    return { status: "ok", command: { cmd: "profiles" } }
  }
  if (cmd === "profile-status") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const profileRaw = takeOption(args, "--profile")
    const name = takeOption(args, "--name")
    const url = takeOption(args, "--url")
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
    return { status: "ok", command: { cmd: "profile-status", profile, name, url } }
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
    if (parsed.command.cmd === "check") {
      if (parsed.command.verifyAfter !== false) {
        const both = await checkThenVerify(parsed.command.opts)
        const receipt = toAgentReceipt(both.check, { verify: both.verify })
        writeStdoutJson(receipt)
        return exitFromOk(receipt.ok)
      }
      const result = await runCheck(parsed.command.opts)
      const receipt = toAgentReceipt(result)
      writeStdoutJson(receipt)
      return exitFromOk(receipt.ok)
    }
    if (parsed.command.cmd === "login") {
      const result = await loginProfile(parsed.command.profile, parsed.command.url)
      if (!parsed.command.wait) {
        writeStdoutJson(stampSchema({ ok: true, ...result }))
        return 0
      }
      const waited = await liveAwaitLogin(parsed.command.profile, {
        sinceVersion: result.sinceVersion,
      })
      const payload = stampSchema({ ok: waited.status === "completed", ...result, wait: waited })
      writeStdoutJson(payload)
      return exitFromOk(payload.ok)
    }
    if (parsed.command.cmd === "await-login") {
      const waited = await liveAwaitLogin(parsed.command.profile, {
        sinceVersion: parsed.command.sinceVersion,
        timeoutMs: parsed.command.timeoutMs,
      })
      const payload = stampSchema({ ok: waited.status === "completed", ...waited })
      writeStdoutJson(payload)
      return exitFromOk(payload.ok)
    }
    if (parsed.command.cmd === "verify") {
      const result = stampSchema(await verifyReceipt(parsed.command.runDir))
      writeStdoutJson(result)
      return exitFromOk(result.ok)
    }
    if (parsed.command.cmd === "reap") {
      const result = stampSchema(
        await reapLeftovers({
          dryRun: parsed.command.dryRun,
          sessionId: parsed.command.sessionId,
          vmId: parsed.command.vmId,
          packReceipts: parsed.command.packReceipts,
          accountWide: parsed.command.accountWide,
        }),
      )
      writeStdoutJson(result)
      return exitFromOk(result.ok)
    }
    if (parsed.command.cmd === "desktop") {
      const result = stampSchema(
        await runDesktopReview({
          ...defaultDesktopDeps(),
          task: {
            open: parsed.command.open,
            type: parsed.command.type,
            click: parsed.command.click,
            expect: parsed.command.expect,
          },
        }),
      )
      writeStdoutJson(result)
      return exitFromOk(result.ok)
    }
    if (parsed.command.cmd === "profile-status") {
      const result = stampSchema(
        await profileStatus({
          profile: parsed.command.profile,
          name: parsed.command.name,
          url: parsed.command.url,
        }),
      )
      writeStdoutJson(result)
      return exitFromOk(result.ok)
    }
    const profiles = await listProfiles()
    writeStdoutJson(stampSchema({ ok: true, profiles }))
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
