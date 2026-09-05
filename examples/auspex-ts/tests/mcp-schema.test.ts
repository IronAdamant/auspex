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
    assert.ok("verify" in props)
    const required = check.inputSchema.required ?? []
    assert.ok(required.includes("url"))
    assert.ok(required.includes("expect"))
    const desktop = listed.tools.find((t) => t.name === "auspex_desktop")
    assert.ok(desktop, "auspex_desktop missing from ListTools")
    assert.match(desktop.description ?? "", /auspex_desktop|overview|log|JSON|computer-use/i)
    assert.match(check.description ?? "", /verify=true|one-shot|claimOk/i)
    assert.match(check.description ?? "", /record\+profile|allowRecordProfile/)
    assert.match(check.description ?? "", /402|FeatureRequiresPlan/)
    assert.match(check.description ?? "", /429/)
    assert.match(check.description ?? "", /solari_kill|solari_browser_close/)
    const verify = listed.tools.find((t) => t.name === "auspex_verify")
    assert.ok(verify)
    assert.match(verify.description ?? "", /claimOk|ok/)
    const login = listed.tools.find((t) => t.name === "auspex_login")
    assert.ok(login)
    assert.match(login.description ?? "", /handoff/)
    const deskProps = desktop.inputSchema.properties ?? {}
    assert.ok("open" in deskProps || "type" in deskProps)
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
