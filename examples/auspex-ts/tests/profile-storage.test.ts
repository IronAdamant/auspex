import assert from "node:assert/strict"
import test from "node:test"
import {
  parseFoldedExpiresOnMs,
  } from "../src/profile-storage.ts"

test("parseFoldedExpiresOnMs accepts epoch ms, unix seconds, and ISO", () => {
  assert.equal(parseFoldedExpiresOnMs("1758370272000"), 1_758_370_272_000)
  assert.equal(parseFoldedExpiresOnMs("1758370272"), 1_758_370_272_000)
  assert.equal(parseFoldedExpiresOnMs("2026-09-20T11:51:12.000Z"), Date.parse("2026-09-20T11:51:12.000Z"))
  assert.equal(parseFoldedExpiresOnMs(""), undefined)
  assert.equal(parseFoldedExpiresOnMs("not-a-date"), undefined)
  assert.equal(parseFoldedExpiresOnMs("-1"), undefined)
})

