# Demo

No Chrome window opens on your Mac. Solari runs a remote browser; you only get JSON and a PNG.

From `examples/auspex-ts` with `SOLARI_API_KEY` set:

```bash
npx tsx src/cli.ts check https://ironadamant.com --expect "Build it."
```

Expect JSON on stdout with `"ok": true` and a PNG + `manifest.json` under `.auspex/runs/`. Same pattern on checkpointprojects.com (`--expect Checkpoint`) and consistencyhub.io (`--profile` + `--sso` + `--expect "Document Editor"`). Then re-check that receipt in a headless sandbox:

```bash
npx tsx src/cli.ts verify
```

Optional recording:

```bash
npx tsx src/cli.ts check https://ironadamant.com --expect "Build it." --record
```

Login-once (human Save in the Solari console; no check session held open):

```bash
npx tsx src/cli.ts login --profile auspex-demo
npx tsx src/cli.ts profiles
```

After MCP is copied from `grok.mcp.example.toml` into Grok config and Grok is restarted, ask Grok to verify https://ironadamant.com for `"Build it."` via `auspex_check`.

Public post image (Solari cloud Chrome, not a local window): [demo/ironadamant.png](demo/ironadamant.png) plus [demo/receipt.json](demo/receipt.json) (`sessionId`) plus [demo/replay.html](demo/replay.html). Do not post logged-in ConsistencyHub dashboards.
