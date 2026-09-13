import path from "node:path"
import { fileURLToPath } from "node:url"
import { runCheck, type CheckOptions } from "./check.ts"
import { explainSolariError } from "./errors.ts"
import { isCheckUrl, isHttpOrHttpsUrl, LOOPBACK_URL_ERROR } from "./http-url.ts"
import { formatLogin, listProfiles, loginProfile, requireProfileName } from "./profiles.ts"
import { defaultDesktopDeps, runDesktopReview } from "./desktop.ts"
import { parseProxyFlag } from "./launch-options.ts"
import { assertFillPair } from "./page-actions.ts"
import { reapLeftovers } from "./reap.ts"
import { checkThenVerify, verifyReceipt } from "./sandbox.ts"
import { type SsoProvider } from "./sso.ts"
import { isNonEmptyExpect } from "./text.ts"
import { RECORD_PROFILE_ERROR } from "./tool-schema.ts"

export const USAGE = `Usage:
  npx tsx src/cli.ts check <url> --expect <string> [--selector <css>] [--profile <name>] [--stealth] [--proxy <cc|smart>] [--proxy-sticky <id>] [--captcha] [--record] [--allow-record-profile] [--sso] [--sso-provider microsoft|google|auto] [--wait-for <css>] [--fill <css> --value <text>] [--click <css>] [--verify]
  npx tsx src/cli.ts verify [runDir]
  npx tsx src/cli.ts desktop [--open <app>] [--type <text>] [--click <x,y>] [--expect <string>]
  npx tsx src/cli.ts reap [--dry-run] [--session <id>] [--vm <id>]
  npx tsx src/cli.ts login --profile <name> [--url <hint>]
  npx tsx src/cli.ts profiles

Open a live URL in a Solari cloud browser, snapshot evidence, check a claim, close.
verify uploads that receipt into a headless Solari sandbox, independently re-checks expect (fetch/OCR), and kills the VM.
--verify on check is one-shot check-then-sandbox (do not also run verify). ok is protocol success; matched is the expect substring.
desktop boots a Solari GUI VM, opens mousepad by default (click 320,300 inside the editor), screenshots, and kills it. streamUrl is the live VNC. Stderr is an append-only log; stdout is JSON.
reap lists/closes leftover browser sessions and kills holding sandboxes/desktops (429 recovery without official Solari MCP).
login creates or reuses a named Solari profile and prints a single-use login-handoff URL (human signs in; agent never handles the password).
profiles lists profile names and ids.

402 FeatureRequiresPlan (stealth/proxy/captcha/desktop on Free) and 429 ConcurrencyLimitExceeded are not retryable.
429: auspex_reap leftover sessions, then retry — do not only use the Solari console. Official solari_browser_close / solari_kill also work if that MCP started.
Requires SOLARI_API_KEY (https://console.getsolari.com). Always closes browser sessions and kills sandboxes/desktops.
Never commit .env or .auspex/ run artifacts.
`

export type CliCommand =
  | { cmd: "help" }
  | { cmd: "check"; opts: CheckOptions; verifyAfter?: boolean }
  | { cmd: "login"; profile: string; url?: string }
  | { cmd: "profiles" }
  | { cmd: "verify"; runDir?: string }
  | { cmd: "desktop"; open?: string; type?: string; click?: { x: number; y: number }; expect?: string }
  | { cmd: "reap"; dryRun?: boolean; sessionId?: string; vmId?: string }

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
  if (cmd === "check") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const expect = takeOption(args, "--expect", { rejectHttp: true })
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
    const sso = takeFlag(args, "--sso")
    const ssoProviderRaw = takeOption(args, "--sso-provider")
    const waitFor = takeOption(args, "--wait-for", { rejectHttp: true })
    const fill = takeOption(args, "--fill", { rejectHttp: true })
    const value = takeOption(args, "--value")
    const click = takeOption(args, "--click", { rejectHttp: true })
    const proxy = takeOption(args, "--proxy", { rejectHttp: true })
    const proxySticky = takeOption(args, "--proxy-sticky", { rejectHttp: true })
    const captcha = takeFlag(args, "--captcha")
    const verifyAfter = takeFlag(args, "--verify")
    const url = args.shift()
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    if (!url || url.startsWith("-")) return { status: "error", message: "check requires a URL" }
    if (!isHttpOrHttpsUrl(url)) return { status: "error", message: "url must be an http or https URL" }
    if (!isCheckUrl(url)) return { status: "error", message: LOOPBACK_URL_ERROR }
    if (!expect || !isNonEmptyExpect(expect)) {
      return { status: "error", message: "check requires --expect <string>" }
    }
    const ssoProvider = parseSsoProvider(ssoProviderRaw)
    if (ssoProviderRaw && !ssoProvider) {
      return { status: "error", message: "--sso-provider must be microsoft, google, or auto" }
    }
    let profileName = profile
    if (profileName !== undefined) {
      try {
        profileName = requireProfileName(profileName)
      } catch (err) {
        return { status: "error", message: err instanceof Error ? err.message : String(err) }
      }
    }
    if (record && profileName && !allowRecordProfile) {
      return { status: "error", message: RECORD_PROFILE_ERROR }
    }
    try {
      parseProxyFlag(proxy, proxySticky)
      assertFillPair({ fill, value })
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
          waitFor,
          fill,
          value,
          click,
          proxy,
          proxySticky,
          captcha,
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
    return { status: "ok", command: { cmd: "login", profile: profileName, url } }
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
  if (cmd === "reap") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const dryRun = takeFlag(args, "--dry-run")
    const sessionId = takeOption(args, "--session")
    const vmId = takeOption(args, "--vm")
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    return { status: "ok", command: { cmd: "reap", dryRun, sessionId, vmId } }
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
    return 2
  }
  if (parsed.command.cmd === "help") {
    process.stdout.write(USAGE)
    return 0
  }
  try {
    if (parsed.command.cmd === "check") {
      if (parsed.command.verifyAfter) {
        const both = await checkThenVerify(parsed.command.opts)
        process.stdout.write(`${JSON.stringify(both, null, 2)}\n`)
        return both.check.ok && both.check.matched && both.verify.ok ? 0 : 1
      }
      const result = await runCheck(parsed.command.opts)
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
      return result.ok && result.matched ? 0 : 1
    }
    if (parsed.command.cmd === "login") {
      const result = await loginProfile(parsed.command.profile, parsed.command.url)
      process.stdout.write(formatLogin(result))
      return 0
    }
    if (parsed.command.cmd === "verify") {
      const result = await verifyReceipt(parsed.command.runDir)
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
      return result.ok ? 0 : 1
    }
    if (parsed.command.cmd === "reap") {
      const result = await reapLeftovers({
        dryRun: parsed.command.dryRun,
        sessionId: parsed.command.sessionId,
        vmId: parsed.command.vmId,
      })
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
      return result.ok ? 0 : 1
    }
    if (parsed.command.cmd === "desktop") {
      const result = await runDesktopReview({
        ...defaultDesktopDeps(),
        task: {
          open: parsed.command.open,
          type: parsed.command.type,
          click: parsed.command.click,
          expect: parsed.command.expect,
        },
      })
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
      return result.ok ? 0 : 1
    }
    const profiles = await listProfiles()
    process.stdout.write(`${JSON.stringify(profiles, null, 2)}\n`)
    return 0
  } catch (err) {
    process.stderr.write(`${explainSolariError(err)}\n`)
    return 2
  }
}

const thisFile = fileURLToPath(import.meta.url)
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : ""
if (invoked === thisFile) {
  process.exit(await main(process.argv))
}
