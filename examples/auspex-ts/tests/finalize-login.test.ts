import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { expectMatchedPublicLandingGuide, needsHumanNext, resolveFinalizeLoginTarget } from "../src/check.ts"
import { agentReceiptOk, deriveCheckReason, expectOnUnpersistableLanding } from "../src/check-reason.ts"
import { parseArgv } from "../src/cli.ts"
import { finalizeLoginGuidance } from "../src/profile-persist.ts"
import { PUBLIC_PROFILE_SAVE_ERROR } from "../src/profile-storage.ts"
import { parseReceiptV1 } from "../src/receipt-schema.ts"
import { haystackMatches } from "../src/text.ts"

test("resolveFinalizeLoginTarget requires url and expect for unknown profiles", () => {
  assert.throws(
    () => resolveFinalizeLoginTarget({ profile: "myapp" }),
    /finalize-login requires --url and --expect unless --profile matches a saved check/,
  )
})

test("resolveFinalizeLoginTarget uses saved check for consistencyhub", () => {
  const target = resolveFinalizeLoginTarget({ profile: "consistencyhub" })
  assert.equal(target.url, "https://consistencyhub.io")
  assert.equal(target.expect, "Document Editor")
})

test("resolveFinalizeLoginTarget passes through generic url and expect", () => {
  const target = resolveFinalizeLoginTarget({
    profile: "myapp",
    url: "https://app.example.com",
    expect: "Dashboard",
  })
  assert.equal(target.url, "https://app.example.com")
  assert.equal(target.expect, "Dashboard")
  assert.notEqual(target.expect, "Document Editor")
})

test("parseArgv finalize-login accepts unknown profile without url at parse time", () => {
  const parsed = parseArgv(["finalize-login", "--profile", "myapp"])
  assert.equal(parsed.status, "ok")
  if (parsed.status === "ok" && parsed.command.cmd === "finalize-login") {
    assert.equal(parsed.command.profile, "myapp")
    assert.equal(parsed.command.url, undefined)
    assert.equal(parsed.command.expect, undefined)
  }
})

test("finalizeLoginGuidance names --url/--expect only for unknown profiles", () => {
  const saved = finalizeLoginGuidance("consistencyhub")
  assert.match(saved, /finalize-login --profile consistencyhub/)
  assert.equal(saved.includes("--url"), false)
  assert.equal(saved.includes("Document Editor"), false)
  const unknown = finalizeLoginGuidance("acme")
  assert.match(unknown, /finalize-login --profile acme --url <url> --expect <string>/)
  assert.match(unknown, /required unless the profile matches a saved check/)
  assert.equal(unknown.includes("Document Editor"), false)
  assert.match(saved, /--save-editor do not refresh folded sessionStorage/)
  assert.match(saved, /while the token is valid/)
})

test("needsHuman next is finalize-login after Save, not retry check", () => {
  const next = needsHumanNext()
  assert.match(next, /^Stop\./)
  assert.match(next, /Never fill password/)
  assert.match(next, /phone keyboard/)
  assert.match(next, /real text field/)
  assert.match(next, /handoff\.url/)
  assert.match(next, /handoff\.mobileUrl/)
  assert.match(next, /phone\.html/)
  assert.equal(next.includes("desktopUrl"), false)
  assert.match(next, /After human completes sign-in and Save: await-login --profile <yours> --save-editor then finalize-login --profile <yours>/)
  assert.match(next, /Do not retry check on cookies alone/)
  assert.match(next, /This is a re-gate/)
  assert.match(next, /Do not auto-fill a secret or claim a challenge is solved/)
  assert.equal(next.includes("retry check --profile"), false)
  assert.equal(next.includes("or retry check"), false)
})

test("public One Dashboard does not satisfy expect Dashboard", () => {
  const page = "10+ Platforms , One Dashboard"
  assert.equal(haystackMatches(page, "Dashboard"), false)
})

