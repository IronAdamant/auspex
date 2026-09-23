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

test("auspexCheckInputObject descriptions advertise fail-closed constraints and structural vs call-time split", () => {
  const schema = auspexCheckInputObject
  
  // Verify that the top-level comment documents structural vs call-time split
  const toolSchemaFile = readFileSync(path.join(root, "src", "tool-schema.ts"), "utf8")
  assert.match(toolSchemaFile, /Structural vs call-time FAIL-CLOSED validation/i, 
    "tool-schema.ts should document structural vs call-time split")
  assert.match(toolSchemaFile, /JSON Schema-visible.*enums.*optional.*required/i,
    "tool-schema.ts should list what's structural")
  assert.match(toolSchemaFile, /call-time only.*superRefine/i,
    "tool-schema.ts should list what's call-time only")
  
  // Check that profile description includes FAIL-CLOSED constraints with call-time markers
  const profileDesc = schema.shape.profile.description
  assert.ok(profileDesc)
  assert.match(profileDesc, /FAIL-CLOSED/i, "profile description should include FAIL-CLOSED marker")
  assert.match(profileDesc, /call-time validation/i, "profile description should mark call-time-only constraints")
  assert.match(profileDesc, /allowPageActions/i, "profile description should mention allowPageActions requirement")
  assert.match(profileDesc, /allowRecordProfile/i, "profile description should mention allowRecordProfile requirement")
  assert.match(profileDesc, /consistencyhub/i, "profile description should mention consistencyhub restrictions")
  
  // Check that record description includes FAIL-CLOSED constraints with call-time markers
  const recordDesc = schema.shape.record.description
  assert.ok(recordDesc)
  assert.match(recordDesc, /FAIL-CLOSED/i, "record description should include FAIL-CLOSED marker")
  assert.match(recordDesc, /call-time validation/i, "record description should mark call-time-only constraints")
  assert.match(recordDesc, /profile.*allowRecordProfile/i, "record description should mention profile+allowRecordProfile")
  assert.match(recordDesc, /sso.*saveProfile/i, "record description should mention sso/saveProfile restrictions")
  assert.match(recordDesc, /consistencyhub/i, "record description should mention consistencyhub restrictions")
  
  // Check that fill description includes FAIL-CLOSED constraints with call-time markers
  const fillDesc = schema.shape.fill.description
  assert.ok(fillDesc)
  assert.match(fillDesc, /FAIL-CLOSED/i, "fill description should include FAIL-CLOSED marker")
  assert.match(fillDesc, /call-time/i, "fill description should mark call-time-only constraints")
  assert.match(fillDesc, /profile.*allowPageActions/i, "fill description should mention profile+allowPageActions requirement")
  assert.match(fillDesc, /consistencyhub/i, "fill description should mention consistencyhub restrictions")
  assert.match(fillDesc, /password/i, "fill description should mention password refusal")
  
  // Check that click description includes FAIL-CLOSED constraints with call-time markers
  const clickDesc = schema.shape.click.description
  assert.ok(clickDesc)
  assert.match(clickDesc, /FAIL-CLOSED/i, "click description should include FAIL-CLOSED marker")
  assert.match(clickDesc, /call-time validation/i, "click description should mark call-time-only constraints")
  assert.match(clickDesc, /profile.*allowPageActions/i, "click description should mention profile+allowPageActions requirement")
  
  // Check that value description mentions fill requirement with call-time marker
  const valueDesc = schema.shape.value.description
  assert.ok(valueDesc)
  assert.match(valueDesc, /FAIL-CLOSED/i, "value description should include FAIL-CLOSED marker")
  assert.match(valueDesc, /call-time validation/i, "value description should mark call-time-only constraint")
  assert.match(valueDesc, /fill/i, "value description should mention fill requirement")
  
  // Check that sso description mentions record restriction with call-time marker
  const ssoDesc = schema.shape.sso.description
  assert.ok(ssoDesc)
  assert.match(ssoDesc, /FAIL-CLOSED/i, "sso description should include FAIL-CLOSED marker")
  assert.match(ssoDesc, /call-time validation/i, "sso description should mark call-time-only constraint")
  assert.match(ssoDesc, /record/i, "sso description should mention record restriction")
  
  // Check that ssoProvider is a structural enum (not just documented)
  const ssoProviderSchema = schema.shape.ssoProvider
  assert.ok(ssoProviderSchema)
  const ssoProviderDesc = ssoProviderSchema.description
  assert.ok(ssoProviderDesc, "ssoProvider should have a description")
  assert.match(ssoProviderDesc, /structural enum/i, "ssoProvider description should note it's a structural enum")
  
  // Check that saveProfile description mentions record restriction with call-time marker
  const saveProfileDesc = schema.shape.saveProfile.description
  assert.ok(saveProfileDesc)
  assert.match(saveProfileDesc, /FAIL-CLOSED/i, "saveProfile description should include FAIL-CLOSED marker")
  assert.match(saveProfileDesc, /call-time validation/i, "saveProfile description should mark call-time-only constraints")
  assert.match(saveProfileDesc, /record/i, "saveProfile description should mention record restriction")
  
  // Check that allowRecordProfile description mentions consistencyhub restriction with call-time marker
  const allowRecordProfileDesc = schema.shape.allowRecordProfile.description
  assert.ok(allowRecordProfileDesc)
  assert.match(allowRecordProfileDesc, /FAIL-CLOSED/i, "allowRecordProfile description should include FAIL-CLOSED marker")
  assert.match(allowRecordProfileDesc, /call-time validation/i, "allowRecordProfile description should mark call-time-only constraint")
  assert.match(allowRecordProfileDesc, /consistencyhub/i, "allowRecordProfile description should mention consistencyhub restriction")
  
  // Check that allowPageActions description mentions its role with call-time marker
  const allowPageActionsDesc = schema.shape.allowPageActions.description
  assert.ok(allowPageActionsDesc)
  assert.match(allowPageActionsDesc, /FAIL-CLOSED/i, "allowPageActions description should include FAIL-CLOSED marker")
  assert.match(allowPageActionsDesc, /call-time validation/i, "allowPageActions description should mark call-time-only constraint")
  assert.match(allowPageActionsDesc, /fill.*click/i, "allowPageActions description should mention fill/click")
  assert.match(allowPageActionsDesc, /profile.*consistencyhub/i, "allowPageActions description should mention profile/consistencyhub")
  
  // Check that verifyWithProfile exists and is documented
  const verifyWithProfileDesc = schema.shape.verifyWithProfile.description
  assert.ok(verifyWithProfileDesc, "verifyWithProfile field should exist")
  assert.match(verifyWithProfileDesc, /profile-seeded|claimOkProfile/i, "verifyWithProfile should mention profile-seeded verification")
})

