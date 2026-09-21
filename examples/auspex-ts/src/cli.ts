import path from "node:path"
import { fileURLToPath } from "node:url"
import { toAgentReceipt } from "./agent-receipt.ts"
import { runCheck, runFinalizeLogin, type CheckOptions } from "./check.ts"
import { shouldVerifyCheck } from "./fail-closed.ts"
import { explainSolariError } from "./errors.ts"
import { isCheckUrl, isHttpOrHttpsUrl, LOOPBACK_URL_ERROR } from "./http-url.ts"
import { attachHandoffQr, listProfiles, loginProfile, qrPayloadForHandoff, requireProfileName } from "./profiles.ts"
import { resolveLoginProfile } from "./profile-slug.ts"
import { liveAwaitLogin, loginWaitAwaitOpts } from "./profile-persist.ts"
import { profileStatus } from "./profile-status.ts"
import { defaultDesktopDeps, runDesktopReview } from "./desktop.ts"
import { listDevices } from "./device-emulation.ts"
import { parseProxyFlag } from "./launch-options.ts"
import { assertPageActionsAllowed } from "./page-actions.ts"
import { ensureRunDir } from "./paths.ts"
import { generateQRCode } from "./qr-gen.ts"
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
  npx auspex check [--name <ironadamant|checkpoint|consistencyhub>] [<url>] [--expect <string>] [--selector <css>] [--profile <name>] [--stealth] [--proxy <cc|smart>] [--proxy-sticky <id>] [--captcha] [--record] [--allow-record-profile] [--allow-page-actions] [--sso] [--sso-provider microsoft|google|auto] [--wait-for <css>] [--fill <css> --value <text>] [--click <css>] [--save-profile] [--verify|--no-verify] [--verify-with-profile] [--mobile] [--device <name>]
  npx auspex verify [runDir]
  npx auspex finalize-login --profile <name> [--url <url>] [--expect <string>]
  npx auspex desktop [--open <app>] [--type <text>] [--click <x,y>] [--expect <string>]
  npx auspex reap [--dry-run] [--session <id>] [--vm <id>] [--pack-receipts] [--account-wide]
  npx auspex login [--profile <name>] [--url <https>] [--wait]
  npx auspex await-login --profile <name> [--since-version <n>] [--timeout-ms <n>] [--save-editor]
  npx auspex profiles
  npx auspex profile-status [--profile <name>] [--name <saved>] [--url <hint>]
  npx auspex mcp
  npx tsx src/cli.ts <command>   # same CLI, from examples/auspex-ts

