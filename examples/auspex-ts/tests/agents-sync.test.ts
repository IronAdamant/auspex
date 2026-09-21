import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { USAGE } from "../src/cli.ts"

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repo = path.resolve(pkg, "../..")

test("root and package AGENTS agree on P0/P1 contract facts", () => {
  const root = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const pack = readFileSync(path.join(pkg, "AGENTS.md"), "utf8")
  const tools = readFileSync(path.join(pkg, "src", "mcp-tools.ts"), "utf8")
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
    "saveEditor",
    "GET editor HTTP 401",
  ]) {
    assert.match(root, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `root AGENTS missing ${needle}`)
    assert.match(pack, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `package AGENTS missing ${needle}`)
  }
  assert.match(USAGE, /--mobile/)
  assert.match(USAGE, /--device/)
  assert.match(USAGE, /emptySave/)
  assert.match(USAGE, /weakSeed/)
  assert.match(USAGE, /finalize-login/)
  assert.match(USAGE, /phone's own Safari or Chrome/)
  assert.match(USAGE, /noVNC|remote Chromium live view/)
  assert.match(USAGE, /mobileUrl/)
  assert.match(USAGE, /desktopUrl/)
  assert.match(USAGE, /real text field/)
  assert.match(USAGE, /--save-editor/)
  assert.match(tools, /mobileUrl/)
  assert.match(tools, /desktopUrl/)
  assert.match(tools, /real text field/)
  assert.match(tools, /phone.html/)
  assert.match(tools, /HANDOFF_PHONE_DOOR_BAN/)
  for (const [label, text] of [
    ["root AGENTS.md", root],
    ["package AGENTS.md", pack],
    ["USAGE", USAGE],
    ["mcp-tools.ts", tools],
  ] as const) {
    assert.equal(text.includes("gateUrl"), false, `${label} must not teach the detecting-gate URL`)
  }
  assert.match(USAGE, /consistencyhub.*--no-verify|defaults to --no-verify/)
  assert.match(USAGE, /derives a safe host slug/)
  assert.match(USAGE, /npx auspex login \[--profile <name>\] \[--url <https>\]/)
  assert.match(tools, /auspex_finalize_login/)
  assert.match(tools, /shouldVerifyCheck/)
  assert.match(tools, /defaults to verify=false/)
  assert.match(tools, /derives a safe host slug/)
})

