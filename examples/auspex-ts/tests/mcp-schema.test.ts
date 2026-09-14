import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerAuspexTools } from "../src/mcp-tools.ts"
import { auspexCheckInputObject } from "../src/tool-schema.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("auspexCheckInputObject is a ZodObject with url and expect (MCP ListTools needs .shape)", () => {
  assert.ok(auspexCheckInputObject.shape)
  assert.ok(auspexCheckInputObject.shape.url)
  assert.ok(auspexCheckInputObject.shape.expect)
})

test("ListTools advertises auspex_check url and expect from the shipped registration", async () => {
  const mcp = new McpServer({ name: "auspex", version: "0.1.0" })
  registerAuspexTools(mcp)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: "auspex-schema-test", version: "0" })
  await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)])
  try {
    const listed = await client.listTools()
    const check = listed.tools.find((t) => t.name === "auspex_check")
    assert.ok(check, "auspex_check missing from ListTools")
    const props = check.inputSchema.properties ?? {}
    assert.ok("url" in props, `advertised properties: ${Object.keys(props).join(",")}`)
    assert.ok("expect" in props, `advertised properties: ${Object.keys(props).join(",")}`)
    assert.ok("waitFor" in props)
    assert.ok("click" in props)
    assert.ok("proxy" in props)
    assert.ok("captcha" in props)
    assert.ok("allowPageActions" in props)
    assert.ok("allowRecordProfile" in props)
    assert.ok("saveProfile" in props)
    const required = check.inputSchema.required ?? []
    assert.equal(required.includes("url"), false)
    assert.equal(required.includes("expect"), false)
    assert.ok("name" in props)
    assert.ok("url" in props, `advertised properties: ${Object.keys(props).join(",")}`)
    assert.ok("expect" in props, `advertised properties: ${Object.keys(props).join(",")}`)
    const desktop = listed.tools.find((t) => t.name === "auspex_desktop")
    assert.ok(desktop, "auspex_desktop missing from ListTools")
    assert.match(desktop.description ?? "", /sandbox demo|mousepad|named Solari sandbox/i)
    assert.match(check.description ?? "", /verify=false|default true|Verifies by default|HTTP \+ OCR|HTTP fetch/i)
    assert.match(check.description ?? "", /schemaVersion/)
    assert.match(check.description ?? "", /schemaVersion 1 is frozen/)
    assert.match(check.description ?? "", /matched\|loggedOut|reason/)
    assert.match(check.description ?? "", /ironadamant|checkpoint|consistencyhub/)
    assert.match(check.description ?? "", /record\+profile|allowRecordProfile/)
    assert.match(check.description ?? "", /402|FeatureRequiresPlan/)
    assert.match(check.description ?? "", /429/)
    assert.match(check.description ?? "", /auspex_reap|429/)
    assert.match(check.description ?? "", /dashboard/)
    const reap = listed.tools.find((t) => t.name === "auspex_reap")
    assert.ok(reap, "auspex_reap missing from ListTools")
    const reapProps = reap.inputSchema.properties ?? {}
    assert.ok("accountWide" in reapProps)
    assert.match(reap.description ?? "", /429|leftover|kill/i)
    assert.match(reap.description ?? "", /packReceipts|pack/)
    assert.match(reap.description ?? "", /accountWide|ledger/i)
    const verify = listed.tools.find((t) => t.name === "auspex_verify")
    assert.ok(verify)
    assert.match(verify.description ?? "", /claimOk|ok/)
    const login = listed.tools.find((t) => t.name === "auspex_login")
    assert.ok(login)
    assert.match(login.description ?? "", /handoff/)
    const awaitLogin = listed.tools.find((t) => t.name === "auspex_await_login")
    assert.ok(awaitLogin, "auspex_await_login missing from ListTools")
    assert.match(awaitLogin.description ?? "", /empty-save|cookies or origins/i)
    const status = listed.tools.find((t) => t.name === "auspex_profile_status")
    assert.ok(status, "auspex_profile_status missing from ListTools")
    assert.match(status.description ?? "", /loggedIn|loggedOut|needsHuman/)
    assert.match(status.description ?? "", /password/)
    const deskProps = desktop.inputSchema.properties ?? {}
    assert.ok("open" in deskProps || "type" in deskProps)
    assert.ok("expect" in deskProps)
    assert.match(desktop.description ?? "", /sandbox demo|mousepad/i)
    assert.match(desktop.description ?? "", /not the user's Mac/i)
    assert.equal(/\buse the Mac\b/i.test(desktop.description ?? ""), false)
  } finally {
    await client.close()
    await mcp.close()
  }
})

test("mcp-tools desktop payload keeps ASCII log and JSON", () => {
  const tools = readFileSync(path.join(root, "src", "mcp-tools.ts"), "utf8")
  assert.match(tools, /unshift/)
  assert.match(tools, /desktopId/)
  assert.match(tools, /packToolFailure/)
})

test("mcp.ts registers tools via registerAuspexTools; that path uses auspexCheckInputObject", () => {
  const entry = readFileSync(path.join(root, "src", "mcp.ts"), "utf8")
  assert.match(entry, /registerAuspexTools\(server\)/)
  const tools = readFileSync(path.join(root, "src", "mcp-tools.ts"), "utf8")
  assert.match(tools, /inputSchema:\s*auspexCheckInputObject/)
  assert.equal(tools.includes("inputSchema: auspexCheckInputSchema"), false)
})
