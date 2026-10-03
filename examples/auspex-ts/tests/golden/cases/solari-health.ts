// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/solari-health.json.
import { at, type GoldenCases } from "../harness.ts"
import { healthSolariOptions } from "../../../src/solari-health.ts"

export const cases: GoldenCases = {
  "healthSolariOptions(\"slr_live_testkeyvalue\")": at(1790991898547, () => healthSolariOptions("slr_live_testkeyvalue")),
}
