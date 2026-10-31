//! Receipt rules that do not need Chrome: the three answers, the second look,
//! a Hornet claim that is not proof, and secret scrubbing of the receipt.

use auspex::checkflow::{build_receipt, exit_code, CheckRequest, ClaimObs, LiveObs, ReceiptInput};
use auspex::hornet::HornetClaim;
use auspex::jsonutil::{self, Json};

fn req(profile: Option<&str>, verify_with_profile: bool, prove: bool) -> CheckRequest {
    CheckRequest {
        url: "https://app.example/board".into(),
        expect: "Card landed".into(),
        name: None,
        profile: profile.map(str::to_string),
        verify: None,
        verify_with_profile,
        fill: None,
        value: None,
        click: None,
        allow_page_actions: false,
        record: false,
        save_profile: false,
        via_hornet: false,
        hornet_project: None,
        hornet_label: None,
        prove,
        hornet_run: None,
    }
}

fn live(text: &str) -> LiveObs {
    LiveObs {
        text: text.into(),
        title: "Board".into(),
        final_url: "https://app.example/board".into(),
        screenshot_ok: true,
        network_idle: true,
        password_field: false,
        filled: None,
        clicked: None,
        click_missed: None,
    }
}

fn saw(text: &str) -> ClaimObs {
    ClaimObs {
        text: text.into(),
        error: None,
        landed_url: "https://app.example/board".into(),
    }
}

fn built(
    ask: &CheckRequest,
    page: &LiveObs,
    anon: Option<&ClaimObs>,
    profile_look: Option<&ClaimObs>,
    claim: Option<&HornetClaim>,
    hornet_run: Option<&str>,
) -> Json {
    build_receipt(
        ask,
        page,
        &ReceiptInput {
            anon,
            profile_look,
            refused: None,
            screenshot: "shot.png",
            run_id: "run",
            hornet_used: false,
            hornet_reason: if claim.is_some() { "present" } else { "" },
            hornet_run,
            claim,
            loaded: None,
        },
    )
}

fn answers(body: &Json) -> (bool, bool, Option<bool>) {
    let ok = body.get("ok").and_then(|v| v.as_bool()).unwrap();
    let claim = body
        .get("verify")
        .and_then(|v| v.get("claimOk"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let profile = body
        .get("verify")
        .and_then(|v| v.get("claimOkProfile"))
        .and_then(|v| v.as_bool());
    (ok, claim, profile)
}

#[test]
fn public_page_needs_the_plain_fetch() {
    let mut ask = req(None, false, false);
    ask.url = "https://ironadamant.com/".into();
    ask.expect = "Web app testing, in plain English.".into();
    let page = live("Web app testing, in plain English.");
    let anon = saw("Web app testing, in plain English.");
    let body = built(&ask, &page, Some(&anon), None, None, None);
    let (ok, claim, profile) = answers(&body);
    assert!(ok);
    assert!(claim);
    assert!(profile.is_none());
    assert_eq!(body.get("reason").and_then(|v| v.as_str()), Some("matched"));
}

#[test]
fn plain_fetch_miss_does_not_count_as_ok() {
    let mut ask = req(None, false, false);
    ask.url = "https://ironadamant.com/".into();
    let page = live("Card landed");
    let anon = saw("a different public page");
    let body = built(&ask, &page, Some(&anon), None, None, None);
    let (ok, claim, _) = answers(&body);
    assert!(!ok);
    assert!(!claim);
    assert_eq!(body.get("matched").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(
        body.get("reason").and_then(|v| v.as_str()),
        Some("mismatch")
    );
}

#[test]
fn saved_login_second_browser_is_not_folded_into_ok() {
    let ask = req(Some("app-example"), true, false);
    let page = live("Card landed");
    let fresh = saw("Card landed");
    let body = built(&ask, &page, None, Some(&fresh), None, None);
    let (ok, claim, profile) = answers(&body);
    assert!(ok);
    assert!(!claim);
    assert_eq!(profile, Some(true));
    let skipped = body
        .get("verify")
        .and_then(|v| v.get("anonymousClaimSkipped"))
        .and_then(|v| v.as_bool());
    assert_eq!(skipped, Some(true));

    let miss = ClaimObs {
        text: "signed out".into(),
        error: None,
        landed_url: "https://app.example/board".into(),
    };
    let body = built(&ask, &page, None, Some(&miss), None, None);
    let (ok, claim, profile) = answers(&body);
    assert!(
        ok,
        "ok stays the live result when the anonymous look was skipped"
    );
    assert!(!claim);
    assert_eq!(profile, Some(false));
    assert_ne!(ok, profile.unwrap());
}

#[test]
fn prove_exit_follows_the_fresh_browser_not_a_hornet_pass() {
    let mut ask = req(Some("app-example"), true, true);
    ask.hornet_run = Some("run_demo".into());
    let page = live("Card landed");
    let miss = ClaimObs {
        text: "not the card".into(),
        error: None,
        landed_url: "https://app.example/board".into(),
    };
    let claim = HornetClaim {
        run_id: "run_demo".into(),
        status: "passed".into(),
        project: "demo".into(),
        found: true,
    };
    let body = built(
        &ask,
        &page,
        None,
        Some(&miss),
        Some(&claim),
        Some("run_demo"),
    );
    let (ok, _, profile) = answers(&body);
    assert_eq!(profile, Some(false));
    assert_eq!(body.get("proved").and_then(|v| v.as_bool()), Some(false));
    let confirmed = body
        .get("hornet")
        .and_then(|v| v.get("confirmed"))
        .and_then(|v| v.as_bool());
    assert_eq!(confirmed, Some(false));
    assert_eq!(exit_code(true, ok, false), 1);
    assert_eq!(exit_code(true, true, true), 0);
    assert_eq!(exit_code(false, true, false), 0);
}

#[test]
fn receipt_excerpt_drops_a_password_and_an_email() {
    let mut ask = req(None, false, false);
    ask.url = "https://ironadamant.com/".into();
    ask.expect = "Card landed".into();
    ask.verify = Some(false);
    let page = live("Card landed user@example.com eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig");
    let body = built(&ask, &page, None, None, None, None);
    let dumped = jsonutil::to_string(&body);
    assert!(!dumped.contains("user@example.com"));
    assert!(!dumped.contains("eyJhbGciOiJIUzI1NiJ9"));
    assert!(dumped.contains("[redacted-email]"));
}
