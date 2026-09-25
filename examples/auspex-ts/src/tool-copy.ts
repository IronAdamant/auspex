/**
 * Short MCP/CLI tool copy. Detail lives in AGENTS.md and docs/door-card-api.md.
 * First sentence is the mistake that fails the call (fail-closed lead).
 */

const DOOR = "Detail: docs/door-card-api.md and AGENTS.md."

export const CHECK_DESCRIPTION =
  "Passing anonymous verify (verify=true / --verify) on an auth-gated page poisons ok. " +
  "Live Solari check + schema v1 receipt (schemaVersion 1 is frozen; required schemaVersion, ok, " +
  "reason matched|loggedOut|needsHuman|mismatch|network|recordedLoggedIn|expectMatchedPublicLanding|hostChanged|stream-expired, " +
  "url, expect, screenshotPath). Default verify is HTTP fetch + OCR except name=consistencyhub / " +
  "profile=consistencyhub / attached profile on a non-public-marketing URL (defaults to verify=false). " +
  "verify=true is anonymous and poisons ok on auth-gated pages. verifyWithProfile adds claimOkProfile " +
  "(reuse gate — ok is not enough to treat the profile as reusable). They are not equivalent. " +
  "record+profile needs allowRecordProfile on a public marketing host; never record a dashboard landing. " +
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
  "Solari editor start 409 is status editor-busy (reason editor-start-409): a prior editor is still running. Do not finalize-login. Wait for it to close, or purge after the human agrees, then remint. " +
  DOOR

export const AWAIT_LOGIN_DESCRIPTION =
  "Treating an empty Save (a version bump with zero cookies) as success is a lie; the profile is still logged out. " +
  "Wait until Save stores cookies or origins (default 30 minutes). Pass saveEditor true after phone/desktop Save " +
  "(do not open Solari on a phone: GET editor HTTP 401). empty-save is not success. " +
  "If editorSave is 200 and editorFold is no-cdp and the profile has cookies, finalize-login NOW even when the VNC JWT is past. " +
  "If those cookies are only Microsoft or Google sign-in hosts and the app host is missing, status is idp-only-save: remint, do not finalize. " +
  "Finish Microsoft or Google, land on the app UI, then Save. " +
  "If editorSave fails, remint. Cookies alone are not proof of login. " +
  "Leftover sessionStorage is not a fresh capture. " +
  "Do not remint for stream-expired after editorSave 200 when cookies exist. Do not verify-with-profile on that fold. " +
  "verify-with-profile after finalize uses a fresh session from the saved profile, not the editor JWT. " +
  "Do not run verify-with-profile on a dead fold (claimOkProfile will not pass). Stale/weak next: remint or finalize-now. " +
  "Statuses: completed | timeout | empty-save | idp-only-save | waiting | host-changed | stream-expired | editor-save-hung | profile-busy. " +
  "saveEditor re-checks streamExpiresAt during the Save poll and caps the wait to that VNC stamp (plus a short grace). " +
  "Once that stamp is past, status is stream-expired with a remint nextCall — not a 30-minute poll and not before the stamp. " +
  "If profile is not the host slug: profileHostMatch false, suggestedProfile (soft advise). " +
  "Live host divergence: hostChanged, remint auspex_login. " +
  DOOR

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
  "List names, ids, version, and populated. After a saved login has been used and tested, ask whether " +
  "testing is done and the login may be purged. Purge only after the human agrees (purge + humanAgree). " +
  "An idle saved profile is deleted on the next command after 30 minutes without use. " +
  "No username, password, or Solari key field. Secrets are not included in the agent message. " +
  DOOR

export const PROFILE_STATUS_DESCRIPTION =
  "Treating weakSeed as loggedIn skips the fold and the next check lands logged out. " +
  "Report loggedIn vs loggedOut vs needsHuman vs weakSeed vs emptySave. " +
  "weakSeed is cookies/origins with a counted sessionStorage of 0, or stale folded expiresOn. " +
  "Never type a password. Microsoft/Google password/OTP is needsHuman: auspex_login, handoff.url " +
  "(mobileUrl real text field; desktopUrl on the computer). Never type in Solari noVNC on a phone. " +
  "Path / is loggedOut unless expect matched. " +
  DOOR

export const DESKTOP_DESCRIPTION =
  "Passing a password or OTP-like string to type is refused, and desktops return 402 on the Free plan. " +
  "Named Solari sandbox demo (default mousepad). Not the user's Mac. FAIL-CLOSED type refuses " +
  "password/OTP-like strings. Wait/expect/ok share one process haystack. streamUrl is live VNC. " +
  "429: auspex_reap. " +
  DOOR

export const REAP_DESCRIPTION =
  "Passing accountWide to clear one 429 kills every sandbox and desktop on the key. " +
  "Default kills Auspex live-ledger ids only. Use after 429. dryRun lists. packReceipts copies " +
  "last receipts per URL into .auspex/pack. " +
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
  DOOR

export const JOB_STATUS_DESCRIPTION =
  "Blind 30-minute polls of await-login waste the slot. " +
  "Read the local job file; optional waitMs (max 60s) blocks until phase/status changes. " +
  "After Save, resume auspex_job --job-id. Returns current state + nextCall. " +
  DOOR
