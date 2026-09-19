import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("dist/mcp.mjs includes current loopback, record-profile, kill, and PNG-fit gates", () => {
  const dist = readFileSync(path.join(root, "dist/mcp.mjs"), "utf8")
  assert.match(dist, /loopback address/)
  assert.match(dist, /allowRecordProfile/)
  assert.match(dist, /sandbox kill failed/)
  assert.match(dist, /fitPngUnderCap/)
  assert.match(dist, /fitMcpAttach/)
  assert.match(dist, /packToolFailure/)
  assert.match(dist, /screenshot file is missing/)
  assert.match(dist, /inputSchema:\s*auspexCheckInputObject/)
  assert.match(dist, /auspex_reap/)
  assert.match(dist, /auspex_await_login/)
  assert.match(dist, /auspex_finalize_login/)
  assert.match(dist, /shouldVerifyCheck/)
  assert.match(dist, /isPublicMarketingUrl|isAuthGatedAnonymousVerifyHost|onedrive\.live\.com/)
  assert.match(dist, /They are not equivalent/)
  assert.match(dist, /saveProfile/)
  assert.match(dist, /waitForLoadState/)
  assert.match(dist, /auspex_profile_status/)
  assert.match(dist, /packReceipts/)
  assert.match(dist, /ironadamant/)
  assert.match(dist, /toAgentReceipt|reason \(matched/)
  assert.match(dist, /schemaVersion/)
  assert.match(dist, /parseReceiptV1|RECEIPT_V1_REQUIRED_KEYS/)
  assert.match(dist, /schemaVersion 1 is frozen/)
  assert.match(dist, /ProfileBusy/)
  assert.match(dist, /allowPageActions/)
  assert.match(dist, /accountWide/)
  assert.match(dist, /profileClaimBudgetMs/)
  assert.match(dist, /PROFILE_CLAIM_RETURN_BUFFER_MS/)
})
