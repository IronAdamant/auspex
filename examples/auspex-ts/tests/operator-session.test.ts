import assert from "node:assert/strict"
import test from "node:test"
import {
  applyOperatorWipes,
  } from "../src/operator-session.ts"

const PASSWORD = "fixture-operator-password"
const SOLARI_KEY = "slr_live_fixture_operator_key"

test("applyOperatorWipes deletes by profile id and does not take login secrets", async () => {
  const deleted: string[] = []
  const wiped = await applyOperatorWipes(["supabase-com"], {
    list: async () => [{ id: "prof_supabase", name: "supabase-com" }],
    deleteProfile: async (id) => {
      deleted.push(id)
    },
  })
  assert.deepEqual(wiped.wiped, ["supabase-com"])
  assert.deepEqual(wiped.wipeFailed, [])
  assert.deepEqual(deleted, ["prof_supabase"])
  assert.equal(deleted.includes(PASSWORD), false)
  assert.equal(deleted.includes(SOLARI_KEY), false)
})

