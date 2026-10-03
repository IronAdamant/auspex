import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { parseArgv, USAGE } from "../src/cli.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function runCli(args: string[]) {
  return spawnSync("npx", ["tsx", "src/cli.ts", ...args], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  })
}

test("USAGE leads with login --url and buries gated flags", () => {
  const commands = USAGE.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("npx auspex "))
  assert.match(commands[0] ?? "", /^npx auspex login --url <https>/)
  assert.match(commands[1] ?? "", /^npx auspex check <url>\|--url <url> --expect/)
  const check = commands[1] ?? ""
  for (const flag of ["--name", "--stealth", "--captcha", "--record", "--fill", "--click"]) {
    assert.equal(check.includes(flag), false, `first check line must not lead with ${flag}`)
  }
  const dogfood = USAGE.indexOf("Saved checks on the author's own sites")
  const leave = USAGE.indexOf("Leave alone")
  assert.ok(dogfood > 0)
  assert.ok(leave > dogfood)
  assert.match(USAGE.slice(dogfood, leave), /--name <ironadamant\|checkpoint\|consistencyhub>/)
  const buried = USAGE.slice(leave)
  for (const flag of ["--stealth", "--captcha", "--record", "--fill", "--click"]) {
    assert.match(buried, new RegExp(flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
})

test("USAGE documents check, login, and profiles", () => {
  assert.match(USAGE, /check/)
  assert.match(USAGE, /login/)
  assert.match(USAGE, /profiles/)
  assert.match(USAGE, /await-login/)
  assert.match(USAGE, /--save-profile/)
  assert.match(USAGE, /--wait/)
  assert.match(USAGE, /verify/)
  assert.match(USAGE, /--verify/)
  assert.match(USAGE, /desktop/)
  assert.match(USAGE, /handoff|door\.html/)
  assert.match(USAGE, /not retryable/)
  assert.match(USAGE, /auspex_reap/)
  assert.match(USAGE, /--wait-for/)
  assert.match(USAGE, /--captcha/)
  assert.match(USAGE, /--name/)
  assert.match(USAGE, /--no-verify/)
  assert.match(USAGE, /profile-status/)
  assert.match(USAGE, /trace/)
  assert.match(USAGE, /auspex job/)
  assert.match(USAGE, /job-status/)
  assert.match(USAGE, /AUSPEX_WAKE_WEBHOOK/)
  assert.match(USAGE, /login\.jsonl/)
  assert.match(USAGE, /--pack-receipts/)
  assert.match(USAGE, /--allow-page-actions/)
  assert.match(USAGE, /--account-wide/)
  assert.match(USAGE, /matched/)
  assert.match(USAGE, /schemaVersion/)
  assert.match(USAGE, /frozen/)
  assert.match(USAGE, /\bmcp\b/)
  assert.match(USAGE, /SOLARI_API_KEY/)
  assert.match(USAGE, /npx auspex/)
  assert.match(USAGE, /npx tsx src\/cli.ts/)
})

test("parseArgv check --sso", () => {
  const parsed = parseArgv([
    "check",
    "https://consistencyhub.io/login",
    "--expect",
    "Dashboard",
    "--profile",
    "consistencyhub",
    "--sso",
  ])
  assert.equal(parsed.status, "ok")
  if (parsed.status === "ok" && parsed.command.cmd === "check") {
    assert.equal(parsed.command.opts.sso, true)
    assert.equal(parsed.command.opts.profile, "consistencyhub")
  }
})

test("parseArgv --stealth=true is not a boolean flag", () => {
  const parsed = parseArgv([
    "check",
    "https://ironadamant.com",
    "--expect",
    "Build it.",
    "--stealth=true",
  ])
  assert.equal(parsed.status, "error")
  if (parsed.status === "error") assert.match(parsed.message, /unexpected/)
})

test("parseArgv login and profiles", () => {
  const login = parseArgv(["login", "--profile", "auspex-goal-test"])
  assert.equal(login.status, "ok")
  if (login.status === "ok") {
    assert.equal(login.command.cmd, "login")
    if (login.command.cmd === "login") assert.equal(login.command.profile, "auspex-goal-test")
  }
  const profiles = parseArgv(["profiles"])
  assert.equal(profiles.status, "ok")
  if (profiles.status === "ok") assert.equal(profiles.command.cmd, "profiles")
  const wait = parseArgv(["login", "--profile", "auspex-demo", "--wait"])
  assert.equal(wait.status, "ok")
  if (wait.status === "ok" && wait.command.cmd === "login") assert.equal(wait.command.wait, true)
  const awaitLogin = parseArgv(["await-login", "--profile", "auspex-demo", "--since-version", "10"])
  assert.equal(awaitLogin.status, "ok")
  if (awaitLogin.status === "ok" && awaitLogin.command.cmd === "await-login") {
    assert.equal(awaitLogin.command.profile, "auspex-demo")
    assert.equal(awaitLogin.command.sinceVersion, 10)
    assert.equal(awaitLogin.command.saveEditor, false)
  }
  const saveEditor = parseArgv(["await-login", "--profile", "auspex-demo", "--save-editor"])
  assert.equal(saveEditor.status, "ok")
  if (saveEditor.status === "ok" && saveEditor.command.cmd === "await-login") {
    assert.equal(saveEditor.command.saveEditor, true)
  }
})

test("shipped CLI --help lists check, login, profiles", () => {
  const help = runCli(["--help"])
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /check/)
  assert.match(help.stdout, /login/)
  assert.match(help.stdout, /profiles/)
  assert.match(help.stdout, /verify/)
  assert.match(help.stdout, /--verify/)
  assert.match(help.stdout, /desktop/)
  assert.match(help.stdout, /auspex_reap|solari_kill|solari_browser_close/)
  assert.match(help.stdout, /await-login/)
  assert.match(help.stdout, /--save-editor/)
  assert.match(help.stdout, /login --wait blocks until Save is signaled[\s\S]*--save-editor/)
  assert.match(help.stdout, /Clipboard Save is not the jar/)
  assert.match(help.stdout, /does not kill it/)
  assert.match(help.stdout, /--save-profile/)
  assert.match(help.stdout, /--name/)
  assert.match(help.stdout, /profile-status/)
  assert.match(help.stdout, /trace/)
  assert.match(help.stdout, /--all/)
  assert.match(help.stdout, /--pack-receipts/)
  assert.equal(help.stdout.includes("kill leftover sessions in the console"), false)
})

test("shipped CLI check --help lists login and profiles", () => {
  const help = runCli(["check", "--help"])
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /check/)
  assert.match(help.stdout, /login/)
  assert.match(help.stdout, /profiles/)
})

