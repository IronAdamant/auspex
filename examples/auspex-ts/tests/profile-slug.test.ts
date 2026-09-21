import assert from "node:assert/strict"
import test from "node:test"
import { parseArgv } from "../src/cli.ts"
import {
  LOGIN_PROFILE_OR_URL_ERROR,
  PROFILE_SLUG_ERROR,
  PROFILE_SLUG_MAX,
  derivedProfileNext,
  profileSlugFromHost,
  profileSlugFromUrl,
  resolveLoginProfile,
} from "../src/profile-slug.ts"
import { auspexLoginInputSchema } from "../src/tool-schema.ts"

test("profileSlugFromHost hyphenates labels and strips www", () => {
  assert.equal(profileSlugFromHost("app.example.com"), "app-example-com")
  assert.equal(profileSlugFromHost("www.example.com"), "example-com")
  assert.equal(profileSlugFromHost("app.example"), "app-example")
  assert.equal(profileSlugFromHost("EXAMPLE.COM."), "example-com")
  assert.equal(profileSlugFromHost("consistencyhub.io"), "consistencyhub-io")
  assert.notEqual(profileSlugFromHost("consistencyhub.io"), "consistencyhub")
  assert.equal(profileSlugFromHost("192.0.2.1"), "192-0-2-1")
})

test("profileSlugFromUrl reads the host only", () => {
  assert.equal(profileSlugFromUrl("https://app.example.com/dashboard?x=1"), "app-example-com")
  assert.equal(profileSlugFromUrl("https://app.example/"), "app-example")
  assert.throws(() => profileSlugFromUrl("not-a-url"), new RegExp(PROFILE_SLUG_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})

test("profileSlugFromHost refuses empty or punctuation-only hosts", () => {
  assert.equal(profileSlugFromHost(""), undefined)
  assert.equal(profileSlugFromHost("..."), undefined)
  assert.equal(profileSlugFromHost("www."), undefined)
})

test("profileSlugFromHost caps length", () => {
  const long = `${"a".repeat(60)}.example.com`
  const slug = profileSlugFromHost(long)
  assert.ok(slug)
  assert.ok(slug.length <= PROFILE_SLUG_MAX)
})

test("resolveLoginProfile prefers explicit --profile over url host", () => {
  const named = resolveLoginProfile({ profile: "consistencyhub", url: "https://app.example.com" })
  assert.equal(named.name, "consistencyhub")
  assert.equal(named.derived, false)
  const derived = resolveLoginProfile({ url: "https://app.example.com" })
  assert.equal(derived.name, "app-example-com")
  assert.equal(derived.derived, true)
  assert.throws(() => resolveLoginProfile({}), new RegExp(LOGIN_PROFILE_OR_URL_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})

test("derivedProfileNext names the slug and the override", () => {
  const next = derivedProfileNext("app-example")
  assert.match(next, /derived from URL host: app-example/)
  assert.match(next, /--profile app-example/)
  assert.match(next, /--profile <yours>/)
})

test("parseArgv login --url without --profile derives a host slug", () => {
  const derived = parseArgv(["login", "--url", "https://app.example.com"])
  assert.equal(derived.status, "ok")
  if (derived.status === "ok" && derived.command.cmd === "login") {
    assert.equal(derived.command.profile, "app-example-com")
    assert.equal(derived.command.profileDerived, true)
    assert.equal(derived.command.url, "https://app.example.com")
  }
  const shortHost = parseArgv(["login", "--url", "https://app.example"])
  assert.equal(shortHost.status, "ok")
  if (shortHost.status === "ok" && shortHost.command.cmd === "login") {
    assert.equal(shortHost.command.profile, "app-example")
    assert.equal(shortHost.command.profileDerived, true)
  }
  const explicit = parseArgv(["login", "--profile", "consistencyhub", "--url", "https://app.example.com"])
  assert.equal(explicit.status, "ok")
  if (explicit.status === "ok" && explicit.command.cmd === "login") {
    assert.equal(explicit.command.profile, "consistencyhub")
    assert.equal(explicit.command.profileDerived, false)
  }
  const missing = parseArgv(["login"])
  assert.equal(missing.status, "error")
  if (missing.status === "error") assert.match(missing.message, /--profile <name> or --url/)
})

test("MCP login schema allows url-only and still rejects whitespace profile", () => {
  assert.equal(auspexLoginInputSchema.safeParse({ url: "https://app.example.com" }).success, true)
  assert.equal(auspexLoginInputSchema.safeParse({ profile: "auspex-demo" }).success, true)
  assert.equal(auspexLoginInputSchema.safeParse({ profile: "   " }).success, false)
  assert.equal(auspexLoginInputSchema.safeParse({}).success, false)
})
