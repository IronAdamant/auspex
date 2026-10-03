// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/launch-options.json.
import { type GoldenCases } from "../harness.ts"
import { parseProxyFlag, profileClaimSessionCreate, sessionCreateFromCheck } from "../../../src/launch-options.ts"

export const cases: GoldenCases = {
  "profileClaimSessionCreate(\"prof_saved\")": () => profileClaimSessionCreate("prof_saved"),
  "parseProxyFlag(\"us\")": () => parseProxyFlag("us"),
  "parseProxyFlag(\"smart\")": () => parseProxyFlag("smart"),
  "parseProxyFlag(\"off\")": () => parseProxyFlag("off"),
  "parseProxyFlag(\"gb\", \"warm-1\")": () => parseProxyFlag("gb", "warm-1"),
  "parseProxyFlag(undefined, \"warm-1\")": () => parseProxyFlag(undefined, "warm-1"),
  "sessionCreateFromCheck({\"proxy\":\"us\"})": () => sessionCreateFromCheck(({"proxy":"us"} as never)),
  "sessionCreateFromCheck({\"captcha\":true})": () => sessionCreateFromCheck(({"captcha":true} as never)),
  "sessionCreateFromCheck({\"stealth\":false,\"proxy\":\"off\"})": () => sessionCreateFromCheck(({"stealth":false,"proxy":"off"} as never)),
  "sessionCreateFromCheck({\"stealth\":true,\"record\":true,\"profileId\":\"p1\",\"url\":\"https://ironadamant.com\"})": () => sessionCreateFromCheck(({"stealth":true,"record":true,"profileId":"p1","url":"https://ironadamant.com"} as never)),
  "sessionCreateFromCheck({\"record\":true,\"profileId\":\"p1\",\"url\":\"https://consistencyhub.io\"})": () => sessionCreateFromCheck(({"record":true,"profileId":"p1","url":"https://consistencyhub.io"} as never)),
}
