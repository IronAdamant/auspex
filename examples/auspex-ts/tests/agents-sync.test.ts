import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { USAGE } from "../src/cli.ts"
import {
  APP_VISIBLE_REFUSE,
  AWAIT_LOGIN_BEGIN,
  AWAIT_LOGIN_END,
  DOOR_AWAIT_BEGIN,
  DOOR_AWAIT_END,
  SIGN_IN_WALL_REMIN,
  agentsAwaitLoginBullet,
  agentsFoldBullet,
  awaitLoginDescription,
  extractMarked,
  llmsDoorAwaitBlock,
} from "../src/door-await-contract.ts"
import {
  AWAIT_LOGIN_DESCRIPTION,
  CHECK_DESCRIPTION,
  LOGIN_DESCRIPTION,
  TRACE_DESCRIPTION,
} from "../src/tool-copy.ts"

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repo = path.resolve(pkg, "../..")

test("root and package AGENTS agree on P0/P1 contract facts", () => {
  const root = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const pack = readFileSync(path.join(pkg, "AGENTS.md"), "utf8")
  const copy = [CHECK_DESCRIPTION, LOGIN_DESCRIPTION, TRACE_DESCRIPTION].join("\n")
  for (const needle of [
    "--mobile",
    "--device",
    "weakSeed",
    "emptySave",
    "openOnPhone",
    "oneLiner",
    "qrPath",
    "auspex_finalize_login",
    "verify=false",
    "phone's own Safari or Chrome",
    "noVNC",
    "mobileUrl",
    "desktopUrl",
    "real text field",
    "phone.html",
    "door.html",
    "desktop.html",
    "saveEditor",
    "GET editor HTTP 401",
    "expectMatchedPublicLanding",
    "One Dashboard",
  ]) {
    assert.match(root, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `root AGENTS missing ${needle}`)
    assert.match(pack, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `package AGENTS missing ${needle}`)
  }
  assert.match(USAGE, /--mobile/)
  assert.match(USAGE, /--device/)
  assert.match(USAGE, /finalize-login/)
  assert.match(USAGE, /--save-editor/)
  assert.match(USAGE, /expectMatchedPublicLanding/)
  assert.match(USAGE, /npx auspex login \[--profile <name>\] \[--url <https>\]/)
  assert.match(USAGE, /AGENTS\.md/)
  assert.match(copy, /expectMatchedPublicLanding/)
  assert.match(copy, /real text field/)
  assert.match(copy, /door\.html/)
  assert.match(copy, /defaults to verify=false/)
  assert.match(copy, /host slug/)
  for (const [label, text] of [
    ["root AGENTS.md", root],
    ["package AGENTS.md", pack],
    ["USAGE", USAGE],
    ["tool-copy.ts", copy],
  ] as const) {
    assert.equal(text.includes("gateUrl"), false, `${label} must not teach the detecting-gate URL`)
  }
})

