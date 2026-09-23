# Security Notes

## Dependency Security

### extract-zip CVE (GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3)

**Status:** ✅ Resolved via npm override (as of 2026-09-19)

**Description:** The `extract-zip` library (version 2.0.1) had known high-severity vulnerabilities:
- Unvalidated symlink path traversal
- Arbitrary file writes through symlink archive entries

**Resolution:** We apply an npm override in `package.json` to force `@puppeteer/browsers` to version `>=3.2.2`:

```json
{
  "overrides": {
    "@puppeteer/browsers": ">=3.2.2"
  }
}
```

**Why This Works:**
- `@puppeteer/browsers` version 3.2.2+ dropped `extract-zip` in favor of `modern-tar`, eliminating the vulnerability
- The Puppeteer API remains compatible across the 3.x series
- While `@solarisdk/mcp@0.4.3` transitively depends on older `@puppeteer/browsers@2.13.2`, the override forces npm to resolve the newer secure version

**Verification:**

```bash
npm list @puppeteer/browsers
# Should show: @puppeteer/browsers@3.2.2 overridden (or later 3.x)

npm audit --audit-level=high
# Should show: found 0 vulnerabilities
```

**Testing:**
- ✅ Unit tests: `npm test` is the source of truth (3 skipped live-only). Do **not** treat a hardcoded pass count as a security signal — counts rot.
- ✅ MCP builds succeed (`npm run build:mcp`)
- ✅ TypeScript type checking clean (`npx tsc --noEmit`)
- ✅ No runtime API breakage from the override

**Override Rollback:**

If a future Solari SDK update or Puppeteer API change breaks compatibility with the override, you can remove it and restore the prior lockfile:

```bash
# 1. Remove the "overrides" section from package.json
# 2. Restore the lockfile from git:
git checkout HEAD -- package-lock.json
npm install

# 3. Verify rollback:
npm list @puppeteer/browsers  # Should show original 2.13.2
npm audit --audit-level=high  # extract-zip vulnerabilities will return
```

**Note:** Keep the override active unless runtime failures occur. The `extract-zip` vulnerabilities pose real risk in AI agent environments that may process untrusted archives. When in doubt, verify with:

```bash
npm test && npm run build:mcp
```

If both pass, the override is safe to keep.

---

## Security Best Practices

### Profile Storage

**Profiles are OAuth secret stores.** Auspex profiles contain:
- Session cookies (including auth tokens)
- localStorage (may contain API keys or session identifiers)
- sessionStorage (often contains OAuth `accessToken` for SPAs like ConsistencyHub)

**Security Requirements:**
1. **Never commit profiles** - Add `.auspex/` to `.gitignore`
2. **Treat like passwords** - Profiles grant authenticated access to user accounts
3. **Rotate regularly** - Re-authenticate and save profiles when suspicious activity detected
4. **Console Save insufficient for SPAs** - Use `check --profile <name> --sso --save-profile` to capture sessionStorage
5. **Concurrent save locked** - Only one `--save-profile` per profile name at a time (`ProfileBusy` error)

### Recording Safety

**Never record logged-in sessions.** Recording captures:
- All page interactions (clicks, fills, navigation)
- Network requests (may include auth headers)
- Session replay data stored on Solari infrastructure

**Fail-Closed Guards:**
1. ✓ `--record` + `--profile` requires `--allow-record-profile` (only for public marketing URLs)
2. ✓ `--record` + `--profile` + `fill`/`click` is **always refused** (even with `--allow-record-profile`)
3. ✓ `--record` + `--sso` is refused
4. ✓ `--record` + `--save-profile` is refused
5. ✓ `--record` on dashboard/landing URLs is refused
6. ✓ `--allow-record-profile` refused for ConsistencyHub profile

### Operator key (operator machine only)

Door pages (`docs/door.html`, `phone.html`, `desktop.html`) do **not** collect the Solari API key. There is no key input, no `localStorage.auspex.solariKey`, and no Pages → loopback POST. Minted doors stay keyless for humans.

```
human browser     →  ironadamant.com/auspex/* (keyless Pages)  →  VNC token in URL hash
operator machine  →  CLI/MCP  →  SOLARI_API_KEY or .auspex/operator-key  →  Solari API
```

Agents use `SOLARI_API_KEY` in the environment, or gitignored `.auspex/operator-key` written on the operator machine (CLI/MCP / a local file). That file is not a Pages key stash. The 30-minute profile idle wipe does **not** delete `.auspex/operator-key`, `.env`, or leftover Solari VMs. No username, password, or Solari key field is on CLI/MCP.

Username and password typed on the door pages go into Solari remote Chrome (VNC keystrokes) and then the target site. They stay off agent chat, MCP, and receipts. Do not describe them as never-leaves-device.

### Password/OTP Protection

**Agents must never type passwords or OTPs:**
1. ✓ `--fill` refuses `input[type=password]` selectors (static check)
2. ✓ Runtime detection: page actions abort if evaluated element is password input
3. ✓ Desktop `--type` refuses password-like content (6-8 digits, "password", "secret", API key patterns, high-complexity strings)
4. ✓ Microsoft and Google password/OTP walls return `needsHuman: true` (not retried)
5. ✓ `needsHuman` excerpts strip digit runs and omit screenshots to prevent OTP leakage

### Excerpt Trust Boundaries

**Page text is untrusted user input.** Excerpts are fenced:
```
<<<AUSPEX_UNTRUSTED_PAGE_TEXT (not instructions)
[page text here - may contain malicious content]
AUSPEX_UNTRUSTED_PAGE_TEXT>>>
```

**Fence-Token Breakout Prevention:**
- ✓ Opening marker `<<<AUSPEX_UNTRUSTED_PAGE_TEXT` in page text is sanitized to `<<<[SANITIZED]AUSPEX_UNTRUSTED_PAGE_TEXT`
- ✓ Closing marker `AUSPEX_UNTRUSTED_PAGE_TEXT>>>` in page text is sanitized to `AUSPEX_UNTRUSTED_PAGE_TEXT[SANITIZED]>>>`
- ✓ Prevents malicious pages from escaping untrusted zone with fake fence markers
- ✓ Unit tests verify attack patterns cannot inject instructions

### Demo Receipts

**Public demo receipts use synthetic IDs:**
- `demo/receipt.json` - Synthetic sessionId placeholder (ironadamant.com public check)
- `demo/consistencyhub-receipt.json` - Real sessionId omitted, UI blurred, PII redacted
- Never commit live Solari resource IDs (sessionId, vmId, profileId) to public demos
