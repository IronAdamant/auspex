//! Run a check: one live look, then an independent second look.

use std::fs;
use std::path::Path;

use crate::browser::Page;
use crate::hornet;
use crate::httpfetch;
use crate::jsonutil::Json;
use crate::logbook::RunRecord;
use crate::profile::{self, Profile};
use crate::receipt_build::{host_changed_receipt, policy_for, policy_for_prove, profile_fits};
use crate::state;
use crate::verdict;

pub use crate::receipt_build::{build_receipt, ReceiptInput};

#[derive(Clone, Debug)]
pub struct CheckRequest {
    pub url: String,
    pub expect: String,
    pub name: Option<String>,
    pub profile: Option<String>,
    pub verify: Option<bool>,
    pub verify_with_profile: bool,
    pub fill: Option<String>,
    pub value: Option<String>,
    pub click: Option<String>,
    pub allow_page_actions: bool,
    pub record: bool,
    pub save_profile: bool,
    pub via_hornet: bool,
    pub hornet_project: Option<String>,
    pub hornet_label: Option<String>,
    pub prove: bool,
    pub hornet_run: Option<String>,
}

#[derive(Clone, Debug)]
pub struct LiveObs {
    pub text: String,
    pub title: String,
    pub final_url: String,
    pub screenshot_ok: bool,
    pub network_idle: bool,
    pub password_field: bool,
    pub filled: Option<String>,
    pub clicked: Option<String>,
    pub click_missed: Option<String>,
}

#[derive(Clone, Debug)]
pub struct ClaimObs {
    pub text: String,
    pub error: Option<String>,
    pub landed_url: String,
}

pub struct Built {
    pub body: Json,
    pub exit: i32,
}

