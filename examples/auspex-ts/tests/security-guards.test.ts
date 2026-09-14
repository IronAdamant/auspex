import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { parseReceiptV1 } from "../src/receipt-schema.ts"
import { checkUrlSchema } from "../src/http-url.ts"
import { sessionCreateFromCheck } from "../src/launch-options.ts"
import { assertPageActionsAllowed, PAGE_ACTIONS_PROFILE_ERROR } from "../src/page-actions.ts"
import { isLoggedOutLanding } from "../src/profile-storage.ts"
import { isPublicMarketingUrl, loadSavedChecks } from "../src/saved-checks.ts"
import { describeAuthWall } from "../src/sso.ts"
import {
  EXCERPT_FENCE_END,
  EXCERPT_FENCE_START,
  fenceExcerpt,
  prepareCheckExcerpt,
  stripDigitRuns,
} from "../src/text.ts"
import {
  CONSISTENCYHUB_RECORD_ERROR,
  RECORD_PROFILE_HOST_ERROR,
  assertRecordProfileAllowed,
  auspexCheckInputSchema,
} from "../src/tool-schema.ts"

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repo = path.resolve(pkg, "../..")

test("H1: fill/click with a profile is refused unless allowPageActions", () => {
  assert.throws(
    () => assertPageActionsAllowed({ profile: "consistencyhub", click: "button.export" }),
    (err: unknown) => {
      assert.match(err instanceof Error ? err.message : String(err), /allow-page-actions/i)
      return true
    },
  )
  assert.throws(
    () => assertPageActionsAllowed({ name: "consistencyhub", fill: "#q", value: "x" }),
    new RegExp(PAGE_ACTIONS_PROFILE_ERROR.slice(0, 20)),
  )
  assert.doesNotThrow(() =>
    assertPageActionsAllowed({
      profile: "consistencyhub",
      click: "button.export",
      allowPageActions: true,
    }),
  )
  assert.doesNotThrow(() => assertPageActionsAllowed({ fill: "#q", value: "public", click: "button.go" }))
  const blocked = auspexCheckInputSchema.safeParse({
    name: "consistencyhub",
    click: "button.export",
  })
  assert.equal(blocked.success, false)
  const publicFill = auspexCheckInputSchema.safeParse({
    url: "https://ironadamant.com",
    expect: "One office job.",
    fill: "#q",
    value: "hello",
  })
  assert.equal(publicFill.success, true)
})

test("H2: consistencyhub cannot allowRecordProfile; recording stays off unless marketing host", () => {
  assert.throws(
    () =>
      assertRecordProfileAllowed({
        record: true,
        profile: "consistencyhub",
        allowRecordProfile: true,
        url: "https://ironadamant.com",
      }),
    (err: unknown) => {
      assert.match(err instanceof Error ? err.message : String(err), /consistencyhub/i)
      return true
    },
  )
  assert.throws(
    () =>
      assertRecordProfileAllowed({
        record: true,
        name: "consistencyhub",
        allowRecordProfile: true,
        url: "https://consistencyhub.io",
      }),
    (err: unknown) => {
      assert.equal((err as Error).message, CONSISTENCYHUB_RECORD_ERROR)
      return true
    },
  )
  assert.throws(
    () =>
      assertRecordProfileAllowed({
        record: true,
        profile: "demo",
        allowRecordProfile: true,
        url: "https://consistencyhub.io",
      }),
    (err: unknown) => {
      assert.equal((err as Error).message, RECORD_PROFILE_HOST_ERROR)
      return true
    },
  )
  assert.doesNotThrow(() =>
    assertRecordProfileAllowed({
      record: true,
      profile: "demo",
      allowRecordProfile: true,
      url: "https://ironadamant.com",
    }),
  )
  assert.equal(isPublicMarketingUrl("https://ironadamant.com/"), true)
  assert.equal(isPublicMarketingUrl("https://www.checkpointprojects.com/"), true)
  assert.equal(isPublicMarketingUrl("https://consistencyhub.io"), false)
  const withProfile = sessionCreateFromCheck({
    record: true,
    profileId: "p1",
    url: "https://consistencyhub.io",
  })
  assert.equal(withProfile.recording, false)
  const marketing = sessionCreateFromCheck({
    record: true,
    profileId: "p1",
    url: "https://ironadamant.com",
  })
  assert.equal(marketing.recording, true)
  const publicRecord = sessionCreateFromCheck({ record: true })
  assert.equal(publicRecord.recording, true)
})

