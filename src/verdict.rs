//! The three answers on a receipt, kept apart.
//!
//! `ok` is the agent's result. `claimOk` is the plain fetch. `claimOkProfile`
//! is a fresh browser that had only the saved login. One is never copied into
//! another.

use crate::jsonutil::Json;

pub const REASONS: &[&str] = &[
    "matched",
    "loggedOut",
    "needsHuman",
    "mismatch",
    "network",
    "recordedLoggedIn",
    "expectMatchedPublicLanding",
    "hostChanged",
    "stream-expired",
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VerifyView {
    pub skipped: bool,
    pub anonymous_claim_skipped: bool,
    pub integrity_ok: bool,
    pub claim_ok: bool,
    pub claim_errors: Vec<String>,
    pub claim_ok_profile: Option<bool>,
    pub claim_errors_profile: Vec<String>,
    pub errors: Vec<String>,
    pub vwp_refused: Option<String>,
}

impl VerifyView {
    pub fn skipped_named(reason: &str) -> Self {
        Self {
            skipped: true,
            anonymous_claim_skipped: false,
            integrity_ok: false,
            claim_ok: false,
            claim_errors: Vec::new(),
            claim_ok_profile: None,
            claim_errors_profile: Vec::new(),
            errors: Vec::new(),
            vwp_refused: None,
        }
        .with_skip_reason(reason)
    }

    fn with_skip_reason(mut self, reason: &str) -> Self {
        self.errors = vec![reason.to_string()];
        self
    }
}

#[derive(Clone, Debug)]
pub struct VerifyPolicy {
    pub name: Option<String>,
    pub profile: Option<String>,
    pub url: Option<String>,
    /// `Some(true)` forces the anonymous fetch. `Some(false)` skips every
    /// second look. `None` follows the default.
    pub verify: Option<bool>,
    pub verify_with_profile: bool,
}

/// Anonymous second look. A saved login on an app URL skips it. Public
/// marketing still runs it. `--verify` forces it. `--no-verify` skips it.
pub fn should_anonymous_verify(opts: &VerifyPolicy) -> bool {
    if opts.verify == Some(false) {
        return false;
    }
    if opts.verify == Some(true) {
        return true;
    }
    if opts.verify_with_profile {
        return false;
    }
    let name = opts
        .name
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let profile = opts
        .profile
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if name == "consistencyhub" || profile == "consistencyhub" {
        return false;
    }
    if opts.profile.as_ref().is_some_and(|p| !p.trim().is_empty()) {
        if let Some(url) = opts.url.as_deref() {
            if !is_public_marketing_url(url) {
                return false;
            }
        } else {
            return false;
        }
    }
    true
}

pub fn should_profile_verify(opts: &VerifyPolicy) -> bool {
    opts.verify != Some(false) && opts.verify_with_profile
}

pub fn is_no_retry_reason(reason: &str) -> bool {
    matches!(
        reason,
        "loggedOut"
            | "needsHuman"
            | "expectMatchedPublicLanding"
            | "hostChanged"
            | "stream-expired"
    )
}

/// `ok` after the live reason is known. A skipped anonymous claim does not
/// pull `claimOk` into `ok`. `claimOkProfile` is never an input.
pub fn agent_ok(protocol_ok: bool, live_reason: &str, verify: Option<&VerifyView>) -> bool {
    if !protocol_ok || live_reason != "matched" {
        return false;
    }
    match verify {
        None => true,
        Some(v) if v.skipped => true,
        Some(v) if v.anonymous_claim_skipped => v.integrity_ok,
        Some(v) => v.integrity_ok && v.claim_ok,
    }
}

pub fn overlay_reason(live_reason: &str, verify: &VerifyView) -> String {
    if live_reason != "matched" {
        return live_reason.to_string();
    }
    if verify.skipped {
        return "matched".into();
    }
    if verify.anonymous_claim_skipped {
        return if verify.integrity_ok {
            "matched".into()
        } else {
            "network".into()
        };
    }
    if verify.integrity_ok && verify.claim_ok {
        return "matched".into();
    }
    let blob = verify
        .errors
        .iter()
        .chain(verify.claim_errors.iter())
        .cloned()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase();
    if !verify.claim_ok && contains_any(&blob, &["expect", "mismatch", "not found", "missing"]) {
        return "mismatch".into();
    }
    if contains_any(
        &blob,
        &[
            "fetch", "network", "timeout", "econn", "http", "dns", "curl",
        ],
    ) {
        return "network".into();
    }
    if !verify.claim_ok {
        return "mismatch".into();
    }
    "network".into()
}

fn contains_any(hay: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| hay.contains(n))
}

