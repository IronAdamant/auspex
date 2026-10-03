import assert from "node:assert/strict"
import test from "node:test"
import { expectMatchedPublicLandingGuide, resolveFinalizeLoginTarget } from "../src/check.ts"
import { agentReceiptOk, deriveCheckReason, expectOnUnpersistableLanding } from "../src/check-reason.ts"
import { PUBLIC_PROFILE_SAVE_ERROR } from "../src/profile-storage.ts"
import { parseReceiptV1 } from "../src/receipt-schema.ts"
import { haystackMatches } from "../src/text.ts"

test("resolveFinalizeLoginTarget uses saved check for consistencyhub", () => {
  const target = resolveFinalizeLoginTarget({ profile: "consistencyhub" })
  assert.equal(target.url, "https://consistencyhub.io")
  assert.equal(target.expect, "Document Editor")
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

