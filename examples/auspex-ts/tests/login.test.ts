import assert from "node:assert/strict"
import test from "node:test"
import {
  CONSOLE_PROFILES_URL,
  formatLogin,
  loginInstructions,
} from "../src/profiles.ts"

test("loginInstructions and formatLogin include console URL and profile name/id", () => {
  const result = loginInstructions(
    { id: "prof_test_id", name: "auspex-goal-test" },
    "https://example.com/login",
  )
  assert.equal(result.profileId, "prof_test_id")
  assert.equal(result.name, "auspex-goal-test")
  assert.match(result.consoleUrl, /console\.getsolari\.com/)
  assert.equal(result.consoleUrl, CONSOLE_PROFILES_URL)
  assert.match(result.next, /Open editor/)
  const printed = formatLogin(result)
  assert.match(printed, /console\.getsolari\.com/)
  assert.match(printed, /auspex-goal-test/)
  assert.match(printed, /prof_test_id/)
})
