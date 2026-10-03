// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/page-actions.json.
import { at, type GoldenCases } from "../harness.ts"
import { assertFillPair, assertPageActionsAllowed, prepareFillTarget, probeVisibleControl } from "../../../src/page-actions.ts"

export const cases: GoldenCases = {
  "prepareFillTarget({\"selector\":\"#editor-content\",\"select\":\"all\"})": at(1790991897308, () => prepareFillTarget(({"selector":"#editor-content","select":"all"} as never))),
  "prepareFillTarget({\"selector\":\"#editor-content\",\"select\":\"end\"})": at(1790991897308, () => prepareFillTarget(({"selector":"#editor-content","select":"end"} as never))),
  "assertFillPair({\"fill\":\"#q\",\"value\":\"x\"})": at(1790991897426, () => assertFillPair(({"fill":"#q","value":"x"} as never))),
  "assertFillPair({})": at(1790991897426, () => assertFillPair(({} as never))),
  "assertPageActionsAllowed({\"click\":\"a\"})": at(1790991897427, () => assertPageActionsAllowed(({"click":"a"} as never))),
  "assertPageActionsAllowed({\"profile\":\"hub\",\"click\":\"a\",\"allowPageActions\":true})": at(1790991897427, () => assertPageActionsAllowed(({"profile":"hub","click":"a","allowPageActions":true} as never))),
  "probeVisibleControl(\"#editor-content\")": at(1790991897427, () => probeVisibleControl("#editor-content")),
  "probeVisibleControl(\"#missing\")": at(1790991897428, () => probeVisibleControl("#missing")),
  "probeVisibleControl(\"#user\")": at(1790991897428, () => probeVisibleControl("#user")),
  "probeVisibleControl(\"#pwd\")": at(1790991897428, () => probeVisibleControl("#pwd")),
  "probeVisibleControl(\"#code\")": at(1790991897428, () => probeVisibleControl("#code")),
  "probeVisibleControl(\"#email\")": at(1790991897429, () => probeVisibleControl("#email")),
}
