import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { toAgentReceipt } from "../src/agent-receipt.ts"
import { exitFromOk, usageErrorReceipt } from "../src/cli-json.ts"
import type { CheckResult } from "../src/check.ts"
import {
  parseReceiptV1,
  } from "../src/receipt-schema.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const goldenDir = path.join(here, "golden", "receipt-v1")

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

