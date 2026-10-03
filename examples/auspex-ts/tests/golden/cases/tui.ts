// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/tui.json.
import { type GoldenCases } from "../harness.ts"
import { desktopLogHeader, desktopLogLine, desktopOverviewText, desktopSummary } from "../../../src/tui.ts"

export const cases: GoldenCases = {
  "desktopLogHeader()": () => desktopLogHeader(),
  "desktopLogLine(\"booting\")": () => desktopLogLine("booting"),
  "desktopLogLine(\"screenshot\")": () => desktopLogLine("screenshot"),
  "desktopLogLine(\"done\")": () => desktopLogLine("done"),
  "desktopSummary({\"ok\":true,\"ready\":true,\"screenshotPath\":\".auspex/runs/stamp/screenshot.png\",\"errors\":[]})": () => desktopSummary(({"ok":true,"ready":true,"screenshotPath":".auspex/runs/stamp/screenshot.png","errors":[]} as never)),
  "desktopOverviewText()": () => desktopOverviewText(),
}
