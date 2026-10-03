import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { toAgentReceipt } from "../src/agent-receipt.ts"
import { exitFromOk, usageErrorReceipt } from "../src/cli-json.ts"
import type { CheckResult } from "../src/check.ts"
import {
  parseReceiptV1,
  RECEIPT_V1_OPTIONAL_KEYS,
  RECEIPT_V1_REQUIRED_KEYS,
  SCHEMA_VERSION,
} from "../src/receipt-schema.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const goldenDir = path.join(here, "golden", "receipt-v1")
const repoRoot = path.resolve(here, "../../..")

function loadGolden(name: string): unknown {
  return JSON.parse(readFileSync(path.join(goldenDir, name), "utf8"))
}

function sampleCheck(over: Partial<CheckResult> = {}): CheckResult {
  return {
    ok: true,
    reason: "matched",
    url: "https://ironadamant.com",
    expect: "One office job.",
    screenshotPath: ".auspex/runs/stamp/screenshot.png",
    title: "Iron Adamant",
    finalUrl: "https://ironadamant.com/",
    matched: true,
    excerpt: "One office job.",
    sessionId: "sess",
    networkIdle: true,
    ...over,
  }
}

test("schemaVersion 1 required keys are frozen", () => {
  assert.equal(SCHEMA_VERSION, 1)
  assert.deepEqual([...RECEIPT_V1_REQUIRED_KEYS], [
    "schemaVersion",
    "ok",
    "reason",
    "url",
    "expect",
    "screenshotPath",
  ])
  assert.equal((RECEIPT_V1_REQUIRED_KEYS as readonly string[]).includes("matched"), false)
  assert.equal((RECEIPT_V1_REQUIRED_KEYS as readonly string[]).includes("futureOptional"), false)
  assert.equal(RECEIPT_V1_OPTIONAL_KEYS.includes("matched"), true)
  assert.equal(RECEIPT_V1_OPTIONAL_KEYS.includes("diff"), true)
  assert.equal(RECEIPT_V1_OPTIONAL_KEYS.includes("verify"), true)
})

test("golden receipt-v1 JSON files parse; extra keys stay optional", () => {
  const names = readdirSync(goldenDir)
    .filter((n) => n.endsWith(".json"))
    .sort()
  assert.deepEqual(names, [
    "extra-keys.json",
    "logged-out.json",
    "matched.json",
    "minimal.json",
    "mismatch-verify.json",
    "network.json",
  ])
  for (const name of names) {
    const parsed = parseReceiptV1(loadGolden(name))
    assert.equal(parsed.schemaVersion, 1)
    for (const key of RECEIPT_V1_REQUIRED_KEYS) {
      assert.notEqual(parsed[key], undefined, `${name} missing ${key}`)
    }
  }
  const minimal = loadGolden("minimal.json") as Record<string, unknown>
  assert.deepEqual(Object.keys(minimal).sort(), [...RECEIPT_V1_REQUIRED_KEYS].sort())
  const extra = loadGolden("extra-keys.json") as Record<string, unknown>
  assert.equal(extra.futureOptional, "must-not-become-required")
  parseReceiptV1(extra)
})

test("toAgentReceipt matches golden matched / logged-out / mismatch-verify", () => {
  assert.deepEqual(toAgentReceipt(sampleCheck()), loadGolden("matched.json"))
  assert.deepEqual(
    toAgentReceipt(sampleCheck({ ok: false, matched: false, reason: "loggedOut", title: "Sign in", url: "https://consistencyhub.io", expect: "Document Editor", finalUrl: "https://consistencyhub.io/landing", excerpt: "Sign in" }), {
      verify: {
        ok: false,
        errors: [],
        claimOk: false,
        claimErrors: [],
        runDir: ".auspex/runs/stamp",
        skipped: true,
        skipReason: "loggedOut",
      },
    }),
    loadGolden("logged-out.json"),
  )
  assert.deepEqual(
    toAgentReceipt(sampleCheck(), {
      verify: {
        ok: true,
        errors: [],
        claimOk: false,
        claimErrors: ["expect missing"],
        runDir: ".auspex/runs/stamp",
      },
    }),
    loadGolden("mismatch-verify.json"),
  )
})

test("dropping any required key fails; dropping optionals still parses", () => {
  const full = loadGolden("matched.json") as Record<string, unknown>
  for (const key of RECEIPT_V1_REQUIRED_KEYS) {
    const copy = { ...full }
    delete copy[key]
    assert.throws(() => parseReceiptV1(copy), new RegExp(key))
  }
  const onlyRequired = { ...full }
  for (const key of RECEIPT_V1_OPTIONAL_KEYS) delete onlyRequired[key]
  const parsed = parseReceiptV1(onlyRequired)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.matched, undefined)
})

test("schemaVersion 2, string ok, and unknown reason are rejected", () => {
  const min = loadGolden("minimal.json") as Record<string, unknown>
  assert.throws(() => parseReceiptV1({ ...min, schemaVersion: 2 }), /schemaVersion/)
  assert.throws(() => parseReceiptV1({ ...min, schemaVersion: "1" }), /schemaVersion/)
  assert.throws(() => parseReceiptV1({ ...min, ok: "true" }), /ok/)
  assert.throws(() => parseReceiptV1({ ...min, reason: "nope" }), /reason/)
  assert.throws(() => parseReceiptV1(null), /JSON object/)
})

test("CLI exit 0 only when receipt ok is true", () => {
  const matched = parseReceiptV1(loadGolden("matched.json"))
  const loggedOut = parseReceiptV1(loadGolden("logged-out.json"))
  const network = parseReceiptV1(loadGolden("network.json"))
  assert.equal(exitFromOk(matched.ok), 0)
  assert.equal(exitFromOk(loggedOut.ok), 1)
  assert.equal(exitFromOk(network.ok), 1)
  assert.equal(JSON.stringify(toAgentReceipt(sampleCheck())).startsWith("{"), true)
  assert.throws(() => parseReceiptV1(usageErrorReceipt("need --expect")), /missing required/)
})

test("root AGENTS.md is the v1 field-list source of truth", () => {
  const md = readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8")
  const section = md.split("## Receipt schema v1")[1]?.split("\n## ")[0] ?? ""
  assert.match(section, /frozen/i)
  assert.match(section, /optional/i)
  assert.match(section, /Exit `0` only when `ok`/)
  for (const key of RECEIPT_V1_REQUIRED_KEYS) {
    assert.match(section, new RegExp(`\`${key}\``), `AGENTS.md required field ${key}`)
  }
  for (const key of RECEIPT_V1_OPTIONAL_KEYS) {
    assert.match(section, new RegExp(`\`${key}\``), `AGENTS.md optional field ${key}`)
  }
  const requiredBlock = section.split("### Optional")[0] ?? ""
  assert.equal(/^\| `matched` /m.test(requiredBlock), false, "matched must not be a required table row")
  assert.match(section.split("### Optional")[1] ?? "", /^\| `matched` /m)
})
