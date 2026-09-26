/**
 * Short MCP/CLI tool copy. Detail lives in AGENTS.md and docs/door-card-api.md.
 * First sentence is the mistake that fails the call (fail-closed lead).
 */

import {
  awaitLoginDescription,
  PROFILES_MAP_LINE,
  RE_GATE_TOOL_LINE,
  SEED_HEALTH_TOOL_LINE,
} from "./door-await-contract.ts"

const DOOR = "Detail: docs/door-card-api.md and AGENTS.md."

export const CHECK_DESCRIPTION =
  "Passing anonymous verify (verify=true / --verify) on an auth-gated page poisons ok. " +
  "Live Solari check + schema v1 receipt (schemaVersion 1 is frozen; required schemaVersion, ok, " +
  "reason matched|loggedOut|needsHuman|mismatch|network|recordedLoggedIn|expectMatchedPublicLanding|hostChanged|stream-expired, " +
  "url, expect, screenshotPath). Default verify is HTTP fetch + OCR except name=consistencyhub / " +
  "profile=consistencyhub / attached profile on a non-public-marketing URL (defaults to verify=false). " +
  "verify=true is anonymous and poisons ok on auth-gated pages. verifyWithProfile adds claimOkProfile " +
  "(reuse gate — ok is not enough to treat the profile as reusable). They are not equivalent. " +
  "Save is not sessionStorage. verifyWithProfile is refused on weakSeed, emptySave, and a dead fold (no claim session). " +
  "record+profile needs allowRecordProfile on a public marketing host; never record a dashboard landing. " +
  "check --fill sets filled only when visible value or innerText contains --value. Hidden textContent does not count. Contenteditable focuses and types, then insertText if that text does not stick. Prefer #save-document; text=Save can match Unsaved chrome. " +
  "allowRecordProfile is refused for consistencyhub. Saved checks: ironadamant|checkpoint|consistencyhub. " +
  "402 FeatureRequiresPlan is not retryable. 429 → auspex_reap (ledger, not accountWide). " +
  DOOR

export const VERIFY_DESCRIPTION =
  "Calling auspex_verify after a default auspex_check double-counts verify and can contradict the receipt. " +
  "Only after auspex_check with verify=false: sandbox integrity ok vs claim claimOk (fetch/OCR, not JSON echo). " +
  "429: auspex_reap first. " +
  DOOR

export const LOGIN_DESCRIPTION =
  "Typing a password, or opening Solari noVNC on a phone, fails this handoff because the phone keyboard will not open. " +
  "Mint once. handoff.url / oneLiner is the chooser (door.html). Labeled deep links: handoff.mobileUrl " +
  "(phone.html, real text field; Chrome-on-phone dogfood; autofill / reconnect same VNC JWT; remint only when stream-expired) and handoff.desktopUrl (desktop.html). Packet also has openOnPhone, " +
  "openOnDesktop, qrPath. url without profile derives a safe host slug; explicit profile wins. " +
  "That page is a seed/handoff door for off-site typing, not a same-session VNC takeover. Never type in Solari noVNC on a phone " +
  "(software keyboard will not open). The agent never copies the password. After Save: " +
  "auspex_await_login with saveEditor true (GET editor HTTP 401 if you open Solari on a phone). " +
  "wait:true / --wait is that same saveEditor path. If profile is not the host slug: profileHostMatch false, " +
  "suggestedProfile, remint nextCall. " +
  "Solari editor start HTTP 409 reuses the live editor by polling /editor/token (no DELETE on that remint). status editor-busy (reason editor-start-409) means reuse failed. Do not finalize-login. Do not purge and remint while that editor is still running; stop the editor first, then remint. " +
  DOOR

export const AWAIT_LOGIN_DESCRIPTION = awaitLoginDescription()

export const FINALIZE_LOGIN_DESCRIPTION =
  "Calling finalize-login without url and expect on an unknown profile fails the call. " +
  "Post-login one-shot: SSO + save-profile to capture sessionStorage. Saved-check profiles supply URL/expect; " +
  "unknown profiles require url and expect. Reuse requires claimOkProfile=true from verifyWithProfile; " +
  "ok alone is not enough to treat the profile as reusable. Public-landing expect hit is " +
  "expectMatchedPublicLanding (not matched). Live host divergence: hostChanged, remint. " +
  "If the editor-save VNC JWT (streamExpiresAt) is past and the profile has no completed non-empty seed, " +
  "finalize refuses POST /sessions and returns reason stream-expired with a remint nextCall. " +
  "If profile is not the host slug: profileHostMatch false, suggestedProfile. " +
  DOOR