pub fn execute(home: &Path, req: &CheckRequest) -> Built {
    if let Some(problem) = preflight(req) {
        return problem;
    }
    let Ok(run) = RunRecord::start(home, if req.prove { "prove" } else { "check" }) else {
        return error_body("could not create a run directory", "state", 1);
    };
    let _ = run.event(
        "asked",
        &[
            ("url", Json::String(req.url.clone())),
            ("expect", Json::String(req.expect.clone())),
            ("prove", Json::Bool(req.prove)),
        ],
    );

    let loaded = req
        .profile
        .as_ref()
        .and_then(|name| profile::load(home, name).ok());
    if let Some(profile) = &loaded {
        if !profile_fits(profile, &req.url) {
            let slug = verdict::profile_slug(&req.url).unwrap_or_default();
            let body = host_changed_receipt(req, &run, &slug);
            let _ = run.finish(&body);
            return Built { body, exit: 1 };
        }
    }

    let claim = req.hornet_run.as_ref().map(|id| hornet::read_claim(id));
    let mut live = LiveObs {
        text: String::new(),
        title: String::new(),
        final_url: String::new(),
        screenshot_ok: false,
        network_idle: false,
        password_field: false,
        filled: None,
        clicked: None,
        click_missed: None,
    };
    let mut hornet_used = false;
    let mut hornet_reason = String::new();
    let mut hornet_run_id = None;
    let mut saved_profile: Option<Profile> = None;

    let hornet_look = if req.via_hornet {
        match (req.hornet_project.as_deref(), req.hornet_label.as_deref()) {
            (Some(project), Some(label)) => Some(hornet::inspect(project, label, &req.url)),
            _ => None,
        }
    } else {
        None
    };

    if let Some(look) = &hornet_look {
        hornet_reason = look.reason.clone();
        hornet_run_id = look.run_id.clone();
        if look.used {
            if let Some(src) = &look.screenshot {
                if let Ok(bytes) = fs::read(src) {
                    let dest = run.run_dir.join("screenshot.png");
                    if fs::write(&dest, bytes).is_ok() {
                        live.text = look.text.clone();
                        live.title = look.title.clone();
                        live.final_url = if look.final_url.is_empty() {
                            req.url.clone()
                        } else {
                            look.final_url.clone()
                        };
                        live.screenshot_ok = true;
                        live.network_idle = true;
                        hornet_used = true;
                    }
                }
            }
        }
        if !hornet_used {
            hornet_reason = if hornet_reason.is_empty() {
                "absent".into()
            } else {
                hornet_reason
            };
        }
    }

    let need_chrome = !hornet_used;
    if need_chrome {
        match look_with_chrome(&run, req, loaded.as_ref(), true) {
            Ok(seen) => {
                live = seen.live;
                saved_profile = seen.saved;
            }
            Err(err) => {
                let _ = run.event("chrome", &[("error", Json::String(err))]);
                live.final_url.clear();
                live.screenshot_ok = false;
            }
        }
    }

    let policy = policy_for(req);
    let anon = if verdict::should_anonymous_verify(&policy) {
        let fetch = httpfetch::anonymous(&req.url);
        Some(ClaimObs {
            text: fetch.text,
            error: fetch.error,
            landed_url: req.url.clone(),
        })
    } else {
        None
    };

    let readiness = loaded.as_ref().map(profile::readiness).unwrap_or("empty");
    let refused = if req.verify_with_profile || req.prove && req.profile.is_some() {
        profile::refuse_profile_claim(readiness).map(|s| s.to_string())
    } else {
        None
    };

    let profile_look =
        if verdict::should_profile_verify(&policy_for_prove(req)) && refused.is_none() {
            match look_with_chrome(&run, req, loaded.as_ref(), false) {
                Ok(seen) => Some(ClaimObs {
                    text: seen.live.text,
                    error: None,
                    landed_url: seen.live.final_url,
                }),
                Err(err) => Some(ClaimObs {
                    text: String::new(),
                    error: Some(err),
                    landed_url: String::new(),
                }),
            }
        } else {
            None
        };

    if let Some(profile) = saved_profile {
        let _ = profile::save(home, &profile);
    }

    let shot = if live.screenshot_ok {
        state::display_path(&run.run_dir.join("screenshot.png"))
    } else {
        String::new()
    };
    let body = build_receipt(
        req,
        &live,
        &ReceiptInput {
            anon: anon.as_ref(),
            profile_look: profile_look.as_ref(),
            refused: refused.as_deref(),
            screenshot: &shot,
            run_id: &run.run_id,
            hornet_used,
            hornet_reason: &hornet_reason,
            hornet_run: hornet_run_id.as_deref(),
            claim: claim.as_ref(),
            loaded: loaded.as_ref(),
        },
    );
    let _ = fs::write(
        run.run_dir.join("receipt.json"),
        crate::jsonutil::to_pretty(&body),
    );
    let _ = run.finish(&body);
    let ok = body.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
    let proved = body
        .get("proved")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    Built {
        body,
        exit: exit_code(req.prove, ok, proved),
    }
}

struct Seen {
    live: LiveObs,
    saved: Option<Profile>,
}

