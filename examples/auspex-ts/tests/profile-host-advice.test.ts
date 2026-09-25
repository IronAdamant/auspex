import assert from "node:assert/strict"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { toAgentReceipt } from "../src/agent-receipt.ts"
import type { CheckResult } from "../src/check.ts"
import { resolveFinalizeLoginTarget } from "../src/check.ts"
import { parseArgv } from "../src/cli.ts"
import { AUSPEX_CONTRACT, PROFILE_HOST_ADVICE_CMDS, PROFILE_HOST_RECEIPT_FIELDS } from "../src/contract.ts"
import { loadEditorSave, loginInstructions, persistEditorSave } from "../src/profiles.ts"
import {
  PROFILE_HOST_MISMATCH_MARK,
  adviseProfileHost,
  resolveProfileHostUrl,
  stampLoginHost,
  stampProfileHostAdvice,
} from "../src/profile-host-advice.ts"
import { parseReceiptV1, RECEIPT_V1_OPTIONAL_KEYS } from "../src/receipt-schema.ts"

function handoff() {
  return { url: "https://console.getsolari.com/handoff/abc", handoffId: "h1", expiresAt: "soon", version: 3 }
}

test("slug match is profileHostMatch true and does not emit suggestedProfile", () => {
  const advice = adviseProfileHost({ profile: "App-Example-Com", url: "https://app.example.com/dashboard" })
  assert.equal(advice?.profileHostMatch, true)
  assert.equal(advice?.suggestedProfile, undefined)
  const www = adviseProfileHost({ profile: "example-com", url: "https://www.example.com" })
  assert.equal(www?.profileHostMatch, true)
  assert.equal(www?.suggestedProfile, undefined)
})

test("saved-check host affinity keeps consistencyhub on consistencyhub.io", () => {
  const advice = adviseProfileHost({
    profile: "ConsistencyHub",
    url: "https://www.consistencyhub.io/login",
  })
  assert.equal(advice?.profileHostMatch, true)
  assert.equal(advice?.suggestedProfile, undefined)
  const sub = adviseProfileHost({ profile: "consistencyhub", url: "https://app.consistencyhub.io" })
  assert.equal(sub?.profileHostMatch, true)
  const minted = stampLoginHost(
    loginInstructions({ id: "p", name: "consistencyhub" }, "https://consistencyhub.io/login", handoff()),
    "https://consistencyhub.io/login",
  )
  assert.equal(minted.profileHostMatch, true)
  assert.equal(minted.suggestedProfile, undefined)
  assert.equal(minted.nextCall?.tool, "auspex_await_login")
  assert.equal((minted.next ?? "").startsWith(PROFILE_HOST_MISMATCH_MARK), false)
})

test("foreign host reusing consistencyhub is a soft mismatch with suggestedProfile", () => {
  const url = "https://app.socialaize.com/login"
  const stamped = stampProfileHostAdvice(
    {
      ok: true,
      next: "Show handoff.url then auspex_await_login --profile consistencyhub.",
      nextCall: { tool: "auspex_await_login", profile: "consistencyhub", saveEditor: true },
    },
    { profile: "consistencyhub", url },
  )
  const next = stamped.next ?? ""
  assert.equal(stamped.ok, true)
  assert.equal(stamped.profileHostMatch, false)
  assert.equal(stamped.suggestedProfile, "app-socialaize-com")
  assert.equal(next.startsWith(PROFILE_HOST_MISMATCH_MARK), true)
  assert.match(next, /suggestedProfile app-socialaize-com/)
  assert.match(next, /omit --profile/)
  assert.match(next, /soft advise, not a refuse/)
  assert.match(next, /Show handoff\.url/)
  assert.equal(stamped.nextCall?.tool, "auspex_login")
  assert.equal(stamped.nextCall?.profile, "app-socialaize-com")
  assert.equal(stamped.nextCall?.url, url)
  assert.equal(stamped.nextCall?.saveEditor, undefined)
  const dumped = JSON.stringify(stamped.nextCall)
  assert.equal(dumped.includes("password"), false)
  assert.equal(dumped.includes("cookie"), false)
  const twice = stampProfileHostAdvice(stamped, { profile: "consistencyhub", url })
  assert.equal((twice.next ?? "").split(PROFILE_HOST_MISMATCH_MARK).length, 2)
})

test("host affinity is label match, not a substring of another host", () => {
  for (const url of [
    "https://notconsistencyhub.io",
    "https://consistencyhub.io.evil.com",
    "https://onedrive.live.com/",
  ]) {
    const advice = adviseProfileHost({ profile: "consistencyhub", url })
    assert.equal(advice?.profileHostMatch, false, url)
    assert.equal(advice?.suggestedProfile !== "consistencyhub", true, url)
  }
  assert.equal(
    adviseProfileHost({ profile: "consistencyhub", url: "https://onedrive.live.com/" })?.suggestedProfile,
    "onedrive-live-com",
  )
})

test("no URL or an unslugable URL omits the advisor instead of claiming a match", () => {
  assert.equal(adviseProfileHost({ profile: "consistencyhub" }), undefined)
  assert.equal(adviseProfileHost({ url: "https://app.example.com" }), undefined)
  assert.equal(adviseProfileHost({ profile: "consistencyhub", url: "not-a-url" }), undefined)
  const bare = stampLoginHost(
    loginInstructions({ id: "p", name: "consistencyhub" }, undefined, handoff()),
    undefined,
  )
  assert.equal(bare.profileHostMatch, undefined)
  assert.equal(bare.suggestedProfile, undefined)
  assert.equal(bare.nextCall?.tool, "auspex_await_login")
  assert.equal((bare.next ?? "").startsWith(PROFILE_HOST_MISMATCH_MARK), false)
})