test("ListTools advertises auspex_check with FAIL-CLOSED constraints in descriptions and structural vs call-time markers", async () => {
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
    assert.ok("verifyWithProfile" in props, "verifyWithProfile should be advertised")
    
    // Verify FAIL-CLOSED markers and call-time validation markers in field descriptions
    const profileDesc = (props as any).profile?.description ?? ""
    assert.match(profileDesc, /FAIL-CLOSED/i, "profile description should advertise FAIL-CLOSED constraints")
    assert.match(profileDesc, /call-time validation/i, "profile description should mark call-time-only constraints")
    assert.match(profileDesc, /allowPageActions/i)
    assert.match(profileDesc, /allowRecordProfile/i)
    
    const recordDesc = (props as any).record?.description ?? ""
    assert.match(recordDesc, /FAIL-CLOSED/i, "record description should advertise FAIL-CLOSED constraints")
    assert.match(recordDesc, /call-time validation/i, "record description should mark call-time-only constraints")
    assert.match(recordDesc, /profile.*allowRecordProfile|allowRecordProfile.*profile/i)
    assert.match(recordDesc, /sso|saveProfile/i)
    
    const fillDesc = (props as any).fill?.description ?? ""
    assert.match(fillDesc, /FAIL-CLOSED/i, "fill description should advertise FAIL-CLOSED constraints")
    assert.match(fillDesc, /call-time/i, "fill description should mark call-time constraints")
    assert.match(fillDesc, /allowPageActions/i)
    
    const clickDesc = (props as any).click?.description ?? ""
    assert.match(clickDesc, /FAIL-CLOSED/i, "click description should advertise FAIL-CLOSED constraints")
    assert.match(clickDesc, /call-time validation/i, "click description should mark call-time-only constraints")
    assert.match(clickDesc, /allowPageActions/i)
    
    const valueDesc = (props as any).value?.description ?? ""
    assert.match(valueDesc, /FAIL-CLOSED/i, "value description should advertise FAIL-CLOSED constraints")
    assert.match(valueDesc, /call-time validation/i, "value description should mark call-time-only constraint")
    
    const ssoDesc = (props as any).sso?.description ?? ""
    assert.match(ssoDesc, /FAIL-CLOSED/i, "sso description should advertise FAIL-CLOSED constraints")
    assert.match(ssoDesc, /call-time validation/i, "sso description should mark call-time-only constraint")
    assert.match(ssoDesc, /record/i)
    
    const ssoProviderDesc = (props as any).ssoProvider?.description ?? ""
    assert.match(ssoProviderDesc, /structural enum/i, "ssoProvider should note it's a structural enum")
    
    const saveProfileDesc = (props as any).saveProfile?.description ?? ""
    assert.match(saveProfileDesc, /FAIL-CLOSED/i, "saveProfile description should advertise FAIL-CLOSED constraints")
    assert.match(saveProfileDesc, /call-time validation/i, "saveProfile description should mark call-time-only constraints")
    assert.match(saveProfileDesc, /record/i)
    
    const allowRecordProfileDesc = (props as any).allowRecordProfile?.description ?? ""
    assert.match(allowRecordProfileDesc, /FAIL-CLOSED/i, "allowRecordProfile description should advertise FAIL-CLOSED constraints")
    assert.match(allowRecordProfileDesc, /call-time validation/i, "allowRecordProfile description should mark call-time-only constraint")
    assert.match(allowRecordProfileDesc, /consistencyhub/i)
    
    const allowPageActionsDesc = (props as any).allowPageActions?.description ?? ""
    assert.match(allowPageActionsDesc, /FAIL-CLOSED/i, "allowPageActions description should advertise FAIL-CLOSED constraints")
    assert.match(allowPageActionsDesc, /call-time validation/i, "allowPageActions description should mark call-time-only constraint")
    
    const verifyWithProfileDesc = (props as any).verifyWithProfile?.description ?? ""
    assert.match(verifyWithProfileDesc, /claimOkProfile/i, "verifyWithProfile should mention claimOkProfile")
    assert.match(verifyWithProfileDesc, /reuse gate|not enough to treat the profile as reusable/)
    
    const required = check.inputSchema.required ?? []
    assert.equal(required.includes("url"), false)
    assert.equal(required.includes("expect"), false)
    assert.ok("name" in props)
    assert.ok("url" in props, `advertised properties: ${Object.keys(props).join(",")}`)
    assert.ok("expect" in props, `advertised properties: ${Object.keys(props).join(",")}`)
    const desktop = listed.tools.find((t) => t.name === "auspex_desktop")
    assert.ok(desktop, "auspex_desktop missing from ListTools")
    assert.match(desktop.description ?? "", /sandbox demo|mousepad|named Solari sandbox/i)
    const deskProps = desktop.inputSchema.properties ?? {}
    const deskTypeDesc = (deskProps as any).type?.description ?? ""
    assert.match(deskTypeDesc, /FAIL-CLOSED/i, "desktop type description should advertise FAIL-CLOSED password/OTP refusal")
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
    const trace = listed.tools.find((t) => t.name === "auspex_trace")
    assert.ok(trace, "auspex_trace missing from ListTools")
    assert.match(trace.description ?? "", /episode|traceSummary|lead-up|mint/)
    assert.match(trace.description ?? "", /before reminting|silent or fails/)
    const job = listed.tools.find((t) => t.name === "auspex_job")
    assert.ok(job, "auspex_job missing from ListTools")
    assert.match(job.description ?? "", /mint/)
    assert.match(job.description ?? "", /claimOkProfile/)
    assert.ok("jobId" in (job.inputSchema.properties ?? {}))
    assert.ok("wakeWebhookUrl" in (job.inputSchema.properties ?? {}))
    const jobStatus = listed.tools.find((t) => t.name === "auspex_job_status")
    assert.ok(jobStatus, "auspex_job_status missing from ListTools")
    assert.match(jobStatus.description ?? "", /waitMs|job file|30-minute/)
    assert.ok("jobId" in (jobStatus.inputSchema.properties ?? {}))
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
    assert.match(login.description ?? "", /openOnPhone|oneLiner|qrPath/)
    assert.match(login.description ?? "", /mobileUrl/)
    assert.match(login.description ?? "", /desktopUrl/)
    assert.match(login.description ?? "", /phone\.html|real text field/)
    assert.match(login.description ?? "", /seed\/handoff door/)
    assert.match(login.description ?? "", /not a same-session VNC takeover/)
    assert.match(login.description ?? "", /noVNC/)
    assert.match(login.description ?? "", /software keyboard/)
    assert.equal((login.description ?? "").includes("gateUrl"), false)
    const awaitLogin = listed.tools.find((t) => t.name === "auspex_await_login")
    assert.ok(awaitLogin, "auspex_await_login missing from ListTools")
    assert.match(awaitLogin.description ?? "", /empty-save|cookies or origins/i)
    assert.match(awaitLogin.description ?? "", /sessionStorage|weak-seed|finalize_login/i)
    assert.match(awaitLogin.description ?? "", /30 minutes/)
    assert.match(awaitLogin.description ?? "", /saveEditor/)
    assert.match(awaitLogin.description ?? "", /GET editor HTTP 401/)
    assert.match(awaitLogin.description ?? "", /finalize-login NOW/)
    assert.match(awaitLogin.description ?? "", /editorSave fails|editorFold is no-cdp/)
    assert.ok("saveEditor" in (awaitLogin.inputSchema.properties ?? {}))
    assert.match(login.description ?? "", /wait:true|saveEditor true/)
    assert.match((login.inputSchema.properties?.wait as { description?: string } | undefined)?.description ?? "", /saveEditor|save-editor/)
    assert.match(login.description ?? "", /phone keyboard|never copies the password/i)
    assert.match(login.description ?? "", /host slug|derives/)
    assert.match(login.description ?? "", /Explicit profile wins|profile wins/)
    assert.match(login.description ?? "", /profileHostMatch/)
    assert.match(login.description ?? "", /suggestedProfile/)
    assert.match(awaitLogin.description ?? "", /profileHostMatch/)
    assert.match(awaitLogin.description ?? "", /suggestedProfile/)
    assert.ok("url" in (awaitLogin.inputSchema.properties ?? {}))
    const finalize = listed.tools.find((t) => t.name === "auspex_finalize_login")
    assert.ok(finalize, "auspex_finalize_login missing from ListTools")
    assert.match(finalize.description ?? "", /sessionStorage|save-profile|SSO/i)
    assert.match(finalize.description ?? "", /claimOkProfile=true|reuse/)
    assert.match(finalize.description ?? "", /profileHostMatch/)
    assert.match(finalize.description ?? "", /suggestedProfile/)
    const status = listed.tools.find((t) => t.name === "auspex_profile_status")
    assert.ok(status, "auspex_profile_status missing from ListTools")
    assert.match(status.description ?? "", /loggedIn|loggedOut|needsHuman/)
    assert.match(status.description ?? "", /weakSeed|emptySave/)
    assert.match(status.description ?? "", /password/)
    assert.match(check.description ?? "", /name=consistencyhub.*verify=false|defaults to verify=false/i)
    assert.match(check.description ?? "", /They are not equivalent/)
    assert.match(check.description ?? "", /reuse gate|not enough to treat the profile as reusable/)
    assert.match(desktop.description ?? "", /FAIL-CLOSED|password\/OTP/i)
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

test("login --wait and MCP wait:true both pass loginWaitAwaitOpts (saveEditor)", () => {
  const cli = readFileSync(path.join(root, "src", "cli.ts"), "utf8")
  const tools = readFileSync(path.join(root, "src", "mcp-tools.ts"), "utf8")
  assert.match(cli, /loginWaitAwaitOpts/)
  assert.match(tools, /loginWaitAwaitOpts/)
  assert.match(cli, /saveEditor: true|loginWaitAwaitOpts/)
  assert.match(tools, /saveEditor: true|loginWaitAwaitOpts/)
})

test("mcp-tools desktop payload keeps ASCII log and JSON", () => {
  const tools = readFileSync(path.join(root, "src", "mcp-tools.ts"), "utf8")
  assert.match(tools, /unshift/)
  assert.match(tools, /desktopId/)
  assert.match(tools, /packToolFailure/)
})

test("mcp.ts registers tools via registerAuspexTools; MCP check uses auspexCheckInputObject with FAIL-CLOSED descriptions", () => {
  const entry = readFileSync(path.join(root, "src", "mcp.ts"), "utf8")
  assert.match(entry, /registerAuspexTools\(server\)/)
  const tools = readFileSync(path.join(root, "src", "mcp-tools.ts"), "utf8")
  assert.match(tools, /inputSchema:\s*auspexCheckInputObject/)
  assert.equal(tools.includes("inputSchema: auspexCheckInputSchema"), false, 
    "MCP must not use auspexCheckInputSchema (has superRefine that's invisible to ListTools)")
  
  // Verify that tool-schema.ts includes FAIL-CLOSED descriptions
  const toolSchema = readFileSync(path.join(root, "src", "tool-schema.ts"), "utf8")
  assert.match(toolSchema, /FAIL-CLOSED/i, "tool-schema.ts should include FAIL-CLOSED markers in descriptions")
})