fn look_with_chrome(
    run: &RunRecord,
    req: &CheckRequest,
    profile: Option<&Profile>,
    primary: bool,
) -> Result<Seen, String> {
    let dir = run.run_dir.join(if primary {
        "chrome-live"
    } else {
        "chrome-claim"
    });
    let mut page = Page::open(&dir, false)?;
    if let Some(profile) = profile {
        page.install_storage(profile)?;
        page.set_cookies(&profile.cookies)?;
    }
    page.goto(&req.url)?;
    let mut filled = None;
    let mut clicked = None;
    let mut click_missed = None;
    if primary {
        if let (Some(selector), Some(value)) = (req.fill.as_deref(), req.value.as_deref()) {
            match page.fill(selector, value) {
                Ok(visible) => {
                    if visible.contains(value) {
                        filled = Some(selector.to_string());
                    }
                }
                Err(err) if err == "password" => {
                    let text = page.read().unwrap_or(empty_text());
                    return Ok(Seen {
                        live: live_from(text, true, None, None, None, false),
                        saved: None,
                    });
                }
                Err(_) => {}
            }
        }
        if let Some(selector) = req.click.as_deref() {
            if let Err(err) = page.click(selector) {
                click_missed = Some(err);
            } else {
                clicked = Some(selector.to_string());
            }
        }
    }
    let text = page.read_settled()?;
    let png = page.screenshot_png()?;
    let shot_name = if primary {
        "screenshot.png"
    } else {
        "claim-screenshot.png"
    };
    fs::write(run.run_dir.join(shot_name), &png).map_err(|err| err.to_string())?;
    let saved = if primary && req.save_profile {
        if let Some(name) = req.profile.as_deref().or(req.name.as_deref()) {
            let cookies = page.cookies().unwrap_or_default();
            let (local, session) = page.capture_storage().unwrap_or_default();
            let host = verdict::host_of(&text.href).unwrap_or_default();
            let mut stored = Profile::empty(name, &host);
            stored.cookies = cookies;
            stored.local_storage = local;
            stored.session_storage = session;
            if !stored.is_empty() {
                Some(stored)
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };
    Ok(Seen {
        live: live_from(text, false, filled, clicked, click_missed, true),
        saved,
    })
}

fn empty_text() -> crate::browser::PageText {
    crate::browser::PageText {
        text: String::new(),
        title: String::new(),
        href: String::new(),
        password_field: true,
        ready: false,
    }
}

fn live_from(
    text: crate::browser::PageText,
    password_forced: bool,
    filled: Option<String>,
    clicked: Option<String>,
    click_missed: Option<String>,
    screenshot_ok: bool,
) -> LiveObs {
    LiveObs {
        text: text.text,
        title: text.title,
        final_url: text.href,
        screenshot_ok,
        network_idle: text.ready,
        password_field: password_forced || text.password_field,
        filled,
        clicked,
        click_missed,
    }
}

fn preflight(req: &CheckRequest) -> Option<Built> {
    if req.expect.trim().is_empty() {
        return Some(error_body(
            "check requires a non-empty --expect",
            "usage",
            2,
        ));
    }
    if !req.url.starts_with("https://") && !req.url.starts_with("http://") {
        return Some(error_body(
            "url must start with http:// or https://",
            "usage",
            2,
        ));
    }
    if verdict::is_forbidden_host(&req.url) {
        return Some(error_body(
            "that host is refused before a browser opens",
            "network",
            1,
        ));
    }
    if verdict::is_loopback_host(&req.url)
        && std::env::var("AUSPEX_ALLOW_LOOPBACK").ok().as_deref() != Some("1")
    {
        return Some(error_body(
            "loopback is refused. Set AUSPEX_ALLOW_LOOPBACK=1 for a local app you own.",
            "network",
            1,
        ));
    }
    if req.record && req.profile.is_some() {
        return Some(receipt_only(
            req,
            "recordedLoggedIn",
            false,
            "Auspex does not record a logged-in session.",
        ));
    }
    if (req.fill.is_some() || req.click.is_some())
        && req.profile.is_some()
        && !req.allow_page_actions
    {
        return Some(error_body(
            "fill or click with a saved login needs --allow-page-actions",
            "usage",
            2,
        ));
    }
    if let Some(selector) = &req.fill {
        if crate::browser::bad_fill_selector(selector) {
            return Some(error_body(
                "fill needs a CSS selector. text=, role=, and >> are refused",
                "usage",
                2,
            ));
        }
    }
    None
}

pub fn exit_code(prove: bool, ok: bool, proved: bool) -> i32 {
    if prove {
        if proved {
            0
        } else {
            1
        }
    } else if ok {
        0
    } else {
        1
    }
}

fn receipt_only(req: &CheckRequest, reason: &str, ok: bool, next: &str) -> Built {
    let body = Json::object(vec![
        ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
        ("ok", Json::Bool(ok)),
        ("reason", Json::String(reason.into())),
        ("url", Json::String(req.url.clone())),
        ("expect", Json::String(req.expect.clone())),
        ("screenshotPath", Json::String(String::new())),
        ("matched", Json::Bool(false)),
        ("next", Json::String(next.into())),
    ]);
    Built {
        body,
        exit: if ok { 0 } else { 1 },
    }
}

pub fn error_body(message: &str, code: &str, exit: i32) -> Built {
    Built {
        body: Json::object(vec![
            ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
            ("ok", Json::Bool(false)),
            ("error", Json::String(message.into())),
            ("code", Json::String(code.into())),
            ("next", Json::String(message.into())),
        ]),
        exit,
    }
}
