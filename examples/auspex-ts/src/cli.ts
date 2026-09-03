import path from "node:path"
import { fileURLToPath } from "node:url"
import { runCheck, type CheckOptions } from "./check.ts"
import { explainSolariError } from "./errors.ts"
import { isCheckUrl, isHttpOrHttpsUrl, LOOPBACK_URL_ERROR } from "./http-url.ts"
import { formatLogin, listProfiles, loginProfile, requireProfileName } from "./profiles.ts"
import { checkThenVerify, verifyReceipt } from "./sandbox.ts"
import { isNonEmptyExpect } from "./text.ts"
import { RECORD_PROFILE_ERROR } from "./tool-schema.ts"

export const USAGE = `Usage:
  npx tsx src/cli.ts check <url> --expect <string> [--selector <css>] [--profile <name>] [--stealth] [--record] [--allow-record-profile] [--sso] [--verify]
  npx tsx src/cli.ts verify [runDir]
  npx tsx src/cli.ts login --profile <name> [--url <hint>]
  npx tsx src/cli.ts profiles

Open a live URL in a Solari cloud browser, snapshot evidence, check a claim, close.
verify uploads that receipt into a headless Solari sandbox, asserts PNG + JSON, and kills the VM.
--verify on check runs verify on that run immediately. Integrity (PNG/path/auth URL) is separate from claim ok/matched.
login creates or reuses a named Solari profile and prints the console Profiles editor (log in live, Save).
profiles lists profile names and ids.

Requires SOLARI_API_KEY (https://console.getsolari.com). Always closes browser sessions and kills sandboxes.
Never commit .env or .auspex/ run artifacts.
`

export type CliCommand =
  | { cmd: "help" }
  | { cmd: "check"; opts: CheckOptions; verifyAfter?: boolean }
  | { cmd: "login"; profile: string; url?: string }
  | { cmd: "profiles" }
  | { cmd: "verify"; runDir?: string }

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
    const verifyAfter = takeFlag(args, "--verify")
    const url = args.shift()
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    if (!url || url.startsWith("-")) return { status: "error", message: "check requires a URL" }
    if (!isHttpOrHttpsUrl(url)) return { status: "error", message: "url must be an http or https URL" }
    if (!isCheckUrl(url)) return { status: "error", message: LOOPBACK_URL_ERROR }
    if (!expect || !isNonEmptyExpect(expect)) {
      return { status: "error", message: "check requires --expect <string>" }
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
          sso,
          allowRecordProfile,
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
        return both.check.ok && both.verify.ok ? 0 : 1
      }
      const result = await runCheck(parsed.command.opts)
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
      return result.ok ? 0 : 1
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
