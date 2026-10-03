// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/check.json.
import { at, PKG, type GoldenCases } from "../harness.ts"
import { checkLoggedOutNext, expectMatchedPublicLandingGuide, needsHumanGuide, needsHumanNext, resolveFinalizeLoginTarget, toReceiptPath } from "../../../src/check.ts"

export const cases: GoldenCases = {
  "toReceiptPath(PKG + \"/.auspex/runs/stamp/screenshot.png\")": at(1790991897090, () => toReceiptPath(PKG + "/.auspex/runs/stamp/screenshot.png")),
  "resolveFinalizeLoginTarget({\"profile\":\"consistencyhub\"})": at(1790991897101, () => resolveFinalizeLoginTarget(({"profile":"consistencyhub"} as never))),
  "resolveFinalizeLoginTarget({\"profile\":\"myapp\",\"url\":\"https://app.example.com\",\"expect\":\"Dashboard\"})": at(1790991897108, () => resolveFinalizeLoginTarget(({"profile":"myapp","url":"https://app.example.com","expect":"Dashboard"} as never))),
  "needsHumanNext()": at(1790991897110, () => needsHumanNext()),
  "expectMatchedPublicLandingGuide(\"app-example\")": at(1790991897141, () => expectMatchedPublicLandingGuide("app-example")),
  "needsHumanGuide(\"app-example\")": at(1790991897699, () => needsHumanGuide("app-example")),
  "resolveFinalizeLoginTarget({\"profile\":\"consistencyhub\",\"url\":\"https://app.socialaize.com\",\"expect\":\"Dashboard\"})": at(1790991898212, () => resolveFinalizeLoginTarget(({"profile":"consistencyhub","url":"https://app.socialaize.com","expect":"Dashboard"} as never))),
  "checkLoggedOutNext(\"consistencyhub\", 78)": at(1790991898370, () => checkLoggedOutNext("consistencyhub", 78)),
  "checkLoggedOutNext(\"acme\", 3)": at(1790991898374, () => checkLoggedOutNext("acme", 3)),
}
