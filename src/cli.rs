//! Command line. Every command prints one JSON object and a stable exit code.

use std::collections::HashMap;
use std::env;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use crate::checkflow::{self, CheckRequest};
use crate::door;
use crate::hornet;
use crate::jsonutil::{self, Json};
use crate::logbook;
use crate::mcp;
use crate::profile;
use crate::saved;
use crate::state;

pub fn main_code() -> i32 {
    let args: Vec<String> = env::args().skip(1).collect();
    let home = state::home_dir();
    let _ = state::ensure_home(&home);
    dispatch(&args, &home)
}

fn dispatch(args: &[String], home: &Path) -> i32 {
    let cmd = args.first().map(String::as_str).unwrap_or("help");
    match cmd {
        "help" | "--help" | "-h" => {
            emit(&help_json());
            0
        }
        "version" | "--version" => {
            emit(&Json::object(vec![
                ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
                ("ok", Json::Bool(true)),
                ("version", Json::String(crate::VERSION.into())),
            ]));
            0
        }
        "mcp" => mcp::serve(),
        "door-hold" => {
            let flags = parse(&args[1..]);
            let profile = flags.get("profile").unwrap_or_default();
            let url = flags.get("url").unwrap_or_default();
            let home = flags
                .get("home")
                .map(PathBuf::from)
                .unwrap_or_else(|| home.to_path_buf());
            door::hold(&home, &profile, &url)
        }
        "check" | "prove" => {
            let flags = parse(&args[1..]);
            let prove = cmd == "prove";
            let req = request_from_flags(&flags, prove);
            let built = checkflow::execute(home, &req);
            emit(&built.body);
            built.exit
        }
        "login" => {
            let flags = parse(&args[1..]);
            let url = flags
                .positional
                .first()
                .cloned()
                .or_else(|| flags.get("url"))
                .unwrap_or_default();
            if url.is_empty() {
                return usage("login requires --url <https> or a url argument");
            }
            let profile = flags
                .get("profile")
                .or_else(|| crate::verdict::profile_slug(&url).ok())
                .unwrap_or_default();
            if let Err(err) = profile::require_name(&profile) {
                return usage(&err);
            }
            let body = door::login_mint(home, &profile, &url);
            let ok = body.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
            emit(&body);
            if ok {
                0
            } else {
                1
            }
        }
        "await-login" => {
            let flags = parse(&args[1..]);
            let Some(profile) = flags.get("profile") else {
                return usage("await-login requires --profile <name>");
            };
            let body = door::await_login(home, &profile);
            let ok = body.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
            emit(&body);
            if ok {
                0
            } else {
                1
            }
        }
        "finalize-login" => {
            let flags = parse(&args[1..]);
            let Some(profile) = flags.get("profile") else {
                return usage("finalize-login requires --profile <name>");
            };
            let url = flags.get("url").unwrap_or_default();
            let expect = flags.get("expect").unwrap_or_default();
            let body = door::finalize_login(home, &profile, &url, &expect);
            let ok = body.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
            emit(&body);
            if ok {
                0
            } else {
                1
            }
        }
        "profiles" => {
            emit(&Json::object(vec![
                ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
                ("ok", Json::Bool(true)),
                (
                    "profiles",
                    Json::Array(
                        profile::list_names(home)
                            .into_iter()
                            .map(Json::String)
                            .collect(),
                    ),
                ),
            ]));
            0
        }
        "profile-status" => {
            let flags = parse(&args[1..]);
            let mut req = request_from_flags(&flags, false);
            req.verify = Some(false);
            req.verify_with_profile = false;
            if req.profile.is_none() {
                return usage("profile-status requires --profile <name>");
            }
            let body = crate::mcp::profile_status_cli(home, &req);
            let ok = body.get("status").and_then(|v| v.as_str()) == Some("loggedIn");
            emit(&body);
            if ok {
                0
            } else {
                1
            }
        }
        "runs" => {
            let flags = parse(&args[1..]);
            let limit = flags
                .get("limit")
                .and_then(|s| s.parse().ok())
                .unwrap_or(20);
            emit(&Json::object(vec![
                ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
                ("ok", Json::Bool(true)),
                ("runs", Json::Array(logbook::list_sessions(home, limit))),
            ]));
            0
        }
        "run" | "summary" => {
            let flags = parse(&args[1..]);
            let id = flags.get("id").or_else(|| flags.get("run-id"));
            let summary = match id {
                Some(id) => logbook::read_session(home, &id),
                None => logbook::latest_session(home),
            };
            let Some(mut summary) = summary else {
                return usage("no runs yet");
            };
            let run_id = summary
                .get("runId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            summary.insert(
                "traceSteps",
                Json::Array(logbook::read_trace(home, &run_id, 40)),
            );
            let ok = summary.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
            emit(&summary);
            if ok {
                0
            } else {
                1
            }
        }
        "trace" => {
            let flags = parse(&args[1..]);
            let Some(summary) = logbook::latest_session(home).or_else(|| {
                flags
                    .get("id")
                    .and_then(|id| logbook::read_session(home, &id))
            }) else {
                return usage("no runs yet");
            };
            let run_id = flags
                .get("id")
                .or_else(|| {
                    summary
                        .get("runId")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_default();
            emit(&Json::object(vec![
                ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
                ("ok", Json::Bool(true)),
                ("runId", Json::String(run_id.clone())),
                ("steps", Json::Array(logbook::read_trace(home, &run_id, 80))),
            ]));
            0
        }
        "hornet-status" => {
            emit(&hornet::status_json());
            0
        }
        "sweep" => {
            let flags = parse(&args[1..]);
            let Some(plan) = flags.get("plan") else {
                return usage("sweep requires --plan <plan.json>");
            };
            let body = mcp::sweep(home, &plan);
            let ok = body.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
            emit(&body);
            if ok {
                0
            } else {
                1
            }
        }
        other => usage(&format!("unknown command {other}")),
    }
}

struct Flags {
    positional: Vec<String>,
    values: HashMap<String, String>,
    switches: Vec<String>,
}

impl Flags {
    fn get(&self, key: &str) -> Option<String> {
        self.values.get(key).cloned()
    }
    fn on(&self, key: &str) -> bool {
        self.switches.iter().any(|s| s == key)
    }
}

fn parse(args: &[String]) -> Flags {
    let mut positional = Vec::new();
    let mut values = HashMap::new();
    let mut switches = Vec::new();
    let mut i = 0;
    while i < args.len() {
        let arg = &args[i];
        if let Some(name) = arg.strip_prefix("--") {
            let name = name.to_string();
            let takes = matches!(
                name.as_str(),
                "url"
                    | "expect"
                    | "name"
                    | "profile"
                    | "fill"
                    | "value"
                    | "click"
                    | "via"
                    | "hornet-project"
                    | "hornet-label"
                    | "hornet-run"
                    | "plan"
                    | "limit"
                    | "id"
                    | "run-id"
                    | "home"
                    | "config"
            );
            if takes {
                i += 1;
                let value = args.get(i).cloned().unwrap_or_default();
                values.insert(name, value);
            } else {
                switches.push(name);
            }
        } else {
            positional.push(arg.clone());
        }
        i += 1;
    }
    Flags {
        positional,
        values,
        switches,
    }
}

fn request_from_flags(flags: &Flags, prove: bool) -> CheckRequest {
    let config = flags.get("config").map(PathBuf::from);
    let resolved = saved::resolve_path(None);
    let checks = saved::load_all(config.as_deref().or(resolved.as_deref()));
    let name = flags.get("name");
    let saved = name.as_deref().and_then(|n| saved::find(&checks, n));
    let url = flags
        .positional
        .first()
        .cloned()
        .or_else(|| flags.get("url"))
        .or_else(|| saved.as_ref().map(|s| s.url.clone()))
        .unwrap_or_default();
    let expect = flags
        .get("expect")
        .or_else(|| saved.as_ref().map(|s| s.expect.clone()))
        .unwrap_or_default();
    let profile = flags
        .get("profile")
        .or_else(|| saved.and_then(|s| s.profile));
    let verify = if flags.on("no-verify") {
        Some(false)
    } else if flags.on("verify") {
        Some(true)
    } else {
        None
    };
    CheckRequest {
        url,
        expect,
        name,
        profile,
        verify,
        verify_with_profile: flags.on("verify-with-profile")
            || prove && flags.get("profile").is_some(),
        fill: flags.get("fill"),
        value: flags.get("value"),
        click: flags.get("click"),
        allow_page_actions: flags.on("allow-page-actions"),
        record: flags.on("record"),
        save_profile: flags.on("save-profile"),
        via_hornet: flags.get("via").as_deref() == Some("hornet") || flags.on("hornet"),
        hornet_project: flags.get("hornet-project"),
        hornet_label: flags.get("hornet-label"),
        prove,
        hornet_run: flags.get("hornet-run"),
    }
}

fn help_json() -> Json {
    Json::object(vec![
        ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
        ("ok", Json::Bool(true)),
        ("version", Json::String(crate::VERSION.into())),
        (
            "commands",
            Json::Array(
                [
                    "check", "prove", "login", "await-login", "finalize-login", "profile-status",
                    "profiles", "runs", "summary", "trace", "hornet-status", "sweep", "mcp",
                ]
                .into_iter()
                .map(|s| Json::String(s.into()))
                .collect(),
            ),
        ),
        (
            "next",
            Json::String("check <url> --expect <words> prints a receipt. ok, claimOk, and claimOkProfile stay separate.".into()),
        ),
    ])
}

fn usage(message: &str) -> i32 {
    emit(&checkflow::error_body(message, "usage", 2).body);
    2
}

fn emit(body: &Json) {
    let mut out = io::stdout().lock();
    let _ = writeln!(out, "{}", jsonutil::to_string(body));
    let _ = out.flush();
}