test("shipped CLI rejects empty and whitespace --expect", () => {
  const empty = runCli(["check", "https://ironadamant.com", "--expect", ""])
  assert.notEqual(empty.status, 0)
  assert.match(`${empty.stderr}${empty.stdout}`, /--expect/)
  const ws = runCli(["check", "https://ironadamant.com", "--expect", "   "])
  assert.notEqual(ws.status, 0)
  assert.match(`${ws.stderr}${ws.stdout}`, /--expect/)
})

test("shipped CLI rejects a non-https URL", () => {
  const bad = runCli(["check", "file:///tmp/x", "--expect", "Build it."])
  assert.notEqual(bad.status, 0)
  assert.match(`${bad.stderr}${bad.stdout}`, /http or https/)
})

test("shipped CLI rejects a userinfo URL", () => {
  const bad = runCli(["check", "https://user:pass@example.com/", "--expect", "x"])
  assert.notEqual(bad.status, 0)
  assert.match(`${bad.stderr}${bad.stdout}`, /http or https/)
})

test("shipped CLI does not take https as --profile", () => {
  const bad = runCli([
    "check",
    "--profile",
    "https://example.com",
    "--expect",
    "x",
    "https://ironadamant.com",
  ])
  assert.notEqual(bad.status, 0)
  assert.match(`${bad.stderr}${bad.stdout}`, /profile|URL|unexpected/i)
})

