//! Assemble a receipt from a live look and a second look.
//!
//! `ok`, `claimOk`, and `claimOkProfile` are written by different branches.

use crate::checkflow::{CheckRequest, ClaimObs, LiveObs};
use crate::hornet::{self, HornetClaim};
use crate::jsonutil::Json;
use crate::logbook::RunRecord;
use crate::profile::{self, Profile};
use crate::textmatch::{self, haystack_matches, prepare_excerpt};
use crate::verdict::{self, LiveInput, VerifyPolicy, VerifyView};

pub struct ReceiptInput<'a> {
    pub anon: Option<&'a ClaimObs>,
    pub profile_look: Option<&'a ClaimObs>,
    pub refused: Option<&'a str>,
    pub screenshot: &'a str,
    pub run_id: &'a str,
    pub hornet_used: bool,
    pub hornet_reason: &'a str,
    pub hornet_run: Option<&'a str>,
    pub claim: Option<&'a HornetClaim>,
    pub loaded: Option<&'a Profile>,
}

pub fn build_receipt(req: &CheckRequest, live: &LiveObs, input: &ReceiptInput<'_>) -> Json {
    let matched = haystack_matches(&live.text, &req.expect);
    let bot = textmatch::is_bot_challenge(&live.title, &live.text);
    let mut special = None;
    let sign_in = verdict::is_sign_in_path(&live.final_url)
        || verdict::host_of(&live.final_url).is_some_and(|h| verdict::is_idp_host(&h));
    if live.password_field && !matched {
        special = Some("needsHuman");
    } else if req.profile.is_some()
        && !matched
        && (sign_in || verdict::is_public_landing_path(&live.final_url))
        && !live.final_url.is_empty()
    {
        special = Some("loggedOut");
    }
    let mut matched_flag = matched;
    if req.save_profile && matched && verdict::is_public_landing_path(&live.final_url) {
        special = Some("expectMatchedPublicLanding");
        matched_flag = false;
    }
    let needs_human = special == Some("needsHuman");
    let live_reason = verdict::derive_live_reason(&LiveInput {
        matched: matched_flag,
        needs_human,
        special: special.map(|s| s.to_string()),
        final_url: live.final_url.clone(),
        screenshot_ok: live.screenshot_ok || needs_human,
        network_idle: live.network_idle,
        excerpt_empty: live.text.trim().is_empty(),
    });
    let verify = make_verify(
        req,
        live_reason,
        input.anon,
        input.profile_look,
        input.refused,
    );
    let mut reason = verify
        .as_ref()
        .map(|v| verdict::overlay_reason(live_reason, v))
        .unwrap_or_else(|| live_reason.to_string());
    if live.click_missed.is_some() && reason == "matched" {
        reason = "mismatch".into();
    }
    let mut ok = verdict::agent_ok(true, live_reason, verify.as_ref());
    if live.click_missed.is_some() {
        ok = false;
    }
    if bot && live_reason == "mismatch" {
        ok = false;
    }
    let proved = if req.prove {
        match verify.as_ref().and_then(|v| v.claim_ok_profile) {
            Some(value) => value,
            None => verify.as_ref().is_some_and(|v| v.claim_ok) && matched_flag,
        }
    } else {
        false
    };
    let next = next_text(
        req,
        &reason,
        ok,
        verify.as_ref(),
        input.refused,
        bot,
        input.claim,
    );
    let mut body = Json::object(vec![
        ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
        ("ok", Json::Bool(ok)),
        ("reason", Json::String(reason.clone())),
        ("url", Json::String(crate::scrub::scrub_url(&req.url))),
        ("expect", Json::String(req.expect.clone())),
        ("screenshotPath", Json::String(input.screenshot.to_string())),
        ("title", Json::String(live.title.clone())),
        (
            "finalUrl",
            Json::String(crate::scrub::scrub_url(&live.final_url)),
        ),
        ("matched", Json::Bool(matched_flag)),
        (
            "excerpt",
            Json::String(prepare_excerpt(&live.text, needs_human)),
        ),
        ("runId", Json::String(input.run_id.to_string())),
        ("networkIdle", Json::Bool(live.network_idle)),
        ("next", Json::String(next)),
    ]);
    if bot {
        body.insert("botWall", Json::Bool(true));
    }
    if needs_human {
        body.insert("needsHuman", Json::Bool(true));
        body.insert("screenshotPath", Json::String(String::new()));
    }
    if let Some(filled) = &live.filled {
        body.insert("filled", Json::String(filled.clone()));
    }
    if let Some(clicked) = &live.clicked {
        body.insert("clicked", Json::String(clicked.clone()));
    }
    if let Some(missed) = &live.click_missed {
        body.insert("clickMissed", Json::String(missed.clone()));
    }
    if let Some(verify) = &verify {
        body.insert("verify", verdict::verify_to_json(verify));
    }
    if let Some(profile) = input.loaded {
        body.insert("profileSeed", profile::seed_summary(profile));
        body.insert(
            "seedReadiness",
            Json::object(vec![(
                "shape",
                Json::String(profile::readiness(profile).into()),
            )]),
        );
    }
    if req.via_hornet || input.claim.is_some() {
        let mut pairs = vec![
            (
                "requested".into(),
                Json::Bool(req.via_hornet || input.claim.is_some()),
            ),
            ("used".into(), Json::Bool(input.hornet_used)),
            (
                "reason".into(),
                Json::String(if input.hornet_reason.is_empty() {
                    hornet::status().reason
                } else {
                    input.hornet_reason.to_string()
                }),
            ),
        ];
        if let Some(id) = input.hornet_run {
            pairs.push(("runId".into(), Json::String(id.to_string())));
        }
        if let Some(claim) = input.claim {
            pairs.push(("claimFound".into(), Json::Bool(claim.found)));
            pairs.push(("claimStatus".into(), Json::String(claim.status.clone())));
            let confirmed = verify
                .as_ref()
                .and_then(|v| v.claim_ok_profile)
                .unwrap_or(false)
                || (req.profile.is_none() && verify.as_ref().is_some_and(|view| view.claim_ok));
            pairs.push((
                "confirmed".into(),
                Json::Bool(hornet::claim_confirmed(&claim.status, confirmed)),
            ));
        }
        body.insert("hornet", Json::Object(pairs));
    }
    if req.prove {
        body.insert("proved", Json::Bool(proved));
    }
    if let Some(call) = next_call(&reason, input.refused, req) {
        body.insert("nextCall", call);
    }
    crate::scrub::scrub_json(&body)
}

