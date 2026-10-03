// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/editor-save-attempt.json.
import { type GoldenCases } from "../harness.ts"
import { isNotSavableConflict } from "../../../src/editor-save-attempt.ts"

export const cases: GoldenCases = {
  "isNotSavableConflict(409, \"not in a savable state\")": () => isNotSavableConflict(409, "not in a savable state"),
  "isNotSavableConflict(409, \"Editor is NOT in a savable state right now\")": () => isNotSavableConflict(409, "Editor is NOT in a savable state right now"),
  "isNotSavableConflict(409, \"profile is not in a savable state\")": () => isNotSavableConflict(409, "profile is not in a savable state"),
  "isNotSavableConflict(409, \"The editor isn't in a savable state.\")": () => isNotSavableConflict(409, "The editor isn't in a savable state."),
  "isNotSavableConflict(409, \"The editor isn’t in a savable state.\")": () => isNotSavableConflict(409, "The editor isn’t in a savable state."),
  "isNotSavableConflict(409, \"editor already running\")": () => isNotSavableConflict(409, "editor already running"),
  "isNotSavableConflict(409, \"editor is open\")": () => isNotSavableConflict(409, "editor is open"),
  "isNotSavableConflict(409, \"The editor isn't ready\")": () => isNotSavableConflict(409, "The editor isn't ready"),
  "isNotSavableConflict(409, \"not savable\")": () => isNotSavableConflict(409, "not savable"),
  "isNotSavableConflict(409, \"cannot in a savable state\")": () => isNotSavableConflict(409, "cannot in a savable state"),
  "isNotSavableConflict(502, \"not in a savable state\")": () => isNotSavableConflict(502, "not in a savable state"),
  "isNotSavableConflict(502, \"The editor isn't in a savable state.\")": () => isNotSavableConflict(502, "The editor isn't in a savable state."),
  "isNotSavableConflict(401, \"not in a savable state\")": () => isNotSavableConflict(401, "not in a savable state"),
}
