# Public Receipts

Live evidence from the Auspex check → verify → teardown workflow.

## Ironadamant.com Check

**Claim:** "One office job." appears on [ironadamant.com](https://ironadamant.com)

**Saved check:** `npx auspex check --name ironadamant`

**Demo artifacts (committed):**

- **[Screenshot](examples/auspex-ts/demo/ironadamant.png)** — PNG from cloud Chrome (337 KB)
- **[Receipt JSON](examples/auspex-ts/demo/receipt.json)** — Marketing summary with `sessionId` and verify flags
- **[Replay HTML](examples/auspex-ts/demo/replay.html)** — rrweb recording ([view via jsDelivr](https://cdn.jsdelivr.net/gh/IronAdamant/auspex@main/examples/auspex-ts/demo/replay.html))
- **[Replay NDJSON](examples/auspex-ts/demo/replay.ndjson)** — Raw recording data ([view via jsDelivr](https://cdn.jsdelivr.net/gh/IronAdamant/auspex@main/examples/auspex-ts/demo/replay.ndjson))

**Result:** ✅ Claim matched. Sandbox verify passed (`claimOk: true`, `verifyOk: true`).

## Important Notes

### Marketing Summary vs. Schema v1

The committed `demo/receipt.json` is a **public marketing summary** that includes:
- `sessionId` for Solari console replay lookup
- Verify outcome flags (`claimOk`, `verifyOk`)
- Human-readable note about replay URLs

**This is NOT the schema v1 CLI/MCP stdout contract.** Agents receive a different, parseable receipt on stdout when they call `auspex_check` or use the MCP tool.

### Schema v1 Receipt (Agent Contract)

The actual agent contract is **[Receipt schema v1](AGENTS.md#receipt-schema-v1-frozen)** in AGENTS.md.

**Required fields:**
- `schemaVersion` (frozen at `1`)
- `ok` (boolean)
- `reason` (`matched` / `loggedOut` / `needsHuman` / `mismatch` / `network` / `recordedLoggedIn`)
- `url`
- `expect`
- `screenshotPath`

**Optional fields:** `title`, `finalUrl`, `matched`, `excerpt`, `sessionId`, `networkIdle`, `replayReady`, `waitedFor`, `filled`, `clicked`, `needsHuman`, `diff`, `verify`, `profileSeed`, `profileSaved`

For a golden example of actual schema v1 receipts, see the committed receipts in `.auspex/golden/` (if present) or run `npx auspex check --name ironadamant` yourself.

## Replay Access

**Console Replay:** View in [Solari console](https://console.getsolari.com) → Sessions → search for the `sessionId` → Replay tab.

**Presigned URLs:** Auspex does not return or commit presigned replay URLs. Use the console or open the HTML file locally.

## Verification

The check ran with default verification enabled (`--verify` is default, not `--no-verify`). The sandbox:
1. Re-fetched `https://ironadamant.com` via HTTP
2. OCR'd the committed PNG
3. Confirmed "One office job." appears in both
4. Wrote `claimOk: true` and `verifyOk: true`
5. Tore down the VM

This is **claim verification**, not just echo — the sandbox independently checks the expect string against live HTTP and OCR, rather than parroting the browser session's `ok` value.

## Running It Yourself

```bash
git clone https://github.com/IronAdamant/auspex.git
cd auspex
npm install
export SOLARI_API_KEY=slr_live_...   # grab one at console.getsolari.com
npx auspex check --name ironadamant
```

The saved check is configured for ironadamant.com with the expect string "One office job." — no URL or flags needed.

## Weekly GitHub Actions Checks

The [`public` job](https://github.com/IronAdamant/auspex/actions/workflows/auspex-ts.yml) in GitHub Actions runs weekly (Mondays + `workflow_dispatch`) to verify the saved checks still work against live sites. **The workflow does not commit artifacts** — it only runs the checks to ensure they pass. The demo PNG/receipt/replay files in this repo are manually committed when refreshed.
