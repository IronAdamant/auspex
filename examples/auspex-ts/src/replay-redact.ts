/** Strip emails and password/email field values from rrweb events before a public player. */

export const REDACTED_EMAIL = "[redacted-email]"

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

const SENSITIVE_TYPES = new Set(["password", "email", "tel"])
const SENSITIVE_NAMES = new Set([
  "passwd",
  "password",
  "loginfmt",
  "login",
  "username",
  "email",
  "login_hint",
])

export function redactEmailsInString(value: string): string {
  return value.replace(EMAIL_RE, REDACTED_EMAIL)
}

export function stringContainsEmail(value: string): boolean {
  EMAIL_RE.lastIndex = 0
  return EMAIL_RE.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function sensitiveInputAttrs(attrs: Record<string, unknown> | undefined): boolean {
  if (!attrs) return false
  const type = String(attrs.type ?? "").toLowerCase()
  const name = String(attrs.name ?? "").toLowerCase()
  const auto = String(attrs.autocomplete ?? "").toLowerCase()
  const id = String(attrs.id ?? "").toLowerCase()
  if (SENSITIVE_TYPES.has(type)) return true
  if (SENSITIVE_NAMES.has(name)) return true
  if (auto.includes("password") || auto.includes("email") || auto.includes("username")) return true
  if (id === "i0116" || id === "i0118") return true
  return false
}

function redactHref(href: string): string {
  try {
    const url = new URL(href)
    for (const key of [...url.searchParams.keys()]) {
      if (/email|login_hint|username|hint|login/i.test(key)) {
        url.searchParams.set(key, REDACTED_EMAIL)
        continue
      }
      const current = url.searchParams.get(key) ?? ""
      if (stringContainsEmail(current)) url.searchParams.set(key, REDACTED_EMAIL)
    }
    return url.toString()
  } catch {
    return redactEmailsInString(href)
  }
}

function redactSerializedNode(node: unknown): void {
  if (!isRecord(node)) return
  if (typeof node.textContent === "string") {
    node.textContent = redactEmailsInString(node.textContent)
  }
  if (isRecord(node.attributes)) {
    const attrs = node.attributes
    if (sensitiveInputAttrs(attrs) && "value" in attrs) attrs.value = ""
    for (const [key, raw] of Object.entries(attrs)) {
      if (typeof raw !== "string") continue
      if (key === "href" || key === "src") attrs[key] = redactHref(raw)
      else attrs[key] = redactEmailsInString(raw)
    }
  }
  const children = node.childNodes
  if (Array.isArray(children)) {
    for (const child of children) redactSerializedNode(child)
  }
}

function redactIncremental(data: Record<string, unknown>): void {
  const source = data.source
  if (source === 5 && typeof data.text === "string") {
    data.text = ""
  }
  const texts = data.texts
  if (Array.isArray(texts)) {
    for (const row of texts) {
      if (isRecord(row) && typeof row.value === "string") {
        row.value = redactEmailsInString(row.value)
      }
    }
  }
  const attributes = data.attributes
  if (Array.isArray(attributes)) {
    for (const row of attributes) {
      if (!isRecord(row) || !isRecord(row.attributes)) continue
      const attrs = row.attributes
      if (sensitiveInputAttrs(attrs) && "value" in attrs) attrs.value = ""
      for (const [key, raw] of Object.entries(attrs)) {
        if (typeof raw === "string") attrs[key] = redactEmailsInString(raw)
      }
    }
  }
  const adds = data.adds
  if (Array.isArray(adds)) {
    for (const row of adds) {
      if (isRecord(row)) redactSerializedNode(row.node)
    }
  }
}

function redactEvent(event: unknown): void {
  if (!isRecord(event)) return
  const data = event.data
  if (!isRecord(data)) return
  if (typeof data.href === "string") data.href = redactHref(data.href)
  if (data.node) redactSerializedNode(data.node)
  redactIncremental(data)
}

/** Deep-clone rrweb events and strip emails plus password/email input values. */
export function redactRrwebEvents(events: unknown[]): unknown[] {
  const cloned = JSON.parse(JSON.stringify(events)) as unknown[]
  for (const event of cloned) redactEvent(event)
  return cloned
}

export function redactRrwebNdjson(ndjson: string): string {
  const events = ndjson
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown)
  const redacted = redactRrwebEvents(events)
  return `${redacted.map((event) => JSON.stringify(event)).join("\n")}\n`
}

export function assertNoCredentialLeak(text: string): string[] {
  const leaks: string[] = []
  EMAIL_RE.lastIndex = 0
  const emails = text.match(EMAIL_RE) ?? []
  for (const email of emails) leaks.push(email)
  if (/"type"\s*:\s*"password"[\s\S]{0,120}"value"\s*:\s*"[^"]+"/i.test(text)) {
    leaks.push("password-input-value")
  }
  return leaks
}