pub fn verify_to_json(verify: &VerifyView) -> Json {
    let mut pairs = vec![
        ("ok".into(), Json::Bool(verify.integrity_ok)),
        ("claimOk".into(), Json::Bool(verify.claim_ok)),
        (
            "errors".into(),
            Json::Array(verify.errors.iter().cloned().map(Json::String).collect()),
        ),
        (
            "claimErrors".into(),
            Json::Array(
                verify
                    .claim_errors
                    .iter()
                    .cloned()
                    .map(Json::String)
                    .collect(),
            ),
        ),
    ];
    if verify.skipped {
        pairs.push(("skipped".into(), Json::Bool(true)));
    }
    if verify.anonymous_claim_skipped {
        pairs.push(("anonymousClaimSkipped".into(), Json::Bool(true)));
    }
    if let Some(value) = verify.claim_ok_profile {
        pairs.push(("claimOkProfile".into(), Json::Bool(value)));
    }
    if !verify.claim_errors_profile.is_empty() {
        pairs.push((
            "claimErrorsProfile".into(),
            Json::Array(
                verify
                    .claim_errors_profile
                    .iter()
                    .cloned()
                    .map(Json::String)
                    .collect(),
            ),
        ));
    }
    if let Some(refused) = &verify.vwp_refused {
        pairs.push(("vwpRefused".into(), Json::String(refused.clone())));
    }
    Json::Object(pairs)
}

#[derive(Clone, Debug)]
pub struct LiveInput {
    pub matched: bool,
    pub needs_human: bool,
    pub special: Option<String>,
    pub final_url: String,
    pub screenshot_ok: bool,
    pub network_idle: bool,
    pub excerpt_empty: bool,
}

pub fn derive_live_reason(input: &LiveInput) -> &'static str {
    if input.special.as_deref() == Some("hostChanged") {
        return "hostChanged";
    }
    if input.special.as_deref() == Some("stream-expired") {
        return "stream-expired";
    }
    if input.needs_human || input.special.as_deref() == Some("needsHuman") {
        return "needsHuman";
    }
    if input.special.as_deref() == Some("expectMatchedPublicLanding") {
        return "expectMatchedPublicLanding";
    }
    if input.special.as_deref() == Some("loggedOut") {
        return "loggedOut";
    }
    if input.special.as_deref() == Some("recordedLoggedIn") {
        return "recordedLoggedIn";
    }
    if input.final_url.is_empty() || !input.screenshot_ok {
        return "network";
    }
    if !input.matched {
        if !input.network_idle && input.excerpt_empty {
            return "network";
        }
        return "mismatch";
    }
    "matched"
}

pub fn is_public_marketing_url(url: &str) -> bool {
    host_is(url, "ironadamant.com") || host_is(url, "checkpointprojects.com")
}

pub fn host_is(url: &str, root: &str) -> bool {
    let Some(host) = host_of(url) else {
        return false;
    };
    host == root || host.ends_with(&format!(".{root}"))
}

pub fn host_of(url: &str) -> Option<String> {
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))?;
    let hostport = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = hostport.split('@').next_back().unwrap_or(hostport);
    let host = host.split(':').next().unwrap_or(host);
    let host = host.trim().trim_matches(['[', ']']).to_ascii_lowercase();
    if host.is_empty() {
        None
    } else {
        Some(host)
    }
}

