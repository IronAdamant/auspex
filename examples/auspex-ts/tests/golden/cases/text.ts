// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/text.json.
import { type GoldenCases } from "../harness.ts"
import { excerptOf, haystackMatches, normalizeHaystack } from "../../../src/text.ts"

export const cases: GoldenCases = {
  "normalizeHaystack(\"Build it.\\nShip it.\")": () => normalizeHaystack("Build  it.\nShip   it."),
  "haystackMatches(\"Build it.\\nShip it.\", \"Build it.\")": () => haystackMatches("Build  it.\nShip   it.", "Build it."),
  "excerptOf(\"Build it.\\nShip it.\")": () => excerptOf("Build  it.\nShip   it."),
  "excerptOf(\"Build it. Ship it.\")": () => excerptOf("Build it. Ship it."),
  "haystackMatches(\"10+ Platforms , One Dashboard\", \"Dashboard\")": () => haystackMatches("10+ Platforms , One Dashboard", "Dashboard"),
  "haystackMatches(\"One Dashboard\", \"Dashboard\")": () => haystackMatches("One Dashboard", "Dashboard"),
  "haystackMatches(\"Dashboards\", \"Dashboard\")": () => haystackMatches("Dashboards", "Dashboard"),
  "haystackMatches(\"MyDashboard\", \"Dashboard\")": () => haystackMatches("MyDashboard", "Dashboard"),
  "haystackMatches(\"one dashboard\", \"Dashboard\")": () => haystackMatches("one dashboard", "Dashboard"),
  "haystackMatches(\"Welcome to your Dashboard\", \"Dashboard\")": () => haystackMatches("Welcome to your Dashboard", "Dashboard"),
  "haystackMatches(\"Dashboard\", \"Dashboard\")": () => haystackMatches("Dashboard", "Dashboard"),
  "haystackMatches(\"10+ Platforms , One Dashboard\", \"One Dashboard\")": () => haystackMatches("10+ Platforms , One Dashboard", "One Dashboard"),
  "haystackMatches(\"Open the Document Editor today\", \"Document Editor\")": () => haystackMatches("Open the Document Editor today", "Document Editor"),
  "haystackMatches(\"Checkpoint Projects\", \"Checkpoint\")": () => haystackMatches("Checkpoint Projects", "Checkpoint"),
  "haystackMatches(\"One office job. Your accounts.\", \"One office job.\")": () => haystackMatches("One office job. Your accounts.", "One office job."),
  "haystackMatches(\"Home\\nDashboard\\nSettings\", \"Dashboard\")": () => haystackMatches("Home\nDashboard\nSettings", "Dashboard"),
  "haystackMatches(\"Projects\\n Checkpoint\\nLogout\", \"Checkpoint\")": () => haystackMatches("Projects\n  Checkpoint\nLogout", "Checkpoint"),
  "haystackMatches(\"Overview. Dashboard\", \"Dashboard\")": () => haystackMatches("Overview. Dashboard", "Dashboard"),
  "haystackMatches(\"Home | Dashboard | Settings\", \"Dashboard\")": () => haystackMatches("Home | Dashboard | Settings", "Dashboard"),
  "haystackMatches(\"Home Dashboard Settings\", \"Dashboard\")": () => haystackMatches("Home Dashboard Settings", "Dashboard"),
  "haystackMatches(\"10+ Platforms ,\\nOne Dashboard\", \"Dashboard\")": () => haystackMatches("10+ Platforms ,\nOne Dashboard", "Dashboard"),
  "haystackMatches(\"Document\\nEditor\", \"Document Editor\")": () => haystackMatches("Document\nEditor", "Document Editor"),
  "haystackMatches(\"10+ Platforms , One Dashboard. Welcome to your workspace\", \"your workspace\")": () => haystackMatches("10+ Platforms , One Dashboard. Welcome to your workspace", "your workspace"),
}
