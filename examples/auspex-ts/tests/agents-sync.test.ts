import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { parseArgv as cliParseArgv, USAGE } from "../src/cli.ts"
import {
  AWAIT_LOGIN_BEGIN,
  AWAIT_LOGIN_END,
  DOOR_AWAIT_BEGIN,
  DOOR_AWAIT_END,
  agentsAwaitLoginBullet,
  agentsDoorAwaitBlock,
  awaitLoginDescription,
  extractMarked,
  llmsDoorAwaitBlock,
} from "../src/door-await-contract.ts"
import {
  AWAIT_LOGIN_DESCRIPTION,
  } from "../src/tool-copy.ts"

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repo = path.resolve(pkg, "../..")

test("AGENTS first calls lead with login --url / derived slug; CH lives under Worked example", () => {
  for (const [label, file] of [["root AGENTS.md", path.join(repo, "AGENTS.md")]] as const) {
    const text = readFileSync(file, "utf8")
    const firstCalls = text.split("## First calls")[1]?.split("\n## ")[0] ?? ""
    const worked = text.split("## Worked example (dogfood)")[1] ?? ""
    const iron = firstCalls.indexOf("check --name ironadamant")
    const anyHost = firstCalls.indexOf('check https://example.com --expect "documentation examples"')
    const genericStatus = firstCalls.indexOf("profile-status --profile app-example --url")
    const genericLogin = firstCalls.indexOf("login --url https://app.example")
    const genericFinalize = firstCalls.indexOf("finalize-login --profile app-example --url")
    assert.notEqual(iron, -1, `${label} missing ironadamant check`)
    assert.ok(anyHost > iron, `${label} must show any-host check after ironadamant`)
    assert.ok(genericStatus > anyHost, `${label} must show derived-profile status after any-host`)
    assert.ok(genericLogin > genericStatus, `${label} must login --url after generic status`)
    assert.ok(genericFinalize > genericLogin, `${label} must finalize-login with derived slug + --url`)
    assert.match(firstCalls, /derives --profile app-example/)
    assert.match(firstCalls, /--profile <yours>/)
    assert.equal(
      firstCalls.includes("login --profile consistencyhub"),
      false,
      `${label} First calls must not send strangers to ConsistencyHub login`,
    )
    assert.equal(
      firstCalls.includes("check --name consistencyhub"),
      false,
      `${label} First calls must not default-check consistencyhub`,
    )
    const saveBeat = firstCalls.indexOf("tap Save on that page")
    const genericAwait = firstCalls.indexOf("await-login --profile app-example")
    assert.ok(saveBeat > genericLogin, `${label} must name human Save after generic login`)
    assert.ok(saveBeat < genericAwait, `${label} must put human Save before generic await-login`)
    assert.match(firstCalls, /Do not intern-ping/)
    assert.match(firstCalls, /auspex reap/)
    assert.match(firstCalls, /never --record/)
    assert.match(firstCalls, /npx auspex await-login --profile app-example --save-editor/)
    assert.equal(/\bnpx auspex desktop\b/.test(firstCalls), false, `${label} must not put desktop in First calls`)
    assert.match(text.slice(0, 400), /Alice-vs-Bob/)
    assert.match(worked, /npx auspex await-login --profile consistencyhub --save-editor/)
    assert.match(worked, /npx auspex check --name consistencyhub --verify-with-profile/)
    assert.match(worked, /claimOkProfile/)
    assert.match(worked, /[Dd]o \*+not\*+ fold `claimOkProfile`|do not fold `claimOkProfile`/)
    assert.match(worked, /not the default recipe/)
  }
})

