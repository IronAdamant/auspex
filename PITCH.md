# PITCH.md — Auspex for hiring managers

**One-sentence summary:** Coding agents launch a throwaway cloud browser, snapshot a live page, verify the claim in a separate headless VM, and tear everything down—no human watching, no passwords typed, frozen contract.

---

## Problem

Coding agents need evidence from live web pages without sitting in a browser tab you have to watch. They also hallucinate claims about what they saw. Asking "did ironadamant.com say X?" gets a confident yes even when the page never loaded.

---

## Mechanism

**Three primitives only:** browser check → independent sandbox verify → tear-down.

1. **`auspex_check`** — agent launches a Solari cloud Chrome (its own remote instance, not your local browser), navigates to a URL, optionally waits for elements/fills forms, snapshots text + PNG, checks if a claim substring appears, and closes. Returns a frozen **schema v1** JSON receipt: `schemaVersion`, `ok`, `reason`, `url`, `expect`, `screenshotPath` (required); `diff`, `verify`, optional fields.

2. **`auspex_verify`** (runs by default) — a separate headless VM independently audits the receipt. It re-fetches the URL via HTTP, OCRs the PNG, and asserts the claim. **Integrity `ok` (the agent sees) is separate from claim `claimOk` (verify sees).** Verify does not echo `manifest.ok`; it does the work again. Then kills the VM.

3. **`auspex_reap`** — lists leftover ledger sessions (e.g., after concurrency limit) and kills them. Default does not wipe every VM on the key; `--account-wide` does.

**Named checks:** `--name ironadamant` / `checkpoint` / `consistencyhub` are saved per-site configs (URL + expected substring + optional profile/SSO). Agents call them without reconstructing flags.

**Fail-closed by design:**
- No password typing: SSO handoff URL (human signs in once). `--fill` refused on `input[type=password]`. Microsoft/Google walls return `needsHuman: true`.
- No logged-in recording by default: `--record` + `--profile` forbidden unless `--allow-record-profile` on a public marketing host (ironadamant.com, checkpointprojects.com). Refused for consistencyhub.
- No page actions with profiles by default: `--fill` / `--click` with a profile requires `--allow-page-actions`.
- Frozen contract: CLI and MCP are identical (every MCP tool is a CLI command; every flag is a JSON field). Schema v1 is locked; no required-key additions.

---

## Evidence

**Public receipts:** [RECEIPTS.md](RECEIPTS.md) — demo artifacts (PNG, replay, receipt JSON), honesty notes on marketing summary vs. schema v1, and verification details.

**Live checks:** GitHub Actions [`public` job](https://github.com/IronAdamant/auspex/actions/workflows/auspex-ts.yml) runs weekly (Mondays + `workflow_dispatch`) to verify the saved checks still work. The workflow **does not commit artifacts**; the demo PNG/receipt/replay in the repo are manually committed when refreshed.

**Agent instructions (any host):** [AGENTS.md](AGENTS.md) — source of truth for CLI, Cursor, Claude Code, Codex, shell. Includes frozen schema v1 table, tools, rules, MCP setup.

**Package:** [examples/auspex-ts](examples/auspex-ts) — the intern submission. Other `examples/*` are upstream Solari cookbook samples (not the submission).

---

## Week one if hired (optional — modest, no promises)

If green-lit, these are areas I'd explore first:

1. **Reap metrics:** `auspex_reap` currently lists/kills ledger ids. Add per-session metadata (created-at, last-used-at, concurrency burn) so agents can triage "which leftover is eating my slot?"

2. **Multi-claim batches:** Today each `auspex_check` is one URL + one expect substring. For pages with many claims (e.g., a pricing table), batch N claims → one browser session → N verify VMs → one receipt with per-claim results. Saves concurrency slots.

3. **Cheaper HTTP-first tier:** For public marketing pages (no stealth/proxy/captcha), try HTTP+OCR first. Only launch cloud Chrome if HTTP fetch fails (403/captcha). Reduces cost when the page is scrapeable.

4. **Profile hygiene alerts:** `auspex_profile_status` returns `loggedIn` / `loggedOut` / `needsHuman`. Add a `stale` reason (e.g., last-used > 30d, cookie expiry approaching) so agents know when to re-seed before a live check.

These are *ideas*, not commitments. Real priorities depend on intern onboarding + team needs.

---

## Why this matters

Coding agents are moving from "write code" to "verify the code works in production." That means checking live pages, waiting for deploy previews, and asserting claims without a human sitting in DevTools. Auspex gives them a parseable receipt they can trust—and a separate VM that double-checks the receipt before the agent sees `ok: true`.

**This is the intern submission.** Full product scope (browser/sandbox/desktop) is at [getsolari.com](https://getsolari.com); Auspex is the check → verify → kill workflow built on Solari's cloud Chrome + headless VMs.

---

**Repo:** [github.com/IronAdamant/auspex](https://github.com/IronAdamant/auspex)  
**Challenge:** [jobs.getsolari.com](https://jobs.getsolari.com)  
**Console:** [console.getsolari.com](https://console.getsolari.com)