test("parseArgv rejects --record with --sso or --save-profile", () => {
  const sso = parseArgv([
    "check",
    "https://consistencyhub.io",
    "--expect",
    "Document Editor",
    "--sso",
    "--record",
  ])
  assert.equal(sso.status, "error")
  if (sso.status === "error") assert.match(sso.message, /logged-in|record/i)
  const save = parseArgv([
    "check",
    "https://consistencyhub.io",
    "--expect",
    "Document Editor",
    "--profile",
    "consistencyhub",
    "--save-profile",
    "--record",
    "--allow-record-profile",
  ])
  assert.equal(save.status, "error")
  if (save.status === "error") assert.match(save.message, /logged-in|record/i)
})

test("parseArgv rejects --record with --profile unless override is set", () => {
  const blocked = parseArgv([
    "check",
    "https://ironadamant.com",
    "--expect",
    "Build it.",
    "--profile",
    "demo",
    "--record",
  ])
  assert.equal(blocked.status, "error")
  if (blocked.status === "error") assert.match(blocked.message, /allow-record-profile|record/i)
  const ok = parseArgv([
    "check",
    "https://ironadamant.com",
    "--expect",
    "Build it.",
    "--profile",
    "demo",
    "--record",
    "--allow-record-profile",
  ])
  assert.equal(ok.status, "ok")
  if (ok.status === "ok" && ok.command.cmd === "check") {
    assert.equal(ok.command.opts.allowRecordProfile, true)
    assert.equal(ok.command.opts.record, true)
    assert.equal(ok.command.opts.profile, "demo")
  }
  const hub = parseArgv([
    "check",
    "--name",
    "consistencyhub",
    "--record",
    "--allow-record-profile",
  ])
  assert.equal(hub.status, "error")
  if (hub.status === "error") assert.match(hub.message, /consistencyhub/i)
})

test("shipped CLI rejects loopback check URLs without launching Solari", () => {
  const bad = runCli(["check", "http://localhost:3000", "--expect", "x"])
  assert.notEqual(bad.status, 0)
  assert.match(`${bad.stderr}${bad.stdout}`, /loopback|cloud Chrome|agent machine/i)
})

test("shipped CLI rejects --record with --profile", () => {
  const bad = runCli([
    "check",
    "https://ironadamant.com",
    "--expect",
    "Build it.",
    "--profile",
    "consistencyhub",
    "--record",
  ])
  assert.notEqual(bad.status, 0)
  assert.match(`${bad.stderr}${bad.stdout}`, /allow-record-profile|record/i)
})

test("shipped CLI rejects whitespace-only --profile", () => {
  const check = runCli(["check", "https://ironadamant.com", "--expect", "Build it.", "--profile", "   "])
  assert.notEqual(check.status, 0)
  assert.match(`${check.stderr}${check.stdout}`, /profile name/i)
  const login = runCli(["login", "--profile", "   "])
  assert.notEqual(login.status, 0)
  assert.match(`${login.stderr}${login.stdout}`, /profile name/i)
})

test("parseArgv check click/fill/wait-for and proxy", () => {
  const parsed = parseArgv([
    "check",
    "https://ironadamant.com",
    "--expect",
    "Build it.",
    "--wait-for",
    "#main",
    "--fill",
    "#q",
    "--value",
    "hello",
    "--click",
    "button.submit",
    "--proxy",
    "us",
    "--captcha",
  ])
  assert.equal(parsed.status, "ok", parsed.status === "error" ? parsed.message : "")
  if (parsed.status === "ok" && parsed.command.cmd === "check") {
    assert.equal(parsed.command.opts.waitFor, "#main")
    assert.equal(parsed.command.opts.fill, "#q")
    assert.equal(parsed.command.opts.value, "hello")
    assert.equal(parsed.command.opts.click, "button.submit")
    assert.equal(parsed.command.opts.proxy, "us")
    assert.equal(parsed.command.opts.captcha, true)
    assert.equal(parsed.command.opts.stealth, false)
    assert.equal(parsed.command.opts.saveProfile, false)
  }
})

