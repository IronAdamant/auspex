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

