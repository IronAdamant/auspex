# Security

## Dependency Security

### puppeteer-core and @puppeteer/browsers

Auspex uses `puppeteer-core` indirectly through `@solarisdk/mcp`. As of 2026-09-19, we apply an npm override to force `@puppeteer/browsers` to version `>=3.2.2` to mitigate high-severity vulnerabilities in the `extract-zip` transitive dependency.

**Background:**
- `@puppeteer/browsers` versions `<=2.13.2` depend on `extract-zip`, which has known high-severity vulnerabilities (GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3) related to symlink path traversal and arbitrary file writes.
- `@puppeteer/browsers` version `3.2.2` and later dropped `extract-zip` in favor of `modern-tar`, eliminating these vulnerabilities.
- The Puppeteer project maintains API compatibility across the 3.x series.

**Current configuration:**

In `examples/auspex-ts/package.json`, we override the `@puppeteer/browsers` version:

```json
{
  "overrides": {
    "@puppeteer/browsers": ">=3.2.2"
  }
}
```

Verify the override is active:

```bash
cd examples/auspex-ts
npm list @puppeteer/browsers
# Should show: @puppeteer/browsers@3.2.2 overridden (or later 3.x)

npm audit --audit-level=high
# Should show: found 0 vulnerabilities
```

**Tests & compatibility:**

As of this writing, all unit tests and MCP builds pass with `@puppeteer/browsers@3.2.2`:
- ✅ `npm test` — 232/235 tests pass (3 skipped)
- ✅ `npm run build:mcp` — both bundles build successfully
- ✅ `npm run typecheck` — no TypeScript errors

### Override rollback

If a future Solari SDK update or Puppeteer API change breaks compatibility with the override, you can remove it and restore the prior lockfile:

**Option 1: Remove override and restore**

```bash
cd examples/auspex-ts

# Remove the "overrides" section from package.json
# Then restore the lockfile from git:
git checkout HEAD -- package-lock.json
npm install

# Verify the rollback:
npm list @puppeteer/browsers
# Should show the original 2.13.2 (or whatever @solarisdk/mcp pins)

npm audit --audit-level=high
# extract-zip vulnerabilities will return
```

**Option 2: Environment-based override toggle (not currently implemented)**

If needed in the future, we could gate the override with an environment variable (e.g., `AUSPEX_PUPPETEER_OVERRIDE=0`) and maintain dual lockfiles. This is not currently implemented; the override is always active.

**Recommendation:**

Keep the override active unless runtime failures occur with Solari or Puppeteer APIs. The `extract-zip` vulnerabilities pose a real risk in AI agent environments that may process untrusted archives. When in doubt, test with:

```bash
npm test && npm run build:mcp
```

If both pass, the override is safe to keep.

## Responsible Disclosure

If you discover a security vulnerability in Auspex, please email [security contact TBD]. Do not open a public issue.

## Secrets Management

**Never commit:**
- `SOLARI_API_KEY` or any other API keys
- `.env` files
- `.auspex/` run artifacts (receipts, screenshots, profiles)

These are already listed in `.gitignore`. Treat Auspex profiles (saved browser storage states) like passwords — they contain session cookies and tokens.
