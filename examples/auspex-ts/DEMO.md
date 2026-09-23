# Demo

No Chrome window opens on your Mac. Solari runs a remote browser; you only get JSON and a PNG.

From `examples/auspex-ts` with `SOLARI_API_KEY` set:

```bash
npx tsx src/cli.ts check https://ironadamant.com --expect "One office job."
```

Expect JSON on stdout with `"matched": true` and a PNG + `manifest.json` under `.auspex/runs/`. Same pattern on checkpointprojects.com (`--expect Checkpoint`). An auth-gated host uses `login --url` (derives `--profile` from the host; override `--profile <yours>`) plus *their* URL and expect after finalize-login — attached profiles on non-public-marketing URLs **default to no sandbox** (anonymous fetch cannot see the editor). The named `consistencyhub` saved check is the optional [worked example](#worked-example-dogfood). Public marketing `check` already verifies; do **not** also run `verify` after a default check. Only run `verify` after `--no-verify`:

```bash
npx tsx src/cli.ts check https://ironadamant.com --expect "One office job." --no-verify
npx tsx src/cli.ts verify
```

Optional recording (polls replay; no presigned URL on JSON):

```bash
npx tsx src/cli.ts check https://ironadamant.com --expect "One office job." --record
```

Desktop sandbox demo (open Mousepad; process list is the evidence):

```bash
npx tsx src/cli.ts desktop --open mousepad --type "hello from auspex" --expect mousepad
```

429 leftovers:

```bash
npx tsx src/cli.ts reap --dry-run
npx tsx src/cli.ts reap
```

Login-once (human IdP sign-in on the Solari Chrome card; Auspex captures sessionStorage via finalize-login). This is the **operator** golden path — *their* site, `login --url` (derives `--profile app-example`; override `--profile <yours>`):

```bash
# 1. Human SSO in handoff → Save (`login --url` derives --profile app-example)
# New host: do not carry a previous --profile. Omit --profile or pass that host's slug.
npx tsx src/cli.ts login --url https://app.example

# 2. Wait for Save (--save-editor; warns if no sessionStorage)
npx tsx src/cli.ts await-login --profile app-example --save-editor

# 3. Agent captures sessionStorage
npx tsx src/cli.ts finalize-login --profile app-example --url https://app.example --expect "Workspace ready"

# 4. Later: reuse profile
npx tsx src/cli.ts check --profile app-example --url https://app.example --expect "Workspace ready"

# 5. Optional: profile-seeded claim recheck (read claimOkProfile; do not fold it into ok)
npx tsx src/cli.ts check --profile app-example --url https://app.example --expect "Workspace ready" --verify-with-profile

# List profiles
npx tsx src/cli.ts profiles
```

The generic path is the recipe. A named saved check is optional; do not invent that any host works without dogfood. Expect must be unique to the logged-in app and absent from public marketing copy (`Dashboard` does not match capitalized `One Dashboard`). A hit on a public or landing URL during finalize is `expectMatchedPublicLanding`, not `matched`.

## Worked example (dogfood)

Redacted auth-gated SaaS demo (ConsistencyHub). Evidence that auth-gated verify works — not the default recipe.

```bash
npx tsx src/cli.ts login --profile consistencyhub
npx tsx src/cli.ts await-login --profile consistencyhub --save-editor
npx tsx src/cli.ts finalize-login --profile consistencyhub
npx tsx src/cli.ts check --name consistencyhub
npx tsx src/cli.ts check --name consistencyhub --verify-with-profile
```

Weekly public loop (ironadamant.com `One office job.` + Checkpoint; skips without a key):

```bash
npm run public-check
```

MCP: copy `mcp.cursor.example.json` or `mcp.claude.example.json`, or the Grok toml. Ask the agent to verify https://ironadamant.com for `"One office job."` via `auspex_check`.

Public demo artifacts (Solari cloud Chrome, not a local window):

- **Watch (auth-gated Microsoft wall):** generate with `npm run generate:replay` from `demo/replay.ndjson` (committed `replay.html` is a stub). Public landing, Sign in with Microsoft, empty Microsoft box. Emails and passwords stripped. Not a logged-in dashboard. Pages serves the generated player.
- **Ironadamant (public marketing):** [demo/ironadamant.png](demo/ironadamant.png) + [demo/receipt.json](demo/receipt.json) (`sessionId`). Marketing summary with `sessionId` and verify flags.
- **Redacted auth-gated SaaS demo:** [demo/consistencyhub.png](demo/consistencyhub.png) + [demo/consistencyhub-receipt.json](demo/consistencyhub-receipt.json). Redacted schema-v1-shaped receipt (blur ≠ blank fail; triad honest: `ok=true`, `claimOk=false`, `claimOkProfile=true`).

**Note:** `demo/receipt.json` is a public marketing summary (`sessionId` + verify flags); the agent contract is schema v1 on CLI/MCP stdout (see [Receipt schema v1](../../AGENTS.md#receipt-schema-v1-frozen)). Do not post unredacted logged-in ConsistencyHub dashboards.