pub fn is_sign_in_path(url: &str) -> bool {
    let path = path_of(url);
    path == "/login"
        || path == "/signin"
        || path == "/sign-in"
        || path == "/signup"
        || path == "/sign-up"
        || path == "/auth"
        || path == "/users/sign_in"
        || path.starts_with("/login/")
        || path.starts_with("/auth/")
        || path.starts_with("/signin/")
}

pub fn is_public_landing_path(url: &str) -> bool {
    let path = path_of(url);
    path == "/" || path == "/landing" || is_sign_in_path(url)
}

pub fn path_of(url: &str) -> String {
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .unwrap_or(url);
    let after_host = rest.find('/').map(|i| &rest[i..]).unwrap_or("/");
    let path = after_host.split(['?', '#']).next().unwrap_or("/");
    if path.is_empty() {
        "/".into()
    } else {
        path.to_string()
    }
}

pub fn is_idp_host(host: &str) -> bool {
    let h = host.trim_start_matches('.').to_ascii_lowercase();
    const EXACT: &[&str] = &[
        "google.com",
        "www.google.com",
        "accounts.google.com",
        "login.microsoftonline.com",
        "login.microsoft.com",
        "login.live.com",
        "account.live.com",
        "appleid.apple.com",
    ];
    EXACT.iter().any(|item| h == *item)
        || h.ends_with(".login.microsoftonline.com")
        || h.ends_with(".accounts.google.com")
}

pub fn is_forbidden_host(url: &str) -> bool {
    let Some(host) = host_of(url) else {
        return true;
    };
    if host == "metadata.google.internal" || host == "169.254.169.254" {
        return true;
    }
    if let Some(ip) = parse_v4(&host) {
        if ip[0] == 169 && ip[1] == 254 {
            return true;
        }
        if ip[0] == 0 {
            return true;
        }
    }
    false
}

pub fn is_loopback_host(url: &str) -> bool {
    let Some(host) = host_of(url) else {
        return false;
    };
    host == "localhost" || host == "::1" || host.starts_with("127.")
}

fn parse_v4(host: &str) -> Option<[u8; 4]> {
    let parts: Vec<_> = host.split('.').collect();
    if parts.len() != 4 {
        return None;
    }
    let mut out = [0u8; 4];
    for (i, part) in parts.iter().enumerate() {
        out[i] = part.parse().ok()?;
    }
    Some(out)
}

pub fn profile_slug(url: &str) -> Result<String, String> {
    let host =
        host_of(url).ok_or_else(|| "could not derive a profile name from url".to_string())?;
    let mut h = host;
    if let Some(rest) = h.strip_prefix("www.") {
        h = rest.to_string();
    }
    let mut slug = String::new();
    let mut dash = false;
    for ch in h.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
            dash = false;
        } else if !dash && !slug.is_empty() {
            slug.push('-');
            dash = true;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.len() > 48 {
        slug.truncate(48);
        while slug.ends_with('-') {
            slug.pop();
        }
    }
    if slug.is_empty() || !slug.chars().next().unwrap().is_ascii_alphanumeric() {
        return Err("could not derive a profile name from url".into());
    }
    Ok(slug)
}

/// Same product, different host. Today only the MariaDB cloud move.
pub fn same_product_host(a: &str, b: &str) -> bool {
    let pair = ["app.skysql.com", "cloud.mariadb.com"];
    pair.contains(&a) && pair.contains(&b)
}