pub(crate) fn make_verify(
    req: &CheckRequest,
    live_reason: &str,
    anon: Option<&ClaimObs>,
    profile_look: Option<&ClaimObs>,
    refused: Option<&str>,
) -> Option<VerifyView> {
    if verdict::is_no_retry_reason(live_reason) {
        return Some(VerifyView {
            skipped: true,
            anonymous_claim_skipped: false,
            integrity_ok: false,
            claim_ok: false,
            claim_errors: vec![format!("skipped:{live_reason}")],
            claim_ok_profile: None,
            claim_errors_profile: Vec::new(),
            errors: Vec::new(),
            vwp_refused: None,
        });
    }
    let policy = policy_for_prove(req);
    let want_anon = verdict::should_anonymous_verify(&policy);
    let want_profile =
        verdict::should_profile_verify(&policy) || (req.prove && req.profile.is_some());
    if !want_anon && !want_profile && req.verify == Some(false) {
        return None;
    }
    if !want_anon && !want_profile {
        return None;
    }
    let mut view = VerifyView {
        skipped: false,
        anonymous_claim_skipped: !want_anon,
        integrity_ok: true,
        claim_ok: false,
        claim_errors: Vec::new(),
        claim_ok_profile: None,
        claim_errors_profile: Vec::new(),
        errors: Vec::new(),
        vwp_refused: refused.map(|s| s.to_string()),
    };
    if let Some(refused) = refused {
        view.integrity_ok = false;
        view.claim_ok_profile = Some(false);
        view.errors
            .push(format!("verify-with-profile refused: {refused}"));
        return Some(view);
    }
    if want_anon {
        match anon {
            Some(obs) => {
                if let Some(err) = &obs.error {
                    view.integrity_ok = false;
                    view.claim_ok = false;
                    view.errors.push(err.clone());
                    view.claim_errors.push(err.clone());
                } else if haystack_matches(&obs.text, &req.expect) {
                    view.claim_ok = true;
                } else {
                    view.claim_ok = false;
                    view.claim_errors.push("expect missing".into());
                }
            }
            None => {
                view.integrity_ok = false;
                view.errors.push("fetch did not run".into());
            }
        }
    }
    if want_profile {
        match profile_look {
            Some(obs) => {
                if let Some(err) = &obs.error {
                    view.integrity_ok = false;
                    view.claim_ok_profile = Some(false);
                    view.errors.push(err.clone());
                    view.claim_errors_profile.push(err.clone());
                } else if verdict::is_sign_in_path(&obs.landed_url) {
                    view.claim_ok_profile = Some(false);
                    view.claim_errors_profile
                        .push("landed on a sign-in page".into());
                } else if haystack_matches(&obs.text, &req.expect) {
                    view.claim_ok_profile = Some(true);
                } else {
                    view.claim_ok_profile = Some(false);
                    view.claim_errors_profile.push("expect missing".into());
                }
            }
            None => {
                view.integrity_ok = false;
                view.claim_ok_profile = Some(false);
                view.errors.push("saved-login browser did not run".into());
            }
        }
    }
    Some(view)
}

pub(crate) fn policy_for(req: &CheckRequest) -> VerifyPolicy {
    VerifyPolicy {
        name: req.name.clone(),
        profile: req.profile.clone(),
        url: Some(req.url.clone()),
        verify: req.verify,
        verify_with_profile: req.verify_with_profile,
    }
}