test("door/await contract is generated from one source", () => {
  assert.equal(AWAIT_LOGIN_DESCRIPTION, awaitLoginDescription())
  assert.match(AWAIT_LOGIN_DESCRIPTION, /status \| do \| don't \| nextCall/)
  assert.match(AWAIT_LOGIN_DESCRIPTION, /Follow that row/)
  assert.match(AWAIT_LOGIN_DESCRIPTION, /Do not merge an IdP row with a fold row/)
  assert.match(AWAIT_LOGIN_DESCRIPTION, /stay separate rows/)
  assert.match(AWAIT_LOGIN_DESCRIPTION, /dead fold/)
  assert.equal(AWAIT_LOGIN_DESCRIPTION.includes("finalize-login NOW"), false)
  assert.equal(AWAIT_LOGIN_DESCRIPTION.includes("idpOnlyKind"), false)
  assert.equal(AWAIT_LOGIN_DESCRIPTION.includes("Do not remint to finish Microsoft"), false)
  assert.equal(/remint or finalize-now/.test(AWAIT_LOGIN_DESCRIPTION), false)
  const fold = agentsDoorAwaitBlock()
  const awaitBullet = agentsAwaitLoginBullet()
  assert.match(fold, /\| status \| do \| don't \| nextCall \|/)
  assert.match(fold, /Do not finalize\. Do not remint to finish Microsoft/)
  assert.match(fold, /There is no `nextCall`/)
  assert.match(fold, /needsHuman/)
  assert.equal(awaitBullet.includes("Do not remint to finish Microsoft"), false, "await bullet must not restate the app-visible row")
  assert.equal(awaitBullet.includes("idpOnlyKind"), false)
  const llms = llmsDoorAwaitBlock()
  assert.match(llms, /`app-visible`/)
  assert.match(llms, /do not finalize/)
  assert.match(llms, /Do not mint again to finish Microsoft/)
  assert.match(llms.split("\n")[1] ?? "", /sign-in-wall/)
  assert.equal(/finalize-login now/.test(llms.split("\n")[0] ?? ""), false)
  const rootOnly = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  assert.equal(extractMarked(rootOnly, DOOR_AWAIT_BEGIN, DOOR_AWAIT_END), fold)
  assert.equal(extractMarked(rootOnly, AWAIT_LOGIN_BEGIN, AWAIT_LOGIN_END), awaitBullet)
  const card = readFileSync(path.join(repo, "llms.txt"), "utf8")
  assert.equal(extractMarked(card, DOOR_AWAIT_BEGIN, DOOR_AWAIT_END), llms)
})

test("AGENT-CARD.md stays short, ships, and agrees with AGENTS.md", () => {
  const card = readFileSync(path.join(repo, "AGENT-CARD.md"), "utf8")
  const agents = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const words = card.split(/\s+/).filter(Boolean).length
  assert.ok(words < 1000, `the card is ${words} words; keep it under 1000`)
  // Same frozen reason list as the receipt schema in AGENTS.md.
  const reasons = ["matched", "loggedOut", "needsHuman", "mismatch", "network", "recordedLoggedIn", "expectMatchedPublicLanding", "hostChanged", "stream-expired"]
  for (const r of reasons) assert.match(card, new RegExp("`" + r + "`"), `card names reason ${r}`)
  // Every status the card tells an agent to act on is a real status in the contract.
  for (const status of ["idp-only-save", "app-visible", "sign-in-wall", "no-cdp", "cookie-strong", "local-storage-auth", "weakSeed", "emptySave", "botWall", "suggestedUrl", "claimOkProfile"]) {
    assert.match(card, new RegExp(status), `card names ${status}`)
    assert.match(agents, new RegExp(status), `AGENTS.md also names ${status}`)
  }
  // Every CLI command the card uses exists.
  const parseArgv = cliParseArgv
  for (const cmd of ["check", "connect", "sweep", "reap", "solari-health", "profiles"]) {
    assert.match(card, new RegExp(cmd), `card mentions ${cmd}`)
    const parsed = parseArgv([cmd])
    const message = parsed.status === "error" ? parsed.message : ""
    assert.equal(message.startsWith("unknown command"), false, `${cmd} is a real command`)
  }
  // The check above can fail: a made-up command is reported as unknown.
  const fake = parseArgv(["not-a-command"])
  assert.equal(fake.status === "error" && fake.message.startsWith("unknown command"), true)
  for (const rule of ["take it once", "Never hold one tool call open", "QR", "stateDir", "30 minutes", "five minutes"]) {
    assert.match(card, new RegExp(rule), `card keeps: ${rule}`)
  }
  const pkgJson = JSON.parse(readFileSync(path.join(repo, "package.json"), "utf8")) as { files: string[] }
  assert.ok(pkgJson.files.includes("AGENT-CARD.md"), "the card ships in the npm package")
  assert.match(agents, /\[AGENT-CARD\.md\]\(AGENT-CARD\.md\)/)
})

test("AGENTS.md's CLI reference is the CLI's own usage, line for line", () => {
  const agents = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const block = agents.slice(agents.indexOf("## CLI"), agents.indexOf("## MCP hosts"))
  const usageLines = USAGE.split("\n")
    .map((line) => line.trim())
    .filter((line) => /^npx auspex [a-z]/.test(line) && !line.includes("--name <ironadamant"))
  assert.ok(usageLines.length >= 15)
  for (const line of usageLines) assert.ok(block.includes(line), `AGENTS.md CLI block is missing or differs from: ${line}`)
})
