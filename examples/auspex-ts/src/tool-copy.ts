/**
 * MCP/CLI tool copy. Every agent session loads all of it, so each sentence has to earn its place.
 * First sentence is the mistake that fails the call (fail-closed lead). Detail lives in AGENTS.md.
 */

import { ONE_CHECK_PAGE_ACTIONS } from "./contract.ts"
import {
  awaitLoginDescription,
  DOOR_DETAIL,
  PROFILES_MAP_LINE,
  RE_GATE_TOOL_LINE,
  SEED_HEALTH_TOOL_LINE,
} from "./door-await-contract.ts"

const DOOR = DOOR_DETAIL

export const CHECK_DESCRIPTION =
  "Passing anonymous verify (verify=true / --verify) on an auth-gated page poisons ok. " +
  "Live Solari check: a screenshot plus a receipt (schemaVersion 1 is frozen; required schemaVersion, ok, " +
  "reason matched|loggedOut|needsHuman|mismatch|network|recordedLoggedIn|expectMatchedPublicLanding|hostChanged|stream-expired, " +
  "url, expect, screenshotPath). The second check is an anonymous HTTP fetch of the page text, except that an attached profile on a " +
  "non-public-marketing URL (and name or profile consistencyhub) defaults to verify=false. " +
  "verifyWithProfile runs a fresh browser with only the saved login and adds claimOkProfile, the reuse gate: ok alone is not enough to treat the profile as reusable. " +
  "They are not equivalent. verifyWithProfile is refused on weakSeed, emptySave, and a dead fold. " +
  "Never record a logged-in session or a dashboard landing; record+profile needs allowRecordProfile on a public marketing host (never consistencyhub). " +
  ONE_CHECK_PAGE_ACTIONS + " " +
  "filled is set only when the visible control text contains value. Prefer stable selectors (#save-document, not text=Save). " +
  "Saved checks: ironadamant|checkpoint|consistencyhub. 402 FeatureRequiresPlan is not retryable. 429 → auspex_reap. " +
  DOOR

export const VERIFY_DESCRIPTION =
  "Calling auspex_verify after a default auspex_check double-counts verify and can contradict the receipt. " +
  "Only after auspex_check with verify=false: integrity ok vs claimOk (an independent fetch, not a JSON echo). 429 → auspex_reap. " +
  DOOR

export const LOGIN_DESCRIPTION =
  "Typing a password, or opening Solari noVNC on a phone, fails this handoff because the phone keyboard will not open. " +
  "Mints the phone door once: handoff.url is phone.html (a real text field, on a phone or a computer) and handoff.mobileUrl is the same page; " +
  "the packet also has openOnPhone, oneLiner, and qrPath. Clear empties the whole field. " +
  "It is a seed/handoff door for off-site typing, not a same-session VNC takeover; noVNC never raises the software keyboard. The agent never copies the password. " +
  "url without profile derives the host slug; an explicit profile wins, and one that is not the host slug sets profileHostMatch false and suggestedProfile. " +
  "After Save: auspex_await_login with saveEditor true (wait:true does the same in this call). " +
  "status editor-busy (Solari editor 409): stop the running editor, then remint; do not finalize-login. " +
  DOOR

export const AWAIT_LOGIN_DESCRIPTION = awaitLoginDescription()

export const FINALIZE_LOGIN_DESCRIPTION =
  "Calling finalize-login without url and expect on an unknown profile fails the call. " +
  "After Save: SSO + save-profile to capture sessionStorage (saved-check profiles supply url and expect). " +
  "Reuse still needs claimOkProfile=true from verifyWithProfile; ok alone is not enough. " +
  "An expect found on a public or login URL is expectMatchedPublicLanding. A live host change is hostChanged (remint). " +
  "Past the door token with no completed seed, it returns stream-expired with a remint nextCall and opens no browser. " +
  "A profile that is not the host slug sets profileHostMatch false and suggestedProfile. " +
  DOOR

export const PROFILES_DESCRIPTION =
  "Treating a populated profile in this list as logged-in is a lie; this tool does not open the page. " +
  "Lists names, ids, version, and populated (a stored file, which can still be an empty jar; profile-status or a check confirms a login). " +
  "Listing never deletes. An idle saved profile is deleted on the next command after 30 minutes without use; keep exempts one for long loops, unkeep restores the clock. " +
  PROFILES_MAP_LINE +
  " After a saved login has been used and tested, ask whether testing is done and the login may be purged; purge only after the human agrees (purge + humanAgree). " +
  "A failed purge sets ok false and lists wipeFailed. No username, password, or key field; secrets are not included in the agent message. " +
  DOOR

