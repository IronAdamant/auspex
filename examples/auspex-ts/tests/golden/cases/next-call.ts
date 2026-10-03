// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/next-call.json.
import { type GoldenCases } from "../harness.ts"
import { remintLoginNextCall } from "../../../src/next-call.ts"

export const cases: GoldenCases = {
  "remintLoginNextCall(\"app-example\")": () => remintLoginNextCall("app-example"),
}