test("parseArgv rejects fill/click with a profile unless --allow-page-actions", () => {
  const blocked = parseArgv([
    "check",
    "--name",
    "consistencyhub",
    "--click",
    "button.export",
  ])
  assert.equal(blocked.status, "error")
  if (blocked.status === "error") assert.match(blocked.message, /allow-page-actions/i)
  const ok = parseArgv([
    "check",
    "--name",
    "consistencyhub",
    "--click",
    "button.export",
    "--allow-page-actions",
  ])
  assert.equal(ok.status, "ok")
  if (ok.status === "ok" && ok.command.cmd === "check") {
    assert.equal(ok.command.opts.allowPageActions, true)
    assert.equal(ok.command.opts.click, "button.export")
  }
})

test("parseArgv check --save-profile", () => {
  const parsed = parseArgv([
    "check",
    "https://example.com",
    "--expect",
    "Example Domain",
    "--profile",
    "auspex-demo",
    "--save-profile",
  ])
  assert.equal(parsed.status, "ok")
  if (parsed.status === "ok" && parsed.command.cmd === "check") {
    assert.equal(parsed.command.opts.saveProfile, true)
    assert.equal(parsed.command.opts.profile, "auspex-demo")
  }
})

test("parseArgv reap and desktop --expect", () => {
  const reap = parseArgv(["reap", "--dry-run", "--session", "sess-1"])
  assert.equal(reap.status, "ok")
  if (reap.status === "ok" && reap.command.cmd === "reap") {
    assert.equal(reap.command.dryRun, true)
    assert.equal(reap.command.sessionId, "sess-1")
  }
  const wide = parseArgv(["reap", "--account-wide"])
  assert.equal(wide.status, "ok")
  if (wide.status === "ok" && wide.command.cmd === "reap") {
    assert.equal(wide.command.accountWide, true)
  }
  const desk = parseArgv(["desktop", "--open", "mousepad", "--expect", "mousepad"])
  assert.equal(desk.status, "ok")
  if (desk.status === "ok" && desk.command.cmd === "desktop") {
    assert.equal(desk.command.expect, "mousepad")
    assert.equal(desk.command.open, "mousepad")
  }
})
test("parseArgv check --name uses saved checks and verifies by default", () => {
  const named = parseArgv(["check", "--name", "ironadamant"])
  assert.equal(named.status, "ok")
  if (named.status === "ok" && named.command.cmd === "check") {
    assert.equal(named.command.opts.url, "https://ironadamant.com")
    assert.equal(named.command.opts.expect, "One office job.")
    assert.equal(named.command.verifyAfter, true)
  }
  const hub = parseArgv(["check", "--name", "consistencyhub"])
  assert.equal(hub.status, "ok")
  if (hub.status === "ok" && hub.command.cmd === "check") {
    assert.equal(hub.command.opts.profile, "consistencyhub")
    assert.equal(hub.command.opts.expect, "Document Editor")
    assert.equal(hub.command.opts.sso, false)
    assert.equal(hub.command.opts.record, false)
    assert.equal(hub.command.verifyAfter, false, "consistencyhub skips anonymous verify by default")
  }
  const skip = parseArgv(["check", "--name", "checkpoint", "--no-verify"])
  assert.equal(skip.status, "ok")
  if (skip.status === "ok" && skip.command.cmd === "check") {
    assert.equal(skip.command.verifyAfter, false)
    assert.equal(skip.command.opts.expect, "Checkpoint")
  }
})