pub(crate) fn policy_for_prove(req: &CheckRequest) -> VerifyPolicy {
    let mut policy = policy_for(req);
    if req.prove && req.profile.is_some() {
        policy.verify_with_profile = true;
        if policy.verify != Some(true) {
            policy.verify = None;
        }
    }
    policy
}

pub(crate) fn profile_fits(profile: &Profile, url: &str) -> bool {
    let Some(host) = verdict::host_of(url) else {
        return false;
    };
    if profile.app_host.is_empty() {
        return true;
    }
    host == profile.app_host
        || profile::cookie_matches_host(&profile.app_host, &host)
        || profile::cookie_matches_host(&host, &profile.app_host)
        || verdict::same_product_host(&host, &profile.app_host)
}

pub(crate) fn host_changed_receipt(req: &CheckRequest, run: &RunRecord, slug: &str) -> Json {
    Json::object(vec![
        ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
        ("ok", Json::Bool(false)),
        ("reason", Json::String("hostChanged".into())),
        ("url", Json::String(req.url.clone())),
        ("expect", Json::String(req.expect.clone())),
        ("screenshotPath", Json::String(String::new())),
        ("matched", Json::Bool(false)),
        ("hostChanged", Json::Bool(true)),
        ("suggestedProfile", Json::String(slug.to_string())),
        ("suggestedUrl", Json::String(origin_of(&req.url))),
        ("runId", Json::String(run.run_id.clone())),
        (
            "next",
            Json::String(format!(
                "The saved login is for a different site. Run auspex login --profile {slug} --url {}.",
                origin_of(&req.url)
            )),
        ),
        (
            "nextCall",
            Json::object(vec![
                ("tool", Json::String("auspex_login".into())),
                ("profile", Json::String(slug.to_string())),
                ("url", Json::String(origin_of(&req.url))),
            ]),
        ),
    ])
}

fn origin_of(url: &str) -> String {
    let scheme = if url.starts_with("http://") {
        "http"
    } else {
        "https"
    };
    let host = verdict::host_of(url).unwrap_or_default();
    format!("{scheme}://{host}")
}

fn next_text(
    req: &CheckRequest,
    reason: &str,
    ok: bool,
    verify: Option<&VerifyView>,
    refused: Option<&str>,
    bot: bool,
    claim: Option<&HornetClaim>,
) -> String {
    if bot {
        return "The site showed a bot check. This is not a logout. Do not sign in again for it."
            .into();
    }
    if let Some(refused) = refused {
        return format!(
            "verify-with-profile was refused ({refused}). Do not retry it. A weak or empty save needs a person to sign in again."
        );
    }
    if let Some(claim) = claim {
        if !hornet::claim_confirmed(
            &claim.status,
            verify.and_then(|v| v.claim_ok_profile).unwrap_or(false),
        ) {
            return format!(
                "Hornet's journey status was {}. Auspex did not confirm it. Read claimOkProfile. A pass in Hornet is not proof.",
                claim.status
            );
        }
    }
    match reason {
        "loggedOut" => "The saved login did not show the app. A person signs in again with auspex login. The agent does not type the password.".into(),
        "needsHuman" => "A person has to finish sign-in. The agent does not type the password or a one-time code.".into(),
        "expectMatchedPublicLanding" => "Those words are on a public or login URL, so nothing was saved. Use the app URL and words only the signed-in app shows.".into(),
        "hostChanged" => "The live site is not the saved login's site. Sign in again for the new host.".into(),
        "recordedLoggedIn" => "Auspex does not record a logged-in session.".into(),
        "network" => "The browser or the plain fetch did not finish. Retry this command once.".into(),
        "mismatch" => "The words were not confirmed. ok is false. If the live browser saw them and claimOk is false, the plain fetch did not.".into(),
        "matched" if req.prove => verdict::reuse_next(verify.and_then(|v| v.claim_ok_profile)),
        "matched" if verify.and_then(|v| v.claim_ok_profile).is_some() => {
            verdict::reuse_next(verify.and_then(|v| v.claim_ok_profile))
        }
        "matched" if ok => "The live browser saw the words, and the second look that ran agreed. ok is not claimOk and not claimOkProfile.".into(),
        _ => "Read ok, claimOk, and claimOkProfile separately.".into(),
    }
}

fn next_call(reason: &str, refused: Option<&str>, req: &CheckRequest) -> Option<Json> {
    let tool = if refused.is_some()
        || reason == "loggedOut"
        || reason == "needsHuman"
        || reason == "hostChanged"
    {
        "auspex_login"
    } else {
        return None;
    };
    let mut pairs = vec![("tool".into(), Json::String(tool.into()))];
    if let Some(profile) = &req.profile {
        pairs.push(("profile".into(), Json::String(profile.clone())));
    }
    pairs.push(("url".into(), Json::String(req.url.clone())));
    pairs.push(("expect".into(), Json::String(req.expect.clone())));
    Some(Json::Object(pairs))
}