test("docs doors do not teach pre-#38 ok or flatten verify vs verifyWithProfile", () => {
  const rootReadme = readFileSync(path.join(repo, "README.md"), "utf8")
  const packReadme = readFileSync(path.join(pkg, "README.md"), "utf8")
  const pitch = readFileSync(path.join(repo, "PITCH.md"), "utf8")
  const security = readFileSync(path.join(pkg, "SECURITY.md"), "utf8")
  const rootAgents = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const packAgents = readFileSync(path.join(pkg, "AGENTS.md"), "utf8")
  const tools = readFileSync(path.join(pkg, "src", "mcp-tools.ts"), "utf8")
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

  assert.match(tools, /They are not equivalent/)
  assert.match(tools, /claimOkProfile/)
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

test("honesty leftovers: desktop demo, dual LICENSE, OneDrive recipe-only", () => {
  const rootReadme = readFileSync(path.join(repo, "README.md"), "utf8")
  const packReadme = readFileSync(path.join(pkg, "README.md"), "utf8")
  const license = readFileSync(path.join(repo, "LICENSE"), "utf8")
  const receipts = readFileSync(path.join(repo, "RECEIPTS.md"), "utf8")
  const rootAgents = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const packAgents = readFileSync(path.join(pkg, "AGENTS.md"), "utf8")
  const pitch = readFileSync(path.join(repo, "PITCH.md"), "utf8")
  const deferred = readFileSync(path.join(pkg, "docs", "deferred-check-2026-09-19.md"), "utf8")

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

  assert.match(rootAgents, /no committed OneDrive PNG\/receipt/)
  assert.match(packAgents, /no committed OneDrive PNG\/receipt/)
  assert.match(receipts, /no committed OneDrive PNG\/receipt/)
  assert.match(receipts, /weekly live coverage is \*\*not\*\* running/)
  assert.match(rootReadme, /weekly live coverage is not running/)

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
  assert.match(header, /class="card"/)
  assert.match(header, /--profile app-example|--profile <yours>|login --url/)
  assert.match(header, /consistencyhub-receipt\.json/)
  assert.match(header, /[Rr]edacted/)
  assert.match(header, /auth-gated/)
  assert.equal(/ConsistencyHub/.test(header), false, "Pages header must not lead with ConsistencyHub")
  assert.equal(/OneDrive/.test(header), false, "Pages header must not lead with OneDrive")
  assert.match(index, /Measured public check/)
  assert.match(index, /Redacted demo|Redacted auth-gated SaaS demo/)
  const receipts = readFileSync(path.join(repo, "RECEIPTS.md"), "utf8")
  assert.match(receipts, /OneDrive/)
  assert.match(receipts, /[Rr]ecipe only/)
  assert.match(index, /src="demo\/replay\.html"/)
  assert.equal(
    index.includes("cdn.jsdelivr.net/gh/IronAdamant/auspex@main/examples/auspex-ts/demo/replay.html"),
    false,
    "jsDelivr serves replay.html as text/plain; do not iframe it",
  )
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

test("operator docs make claimOkProfile the reuse gate and phone a seed door", () => {
  const rootAgents = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const packAgents = readFileSync(path.join(pkg, "AGENTS.md"), "utf8")
  const tools = readFileSync(path.join(pkg, "src", "mcp-tools.ts"), "utf8")
  const cursorRule = readFileSync(path.join(repo, ".cursor", "rules", "auspex.mdc"), "utf8")
  const rootReadme = readFileSync(path.join(repo, "README.md"), "utf8")
  for (const [label, text] of [
    ["root AGENTS.md", rootAgents],
    ["package AGENTS.md", packAgents],
    ["USAGE", USAGE],
    ["mcp-tools.ts", tools],
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

test("stale/weak docs remint or finalize-now and ban VWP on a dead fold", () => {
  const rootAgents = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const packAgents = readFileSync(path.join(pkg, "AGENTS.md"), "utf8")
  const tools = readFileSync(path.join(pkg, "src", "mcp-tools.ts"), "utf8")
  const cursorRule = readFileSync(path.join(repo, ".cursor", "rules", "auspex.mdc"), "utf8")
  for (const [label, text] of [
    ["root AGENTS.md", rootAgents],
    ["package AGENTS.md", packAgents],
    ["USAGE", USAGE],
    ["mcp-tools.ts", tools],
    ["Cursor rule", cursorRule],
  ] as const) {
    assert.match(text, /remint or finalize-now|Remint now/, `${label} must push remint or finalize-now`)
    assert.match(text, /dead fold|claimOkProfile will not pass/, `${label} must not imply VWP on a dead fold`)
  }
})

test("weakSeed docs are ConsistencyHub-only; VWP integrity miss is reason network", () => {
  const rootAgents = readFileSync(path.join(repo, "AGENTS.md"), "utf8")
  const packAgents = readFileSync(path.join(pkg, "AGENTS.md"), "utf8")
  const rootReadme = readFileSync(path.join(repo, "README.md"), "utf8")
  const packReadme = readFileSync(path.join(pkg, "README.md"), "utf8")
  const tools = readFileSync(path.join(pkg, "src", "mcp-tools.ts"), "utf8")
  const cursorRule = readFileSync(path.join(repo, ".cursor", "rules", "auspex.mdc"), "utf8")
  for (const [label, text] of [
    ["root AGENTS.md", rootAgents],
    ["package AGENTS.md", packAgents],
    ["root README.md", rootReadme],
    ["package README.md", packReadme],
    ["USAGE", USAGE],
    ["mcp-tools.ts", tools],
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
