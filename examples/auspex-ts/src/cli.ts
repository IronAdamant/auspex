import path from "node:path"
import { fileURLToPath } from "node:url"
import { runCheck, type CheckOptions } from "./check.ts"
import { formatLogin, listProfiles, loginProfile } from "./profiles.ts"

export const USAGE = `Usage:
  npx tsx src/cli.ts check <url> --expect <string> [--selector <css>] [--profile <name>] [--stealth] [--record] [--sso]
  npx tsx src/cli.ts login --profile <name> [--url <hint>]
  npx tsx src/cli.ts profiles

Open a live URL in a Solari cloud browser, snapshot evidence, check a claim, close.
login creates or reuses a named Solari profile and prints the console Profiles editor (log in live, Save).
profiles lists profile names and ids. Neither login nor profiles holds a check session open.

Requires SOLARI_API_KEY (https://console.getsolari.com). Always closes the session.
Never commit .env or .auspex/ run artifacts.
`

export type CliCommand =
  | { cmd: "help" }
  | { cmd: "check"; opts: CheckOptions }
  | { cmd: "login"; profile: string; url?: string }
  | { cmd: "profiles" }

export type ParseResult =
  | { status: "ok"; command: CliCommand }
  | { status: "error"; message: string }

function takeFlag(args: string[], name: string): boolean {
  const i = args.indexOf(name)
  if (i === -1) return false
  args.splice(i, 1)
  return true
}

function takeOption(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  const value = args[i + 1]
  if (!value || value.startsWith("-")) return undefined
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
    const expect = takeOption(args, "--expect")
    const selector = takeOption(args, "--selector")
    const profile = takeOption(args, "--profile")
    const stealth = takeFlag(args, "--stealth")
    const record = takeFlag(args, "--record")
    const sso = takeFlag(args, "--sso")
    const url = args.shift()
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    if (!url || url.startsWith("-")) return { status: "error", message: "check requires a URL" }
    if (!expect) return { status: "error", message: "check requires --expect <string>" }
    return { status: "ok", command: { cmd: "check", opts: { url, expect, selector, profile, stealth, record, sso } } }
  }
  if (cmd === "login") {
    if (args.includes("--help") || args.includes("-h")) {
      return { status: "ok", command: { cmd: "help" } }
    }
    const profile = takeOption(args, "--profile")
    const url = takeOption(args, "--url")
    if (args.length > 0) return { status: "error", message: `unexpected arguments: ${args.join(" ")}` }
    if (!profile) return { status: "error", message: "login requires --profile <name>" }
    return { status: "ok", command: { cmd: "login", profile, url } }
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
      const result = await runCheck(parsed.command.opts)
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
      return result.ok ? 0 : 1
    }
    if (parsed.command.cmd === "login") {
      const result = await loginProfile(parsed.command.profile, parsed.command.url)
      process.stdout.write(formatLogin(result))
      return 0
    }
    const profiles = await listProfiles()
    process.stdout.write(`${JSON.stringify(profiles, null, 2)}\n`)
    return 0
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`${message}\n`)
    return 2
  }
}

const thisFile = fileURLToPath(import.meta.url)
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : ""
if (invoked === thisFile) {
  process.exit(await main(process.argv))
}
