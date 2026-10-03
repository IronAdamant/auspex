// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/http-url.json.
import { type GoldenCases } from "../harness.ts"
import { isHttpOrHttpsUrl } from "../../../src/http-url.ts"

export const cases: GoldenCases = {
  "isHttpOrHttpsUrl(\"http://example.com\")": () => isHttpOrHttpsUrl("http://example.com"),
  "isHttpOrHttpsUrl(\"https://user:pass@example.com/\")": () => isHttpOrHttpsUrl("https://user:pass@example.com/"),
}
