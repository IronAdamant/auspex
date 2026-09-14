/**
 * CLI ↔ MCP parity. Every MCP tool is a CLI command; every JSON field has a flag
 * (or a documented positional). Hosts may speak either door.
 */
export type ContractFieldKind = "boolean" | "string" | "number" | "positional" | "xy"

export type ContractField = {
  json: string
  flag: string
  kind: ContractFieldKind
}

export type ContractCommand = {
  cmd: string
  tool: string
  fields: ContractField[]
}

export const AUSPEX_CONTRACT: readonly ContractCommand[] = [
  {
    cmd: "check",
    tool: "auspex_check",
    fields: [
      { json: "name", flag: "--name", kind: "string" },
      { json: "url", flag: "<url>", kind: "positional" },
      { json: "expect", flag: "--expect", kind: "string" },
      { json: "selector", flag: "--selector", kind: "string" },
      { json: "profile", flag: "--profile", kind: "string" },
      { json: "stealth", flag: "--stealth", kind: "boolean" },
      { json: "record", flag: "--record", kind: "boolean" },
      { json: "sso", flag: "--sso", kind: "boolean" },
      { json: "ssoProvider", flag: "--sso-provider", kind: "string" },
      { json: "waitFor", flag: "--wait-for", kind: "string" },
      { json: "fill", flag: "--fill", kind: "string" },
      { json: "value", flag: "--value", kind: "string" },
      { json: "click", flag: "--click", kind: "string" },
      { json: "proxy", flag: "--proxy", kind: "string" },
      { json: "proxySticky", flag: "--proxy-sticky", kind: "string" },
      { json: "captcha", flag: "--captcha", kind: "boolean" },
      { json: "verify", flag: "--no-verify", kind: "boolean" },
      { json: "allowRecordProfile", flag: "--allow-record-profile", kind: "boolean" },
      { json: "allowPageActions", flag: "--allow-page-actions", kind: "boolean" },
      { json: "saveProfile", flag: "--save-profile", kind: "boolean" },
    ],
  },
  {
    cmd: "login",
    tool: "auspex_login",
    fields: [
      { json: "profile", flag: "--profile", kind: "string" },
      { json: "url", flag: "--url", kind: "string" },
      { json: "wait", flag: "--wait", kind: "boolean" },
    ],
  },
  {
    cmd: "await-login",
    tool: "auspex_await_login",
    fields: [
      { json: "profile", flag: "--profile", kind: "string" },
      { json: "sinceVersion", flag: "--since-version", kind: "number" },
      { json: "timeoutMs", flag: "--timeout-ms", kind: "number" },
    ],
  },
  {
    cmd: "profiles",
    tool: "auspex_profiles",
    fields: [],
  },
  {
    cmd: "profile-status",
    tool: "auspex_profile_status",
    fields: [
      { json: "profile", flag: "--profile", kind: "string" },
      { json: "name", flag: "--name", kind: "string" },
      { json: "url", flag: "--url", kind: "string" },
    ],
  },
  {
    cmd: "verify",
    tool: "auspex_verify",
    fields: [{ json: "runDir", flag: "<runDir>", kind: "positional" }],
  },
  {
    cmd: "desktop",
    tool: "auspex_desktop",
    fields: [
      { json: "open", flag: "--open", kind: "string" },
      { json: "type", flag: "--type", kind: "string" },
      { json: "clickX", flag: "--click", kind: "xy" },
      { json: "clickY", flag: "--click", kind: "xy" },
      { json: "expect", flag: "--expect", kind: "string" },
    ],
  },
  {
    cmd: "reap",
    tool: "auspex_reap",
    fields: [
      { json: "dryRun", flag: "--dry-run", kind: "boolean" },
      { json: "sessionId", flag: "--session", kind: "string" },
      { json: "vmId", flag: "--vm", kind: "string" },
      { json: "packReceipts", flag: "--pack-receipts", kind: "boolean" },
      { json: "accountWide", flag: "--account-wide", kind: "boolean" },
    ],
  },
]

export function contractJsonFields(cmd: string): string[] {
  const row = AUSPEX_CONTRACT.find((c) => c.cmd === cmd)
  return row ? row.fields.map((f) => f.json) : []
}

export function contractToolNames(): string[] {
  return AUSPEX_CONTRACT.map((c) => c.tool)
}

export function contractCliCommands(): string[] {
  return AUSPEX_CONTRACT.map((c) => c.cmd)
}
