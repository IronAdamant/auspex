// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/receipt-diff.json.
import { type GoldenCases } from "../harness.ts"
import { canonicalCheckUrl } from "../../../src/receipt-diff.ts"

export const cases: GoldenCases = {
  "canonicalCheckUrl(\"https://IronAdamant.com/\")": () => canonicalCheckUrl("https://IronAdamant.com/"),
  "canonicalCheckUrl(\"https://checkpointprojects.com/foo/\")": () => canonicalCheckUrl("https://checkpointprojects.com/foo/"),
}
