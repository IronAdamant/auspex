// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/job.json.
import { at, type GoldenCases } from "../harness.ts"
import { parseJobFlags } from "../../../src/job.ts"

export const cases: GoldenCases = {
  "parseJobFlags(([]))": at(1790991897312, () => parseJobFlags(([] as never))),
}
