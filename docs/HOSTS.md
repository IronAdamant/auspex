# Host paste cards

Auspex MCP is a local program. Every card below starts the published package:

`npx -p auspex-solari auspex-mcp`

Put `SOLARI_API_KEY` in that program's environment. Get the key from [console.getsolari.com](https://console.getsolari.com). Never commit it. npm `auspex` is a different scraper. The repo is `IronAdamant/auspex`.

These cards were checked against public host docs (2026-09-26). They were not live-tested against `auspex-solari`. A host that can start a stdio MCP server can list the tools. Obeying the English door, the three results, and the login rules is model discipline. MCP does not enforce that.

Cursor, Claude, and Grok pastes are on the [root README](../README.md#mcp). Claude Code also reads [CLAUDE.md](../CLAUDE.md), which points at [AGENTS.md](../AGENTS.md) and [llms.txt](../llms.txt).

## Read this before the first tool call

Paste into the host's project instructions:

```text
Read AGENTS.md and llms.txt before calling Auspex.
Never type a password or a one-time code. Never --record a logged-in session.
ok, claimOk, and claimOkProfile are three separate results.
A login wait (await-login) can run about 30 minutes. Call auspex_job, then auspex_job_status.
A tool timeout of about 300 seconds ends before that wait.
Save can return 200 while the screen shows the app and the cookie jar is still only Microsoft or Google (idp-only-save, app-visible). Do not finalize. Do not mint login again to finish Microsoft.
```

Five-minute read of that last line: [Reviewer path](REVIEWER-5MIN.md) (app on screen is not a reusable saved login).

## Long waits

`await-login` waits until a person taps Save. The default cap is 30 minutes. Hosts that kill a tool call in about 5–10 minutes, or at 60 seconds, will cut that off.

Use the hands-off path:

```bash
npx auspex-solari job --url https://app.example --expect "Workspace ready"
npx auspex-solari job-status --job-id <id>
```

MCP names: `auspex_job`, then `auspex_job_status`. The same rule is in [AGENTS.md](../AGENTS.md#autonomous-agents-job-compose).

A single public check fits in a few minutes. The login wait does not. If you still call `auspex_await_login` as one tool, set the host tool timeout to at least 1800 seconds. Do not set it near 300 seconds for that call.

## What this page is

Local stdio on the machine that runs the agent (or a cloud agent VM that can run `npx` and holds `SOLARI_API_KEY`).

Claude.ai custom connectors, and other cloud connectors like them, ask for a remote HTTP MCP server. This repo does not publish one. Do not invent an Auspex HTTP URL. Solari's hosted browser MCP is a different product.

Doubao, MarsCode, and a GLM IDE are outside this page. No native Auspex client is documented here for those products. A Chinese model inside Cursor, OpenHands, or Qwen Code uses that host's MCP, and still has to follow the door.

## Qwen Code

Paste into Qwen Code `settings.json` under `mcpServers`. Shape from the [Qwen Code MCP docs](https://qwenlm.github.io/qwen-code-docs/en/developers/tools/mcp-server/) (page updated 2026-09-08).

```json
{
  "mcpServers": {
    "auspex": {
      "command": "npx",
      "args": ["-p", "auspex-solari", "auspex-mcp"],
      "env": {
        "SOLARI_API_KEY": "$SOLARI_API_KEY"
      },
      "timeout": 600000
    }
  }
}
```

`$SOLARI_API_KEY` is Qwen's env reference. The documented request timeout default is 600000 ms (10 minutes). That covers a check. It ends during a 30-minute `await-login`. Use `auspex_job`. Qwen also sanitizes tool schemas before the model sees them. Trust prompts can appear before `npx` runs.

## Kimi Code

User file `~/.kimi-code/mcp.json`, or project file `.kimi-code/mcp.json`. Shape from the [Kimi Code MCP docs](https://moonshotai.github.io/kimi-code/en/customization/mcp).

```json
{
  "mcpServers": {
    "auspex": {
      "command": "npx",
      "args": ["-p", "auspex-solari", "auspex-mcp"],
      "env": {
        "SOLARI_API_KEY": "slr_live_…"
      }
    }
  }
}
```

Kimi names tools `mcp__auspex__auspex_check` (server, then tool). Approval mode can ask before each call. Kimi also speaks HTTP and SSE. Auspex has no remote URL, so leave `url` unset. If you set `toolTimeoutMs`, keep it at 1800000 or above for a blocking login wait, or call `auspex_job` instead.

## DeepSeek Harness

One server per plugin, stdio. Shape from [`@deepseek-ai/dsh-mcp-client`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md). This is YAML, not Cursor JSON.

```yaml
- id: mcp-auspex
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: auspex
    transport: stdio
    command: npx
    args: ['-p', 'auspex-solari', 'auspex-mcp']
    env:
      SOLARI_API_KEY: !!js process.env.SOLARI_API_KEY
    toolCallTimeoutMs: 300000
```

The harness drops ambient environment names that look like keys, then applies this `env` block. The `!!js` line is their documented way to pass a token (same pattern as `GITHUB_TOKEN` in that README). Tools show up as `mcp__auspex__auspex_check`.

Their default `toolCallTimeoutMs` is 60000 (60 seconds). A live check can run longer than that, so the card sets 300000 (5 minutes) for a check. A login wait is still about 30 minutes. Use `auspex_job`. The harness also has a `streamable-http` transport. Auspex does not publish an HTTP endpoint, so this card stays on stdio.

## OpenHands

```bash
openhands mcp add auspex --transport stdio \
  --env "SOLARI_API_KEY=slr_live_…" \
  npx -- -p auspex-solari auspex-mcp
```

That writes `~/.openhands/mcp.json`. The same JSON by hand, from the [OpenHands MCP docs](https://docs.openhands.dev/openhands/usage/cli/mcp-servers):

```json
{
  "mcpServers": {
    "auspex": {
      "command": "npx",
      "args": ["-p", "auspex-solari", "auspex-mcp"],
      "env": {
        "SOLARI_API_KEY": "slr_live_…"
      }
    }
  }
}
```

If the server does not show up, run `openhands mcp list` and run `npx -p auspex-solari auspex-mcp` in the same shell. OpenHands can also add HTTP servers. Auspex has no remote URL, so use `--transport stdio`.