pub fn reuse_next(claim_ok_profile: Option<bool>) -> String {
    match claim_ok_profile {
        Some(true) => {
            "claimOkProfile is true. That is the reuse gate for this saved login. ok is not claimOk and not claimOkProfile.".into()
        }
        Some(false) => {
            "claimOkProfile is false. Do not reuse this saved login. ok is not the reuse gate.".into()
        }
        None => "No saved-login second look ran. claimOkProfile was not set. ok is not a reuse gate.".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy(profile: Option<&str>, verify: Option<bool>, vwp: bool, url: &str) -> VerifyPolicy {
        VerifyPolicy {
            name: None,
            profile: profile.map(str::to_string),
            url: Some(url.into()),
            verify,
            verify_with_profile: vwp,
        }
    }

    #[test]
    fn second_look_rules() {
        let public = "https://ironadamant.com/";
        let app = "https://app.example/home";
        assert!(should_anonymous_verify(&policy(None, None, false, public)));
        assert!(!should_anonymous_verify(&policy(
            Some("app-example"),
            None,
            false,
            app
        )));
        assert!(should_anonymous_verify(&policy(
            Some("leftover"),
            None,
            false,
            public
        )));
        assert!(should_anonymous_verify(&policy(
            Some("app-example"),
            Some(true),
            false,
            app
        )));
        assert!(!should_anonymous_verify(&policy(
            None,
            Some(false),
            false,
            public
        )));
        assert!(!should_anonymous_verify(&policy(None, None, true, app)));
        assert!(should_profile_verify(&policy(
            Some("app-example"),
            None,
            true,
            app
        )));
        let mut hub = policy(None, None, false, "https://consistencyhub.io/app");
        hub.name = Some("consistencyhub".into());
        assert!(!should_anonymous_verify(&hub));
    }

    #[test]
    fn three_answers_stay_apart() {
        let live_ok = VerifyView {
            skipped: false,
            anonymous_claim_skipped: true,
            integrity_ok: true,
            claim_ok: false,
            claim_errors: Vec::new(),
            claim_ok_profile: Some(true),
            claim_errors_profile: Vec::new(),
            errors: Vec::new(),
            vwp_refused: None,
        };
        assert!(agent_ok(true, "matched", Some(&live_ok)));
        assert!(!live_ok.claim_ok);
        assert_eq!(live_ok.claim_ok_profile, Some(true));

        let claim_miss = VerifyView {
            skipped: false,
            anonymous_claim_skipped: false,
            integrity_ok: true,
            claim_ok: false,
            claim_errors: vec!["expect missing".into()],
            claim_ok_profile: None,
            claim_errors_profile: Vec::new(),
            errors: Vec::new(),
            vwp_refused: None,
        };
        assert!(!agent_ok(true, "matched", Some(&claim_miss)));
        assert_eq!(overlay_reason("matched", &claim_miss), "mismatch");

        let profile_miss = VerifyView {
            skipped: false,
            anonymous_claim_skipped: true,
            integrity_ok: true,
            claim_ok: false,
            claim_errors: Vec::new(),
            claim_ok_profile: Some(false),
            claim_errors_profile: vec!["expect missing".into()],
            errors: Vec::new(),
            vwp_refused: None,
        };
        // The live browser matched and the anonymous claim was skipped, so ok
        // stays true. claimOkProfile is still false. They are not one flag.
        assert!(agent_ok(true, "matched", Some(&profile_miss)));
        assert_eq!(profile_miss.claim_ok_profile, Some(false));
        assert_eq!(overlay_reason("matched", &profile_miss), "matched");
    }

    #[test]
    fn prove_requires_its_own_second_browser() {
        // A journey claim is not ok. The caller passes the fresh browser result.
        let hornet_said_passed = true;
        let fresh = VerifyView {
            skipped: false,
            anonymous_claim_skipped: true,
            integrity_ok: true,
            claim_ok: false,
            claim_errors: Vec::new(),
            claim_ok_profile: Some(false),
            claim_errors_profile: vec!["expect missing".into()],
            errors: Vec::new(),
            vwp_refused: None,
        };
        assert!(hornet_said_passed);
        assert_eq!(fresh.claim_ok_profile, Some(false));
        assert!(!fresh.claim_ok_profile.unwrap());
    }
}
