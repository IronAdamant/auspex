// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/stdio-transport.json.
import { type GoldenCases } from "../harness.ts"
import { parseContentLength } from "../../../src/stdio-transport.ts"

export const cases: GoldenCases = {
  "parseContentLength(\"12\", 10485760)": () => parseContentLength("12", 10485760),
}