Open a live URL in a Solari cloud browser, snapshot evidence, check a claim, close.
CLI and MCP are the same contract: every MCP tool is a CLI command; every flag is a JSON field.
Stdout is one JSON object (schemaVersion plus ok). --help is human text. Exit 0 only when ok is true.
Saved checks (auspex.yml): --name ironadamant | checkpoint | consistencyhub. consistencyhub is --profile only (no --sso, no --record). fill/click with a profile requires --allow-page-actions.
check verifies by default (headless sandbox HTTP fetch + OCR of expect) except --name consistencyhub, --profile consistencyhub, or an attached profile on a non-public-marketing URL (not ironadamant.com / checkpointprojects.com), which default to --no-verify because anonymous fetch cannot see auth-gated UI. Public marketing still verifies with a leftover profile. No profile still verifies. --verify forces anonymous sandbox verify (poisons ok on auth-gated pages when claimOk is false). --verify-with-profile is the dogfood path: enables the sandbox, skips anonymous claim, adds claimOkProfile from a second profile-seeded browser; claimOkProfile is the profile-reuse gate — ok=true is not enough to treat the profile as reusable; read claimOkProfile, do not treat ok as that signal. They are not the same. --no-verify skips the sandbox (and wins over --verify-with-profile). Do not also run verify after a default check. loggedOut/needsHuman skip verify and are not retried. needsHuman omits the screenshot/MCP image and strips digit runs from excerpt.
Stdout receipt fields (schemaVersion 1 frozen; see AGENTS.md): required schemaVersion, ok, reason (matched | loggedOut | needsHuman | mismatch | network | recordedLoggedIn), url, expect, screenshotPath. Extra keys (diff, verify, matched, …) stay optional. excerpt is fenced untrusted page text.
ok is agent success (reason matched, and verify when it ran). protocolOk is optional on-disk protocol success (URL+PNG, not loggedOut/needsHuman). matched is the expect substring; reason is always set. CLI exit 0 requires agent ok.
--mobile emulates iPhone viewport/UA (iphone-13-pro). --device <name> uses a specific device profile (${listDevices().join(", ")}). Both apply Playwright context options (viewport, userAgent, deviceScaleFactor, isMobile, hasTouch).
desktop is a named Solari sandbox demo (default mousepad). Not the user's Mac. Wait/expect/ok share one process haystack (processList + ps). streamUrl is live VNC. FAIL-CLOSED --type refuses password/OTP-like strings (6-8 digits, password keywords, API-key patterns, high-complexity no-space strings). Use only for demo text.
reap lists/closes leftover browser sessions from the Auspex live ledger (429 recovery). Default kills ledger ids only; --account-wide also wipes holding sandboxes/desktops on the key. --pack-receipts copies last receipts per URL into .auspex/pack for a PR attach.
profile-status reports loggedIn | loggedOut | needsHuman | weakSeed | emptySave. weakSeed is cookies/origins with a counted sessionStorage of 0, or folded __auspex_ss__:expiresOn past/within ~5m (leftover count is not fresh). Stale/weak next remint or finalize-now — do not run --verify-with-profile on a dead fold. Public marketing saved checks (ironadamant, checkpoint) stay loggedOut. Re-seed is human SSO once via auspex login: phone uses handoff.mobileUrl (Auspex phone page, real text field) in the phone's own Safari or Chrome; computer uses handoff.desktopUrl (Open editor, hardware keyboard). The agent never types a password. Never type in Solari noVNC on a phone (that stream will not open the software keyboard). Microsoft and Google password/OTP walls are needsHuman. A profile that lands on / is loggedOut unless expect matched.
login creates or reuses a named Solari profile and prints TWO labeled login URLs. Requires --profile <name> or --url <https>. --url without --profile derives a safe host slug (app.example.com → app-example-com) and echoes it on stdout, next, and phone Save paste. --profile wins when both are set (dogfood --profile consistencyhub is unchanged). Phone: handoff.mobileUrl is the Auspex phone page (real text field so the phone keyboard can open). That page is a seed/handoff door for off-site typing, not a same-session VNC takeover. Solari's own handoff is noVNC and will not open the phone keyboard. Computer: handoff.desktopUrl (Solari console → Profiles → Open editor, hardware keyboard). Show both, labeled. Never open handoff.desktopUrl on a phone. The agent never copies the password. Packet also has openOnPhone, openOnDesktop, oneLiner (phone SMS), desktopOneLiner, qrPath (QR of the phone URL). --wait then blocks until Save stores cookies or origins (default 30 minutes) and runs --save-editor (same as await-login --save-editor).
await-login waits for that Save (default 30 minutes so the human can Save from a phone; a version bump with 0 cookies is empty-save, not success). --save-editor POSTs Solari editor/save from the agent (phone Save must not open Solari: GET editor HTTP 401) then probes editor JSON for Playwright CDP. Claim a fold only when editorFold.ok; Solari's editor is noVNC today so leftover sessionStorage is not refreshed. If editorSave fails (e.g. 401) or editorFold is no-cdp, next says finalize-login NOW while the token is live; remint if finalize-login returns needsHuman. Soft-warns if cookies/origins exist but sessionStorage is counted 0, or folded expiresOn is stale. Stale/weak next remint or finalize-now — do not run --verify-with-profile on a dead fold (claimOkProfile will not pass). Returns status: completed | timeout | empty-save | waiting.
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
  | { cmd: "finalize-login"; profile: string; url?: string; expect?: string; ssoProvider?: SsoProvider }
  | { cmd: "login"; profile: string; url?: string; wait?: boolean; profileDerived?: boolean }
  | { cmd: "await-login"; profile: string; sinceVersion?: number; timeoutMs?: number; saveEditor?: boolean }
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
    const verifyWithProfile = takeFlag(args, "--verify-with-profile")
    const noVerify = takeFlag(args, "--no-verify")
    const verifyFlag = takeFlag(args, "--verify")
    const mobile = takeFlag(args, "--mobile")
    const device = takeOption(args, "--device", { rejectHttp: true })
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
        },
        verifyAfter,
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
    return { status: "ok", command: { cmd: "await-login", profile: profileName, sinceVersion, timeoutMs, saveEditor } }
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
        const both = await checkThenVerify(parsed.command.opts, {
          verifyWithProfile: parsed.command.opts.verifyWithProfile,
        })
        const receipt = toAgentReceipt(both.check, { verify: both.verify })
        writeStdoutJson(receipt)
        return exitFromOk(receipt.ok)
      }
      const result = await runCheck(parsed.command.opts)
      const receipt = toAgentReceipt(result)
      writeStdoutJson(receipt)
      return exitFromOk(receipt.ok)
    }
    if (parsed.command.cmd === "finalize-login") {
      const result = await runFinalizeLogin({
        profile: parsed.command.profile,
        url: parsed.command.url,
        expect: parsed.command.expect,
        ssoProvider: parsed.command.ssoProvider,
      })
      const receipt = toAgentReceipt(result)
      writeStdoutJson(receipt)
      return exitFromOk(receipt.ok)
    }
    if (parsed.command.cmd === "login") {
      const runDir = await ensureRunDir()
      const result = await loginProfile(parsed.command.profile, parsed.command.url, undefined, undefined, {
        profileDerived: parsed.command.profileDerived,
      })
      if (result.handoff?.url) {
        const qr = await generateQRCode(qrPayloadForHandoff(result.handoff), runDir)
        if (qr.qrPath) attachHandoffQr(result, qr.qrPath, parsed.command.url)
      }
      if (!parsed.command.wait) {
        writeStdoutJson(stampSchema({ ok: true, ...result }))
        return 0
      }
      const waited = await liveAwaitLogin(
        parsed.command.profile,
        loginWaitAwaitOpts({ sinceVersion: result.sinceVersion, url: parsed.command.url }),
      )
      const payload = stampSchema({ ok: waited.status === "completed", ...result, wait: waited })
      writeStdoutJson(payload)
      return exitFromOk(payload.ok)
    }
    if (parsed.command.cmd === "await-login") {
      const waited = await liveAwaitLogin(parsed.command.profile, {
        sinceVersion: parsed.command.sinceVersion,
        timeoutMs: parsed.command.timeoutMs,
        saveEditor: parsed.command.saveEditor,
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
