# SessionStorage Profile Verification Fix

## Root Cause Analysis

### Problem
After `finalize-login` (which captures sessionStorage for ConsistencyHub and other Microsoft OAuth SPAs), profile-seeded `--verify-with-profile` checks often land on the sign-in page and emit `claimOkProfile: false`. This indicates that sessionStorage is not being properly restored during profile-seeded claim verification.

### Layer Identified
**Layer 1: Auspex not applying sessionStorage in profile claim check path**

### Technical Details

#### How SessionStorage Save Works (Correct)
When `--save-profile` is used during a check (or in `finalize-login`):

1. **Capture** (`profile-storage.ts:captureStorageState`):
   - Reads live `sessionStorage` from all page frames via `readSessionItems`
   - Stores each sessionStorage item in `localStorage` with `__auspex_ss__:` prefix via `foldSessionStorage`
   - Saves the complete `StorageState` (cookies + origins with modified localStorage) to Solari profile

2. **Result**: Profile contains sessionStorage data encoded as prefixed localStorage items

#### How SessionStorage Restore Should Work

When a profile is used in a check:

1. **Launch** (`solari.ts:launchBrowser`):
   - Solari returns session with `storageState` populated from the saved profile
   - This includes cookies and origins with localStorage (including `__auspex_ss__:` prefixed items)

2. **Apply Context** (`solari.ts:pageForSession`):
   - Creates new context with profile's `storageState`
   - Calls `installSessionStorageRestore(ctx, state, page)` which:
     - Extracts sessionStorage items from localStorage via `sessionItemsByOrigin`
     - Installs an init script via `ctx.addInitScript` and `page.addInitScript`
     - Init script runs on every page load and copies `__auspex_ss__:` items into sessionStorage

3. **Navigate** (in check flow):
   - Page navigates to target URL
   - Init script should run automatically and restore sessionStorage
   - **CRITICAL**: Explicit call to `hydrateSessionStorage(page)` provides fallback

4. **Hydrate Fallback** (`profile-storage.ts:hydrateSessionStorage`):
   - Manually evaluates in page context to copy `__auspex_ss__:` items from localStorage to sessionStorage
   - Returns count of items restored
   - Provides guarantee that sessionStorage is restored even if init script failed/raced

#### The Bug

**Main check path** (`check.ts` line 218):
```typescript
const restored = await hydrateSessionStorage(page)
```
✅ Explicitly calls `hydrateSessionStorage` after navigation

**Profile claim check path** (`sandbox.ts:defaultProfileClaimCheck` line 132-147):
```typescript
await page.goto(opts.finalUrl, { ... })
try {
  await page.waitForLoadState("networkidle", { timeout: 20_000 })
} catch { }
await new Promise((resolve) => setTimeout(resolve, 2000))
let raw = await page.evaluate(() => document.body?.innerText ?? "")
```
❌ **NO call to `hydrateSessionStorage`**

The init script installed by `installSessionStorageRestore` is **not sufficient** because:
- It may run too early, before localStorage is fully hydrated by Playwright
- There may be race conditions with page load timing
- SPAs may navigate/rewrite DOM before the script completes
- The explicit hydrate call in main check path proves this fallback is necessary

### Verification Path

`--verify-with-profile` flow:
1. Main check completes successfully (with `hydrateSessionStorage` call) ✅
2. Verification starts → calls `defaultProfileClaimCheck` ❌
3. Profile claim check launches new session with same profile
4. Navigates without calling `hydrateSessionStorage`
5. SessionStorage items not restored reliably
6. SPA lands on sign-in page instead of authenticated state
7. `claimOkProfile: false`

### Classification

- **Fixable in Auspex**: YES
- **Layer**: Application logic (missing hydrate call)
- **Not a Solari API issue**: Solari correctly returns the saved storageState
- **Not a timing issue**: The explicit hydrate call solves the race
- **Not an origin mismatch**: Same URL used in both main check and claim check

### Evidence

1. **Code comparison**:
   - `check.ts:218` has `await hydrateSessionStorage(page)` ✅
   - `sandbox.ts:defaultProfileClaimCheck` missing this call ❌

2. **Test precedent**:
   - `tests/live-smoke.test.ts:84` explicitly calls `hydrateSessionStorage` after goto
   - Shows this is a known necessary pattern

3. **Fail-closed design**:
   - Main check succeeds because sessionStorage is restored
   - Claim check fails because sessionStorage is not restored
   - Honestly reports false (correct behavior, not a false positive)

## The Fix

Add explicit `hydrateSessionStorage` call in `defaultProfileClaimCheck` after page navigation, matching the pattern in the main check flow.

### Changes Required

**File**: `examples/auspex-ts/src/sandbox.ts`

**Location**: After `page.goto` and before reading page content

**Addition**: 
```typescript
const restored = await hydrateSessionStorage(page)
```

This ensures sessionStorage is reliably restored from the saved profile before evaluating page content, matching the behavior of the main check path.

### Why This is Fail-Closed

- The fix makes `claimOkProfile: true` honest (sessionStorage actually restored)
- Does not fake success or bypass verification
- Aligns profile claim check behavior with main check behavior
- If sessionStorage items are missing/corrupted, hydrate will restore 0 items and verification will still honestly fail

## Testing Strategy

1. **Unit test**: Mock profile with sessionStorage items, verify hydrate is called
2. **Integration test**: Save profile with sessionStorage, run claim check, verify restoration
3. **Dogfood**: Run real ConsistencyHub flow with profile-seeded verification

## Related Code Paths

All paths that use profiles should call `hydrateSessionStorage` after navigation:
- ✅ `check.ts:runCheck` - has it
- ❌ `sandbox.ts:defaultProfileClaimCheck` - missing (this fix)
- ✅ `tests/live-smoke.test.ts` - has it (test pattern)