test("parseArgv rejects --record with a dashboard landing URL", () => {
  const parsed = parseArgv([
    "check",
    "https://consistencyhub.io/dashboard",
    "--expect",
    "Document Editor",
    "--record",
  ])
  assert.equal(parsed.status, "error")
  if (parsed.status === "error") assert.match(parsed.message, /logged-in|record|dashboard/i)
})

test("parseArgv profile-status and reap --pack-receipts", () => {
  const status = parseArgv(["profile-status", "--name", "consistencyhub"])
  assert.equal(status.status, "ok")
  if (status.status === "ok" && status.command.cmd === "profile-status") {
    assert.equal(status.command.name, "consistencyhub")
  }
  const probed = parseArgv([
    "profile-status",
    "--profile",
    "app-example",
    "--url",
    "https://app.example",
    "--expect",
    "Workspace ready",
  ])
  assert.equal(probed.status, "ok")
  if (probed.status === "ok" && probed.command.cmd === "profile-status") {
    assert.equal(probed.command.profile, "app-example")
    assert.equal(probed.command.url, "https://app.example")
    assert.equal(probed.command.expect, "Workspace ready")
  }
  const emptyExpect = parseArgv(["profile-status", "--profile", "app-example", "--expect", ""])
  assert.equal(emptyExpect.status, "error")
  if (emptyExpect.status === "error") assert.match(emptyExpect.message, /non-empty/)
  const reap = parseArgv(["reap", "--dry-run", "--pack-receipts"])
  assert.equal(reap.status, "ok")
  if (reap.status === "ok" && reap.command.cmd === "reap") {
    assert.equal(reap.command.packReceipts, true)
    assert.equal(reap.command.dryRun, true)
  }
})

test("parseArgv desktop takes no extra args", () => {
  const a = parseArgv(["desktop"])
  assert.equal(a.status, "ok")
  if (a.status === "ok") assert.equal(a.command.cmd, "desktop")
  const b = parseArgv(["desktop", "extra"])
  assert.equal(b.status, "error")
})

test("parseArgv ad-hoc auth URL + profile skips anonymous verify; public marketing does not", () => {
  const onedrive = parseArgv([
    "check",
    "https://onedrive.live.com/",
    "--expect",
    "My files",
    "--profile",
    "consistencyhub",
  ])
  assert.equal(onedrive.status, "ok")
  if (onedrive.status === "ok" && onedrive.command.cmd === "check") {
    assert.equal(onedrive.command.verifyAfter, false, "OneDrive + profile must not default-verify anonymously")
  }
  const adHocCh = parseArgv([
    "check",
    "https://consistencyhub.io",
    "--expect",
    "Document Editor",
    "--profile",
    "consistencyhub",
  ])
  assert.equal(adHocCh.status, "ok")
  if (adHocCh.status === "ok" && adHocCh.command.cmd === "check") {
    assert.equal(adHocCh.command.verifyAfter, false, "ad-hoc CH URL + profile skips anonymous verify")
  }
  const publicWithProfile = parseArgv([
    "check",
    "https://ironadamant.com",
    "--expect",
    "One office job.",
    "--profile",
    "demo",
  ])
  assert.equal(publicWithProfile.status, "ok")
  if (publicWithProfile.status === "ok" && publicWithProfile.command.cmd === "check") {
    assert.equal(publicWithProfile.command.verifyAfter, true, "public marketing still verifies with a leftover profile")
  }
  const unknownHost = parseArgv([
    "check",
    "https://app.example.com",
    "--expect",
    "Dashboard",
    "--profile",
    "acme",
  ])
  assert.equal(unknownHost.status, "ok")
  if (unknownHost.status === "ok" && unknownHost.command.cmd === "check") {
    assert.equal(unknownHost.command.verifyAfter, false, "unknown host + profile skips anonymous verify")
  }
  const noProfile = parseArgv(["check", "https://app.example.com", "--expect", "Dashboard"])
  assert.equal(noProfile.status, "ok")
  if (noProfile.status === "ok" && noProfile.command.cmd === "check") {
    assert.equal(noProfile.command.verifyAfter, true, "no profile still verifies")
  }
})