test("docs doors do not teach pre-#38 ok or flatten verify vs verifyWithProfile", () => {
  const rootReadme = readFileSync(path.join(repo, "README.md"), "utf8")
  const packReadme = readFileSync(path.join(pkg, "README.md"), "utf8")
  const pitch = readFileSync(path.join(repo, "PITCH.md"), "utf8")
  const security = readFileSync(path.join(pkg, "SECURITY.md"), "utf8")
  const rootAgents = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const packAgents = readFileSync(path.join(pkg, "AGENTS.md"), "utf8")
  const cursorRule = readFileSync(path.join(repo, ".cursor", "rules", "auspex.mdc"), "utf8")

  assert.equal(packReadme.includes("ok is protocol success"), false, "package README must not teach pre-#38 ok")
  assert.match(packReadme, /finalize-login/)
  assert.match(packReadme, /--verify-with-profile/)
  assert.match(packReadme, /weakSeed|emptySave/)
  assert.match(packReadme, /auspex_finalize_login/)

  assert.match(rootReadme, /auspex_finalize_login/)
  assert.match(rootReadme, /weakSeed/)
  assert.match(rootReadme, /emptySave/)
  assert.match(rootReadme, /claimOkProfile/)

  assert.equal(pitch.includes("After anonymous verify"), false, "PITCH must not say VWP runs after anonymous verify")
  assert.match(pitch, /Skips\*\* anonymous claim|Skips anonymous claim/)

  assert.equal(security.includes("232/235"), false, "SECURITY must not ship a rotting test-count")
  assert.match(security, /npm test/)

  assert.match(rootAgents, /FAIL-CLOSED `--type`/)
  assert.match(packAgents, /FAIL-CLOSED `--type`/)
  assert.match(rootAgents, /verify=true.*is not.*verifyWithProfile|not `verifyWithProfile`/)
  assert.match(packAgents, /verify=true.*is not.*verifyWithProfile|not `verifyWithProfile`/)

  assert.match(CHECK_DESCRIPTION, /They are not equivalent/)
  assert.match(CHECK_DESCRIPTION, /claimOkProfile/)
  assert.match(USAGE, /They are not the same/)
  assert.match(USAGE, /FAIL-CLOSED --type/)

  assert.match(cursorRule, /verify-with-profile/)
  assert.match(cursorRule, /auspex_finalize_login/)
  assert.match(cursorRule, /auspex_login/)
  assert.match(cursorRule, /phone's own Safari or Chrome/)
  assert.match(cursorRule, /mobileUrl/)
  assert.match(cursorRule, /desktopUrl/)
  assert.match(cursorRule, /noVNC|remote Chromium live view/)
  assert.match(cursorRule, /real text field/)
  assert.match(cursorRule, /phone.html/)
  assert.equal(cursorRule.includes("gateUrl"), false, "Cursor rule must not teach the detecting-gate URL")
  assert.match(cursorRule, /weakSeed/)
  assert.equal(
    cursorRule.includes("Never ping the user to sign in"),
    false,
    "Cursor rule must not tell agents to hide the login URL",
  )
  assert.equal(
    cursorRule.includes("profile on consistencyhub.io / onedrive.live.com"),
    false,
    "Cursor rule must not teach the old two-host anonymous-verify skip",
  )
  assert.equal(
    /defaults to ConsistencyHub/i.test(cursorRule),
    false,
    "Cursor rule must not teach finalize-login always defaulting to ConsistencyHub",
  )
  assert.match(cursorRule, /any attached profile on a non-public-marketing URL/)
  assert.match(cursorRule, /unknown profiles require `--url` and `--expect`/)
  assert.match(cursorRule, /weakSeed/)
  assert.match(cursorRule, /counted `sessionStorage === 0`|counted sessionStorage/)
  assert.match(cursorRule, /remint or finalize-now|Remint now/)
  assert.match(cursorRule, /dead fold|claimOkProfile will not pass/)
})

test("AGENTS first calls lead with login --url / derived slug; CH lives under Worked example", () => {
  for (const [label, file] of [
    ["root AGENTS.md", path.join(repo, "AGENTS.md")],
    ["package AGENTS.md", path.join(pkg, "AGENTS.md")],
  ] as const) {
    const text = readFileSync(file, "utf8")
    const firstCalls = text.split("## First calls")[1]?.split("\n## ")[0] ?? ""
    const worked = text.split("## Worked example (dogfood)")[1] ?? ""
    const iron = firstCalls.indexOf("check --name ironadamant")
    const anyHost = firstCalls.indexOf('check https://example.com --expect "Example Domain"')
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

test("copy-paste fences put --save-editor on the typed await-login line", () => {
  const pages = readFileSync(path.join(repo, "docs", "index.html"), "utf8")
  const demo = readFileSync(path.join(pkg, "DEMO.md"), "utf8")
  const tryIt = pages.split("<h2>Try it</h2>")[1] ?? ""
  const golden = demo.split("## Worked example (dogfood)")[0] ?? ""
  const worked = demo.split("## Worked example (dogfood)")[1] ?? ""
  assert.match(tryIt, /login --url https:\/\/app\.example/)
  assert.match(tryIt, /await-login --profile app-example --save-editor/)
  assert.match(tryIt, /finalize-login --profile app-example/)
  assert.equal(tryIt.includes("consistencyhub"), false, "Pages Try it must not name consistencyhub")
  assert.ok(
    tryIt.indexOf("await-login --profile app-example --save-editor") < tryIt.indexOf("finalize-login --profile app-example"),
    "Pages Try it must await-login --save-editor before finalize-login",
  )
  assert.match(golden, /await-login --profile app-example --save-editor/)
  assert.equal(
    golden.includes("login --profile consistencyhub"),
    false,
    "DEMO golden path must not default to consistencyhub login",
  )
  assert.match(worked, /await-login --profile consistencyhub --save-editor/)
})

test("package README Run fence is login --url → await --save-editor → finalize → check, no trailing verify", () => {
  const pack = readFileSync(path.join(pkg, "README.md"), "utf8")
  const run = pack.split("## Run")[1]?.split("### Commands")[0] ?? ""
  const login = run.indexOf("npx auspex login --url https://app.example")
  const awaitLogin = run.indexOf("npx auspex await-login --profile app-example --save-editor")
  const finalize = run.indexOf("npx auspex finalize-login --profile app-example --url")
  const check = run.indexOf("npx auspex check --profile app-example --url")
  assert.notEqual(login, -1, "Run fence missing login --url")
  assert.notEqual(awaitLogin, -1, "Run fence missing await-login --save-editor")
  assert.notEqual(finalize, -1, "Run fence missing finalize-login derived slug")
  assert.notEqual(check, -1, "Run fence missing check derived slug")
  assert.ok(login < awaitLogin, "Run fence must login before await-login")
  assert.ok(awaitLogin < finalize, "Run fence must await-login before finalize")
  assert.ok(finalize < check, "Run fence must finalize before check")
  assert.equal(run.includes("login --profile consistencyhub"), false, "Run fence must not default to consistencyhub")
  assert.equal(run.includes("npx auspex verify"), false, "do not run auspex verify after a default check")
  const worked = pack.split("## Worked example (dogfood)")[1] ?? ""
  assert.match(worked, /npx auspex check --name consistencyhub --verify-with-profile/)
})

test("root README first screen is For Reviewers + watch URL", () => {
  const rootReadme = readFileSync(path.join(repo, "README.md"), "utf8")
  const first = rootReadme.split("\n").slice(0, 80).join("\n")
  assert.match(first, /For Reviewers/)
  assert.match(first, /https:\/\/ironadamant\.com\/auspex\//)
  assert.match(first, /npx auspex-solari check --name ironadamant/)
  assert.match(first, /auspex-mcp/)
  assert.equal(first.includes("cdn.jsdelivr.net/gh/IronAdamant/auspex@main/examples/auspex-ts/demo/replay.html"), false)
  assert.match(first, /[Pp]ublic check/)
  assert.match(first, /[Aa]uth-gated/)
  assert.match(first, /measured public check|Measured public check/)
  assert.match(first, /[Rr]edacted demo/)
  assert.match(first, /Auth-gated evidence/)
  assert.match(first, /consistencyhub-receipt\.json/)
  assert.match(first, /redacted auth-gated SaaS demo/)
  assert.match(first, /--profile <yours>|login --url/)
  assert.equal(
    /login --profile consistencyhub/.test(first.split("## Worked example")[0] ?? first),
    false,
    "README first screen must not default-login consistencyhub",
  )
  assert.match(first, /Alice-vs-Bob/)
  assert.match(first, /Issues.*skip/i)
  assert.equal(first.includes("no public GitHub Issues tracker"), false)
})

test("root README shipped bullets match shouldVerifyCheck and resolveFinalizeLoginTarget", () => {
  const rootReadme = readFileSync(path.join(repo, "README.md"), "utf8")
  const pagesYml = readFileSync(path.join(repo, ".github", "workflows", "pages.yml"), "utf8")
  assert.equal(
    rootReadme.includes("profile on consistencyhub.io / onedrive.live.com"),
    false,
    "README must not teach the old two-host anonymous-verify skip",
  )
  assert.equal(
    rootReadme.includes("Defaults to ConsistencyHub URL and expect"),
    false,
    "README must not teach finalize-login always defaulting to ConsistencyHub",
  )
  assert.match(rootReadme, /any attached profile on a non-public-marketing URL/)
  assert.match(rootReadme, /unknown profiles require `--url` and `--expect`/)
  assert.match(rootReadme, /tap Save/)
  assert.match(rootReadme, /--save-editor/)
  assert.match(rootReadme, /phone keyboard/)
  assert.match(pagesYml, /enablement:\s*true/)
})

test("clone MCP and replay stub stay honest after slim", () => {
  const rootReadme = readFileSync(path.join(repo, "README.md"), "utf8")
  const packReadme = readFileSync(path.join(pkg, "README.md"), "utf8")
  const rootAgents = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const packAgents = readFileSync(path.join(pkg, "AGENTS.md"), "utf8")
  const cursorRule = readFileSync(path.join(repo, ".cursor", "rules", "auspex.mdc"), "utf8")
  const grok = readFileSync(path.join(pkg, "grok.mcp.example.toml"), "utf8")
  const cursorExample = readFileSync(path.join(pkg, "mcp.cursor.example.json"), "utf8")
  const claudeExample = readFileSync(path.join(pkg, "mcp.claude.example.json"), "utf8")
  const runJs = readFileSync(path.join(pkg, "bin", "run.mjs"), "utf8")
  const receipt = JSON.parse(readFileSync(path.join(pkg, "demo", "receipt.json"), "utf8")) as { note?: string }
  const index = readFileSync(path.join(repo, "docs", "index.html"), "utf8")
  const discord = readFileSync(path.join(repo, "docs", "showcase", "DISCORD.md"), "utf8")
  const saveDemo = readFileSync(path.join(pkg, "scripts", "save-demo-receipt.ts"), "utf8")

  for (const [label, text] of [
    ["root AGENTS.md", rootAgents],
    ["package AGENTS.md", packAgents],
    ["root README.md", rootReadme],
    ["package README.md", packReadme],
    ["Cursor rule", cursorRule],
    ["grok.mcp.example.toml", grok],
    ["mcp.cursor.example.json", cursorExample],
    ["mcp.claude.example.json", claudeExample],
  ] as const) {
    assert.match(text, /build:mcp/, `${label} must name npm run build:mcp for clone MCP`)
  }
  assert.match(runJs, /DistMissing/)
  assert.match(runJs, /spawnAuspexMcp/)
  assert.equal(
    (receipt.note ?? "").includes("open demo/replay.html"),
    false,
    "demo receipt must not tell strangers to open the committed stub as the player",
  )
  assert.match(receipt.note ?? "", /stub/)
  assert.match(receipt.note ?? "", /ironadamant\.com\/auspex\/demo\/replay\.html/)
  assert.match(receipt.note ?? "", /generate:replay/)
  assert.match(index, /committed repo file/)
  assert.match(index, /stub/)
  assert.match(discord, /committed repo `demo\/replay\.html`/)
  assert.match(discord, /stub/)
  assert.match(saveDemo, /Does not overwrite the committed demo\/replay\.html stub/)
})

test("honesty leftovers: desktop demo, dual LICENSE, OneDrive recipe-only", () => {
  const rootReadme = readFileSync(path.join(repo, "README.md"), "utf8")
  const packReadme = readFileSync(path.join(pkg, "README.md"), "utf8")
  const license = readFileSync(path.join(repo, "LICENSE"), "utf8")
  const receipts = readFileSync(path.join(repo, "RECEIPTS.md"), "utf8")
  const rootAgents = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const packAgents = readFileSync(path.join(pkg, "AGENTS.md"), "utf8")
  const pitch = readFileSync(path.join(repo, "PITCH.md"), "utf8")
  const deferred = readFileSync(path.join(pkg, "docs", "archive", "deferred-check-2026-09-19.md"), "utf8")

  assert.match(rootReadme, /named Solari sandbox Mousepad demo/)
  assert.match(rootReadme, /402 on Free/)
  assert.match(packReadme, /named Solari sandbox demo \(default Mousepad\)/)
  assert.match(packReadme, /402 on Free/)
  assert.match(USAGE, /desktop/)

  assert.match(license, /Copyright \(c\) 2026 Pinetree Research/)
  assert.match(license, /Copyright \(c\) 2026 Iron Adamant/)

  assert.match(rootReadme, /auth \+ hygiene doors/)
  assert.match(rootAgents, /auth \+ hygiene doors/)
  assert.match(packAgents, /auth \+ hygiene doors/)
  assert.match(pitch, /auth \+ hygiene doors/)

  assert.match(rootAgents, /no raw OneDrive PNG/)
  assert.match(packAgents, /no raw OneDrive PNG/)
  assert.match(receipts, /no raw OneDrive PNG|No raw OneDrive PNG/)
  assert.match(receipts, /onedrive-receipt\.json/)
  assert.match(receipts, /35605123361/)
  assert.match(receipts, /ok: true/)
  assert.match(receipts, /SOLARI_API_KEY` is \*\*present\*\*/)
  assert.equal(receipts.includes("weekly live coverage is **not** running"), false)
  assert.match(rootReadme, /35605123361/)
  assert.match(rootReadme, /SOLARI_API_KEY` is \*\*present\*\*/)
  assert.equal(rootReadme.includes("weekly live coverage is not running"), false)
  assert.match(rootAgents, /35605123361/)
  assert.match(rootAgents, /SOLARI_API_KEY` is \*\*present\*\*/)
  assert.match(packAgents, /35605123361/)
  assert.match(packAgents, /SOLARI_API_KEY` is \*\*present\*\*/)

  assert.match(deferred, /fixed in #42/)
  assert.match(deferred, /vwp-magic-sleeps-2026-09-19/)
  assert.match(deferred, /Do not claim timeout still invents an anonymous miss/)
})

test("showcase landing and Discord packet hero the Pages HTML player, not jsDelivr text/plain", () => {
  const index = readFileSync(path.join(repo, "docs", "index.html"), "utf8")
  const discord = readFileSync(path.join(repo, "docs", "showcase", "DISCORD.md"), "utf8")
  const header = index.split("<iframe")[0] ?? ""
  assert.match(header, /ok ≠ claimOk ≠ claimOkProfile/)
  assert.match(header, /Alice-vs-Bob/)
  assert.match(header, /seed\/handoff door/)
  assert.match(header, /same-session HITL takeover/)
  assert.match(header, /Phone door/)
  assert.match(header, /Agent door/)
  assert.match(header, /await-login --save-editor/)
  assert.match(header, /finalize-login/)
  assert.match(header, /--verify-with-profile/)
  assert.match(header, /not a same-session VNC takeover/)
  assert.match(header, /Agents never type a password/)
  assert.match(header, /frozen-agent-door-sequence/)
  assert.match(header, /npm auspex-solari@0\.1\.3/)
  assert.match(header, /https:\/\/www\.npmjs\.com\/package\/auspex-solari/)
  assert.match(header, /not npm <code>auspex<\/code>/)
  assert.match(header, /IronAdamant\/auspex/)
  assert.match(header, /35605123361/)
  assert.match(header, /2026-09-21/)
  assert.match(header, /class="card"/)
  assert.match(header, /--profile app-example|--profile <yours>|login --url/)
  assert.match(header, /consistencyhub-receipt\.json/)
  assert.match(header, /[Rr]edacted/)
  assert.match(header, /auth-gated/)
  const hero = header.match(/<figure class="hero">[\s\S]*?<\/figure>/)?.[0] ?? ""
  const dual = hero.match(/<p class="dual-pack">[\s\S]*?<\/p>/)?.[0] ?? ""
  assert.match(dual, /Same Microsoft login seed/)
  assert.match(dual, /ConsistencyHub/)
  assert.match(dual, /demo\/consistencyhub-receipt\.json/)
  assert.match(dual, /OneDrive/)
  assert.match(dual, /demo\/onedrive-receipt\.json/)
  assert.match(dual, /no public PNG/)
  assert.match(dual, /ok true, claimOk false \(skipped\), claimOkProfile true/)
  assert.match(dual, /not the recipe/)
  assert.match(dual, /login --url/)
  assert.match(dual, /RECEIPTS\.md#dual-pack-same-microsoft-seed/)
  assert.equal(index.includes("onedrive.png"), false, "do not publish an OneDrive PNG")
  const lead = header.replace(dual, "")
  assert.equal(/ConsistencyHub/.test(lead), false, "Pages header must not lead with ConsistencyHub outside the dual-pack skim")
  assert.equal(/OneDrive/.test(lead), false, "Pages header must not lead with OneDrive outside the dual-pack skim")
  assert.match(index, /Measured public check/)
  assert.match(index, /Redacted demo|Redacted auth-gated SaaS demo/)
  const receipts = readFileSync(path.join(repo, "RECEIPTS.md"), "utf8")
  assert.match(receipts, /OneDrive/)
  assert.match(receipts, /not the default recipe/)
  assert.match(receipts, /onedrive-receipt\.json/)
  assert.match(index, /src="demo\/replay\.html"/)
  const frameAt = index.indexOf("<iframe")
  const publicStill = index.indexOf('src="demo/ironadamant.png"')
  const blurredStill = index.indexOf('src="demo/consistencyhub.png"')
  assert.ok(publicStill !== -1 && publicStill < frameAt, "public still must sit above the player")
  assert.ok(blurredStill !== -1 && blurredStill < frameAt, "blurred still must sit above the player")
  assert.equal(index.includes("blur below"), false, "caption must not say the blur is below the player")
  assert.match(index, /blur above/)
  assert.equal(
    index.includes("cdn.jsdelivr.net/gh/IronAdamant/auspex@main/examples/auspex-ts/demo/replay.html"),
    false,
    "jsDelivr serves replay.html as text/plain; do not iframe it",
  )
  const rootForWorked = readFileSync(path.join(repo, "README.md"), "utf8")
  const worked = rootForWorked.split("## Worked example (dogfood)")[1]?.split("## MCP first")[0] ?? ""
  assert.match(worked, /npx auspex-solari login/)
  assert.equal(worked.includes("npx auspex login"), false, "worked example must not tell a stranger to run npx auspex")
  assert.match(discord, /above the player/)
  assert.match(discord, /software keyboard/)
  assert.match(discord, /Tap Save/)
  assert.match(index, /phone's own Safari or Chrome/)
  assert.match(index, /software keyboard/)
  assert.equal(index.includes('src="demo/phone.png"'), false, "do not ship a phone still before the live test")
  assert.match(discord, /https:\/\/ironadamant\.com\/auspex\/demo\/replay\.html/)
  const packReadme = readFileSync(path.join(pkg, "README.md"), "utf8")
  const plan = readFileSync(path.join(repo, "PLAN.md"), "utf8")
  assert.match(plan, /executed on `0aac1a1`/)
  assert.equal(/plan only\. Do not execute/i.test(plan), false, "PLAN.md must not still say do not execute")
  for (const [label, text] of [
    ["package README", packReadme],
    ["RECEIPTS.md", receipts],
    ["Discord packet", discord],
    ["PLAN.md", plan],
  ] as const) {
    assert.equal(
      text.includes("cdn.jsdelivr.net/gh/IronAdamant/auspex@main/examples/auspex-ts/demo/replay.html"),
      false,
      `${label} must not hero jsDelivr replay.html (text/plain)`,
    )
  }
  assert.match(discord, /https:\/\/github\.com\/IronAdamant\/auspex/)
  assert.match(discord, /npx auspex-solari check --name ironadamant/)
  assert.match(discord, /auspex-mcp/)
  assert.match(discord, /ok.*claimOk.*claimOkProfile/)
  assert.equal(/slr_live_[A-Za-z0-9]{8,}/.test(index), false)
  assert.equal(/slr_live_[A-Za-z0-9]{8,}/.test(discord), false)
})

test("trace docs allow one post-handoff row and still forbid check rows and secrets", () => {
  const rootAgents = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const packAgents = readFileSync(path.join(pkg, "AGENTS.md"), "utf8")
  const rootReadme = readFileSync(path.join(repo, "README.md"), "utf8")
  const packReadme = readFileSync(path.join(pkg, "README.md"), "utf8")
  for (const [label, text] of [
    ["root AGENTS.md", rootAgents],
    ["package AGENTS.md", packAgents],
    ["root README.md", rootReadme],
    ["package README.md", packReadme],
    ["trace tool", TRACE_DESCRIPTION],
  ] as const) {
    assert.match(text, /post-handoff/, `${label} must name the post-handoff row`)
    assert.match(text, /Check rows are not written/, `${label} must still forbid check rows`)
    assert.match(text, /tokens/, `${label} must still forbid tokens`)
    assert.equal(
      /Production does not write await-login/.test(text),
      false,
      `${label} must not forbid the single post-handoff row`,
    )
  }
  assert.match(TRACE_DESCRIPTION, /session ids/)
})

test("operator docs make claimOkProfile the reuse gate and phone a seed door", () => {
  const rootAgents = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const packAgents = readFileSync(path.join(pkg, "AGENTS.md"), "utf8")
  const cursorRule = readFileSync(path.join(repo, ".cursor", "rules", "auspex.mdc"), "utf8")
  const rootReadme = readFileSync(path.join(repo, "README.md"), "utf8")
  for (const [label, text] of [
    ["root AGENTS.md", rootAgents],
    ["package AGENTS.md", packAgents],
    ["tool-copy", CHECK_DESCRIPTION + " " + LOGIN_DESCRIPTION],
    ["Cursor rule", cursorRule],
    ["root README.md", rootReadme],
  ] as const) {
    assert.match(text, /reuse gate/, `${label} must name claimOkProfile as the reuse gate`)
    assert.match(
      text,
      /not enough to treat the profile as reusable/,
      `${label} must refuse ok-alone reuse`,
    )
    assert.match(
      text,
      /seed\/handoff door|same-session VNC takeover/,
      `${label} must contrast phone.html with same-session takeover`,
    )
  }
})

test("frozen agent door sequence is documented for operators and not a takeover", () => {
  const rootAgents = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const packAgents = readFileSync(path.join(pkg, "AGENTS.md"), "utf8")
  const rootReadme = readFileSync(path.join(repo, "README.md"), "utf8")
  const packReadme = readFileSync(path.join(pkg, "README.md"), "utf8")
  const pitch = readFileSync(path.join(repo, "PITCH.md"), "utf8")
  for (const [label, text] of [
    ["root AGENTS.md", rootAgents],
    ["package AGENTS.md", packAgents],
  ] as const) {
    assert.match(text, /## Frozen agent door sequence/)
    assert.match(text, /not\*\* a Handraise-style same-session live-view takeover|not a Handraise-style same-session live-view takeover/)
    assert.match(text, /login --url/)
    assert.match(text, /await-login --save-editor/)
    assert.match(text, /finalize-login/)
    assert.match(text, /ok` ≠ `claimOk` ≠ `claimOkProfile/)
    assert.match(text, /expectMatchedPublicLanding/)
    assert.match(text, /hostChanged/)
    assert.match(text, /#61/)
    assert.match(text, /#62/)
  }
  assert.match(rootReadme, /Frozen door sequence|frozen-agent-door-sequence/)
  assert.match(packReadme, /Frozen door sequence|frozen-agent-door-sequence/)
  assert.match(pitch, /Frozen agent door|frozen-agent-door-sequence/)
  assert.match(rootReadme, /expectMatchedPublicLanding/)
  assert.match(rootReadme, /hostChanged/)
})

test("door/await contract is generated from one source", () => {
  assert.equal(AWAIT_LOGIN_DESCRIPTION, awaitLoginDescription())
  assert.match(AWAIT_LOGIN_DESCRIPTION, new RegExp(APP_VISIBLE_REFUSE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(AWAIT_LOGIN_DESCRIPTION, new RegExp(SIGN_IN_WALL_REMIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(AWAIT_LOGIN_DESCRIPTION, /Do not finalize-login/)
  assert.match(AWAIT_LOGIN_DESCRIPTION, /Do not remint to finish Microsoft/)
  assert.match(AWAIT_LOGIN_DESCRIPTION, /remint or finalize-now/)
  assert.match(AWAIT_LOGIN_DESCRIPTION, /dead fold/)
  const fold = agentsFoldBullet()
  const awaitBullet = agentsAwaitLoginBullet()
  assert.match(fold, new RegExp(APP_VISIBLE_REFUSE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(awaitBullet, new RegExp(APP_VISIBLE_REFUSE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(fold, /There is no `nextCall`/)
  assert.match(fold, /needsHuman/)
  const llms = llmsDoorAwaitBlock()
  assert.match(llms, /kind `app-visible`/)
  assert.match(llms, /Do not finalize/)
  assert.match(llms, /Do not mint again to finish Microsoft/)
  assert.equal(/remint auspex_login/.test(llms.split("\n")[1] ?? ""), false)
  for (const file of [path.join(repo, "AGENTS.md"), path.join(pkg, "AGENTS.md")]) {
    const text = readFileSync(file, "utf8")
    assert.equal(extractMarked(text, DOOR_AWAIT_BEGIN, DOOR_AWAIT_END), fold, file)
    assert.equal(extractMarked(text, AWAIT_LOGIN_BEGIN, AWAIT_LOGIN_END), awaitBullet, file)
  }
  const card = readFileSync(path.join(repo, "llms.txt"), "utf8")
  assert.equal(extractMarked(card, DOOR_AWAIT_BEGIN, DOOR_AWAIT_END), llms)
})

test("weakSeed docs are ConsistencyHub-only; VWP integrity miss is reason network", () => {
  const rootAgents = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const packAgents = readFileSync(path.join(pkg, "AGENTS.md"), "utf8")
  const rootReadme = readFileSync(path.join(repo, "README.md"), "utf8")
  const packReadme = readFileSync(path.join(pkg, "README.md"), "utf8")
  const cursorRule = readFileSync(path.join(repo, ".cursor", "rules", "auspex.mdc"), "utf8")
  for (const [label, text] of [
    ["root AGENTS.md", rootAgents],
    ["package AGENTS.md", packAgents],
    ["root README.md", rootReadme],
    ["package README.md", packReadme],
    ["Cursor rule", cursorRule],
  ] as const) {
    assert.equal(
      text.includes("weakSeed = cookies/origins but no sessionStorage"),
      false,
      `${label} must not teach generic weakSeed`,
    )
    assert.match(text, /counted `sessionStorage === 0`|counted sessionStorage === 0|cookies\/origins with a counted/)
  }
  for (const [label, text] of [
    ["root AGENTS.md", rootAgents],
    ["package AGENTS.md", packAgents],
  ] as const) {
    assert.match(text, /overlay `reason` is `network` \(intentional, retry-shaped\)/)
    assert.match(text, /do not fold `claimOkProfile` into `ok`/)
  }
})