export const PROFILES_DESCRIPTION =
  "Treating a populated profile in this list as logged-in is a lie; this tool does not open the page. " +
  "List names, ids, version, and populated. " +
  PROFILES_MAP_LINE +
  " After a saved login has been used and tested, ask whether " +
  "testing is done and the login may be purged. Purge only after the human agrees (purge + humanAgree). " +
  "An idle saved profile is deleted on the next command after 30 minutes without use. " +
  "Voluntary purge stops the editor before delete. If the named profile is not wiped, ok is false and wipeFailed lists it. " +
  "No username, password, or Solari key field. Secrets are not included in the agent message. " +
  DOOR

export const PROFILE_STATUS_DESCRIPTION =
  "Treating weakSeed as loggedIn skips the fold and the next check lands logged out. " +
  "Report loggedIn vs loggedOut vs needsHuman vs weakSeed vs emptySave. " +
  "weakSeed is cookies/origins with a counted sessionStorage of 0, or stale folded expiresOn, when the jar is not cookie-strong or local-storage-auth. " +
  "App-origin cookies or allowlisted localStorage auth key names are a Solari Save. seedReadiness reports counts and names only. solariSaveReady is not claimOkProfile. " +
  "emptySave means the profile is missing. Save is not sessionStorage. " +
  "check verifyWithProfile is refused on weakSeed, emptySave, and a dead fold. " +
  "Never type a password. Microsoft/Google password/OTP is needsHuman: auspex_login, handoff.url " +
  "(mobileUrl real text field; desktopUrl on the computer). Never type in Solari noVNC on a phone. " +
  "Path / is loggedOut unless expect matched. " +
  `${SEED_HEALTH_TOOL_LINE} ` +
  DOOR

export const DESKTOP_DESCRIPTION =
  "Passing a password or OTP-like string to type is refused, and desktops return 402 on the Free plan. " +
  "Named Solari sandbox demo (default mousepad). Not the user's Mac. FAIL-CLOSED type refuses " +
  "password/OTP-like strings. Wait/expect/ok share one process haystack. streamUrl is live VNC. " +
  "429: auspex_reap. " +
  DOOR

export const REAP_DESCRIPTION =
  "Passing accountWide to clear one 429 kills every sandbox and desktop on the key. " +
  "Default kills Auspex live-ledger ids only (accountWide stays false). Solari has no GET /sessions (cookbook #61). " +
  "Use after 429. dryRun lists. packReceipts copies last receipts per URL into .auspex/pack. " +
  DOOR

export const TRACE_DESCRIPTION =
  "Treating auspex_trace as a log of check rows, tokens, or session ids is a lie. " +
  "Last login mint episode plus one redacted post-handoff row (status and fold reason). " +
  "Check rows are not written. If mint is silent or fails, read this before reminting. " +
  "Never tokens, passwords, excerpts, or session ids. Not a fourth primitive. " +
  DOOR

export const JOB_DESCRIPTION =
  "Treating ok as claimOkProfile, or polling await-login for 30 minutes, is a lie. " +
  "Durable mint→await→finalize→check job (url+expect or a saved-check name). " +
  "First call mints and returns waiting + handoff; resume with jobId after Save (wait:true continues). " +
  "Fail-closed nextCall matches the door-card matrix (hostChanged, stream-expired, editor-save-hung, " +
  "profile-busy, expectMatchedPublicLanding). On 429 the job reaps the ledger (not accountWide) " +
  "and nextCall resumes this job. claimOkProfile only after verifyWithProfile. " +
  "Optional wakeWebhookUrl / AUSPEX_WAKE_WEBHOOK POSTs scrubbed JSON (operator-local). " +
  "Not a fourth primitive. Never types passwords. " +
  `${RE_GATE_TOOL_LINE} ` +
  DOOR

export const JOB_STATUS_DESCRIPTION =
  "Blind 30-minute polls of await-login waste the slot. " +
  "Read the local job file; optional waitMs (max 60s) blocks until phase/status changes. " +
  "After Save, resume auspex_job --job-id. Returns current state + nextCall. " +
  DOOR
