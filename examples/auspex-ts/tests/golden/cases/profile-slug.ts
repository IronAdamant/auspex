// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/profile-slug.json.
import { type GoldenCases } from "../harness.ts"
import { derivedProfileNext, profileSlugFromHost, profileSlugFromUrl, resolveLoginProfile } from "../../../src/profile-slug.ts"

export const cases: GoldenCases = {
  "profileSlugFromHost(\"app.example.com\")": () => profileSlugFromHost("app.example.com"),
  "profileSlugFromHost(\"www.example.com\")": () => profileSlugFromHost("www.example.com"),
  "profileSlugFromHost(\"app.example\")": () => profileSlugFromHost("app.example"),
  "profileSlugFromHost(\"EXAMPLE.COM.\")": () => profileSlugFromHost("EXAMPLE.COM."),
  "profileSlugFromHost(\"consistencyhub.io\")": () => profileSlugFromHost("consistencyhub.io"),
  "profileSlugFromHost(\"192.0.2.1\")": () => profileSlugFromHost("192.0.2.1"),
  "profileSlugFromUrl(\"https://app.example.com/dashboard?x=1\")": () => profileSlugFromUrl("https://app.example.com/dashboard?x=1"),
  "profileSlugFromUrl(\"https://app.example/\")": () => profileSlugFromUrl("https://app.example/"),
  "profileSlugFromHost(\"\")": () => profileSlugFromHost(""),
  "profileSlugFromHost(\"...\")": () => profileSlugFromHost("..."),
  "profileSlugFromHost(\"www.\")": () => profileSlugFromHost("www."),
  "profileSlugFromHost(\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.example.com\")": () => profileSlugFromHost("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.example.com"),
  "resolveLoginProfile({\"profile\":\"consistencyhub\",\"url\":\"https://app.example.com\"})": () => resolveLoginProfile(({"profile":"consistencyhub","url":"https://app.example.com"} as never)),
  "resolveLoginProfile({\"url\":\"https://app.example.com\"})": () => resolveLoginProfile(({"url":"https://app.example.com"} as never)),
  "derivedProfileNext(\"app-example\")": () => derivedProfileNext("app-example"),
}