test("finalize target for consistencyhub matches; a foreign URL does not", () => {
  const saved = resolveFinalizeLoginTarget({ profile: "consistencyhub" })
  assert.equal(adviseProfileHost({ profile: "consistencyhub", url: saved.url })?.profileHostMatch, true)
  const foreign = resolveFinalizeLoginTarget({
    profile: "consistencyhub",
    url: "https://app.socialaize.com",
    expect: "Dashboard",
  })
  const advice = adviseProfileHost({ profile: "consistencyhub", url: foreign.url })
  assert.equal(advice?.profileHostMatch, false)
  assert.equal(advice?.suggestedProfile, "app-socialaize-com")
})

test("await-login reads the mint site URL when --url is omitted", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "auspex-host-"))
  await persistEditorSave(
    {
      profileId: "p1",
      name: "consistencyhub",
      handoffToken: "hand",
      siteUrl: "https://app.socialaize.com/login",
      sinceVersion: 4,
    },
    root,
  )
  assert.equal((await loadEditorSave("consistencyhub", root))?.sinceVersion, 4)
  const stored = await resolveProfileHostUrl({ profile: "consistencyhub", root })
  assert.equal(stored, "https://app.socialaize.com/login")
  const explicit = await resolveProfileHostUrl({
    profile: "consistencyhub",
    url: "https://consistencyhub.io",
    root,
  })
  assert.equal(explicit, "https://consistencyhub.io")
  await persistEditorSave(
    {
      profileId: "p1",
      name: "consistencyhub",
      handoffToken: "hand",
      siteUrl: "javascript:alert(1)",
    },
    root,
  )
  const dropped = await loadEditorSave("consistencyhub", root)
  assert.equal(dropped?.siteUrl, undefined)
  assert.equal(await resolveProfileHostUrl({ profile: "consistencyhub", root }), undefined)
})

test("parseArgv await-login accepts --url and rejects a non-http url", () => {
  const parsed = parseArgv([
    "await-login",
    "--profile",
    "consistencyhub",
    "--url",
    "https://app.socialaize.com",
    "--save-editor",
  ])
  assert.equal(parsed.status, "ok")
  if (parsed.status === "ok" && parsed.command.cmd === "await-login") {
    assert.equal(parsed.command.profile, "consistencyhub")
    assert.equal(parsed.command.url, "https://app.socialaize.com")
    assert.equal(parsed.command.saveEditor, true)
  }
  const bad = parseArgv(["await-login", "--profile", "consistencyhub", "--url", "file:///tmp"])
  assert.equal(bad.status, "error")
})

test("contract and receipt schema publish the advisor fields", () => {
  assert.deepEqual([...PROFILE_HOST_ADVICE_CMDS], ["login", "await-login", "finalize-login"])
  for (const cmd of PROFILE_HOST_ADVICE_CMDS) {
    assert.ok(AUSPEX_CONTRACT.some((row) => row.cmd === cmd), cmd)
  }
  for (const field of PROFILE_HOST_RECEIPT_FIELDS) {
    assert.equal(RECEIPT_V1_OPTIONAL_KEYS.includes(field), true, field)
  }
  const parsed = parseReceiptV1({
    schemaVersion: 1,
    ok: true,
    reason: "matched",
    url: "https://app.socialaize.com",
    expect: "Dashboard",
    screenshotPath: "shot.png",
    profileHostMatch: false,
    suggestedProfile: "app-socialaize-com",
  })
  assert.equal(parsed.profileHostMatch, false)
  assert.equal(parsed.suggestedProfile, "app-socialaize-com")
  assert.throws(
    () =>
      parseReceiptV1({
        schemaVersion: 1,
        ok: true,
        reason: "matched",
        url: "https://app.example.com",
        expect: "Dashboard",
        screenshotPath: "shot.png",
        profileHostMatch: "false",
      }),
    /profileHostMatch/,
  )
})

test("CLI, MCP, and finalize-login stamp the advisor", () => {
  const cli = readFileSync(new URL("../src/cli.ts", import.meta.url), "utf8")
  const runners = readFileSync(new URL("../src/runners.ts", import.meta.url), "utf8")
  const check = readFileSync(new URL("../src/check.ts", import.meta.url), "utf8")
  assert.match(cli, /runLoginDoor|runAwaitLoginDoor/)
  assert.match(runners, /stampLoginHost\(/)
  assert.match(runners, /stampAwaitLoginHost\(/)
  assert.match(runners, /stampProfileHostAdvice\(/)
  assert.match(check, /stampProfileHostAdvice\(result/)
})

test("toAgentReceipt keeps profileHostMatch false", () => {
  const check: CheckResult = {
    ok: true,
    reason: "matched",
    url: "https://app.socialaize.com",
    expect: "Dashboard",
    screenshotPath: ".auspex/runs/stamp/screenshot.png",
    title: "Socialaize",
    finalUrl: "https://app.socialaize.com/",
    matched: true,
    excerpt: "Dashboard",
    sessionId: "sess",
    networkIdle: true,
    profileHostMatch: false,
    suggestedProfile: "app-socialaize-com",
    next: "Profile host mismatch: remint",
    nextCall: { tool: "auspex_login", profile: "app-socialaize-com", url: "https://app.socialaize.com" },
  }
  const receipt = toAgentReceipt(check)
  assert.equal(receipt.profileHostMatch, false)
  assert.equal(receipt.suggestedProfile, "app-socialaize-com")
  assert.equal(receipt.nextCall?.tool, "auspex_login")
  assert.equal(receipt.ok, true)
})
