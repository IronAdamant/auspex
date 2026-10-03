// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/sandbox.json.
import { at, type GoldenCases } from "../harness.ts"
import { parseAssertStdout, profileClaimBudgetMs } from "../../../src/sandbox.ts"

export const cases: GoldenCases = {
  "profileClaimBudgetMs(90000, 60000)": at(1790991896875, () => profileClaimBudgetMs(90000, 60000)),
  "profileClaimBudgetMs(90000, 90000)": at(1790991896875, () => profileClaimBudgetMs(90000, 90000)),
  "parseAssertStdout(\"noise\\n{\\\"ok\\\":true,\\\"errors\\\":[],\\\"claimOk\\\":true,\\\"claimErrors\\\":[]}\\n\")": at(1790991898512, () => parseAssertStdout("noise\n{\"ok\":true,\"errors\":[],\"claimOk\":true,\"claimErrors\":[]}\n")),
  "parseAssertStdout(\"not json\")": at(1790991898512, () => parseAssertStdout("not json")),
  "parseAssertStdout(\" \")": at(1790991898513, () => parseAssertStdout("   ")),
  "parseAssertStdout(\"{\\\"ok\\\":true,\\\"errors\\\":[],\\\"claimOk\\\":false,\\\"claimErrors\\\":[\\\"anonymous claim skippe...)": at(1790991898513, () => parseAssertStdout("{\"ok\":true,\"errors\":[],\"claimOk\":false,\"claimErrors\":[\"anonymous claim skipped\"]}\n")),
  "parseAssertStdout(\"{\\\"ok\\\":true,\\\"errors\\\":[],\\\"claimOk\\\":false,\\\"claimErrors\\\":[\\\"fetched page text does...)": at(1790991898513, () => parseAssertStdout("{\"ok\":true,\"errors\":[],\"claimOk\":false,\"claimErrors\":[\"fetched page text does not contain expect\"]}\n")),
}