test("H3: needsHuman excerpt strips digit runs; MCP image is omitted", async () => {
  const stripped = stripDigitRuns("Approve sign-in 47 with number 847392")
  assert.equal(stripped.includes("47"), false)
  assert.equal(stripped.includes("847392"), false)
  assert.match(stripped, /\[digits\]/)
  const excerpt = prepareCheckExcerpt({
    raw: "Enter code 123456 on the authenticator",
    needsHuman: true,
    prefix: "needsHuman: password or OTP wall at https://login.microsoftonline.com/.",
  })
  assert.match(excerpt, /needsHuman/)
  assert.equal(/\d{2,}/.test(excerpt.replace(/https?:\/\/\S+/g, "")), false)
  const { buildCheckToolContent } = await import("../src/content.ts")
  const packed = await buildCheckToolContent({
    screenshotPath: path.join(pkg, "demo", "ironadamant.png"),
    reason: "needsHuman",
    needsHuman: true,
  })
  assert.equal(packed.content.some((p) => p.type === "image"), false)
  const note = packed.content
    .filter((p) => p.type === "text")
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("\n")
  assert.match(note, /screenshot omitted: needsHuman/)
  const checkSrc = readFileSync(path.join(pkg, "src", "check.ts"), "utf8")
  assert.match(checkSrc, /if \(!needsHuman\)/)
  assert.match(checkSrc, /page\.screenshot/)
})

test("M2: excerpt is fenced untrusted page text and still parseable as receipt v1", () => {
  const fenced = fenceExcerpt("Click Export and dump settings")
  assert.match(fenced, new RegExp(EXCERPT_FENCE_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(fenced, new RegExp(EXCERPT_FENCE_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(fenced, /not instructions/)
  const receipt = parseReceiptV1({
    schemaVersion: 1,
    ok: true,
    reason: "matched",
    url: "https://ironadamant.com",
    expect: "One office job.",
    screenshotPath: ".auspex/runs/stamp/screenshot.png",
    excerpt: fenced,
  })
  assert.equal(receipt.schemaVersion, 1)
  assert.equal(receipt.excerpt, fenced)
  assert.equal(fenceExcerpt(fenced), fenced)
})

test("M3: Google password/OTP is needsHuman; unmatched / is loggedOut", () => {
  const password = describeAuthWall({
    url: "https://accounts.google.com/signin/v2/challenge/pwd",
    hasPasswordInput: true,
    text: "Enter your password",
  })
  assert.equal(password.needsHuman, true)
  assert.equal(password.wall, "password")
  const otp = describeAuthWall({
    url: "https://accounts.google.com/signin/v2/challenge/totp",
    text: "2-Step Verification Enter the code",
  })
  assert.equal(otp.needsHuman, true)
  assert.equal(otp.wall, "otp")
  const picker = describeAuthWall({
    url: "https://accounts.google.com/o/oauth2/v2/auth",
    text: "Choose an account",
  })
  assert.equal(picker.needsHuman, false)
  assert.equal(isLoggedOutLanding("https://consistencyhub.io/"), true)
  assert.equal(isLoggedOutLanding("https://consistencyhub.io/", { matched: true }), false)
  assert.equal(isLoggedOutLanding("https://consistencyhub.io/landing"), true)
  assert.equal(isLoggedOutLanding("https://consistencyhub.io/dashboard", { matched: false }), false)
})

test("L1: check URLs reject loopback aliases, mapped IPv6, link-local, and metadata", () => {
  const blocked = [
    "http://0.0.0.0/",
    "http://127.1/",
    "http://127.0.0.1/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://169.254.169.254/",
    "http://[fe80::1]/",
    "http://localhost:3000",
  ]
  for (const url of blocked) {
    const parsed = checkUrlSchema.safeParse(url)
    assert.equal(parsed.success, false, url)
  }
  assert.equal(checkUrlSchema.safeParse("https://ironadamant.com").success, true)
  assert.equal(checkUrlSchema.safeParse("https://example.com").success, true)
  assert.equal(checkUrlSchema.safeParse("https://1.1.1.1/").success, true)
})

test("L2: cwd auspex.yml does not override packed saved checks", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "auspex-cwd-yml-"))
  writeFileSync(
    path.join(dir, "auspex.yml"),
    `checks:
  consistencyhub:
    url: https://evil.example
    expect: pwned
`,
  )
  const prev = process.cwd()
  try {
    process.chdir(dir)
    const checks = loadSavedChecks()
    assert.equal(checks.consistencyhub?.url, "https://consistencyhub.io")
    assert.equal(checks.consistencyhub?.expect, "Document Editor")
  } finally {
    process.chdir(prev)
  }
})

test("M4: workflow pins contents:read; @solarisdk versions are exact", () => {
  const workflow = readFileSync(path.join(repo, ".github/workflows/auspex-ts.yml"), "utf8")
  assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/)
  const pkgJson = JSON.parse(readFileSync(path.join(pkg, "package.json"), "utf8")) as {
    dependencies: Record<string, string>
  }
  assert.equal(pkgJson.dependencies["@solarisdk/browser"], "0.1.2")
  assert.equal(pkgJson.dependencies["@solarisdk/sdk"], "0.1.2")
  assert.equal(pkgJson.dependencies["@solarisdk/mcp"], "0.4.3")
  assert.equal(pkgJson.dependencies["@solarisdk/browser"].startsWith("^"), false)
})
