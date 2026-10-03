import assert from "node:assert/strict"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { toAgentReceipt } from "../src/agent-receipt.ts"
import type { CheckResult } from "../src/check.ts"
import { resolveFinalizeLoginTarget } from "../src/check.ts"
import { parseArgv } from "../src/cli.ts"
import { AUSPEX_CONTRACT, PROFILE_HOST_ADVICE_CMDS, PROFILE_HOST_RECEIPT_FIELDS } from "../src/contract.ts"
import { loadEditorSave, loginInstructions, persistEditorSave } from "../src/profiles.ts"
import {
  PROFILE_HOST_MISMATCH_MARK,
  adviseProfileHost,
  resolveProfileHostUrl,
  stampLoginHost,
  stampProfileHostAdvice,
} from "../src/profile-host-advice.ts"
import { parseReceiptV1, RECEIPT_V1_OPTIONAL_KEYS } from "../src/receipt-schema.ts"

function handoff() {
  return { url: "https://console.getsolari.com/handoff/abc", handoffId: "h1", expiresAt: "soon", version: 3 }
}

test("await-login reads the mint site URL when --url is omitted", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "auspex-host-"))
  await persistEditorSave(
    {
      profileId: "p1",
      name: "consistencyhub",
      handoffToken: "hand",
      siteUrl: "https://app.socialaize.com/login",
      sinceVersion: 4,
    },
    root,
  )
  assert.equal((await loadEditorSave("consistencyhub", root))?.sinceVersion, 4)
  const stored = await resolveProfileHostUrl({ profile: "consistencyhub", root })
  assert.equal(stored, "https://app.socialaize.com/login")
  const explicit = await resolveProfileHostUrl({
    profile: "consistencyhub",
    url: "https://consistencyhub.io",
    root,
  })
  assert.equal(explicit, "https://consistencyhub.io")
  await persistEditorSave(
    {
      profileId: "p1",
      name: "consistencyhub",
      handoffToken: "hand",
      siteUrl: "javascript:alert(1)",
    },
    root,
  )
  const dropped = await loadEditorSave("consistencyhub", root)
  assert.equal(dropped?.siteUrl, undefined)
  assert.equal(await resolveProfileHostUrl({ profile: "consistencyhub", root }), undefined)
})

