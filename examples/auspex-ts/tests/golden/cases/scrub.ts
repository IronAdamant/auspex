// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/scrub.json.
import { type GoldenCases } from "../harness.ts"
import { redactUrlSecrets, redactUrlSecretsInText } from "../../../src/scrub.ts"

export const cases: GoldenCases = {
  "redactUrlSecrets(\"https://cloud.example/login/oauth2/code/grant?code=4f47bc0be3df&state=M0jZ.JTJG&lang=en\")": () => redactUrlSecrets("https://cloud.example/login/oauth2/code/grant?code=4f47bc0be3df&state=M0jZ.JTJG&lang=en"),
  "redactUrlSecrets(\"https://app.example/#/dashboard\")": () => redactUrlSecrets("https://app.example/#/dashboard"),
  "redactUrlSecrets(\"https://app.example/dashboard?tab=2\")": () => redactUrlSecrets("https://app.example/dashboard?tab=2"),
  "redactUrlSecrets(\"https://app.example/cb#access_token=abc123&token_type=bearer&expires_in=3600\")": () => redactUrlSecrets("https://app.example/cb#access_token=abc123&token_type=bearer&expires_in=3600"),
  "redactUrlSecrets(\"https://app.example/#/callback?id_token=eyJabc&view=1\")": () => redactUrlSecrets("https://app.example/#/callback?id_token=eyJabc&view=1"),
  "redactUrlSecrets(\"not a url\")": () => redactUrlSecrets("not a url"),
  "redactUrlSecretsInText(\"locator.click: Timeout 15000ms exceeded. navigated to \\\"https://cloud.example/login/oa...)": () => redactUrlSecretsInText("locator.click: Timeout 15000ms exceeded. navigated to \"https://cloud.example/login/oauth2/code/grant?code=4f47bc0be3df4ff6&state=M0jZFW1Zi9\""),
}
