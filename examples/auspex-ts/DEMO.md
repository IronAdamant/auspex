# Demo

No Chrome window opens on your Mac. Solari runs a remote browser; you only get JSON and a PNG.

From `examples/auspex-ts` with `SOLARI_API_KEY` set:

```bash
npx tsx src/cli.ts check https://ironadamant.com --expect "One office job."
```

Expect JSON on stdout with `"matched": true` and a PNG + `manifest.json` under `.auspex/runs/`. Same pattern on checkpointprojects.com (`--expect Checkpoint`) and consistencyhub.io (`--profile` + `--sso --save-profile` once, then `--profile` + `--expect "Document Editor"`). Then re-check that receipt in a headless sandbox (independent fetch/OCR of expect):

```bash
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

Login-once (human Microsoft sign-in on the Solari Chrome card; Auspex captures sessionStorage via finalize-login):

```bash
# 1. Human SSO in handoff → Save
npx tsx src/cli.ts login --profile consistencyhub

# 2. Wait for Save (warns if no sessionStorage)
npx tsx src/cli.ts await-login --profile consistencyhub

# 3. Agent captures sessionStorage
npx tsx src/cli.ts finalize-login --profile consistencyhub

# 4. Later: reuse profile
npx tsx src/cli.ts check --name consistencyhub

# 5. Optional: profile-seeded claim recheck
npx tsx src/cli.ts check --name consistencyhub --verify-with-profile

# List profiles
npx tsx src/cli.ts profiles
```

Weekly public loop (ironadamant.com `One office job.` + Checkpoint; skips without a key):

```bash
npm run public-check
```

MCP: copy `mcp.cursor.example.json` or `mcp.claude.example.json`, or the Grok toml. Ask the agent to verify https://ironadamant.com for `"One office job."` via `auspex_check`.

Public post image (Solari cloud Chrome, not a local window): [demo/ironadamant.png](demo/ironadamant.png) plus [demo/receipt.json](demo/receipt.json) (`sessionId`) plus [demo/replay.html](demo/replay.html). **Note:** `demo/receipt.json` is a public marketing summary (`sessionId` + verify flags); the agent contract is schema v1 on CLI/MCP stdout (see [Receipt schema v1](../../AGENTS.md#receipt-schema-v1-frozen)). Do not post logged-in ConsistencyHub dashboards.
