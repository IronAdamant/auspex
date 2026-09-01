# Demo

From `examples/auspex-ts` with `SOLARI_API_KEY` set:

```bash
npx tsx src/cli.ts check https://ironadamant.com --expect "Build it."
```

Expect JSON on stdout with `"ok": true` and a PNG + `manifest.json` under `.auspex/runs/`.

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