test("parseArgv --verify-with-profile enables verifyAfter for consistencyhub", () => {
  const withProfile = parseArgv(["check", "--name", "consistencyhub", "--verify-with-profile"])
  assert.equal(withProfile.status, "ok")
  if (withProfile.status === "ok" && withProfile.command.cmd === "check") {
    assert.equal(withProfile.command.opts.profile, "consistencyhub")
    assert.equal(withProfile.command.opts.verifyWithProfile, true)
    assert.equal(withProfile.command.verifyAfter, true, "--verify-with-profile should enable verifyAfter")
  }
  const explicitVerify = parseArgv(["check", "--name", "consistencyhub", "--verify"])
  assert.equal(explicitVerify.status, "ok")
  if (explicitVerify.status === "ok" && explicitVerify.command.cmd === "check") {
    assert.equal(explicitVerify.command.verifyAfter, true, "--verify should enable verifyAfter")
  }
  const explicitNoVerify = parseArgv(["check", "--name", "consistencyhub", "--no-verify"])
  assert.equal(explicitNoVerify.status, "ok")
  if (explicitNoVerify.status === "ok" && explicitNoVerify.command.cmd === "check") {
    assert.equal(explicitNoVerify.command.verifyAfter, false, "--no-verify should disable verifyAfter")
  }
})

test("option values may start with a dash; a following flag is still not a value", async () => {
  const { parseArgv } = await import("../src/cli.ts")
  const ok = parseArgv(["check", "https://example.com", "--expect", "-20% off"])
  assert.equal(ok.status, "ok")
  if (ok.status === "ok" && ok.command.cmd === "check") assert.equal(ok.command.opts.expect, "-20% off")
  const missing = parseArgv(["check", "https://example.com", "--expect", "--no-verify"])
  assert.equal(missing.status, "error")
})

test("job and connect read a dash-leading value the same way check does", async () => {
  const { parseArgv } = await import("../src/cli.ts")
  const job = parseArgv(["job", "--url", "https://app.example", "--expect", "-20% off"])
  assert.equal(job.status, "ok")
  if (job.status === "ok" && job.command.cmd === "job") assert.equal(job.command.opts.expect, "-20% off")
  const connect = parseArgv(["connect", "https://app.example", "--expect", "-20% off"])
  assert.equal(connect.status, "ok")
  if (connect.status === "ok" && connect.command.cmd === "connect" && connect.command.connect.mode === "run") {
    assert.equal(connect.command.connect.opts.expect, "-20% off")
  }
  // A flag in the value's place is still not a value, in every command.
  assert.equal(parseArgv(["job", "--url", "https://app.example", "--expect", "-v"]).status, "error")
  assert.equal(parseArgv(["connect", "https://app.example", "--expect", "-v"]).status, "error")
})

test("every command's --help prints help, wherever it sits", async () => {
  const { parseArgv } = await import("../src/cli.ts")
  for (const cmd of ["check", "login", "await-login", "finalize-login", "profiles", "profile-status", "solari-health", "reap", "desktop", "trace", "verify", "job", "job-status", "connect", "sweep", "mcp"]) {
    assert.deepEqual(parseArgv([cmd, "--help"]), { status: "ok", command: { cmd: "help" } }, cmd)
    assert.deepEqual(parseArgv([cmd, "--bogus", "-h"]), { status: "ok", command: { cmd: "help" } }, cmd)
  }
})

test("sweep parses --plan and --notify and refuses a non-http notify", async () => {
  const { parseArgv } = await import("../src/cli.ts")
  assert.deepEqual(parseArgv(["sweep", "--plan", "plan.json"]), { status: "ok", command: { cmd: "sweep", planPath: "plan.json", notify: undefined } })
  assert.equal(parseArgv(["sweep"]).status, "error")
  assert.equal(parseArgv(["sweep", "--plan", "p.json", "--notify", "file:///x"]).status, "error")
})

