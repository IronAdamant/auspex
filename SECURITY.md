# Security

Short skim. Full notes: [`examples/auspex-ts/SECURITY.md`](examples/auspex-ts/SECURITY.md).

- **Never type passwords or OTPs.** `--fill` refuses `input[type=password]`. Microsoft/Google walls are `needsHuman`. Desktop `--type` is fail-closed on password-like strings.
- **No second browser actor.** The live check session is the only agent-driven browser that may take page actions. Profile-seeded verify (`--verify-with-profile`) is a **separate read-only** Solari browser for `claimOkProfile`. It does not log in, fill, or click.
- **`--record` + `--profile`** is refused unless `--allow-record-profile` on a public marketing host. Refused for ConsistencyHub. Never record a logged-in session.
- **Profiles are OAuth secret stores.** Never commit `.auspex/`, `.env`, or `SOLARI_API_KEY`.
- **Pages doors are keyless.** Humans open `ironadamant.com/auspex/*`. Agents use env `SOLARI_API_KEY` or gitignored `.auspex/operator-key` on the operator machine.

```
human browser     →  ironadamant.com/auspex/* (keyless Pages)  →  VNC token in URL hash
operator machine  →  CLI/MCP  →  SOLARI_API_KEY or .auspex/operator-key  →  Solari API
```

Report issues on GitHub. Do not add or remove the repo Actions `SOLARI_API_KEY` from a PR. Weekly `public` already runs with that secret present (Actions run 35605123361).
