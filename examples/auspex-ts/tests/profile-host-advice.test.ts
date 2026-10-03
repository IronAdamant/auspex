import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { resolveFinalizeLoginTarget } from "../src/check.ts"
import { loadEditorSave, persistEditorSave } from "../src/profiles.ts"
import {
  PROFILE_HOST_MISMATCH_MARK,
  adviseProfileHost,
  resolveProfileHostUrl,
  stampProfileHostAdvice,
} from "../src/profile-host-advice.ts"

test("slug match is profileHostMatch true and does not emit suggestedProfile", () => {
  const advice = adviseProfileHost({ profile: "App-Example-Com", url: "https://app.example.com/dashboard" })
  assert.equal(advice?.profileHostMatch, true)
  assert.equal(advice?.suggestedProfile, undefined)
  const www = adviseProfileHost({ profile: "example-com", url: "https://www.example.com" })
  assert.equal(www?.profileHostMatch, true)
  assert.equal(www?.suggestedProfile, undefined)
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

