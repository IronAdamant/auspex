import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import {
  applySavedCheckName,
  canonicalSavedCheckName,
  loadSavedChecks,
  materializeSavedCheck,
  parseSavedChecksYaml,
  resolveSavedCheck,
} from "../src/saved-checks.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("shipped auspex.yml has ironadamant, checkpoint, consistencyhub", () => {
  const checks = loadSavedChecks(path.join(root, "auspex.yml"))
  assert.equal(resolveSavedCheck("ironadamant", checks).expect, "One office job.")
  assert.equal(resolveSavedCheck("ironadamant", checks).url, "https://ironadamant.com")
  assert.equal(resolveSavedCheck("Checkpoint", checks).expect, "Checkpoint")
  assert.equal(resolveSavedCheck("checkpoint", checks).url, "https://checkpointprojects.com")
  const hub = resolveSavedCheck("ConsistencyHub", checks)
  assert.equal(hub.expect, "Document Editor")
  assert.equal(hub.profile, "consistencyhub")
  assert.equal(hub.url, "https://consistencyhub.io")
  assert.equal("sso" in hub, false)
  assert.equal("record" in hub, false)
})

test("canonicalSavedCheckName is case-insensitive for the three sites", () => {
  assert.equal(canonicalSavedCheckName("Checkpoint"), "checkpoint")
  assert.equal(canonicalSavedCheckName("ConsistencyHub"), "consistencyhub")
  assert.equal(canonicalSavedCheckName("ironadamant"), "ironadamant")
})

test("parseSavedChecksYaml rejects sso/record on a saved check", () => {
  const parsed = parseSavedChecksYaml(`checks:
  consistencyhub:
    url: https://consistencyhub.io
    expect: "Document Editor"
    profile: consistencyhub
    sso: true
`)
  assert.throws(() => materializeSavedCheck("consistencyhub", parsed.consistencyhub ?? {}), /sso/)
  const recorded = parseSavedChecksYaml(`checks:
  ironadamant:
    url: https://ironadamant.com
    expect: "One office job."
    record: true
`)
  assert.throws(() => materializeSavedCheck("ironadamant", recorded.ironadamant ?? {}), /record/)
  const yaml = readFileSync(path.join(root, "auspex.yml"), "utf8")
  assert.equal(/^\s+sso:/m.test(yaml), false)
  assert.equal(/^\s+record:/m.test(yaml), false)
})

test("parseSavedChecksYaml rejects invalid lines", () => {
  assert.throws(() => parseSavedChecksYaml("checks:\n  nope: { json: true }\n"), /invalid auspex.yml/)
})

test("applySavedCheckName fills url/expect/profile without reconstructing flags", () => {
  const merged = applySavedCheckName({ name: "consistencyhub" })
  assert.equal(merged.url, "https://consistencyhub.io")
  assert.equal(merged.expect, "Document Editor")
  assert.equal(merged.profile, "consistencyhub")
  const overridden = applySavedCheckName({
    name: "ironadamant",
    expect: "Other copy",
  })
  assert.equal(overridden.expect, "Other copy")
  assert.equal(overridden.url, "https://ironadamant.com")
})

test("unknown saved check lists known names", () => {
  assert.throws(() => resolveSavedCheck("not-a-site"), /ironadamant|checkpoint|consistencyhub/)
})
