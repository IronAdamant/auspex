// Recorded from unit tests by experiments/slim-tests/record-goldens.ts. Outputs live in ../out/sso.json.
import { at, type GoldenCases } from "../harness.ts"
import { describeAuthWall, shouldFailClosedAuth, stillOnAuth } from "../../../src/sso.ts"

export const cases: GoldenCases = {
  "stillOnAuth(new URL(\"https://login.microsoftonline.com/common/oauth2/v2.0/authorize\"))": at(1790991898093, () => stillOnAuth(new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize"))),
  "stillOnAuth(new URL(\"https://login.live.com/\"))": at(1790991898093, () => stillOnAuth(new URL("https://login.live.com/"))),
  "stillOnAuth(new URL(\"https://consistencyhub.io/login\"))": at(1790991898093, () => stillOnAuth(new URL("https://consistencyhub.io/login"))),
  "stillOnAuth(new URL(\"https://consistencyhub.io/login/\"))": at(1790991898093, () => stillOnAuth(new URL("https://consistencyhub.io/login/"))),
  "stillOnAuth(new URL(\"https://consistencyhub.io/login/oauth\"))": at(1790991898093, () => stillOnAuth(new URL("https://consistencyhub.io/login/oauth"))),
  "stillOnAuth(new URL(\"https://consistencyhub.io/Login\"))": at(1790991898093, () => stillOnAuth(new URL("https://consistencyhub.io/Login"))),
  "stillOnAuth(new URL(\"https://consistencyhub.io/auth\"))": at(1790991898093, () => stillOnAuth(new URL("https://consistencyhub.io/auth"))),
  "stillOnAuth(new URL(\"https://consistencyhub.io/auth/callback\"))": at(1790991898093, () => stillOnAuth(new URL("https://consistencyhub.io/auth/callback"))),
  "stillOnAuth(new URL(\"https://accounts.google.com/o/oauth2/v2/auth\"))": at(1790991898093, () => stillOnAuth(new URL("https://accounts.google.com/o/oauth2/v2/auth"))),
  "stillOnAuth(new URL(\"https://ironadamant.com/\"))": at(1790991898094, () => stillOnAuth(new URL("https://ironadamant.com/"))),
  "stillOnAuth(new URL(\"https://login.microsoftonline.com.evil.com/\"))": at(1790991898094, () => stillOnAuth(new URL("https://login.microsoftonline.com.evil.com/"))),
  "stillOnAuth(new URL(\"https://notlogin.live.com/\"))": at(1790991898094, () => stillOnAuth(new URL("https://notlogin.live.com/"))),
  "shouldFailClosedAuth(new URL(\"https://login.microsoftonline.com/common/oauth2/v2.0/authorize\"), {})": at(1790991898094, () => shouldFailClosedAuth(new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize"), ({} as never))),
  "shouldFailClosedAuth(new URL(\"https://accounts.google.com/o/oauth2/v2/auth\"), {})": at(1790991898094, () => shouldFailClosedAuth(new URL("https://accounts.google.com/o/oauth2/v2/auth"), ({} as never))),
  "shouldFailClosedAuth(new URL(\"https://consistencyhub.io/login\"), {})": at(1790991898094, () => shouldFailClosedAuth(new URL("https://consistencyhub.io/login"), ({} as never))),
  "shouldFailClosedAuth(new URL(\"https://consistencyhub.io/login\"), {\"sso\":true})": at(1790991898094, () => shouldFailClosedAuth(new URL("https://consistencyhub.io/login"), ({"sso":true} as never))),
  "shouldFailClosedAuth(new URL(\"https://consistencyhub.io/login\"), {\"profile\":\"consistencyhub\"})": at(1790991898094, () => shouldFailClosedAuth(new URL("https://consistencyhub.io/login"), ({"profile":"consistencyhub"} as never))),
  "describeAuthWall({\"url\":\"https://login.microsoftonline.com/common/oauth2/v2.0/authorize\",\"hasPasswordInp...)": at(1790991898094, () => describeAuthWall(({"url":"https://login.microsoftonline.com/common/oauth2/v2.0/authorize","hasPasswordInput":true,"text":"Enter password"} as never))),
  "describeAuthWall({\"url\":\"https://login.microsoftonline.com/common/oauth2/v2.0/authorize\",\"text\":\"Approve...)": at(1790991898095, () => describeAuthWall(({"url":"https://login.microsoftonline.com/common/oauth2/v2.0/authorize","text":"Approve a sign-in request in your authenticator app"} as never))),
  "describeAuthWall({\"url\":\"https://login.microsoftonline.com/common/oauth2/v2.0/authorize\",\"text\":\"Pick an...)": at(1790991898095, () => describeAuthWall(({"url":"https://login.microsoftonline.com/common/oauth2/v2.0/authorize","text":"Pick an account"} as never))),
  "describeAuthWall({\"url\":\"https://consistencyhub.io/dashboard\",\"text\":\"Document Editor\"})": at(1790991898095, () => describeAuthWall(({"url":"https://consistencyhub.io/dashboard","text":"Document Editor"} as never))),
  "describeAuthWall({\"url\":\"https://accounts.google.com/signin/v2/challenge/pwd\",\"hasPasswordInput\":true,\"t...)": at(1790991898095, () => describeAuthWall(({"url":"https://accounts.google.com/signin/v2/challenge/pwd","hasPasswordInput":true,"text":"Enter your password"} as never))),
}