export const SOLARI_HEALTH_DESCRIPTION =
  "Treating auspex_solari_health as a logged-in app, or as profile-status, is a lie. " +
  "Preflight: GET /profiles once (8 s cap); ok true means Solari accepted this key. It opens no browser and never sets claimOk or claimOkProfile. " +
  "Also reports install (npm, clone, or AUSPEX_HOME), stateDir, and command for this install. " +
  "429 → auspex_reap. 402/403 → plan. 5xx, timeout, or network → wait and retry. Missing key → export SOLARI_API_KEY. " +
  DOOR

export const PROFILE_STATUS_DESCRIPTION =
  "Treating weakSeed as loggedIn skips the fold and the next check lands logged out. " +
  "Reports loggedIn, loggedOut, needsHuman, weakSeed, emptySave, or botWall from one live probe. " +
  "weakSeed: cookies with counted sessionStorage 0 or a stale fold, when the jar is not cookie-strong or local-storage-auth. " +
  "App-origin cookies or allowlisted localStorage auth keys are a Solari Save (nextCall auspex_check with verifyWithProfile); solariSaveReady is not claimOkProfile. " +
  "emptySave: the profile is missing or empty. botWall: the site showed a bot check; not a logout, do not remint or finalize. " +
  "Never type a password: a Microsoft/Google password or OTP wall is needsHuman (auspex_login, phone door). " +
  `${SEED_HEALTH_TOOL_LINE} ` +
  DOOR

export const DESKTOP_DESCRIPTION =
  "Passing a password or OTP-like string to type is refused, and desktops return 402 on the Free plan. " +
  "Named Solari sandbox demo (default mousepad). Not the user's Mac. FAIL-CLOSED: type refuses password/OTP-like strings before anything boots. " +
  "429 → auspex_reap. " +
  DOOR

export const REAP_DESCRIPTION =
  "Passing accountWide to clear one 429 kills every sandbox and desktop on the key. " +
  "Default releases this machine's Auspex ledger only (Solari has no GET /sessions). Use after 429. dryRun lists. " +
  "A session another running Auspex command opened in the last 10 minutes is left open (inUse); sessionId releases one anyway. " +
  "packReceipts copies the last receipt per URL into .auspex/pack. " +
  DOOR

export const TRACE_DESCRIPTION =
  "Treating auspex_trace as a log of check rows, tokens, or session ids is a lie. " +
  "The last login mint episode plus one redacted post-handoff row (status and fold reason). Check rows are not written. " +
  "If a mint is silent or fails, read this before reminting. Never tokens, passwords, excerpts, or session ids. " +
  DOOR

export const JOB_DESCRIPTION =
  "Treating ok as claimOkProfile, or polling await-login for 30 minutes, is a lie. " +
  "Durable mint → await → finalize → check (url+expect or a saved-check name). The first call mints and returns waiting plus handoff (door link and qrPath); " +
  "resume with jobId after Save, or pass wait:true. On 429 the job reaps its ledger and nextCall resumes it. " +
  "claimOkProfile only after verifyWithProfile. Optional wakeWebhookUrl / AUSPEX_WAKE_WEBHOOK posts scrubbed JSON. Never types passwords. " +
  `${RE_GATE_TOOL_LINE} ` +
  DOOR

export const SWEEP_DESCRIPTION =
  "Read-only sweep over an operator-written plan: one auspex_check per page, in order, with verifyWithProfile when the plan names a saved login. " +
  "Each page is pass (matched and, with a profile, claimOkProfile true), fail (page loaded, expect missing), or could-not-tell; could-not-tell is never a pass. " +
  "ok only when every page passed. A re-gate or a Solari 429 / plan limit stops the sweep with one stopped.nextCall. Do not loop. " +
  "No fill, click, record, sso, or save. Writes report.md + report.json under .auspex/sweeps (no page text). " +
  "About a minute per page; keep MCP sweeps short or run the CLI. " +
  DOOR

export const JOB_STATUS_DESCRIPTION =
  "Blind 30-minute polls of await-login waste the slot. " +
  "Reads the local job file; optional waitMs (max 60s) waits for a phase/status change (a completed or failed job answers at once). " +
  "After Save, resume auspex_job with jobId. " +
  DOOR