test("expect match on a non-persistable landing is not success-shaped", () => {
  const page = "10+ Platforms , One Dashboard. Welcome to your workspace"
  const textMatched = haystackMatches(page, "your workspace")
  assert.equal(textMatched, true)
  const hit = expectOnUnpersistableLanding({
    saveProfile: true,
    textMatched,
    finalUrl: "https://app.example/",
    needsHuman: false,
  })
  assert.equal(hit, true)
  assert.equal(
    expectOnUnpersistableLanding({
      saveProfile: true,
      textMatched: true,
      finalUrl: "https://app.example/login",
      needsHuman: false,
    }),
    true,
  )
  assert.equal(
    expectOnUnpersistableLanding({
      saveProfile: true,
      textMatched: true,
      finalUrl: "https://app.example/dashboard",
      needsHuman: false,
    }),
    false,
  )
  assert.equal(
    expectOnUnpersistableLanding({
      saveProfile: false,
      textMatched: true,
      finalUrl: "https://app.example/",
      needsHuman: false,
    }),
    false,
  )
  const matched = false
  const reason = deriveCheckReason({
    special: "expectMatchedPublicLanding",
    matched,
    networkIdle: true,
    finalUrl: "https://app.example/",
    excerpt: page,
    screenshotOk: true,
  })
  assert.equal(reason, "expectMatchedPublicLanding")
  assert.notEqual(reason, "matched")
  assert.equal(matched, false)
  assert.equal(agentReceiptOk({ protocolOk: false, reason }), false)
  const guided = expectMatchedPublicLandingGuide("app-example")
  assert.equal(guided.nextCall.tool, "auspex_finalize_login")
  assert.equal(guided.nextCall.profile, "app-example")
  assert.match(guided.text, /persistable-app-url/)
  assert.match(guided.text, /Dashboard does not match One Dashboard/)
  assert.match(guided.text, /no profile bytes were written/)
  assert.match(guided.text, new RegExp(PUBLIC_PROFILE_SAVE_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.equal(/\bauspex_login\b/.test(guided.text), false)
  assert.equal(/\bremint\b/i.test(guided.text), false)
  const receipt = parseReceiptV1({
    schemaVersion: 1,
    ok: false,
    reason,
    url: "https://app.example/",
    expect: "your workspace",
    screenshotPath: ".auspex/runs/stamp/screenshot.png",
    matched,
    finalUrl: "https://app.example/",
    profileSaved: { ok: false, cookies: 0, origins: 0, error: PUBLIC_PROFILE_SAVE_ERROR },
  })
  assert.equal(receipt.ok, false)
  assert.equal(receipt.reason, "expectMatchedPublicLanding")
  assert.equal(receipt.matched, false)
  assert.equal(receipt.profileSaved?.ok, false)
})

test("finalize check wires unpersistable expect hits away from reason matched", () => {
  const src = readFileSync(new URL("../src/check.ts", import.meta.url), "utf8")
  assert.match(src, /expectOnUnpersistableLanding/)
  assert.match(src, /special = "expectMatchedPublicLanding"/)
  assert.match(src, /expectMatchedPublicLandingGuide/)
  const refuse = src.split("if (!isPersistableAppUrl(liveUrl))")[1]?.split("} else {")[0] ?? ""
  assert.equal(refuse.includes("persistLiveProfile"), false)
  assert.match(refuse, /PUBLIC_PROFILE_SAVE_ERROR/)
})

test("parseArgv finalize-login parses --url and --expect", () => {
  const parsed = parseArgv([
    "finalize-login",
    "--profile",
    "myapp",
    "--url",
    "https://app.example.com",
    "--expect",
    "Dashboard",
  ])
  assert.equal(parsed.status, "ok")
  if (parsed.status === "ok" && parsed.command.cmd === "finalize-login") {
    assert.equal(parsed.command.profile, "myapp")
    assert.equal(parsed.command.url, "https://app.example.com")
    assert.equal(parsed.command.expect, "Dashboard")
  }
})
