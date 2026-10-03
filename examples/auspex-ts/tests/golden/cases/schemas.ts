// What the CLI-shared schemas accept and refuse: URLs the cloud browser may open, expects, and the
// MCP check and login inputs. Inputs come from the schema tests this table replaced.
import type { GoldenCases } from "../harness.ts"
import { checkUrlSchema, httpUrlSchema } from "../../../src/http-url.ts"
import { expectSchema } from "../../../src/text.ts"
import { auspexCheckInputSchema, auspexLoginInputSchema } from "../../../src/tool-schema.ts"

type Schema = { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues: Array<{ message: string }> } } }
const parsed = (schema: Schema, value: unknown) => () => {
  const r = schema.safeParse(value)
  return r.success ? { ok: true, data: r.data } : { ok: false, issues: r.error?.issues.map((i) => i.message) }
}

const base = { url: "https://ironadamant.com", expect: "Build it." }
const actions = { url: "https://example.com", expect: "Example Domain", allowPageActions: true }

export const cases: GoldenCases = {}
for (const url of [
  "https://ironadamant.com",
  "https://consistencyhub.io",
  "http://example.com",
  "http://localhost:3000",
  "http://127.0.0.1/",
  "http://127.1/",
  "http://0.0.0.0/",
  "http://[::1]/",
  "http://169.254.169.254/",
  "http://metadata.google.internal/",
  "https://user:pass@example.com/",
  "file:///etc/passwd",
  "javascript:alert(1)",
]) {
  cases[`checkUrl ${url}`] = parsed(checkUrlSchema, url)
  cases[`httpUrl ${url}`] = parsed(httpUrlSchema, url)
}
for (const expect of ["", "   ", "Build it."]) cases[`expect ${JSON.stringify(expect)}`] = parsed(expectSchema, expect)

const checkInputs: Record<string, unknown> = {
  "url + expect": base,
  "loopback url": { ...base, url: "http://localhost:3000" },
  "record + profile": { ...base, record: true, profile: "consistencyhub" },
  "record + consistencyhub + allowRecordProfile": { ...base, record: true, profile: "consistencyhub", allowRecordProfile: true },
  "record + profile + allowRecordProfile on marketing": { ...base, record: true, profile: "demo", allowRecordProfile: true },
  "record + profile + fill": { ...base, record: true, profile: "demo", allowRecordProfile: true, fill: "x", value: "y" },
  "record + profile + fill + allowPageActions": {
    ...base, record: true, profile: "demo", allowRecordProfile: true, allowPageActions: true, fill: "x", value: "y",
  },
  "record + sso": { ...base, record: true, sso: true },
  "record on a dashboard URL": { url: "https://consistencyhub.io/dashboard", expect: "Document Editor", record: true },
  "saved check name only": { name: "ironadamant" },
  "nothing": {},
  "waitFor, fill, click, proxy, captcha": { ...base, waitFor: "#main", fill: "#q", value: "hello", click: "button.go", proxy: "us", captcha: true },
  "fill without value": { ...base, fill: "#q" },
  "whitespace profile": { ...base, profile: "   " },
  "one fill and one click": { ...actions, fill: "#q", value: "hi", click: "button.go" },
  "two fills": { ...actions, fill: ["#a", "#b"], value: "hi" },
  "two clicks": { ...actions, click: ["button.open", "button.save"] },
}
for (const [name, input] of Object.entries(checkInputs)) cases[`auspex_check ${name}`] = parsed(auspexCheckInputSchema, input)

const loginInputs: Record<string, unknown> = {
  "profile": { profile: "auspex-demo" },
  "whitespace profile": { profile: "   " },
  "padded profile": { profile: "  auspex-demo  " },
  "url only": { url: "https://app.example.com" },
  "loopback url": { url: "http://localhost:3000" },
  "nothing": {},
}
for (const [name, input] of Object.entries(loginInputs)) cases[`auspex_login ${name}`] = parsed(auspexLoginInputSchema, input)