test("check takes its URL positionally or as --url, like login, job and connect", async () => {
  const { parseArgv } = await import("../src/cli.ts")
  for (const argv of [
    ["check", "https://app.example", "--expect", "Hi", "--profile", "app"],
    ["check", "--profile", "app", "--url", "https://app.example", "--expect", "Hi", "--verify-with-profile"],
  ]) {
    const parsed = parseArgv(argv)
    assert.equal(parsed.status, "ok", argv.join(" "))
    if (parsed.status === "ok" && parsed.command.cmd === "check") assert.equal(parsed.command.opts.url, "https://app.example")
  }
  assert.equal(parseArgv(["check", "https://a.example", "--url", "https://b.example", "--expect", "Hi"]).status, "error")
})

test("the commands connect prints for next time and for a retry parse", async () => {
  const { parseArgv } = await import("../src/cli.ts")
  const { connectOutcome } = await import("../src/connect.ts")
  const base = { schemaVersion: 1 as const, jobId: "job-1", profile: "tldraw-com", url: "https://www.tldraw.com", expect: 'My "big" workspace', createdAt: "", updatedAt: "" }
  const lines = [
    ...connectOutcome({ ...base, phase: "completed", status: "completed", ok: true, reason: "matched", claimOkProfile: true }).detail,
    ...connectOutcome({ ...base, phase: "failed", status: "failed", ok: false, reason: "exhausted retries", seedReadiness: { solariSaveReady: true } as never }).detail,
  ]
  const commands = lines.map((l) => l.replace(/^Next time: /, "")).filter((l) => /^npx auspex(-solari)? check /.test(l))
  assert.equal(commands.length, 2)
  for (const command of commands) {
    const args = [...command.replace(/^npx auspex(-solari)? /, "").matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)].map((m) => (m[1] ?? m[2]!).replace(/\\(.)/g, "$1"))
    const parsed = parseArgv(args)
    assert.equal(parsed.status, "ok", `${command} -> ${parsed.status === "error" ? parsed.message : ""}`)
    if (parsed.status === "ok" && parsed.command.cmd === "check") {
      assert.equal(parsed.command.opts.expect, 'My "big" workspace')
      assert.equal(parsed.command.opts.verifyWithProfile, true)
    }
  }
})

test("every auspex command in the docs' code blocks parses", async () => {
  const { readFileSync } = await import("node:fs")
  const { parseArgv } = await import("../src/cli.ts")
  const repo = path.resolve(root, "..", "..")
  const files = ["AGENTS.md", "AGENT-CARD.md", "README.md", "RECEIPTS.md", "docs/HOSTS.md", "docs/REVIEWER-5MIN.md", "docs/ops-runbook.md", "docs/index.html", ".cursor/rules/auspex.mdc", "examples/auspex-ts/README.md", "examples/auspex-ts/DEMO.md"]
  let checked = 0
  for (const file of files) {
    const text = readFileSync(path.join(repo, file), "utf8").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    const blocks = [...text.matchAll(/```[a-z]*\n([\s\S]*?)```|<pre[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => m[1] ?? m[2] ?? "")
    for (const block of blocks) {
      for (const raw of block.replace(/\\\n\s*/g, " ").split("\n")) {
        const m = /^\s*npx (?:auspex(?:-solari)?|tsx src\/cli\.ts) (.*)$/.exec(raw.replace(/\s+#.*$/, ""))
        if (!m || /[<…]|\.\.\./.test(m[1]!)) continue
        const args = [...m[1]!.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g)].map((x) => x[1] ?? x[2] ?? x[3]!)
        const parsed = parseArgv(args)
        assert.equal(parsed.status, "ok", `${file}: ${raw.trim()} -> ${parsed.status === "error" ? parsed.message : ""}`)
        checked += 1
      }
    }
  }
  assert.ok(checked >= 40, `only ${checked} doc commands found`)
})
