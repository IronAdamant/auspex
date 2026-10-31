# Changelog

## 1.0.0

Auspex is a Rust program with no third-party crates. It drives a local Chrome or Chromium over the DevTools protocol. There is no Solari API, key, SDK, or cloud browser.

- A check opens the page, looks for the exact words, and writes a screenshot and a schema version 1 receipt.
- The three answers stay apart: `ok`, `claimOk` (plain fetch, no login), and `claimOkProfile` (a fresh browser with only the saved login).
- A person signs in on a local page. The agent does not see or type the password. Auspex does not record a logged-in session.
- `prove` confirms a change with a fresh saved-login browser. The click is not the proof.
- Named checks stay in `auspex.yml`. The ironadamant check expects `Web app testing, in plain English.`
- Hornet Swarm is optional. If it is missing, checks still run. A Hornet pass is not treated as proof.
- Every run writes an append-only log, a trace, and a short session summary under `~/.auspex`.
- `auspex mcp` is a stdio MCP server.
- This repo does not claim to detect the wrong account.

The example receipt is [examples/ironadamant-receipt.json](examples/ironadamant-receipt.json).

### Legacy npm line

`auspex-solari` on npm is the previous product. It talked to Solari's cloud browser. This repository no longer contains that TypeScript program, and it does not publish `auspex-solari` or this crate. The old package remains the legacy line for anyone who still has it installed. Its history is in git before this change.
