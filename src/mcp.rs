//! stdio MCP server. One JSON-RPC message per line.
//!
//! A `Content-Length` header is also accepted, so either framing works. The
//! response is always one JSON line.

use std::io::{BufRead, BufReader, Read, Write};
use std::path::Path;

use crate::checkflow::{self, CheckRequest};
use crate::door;
use crate::hornet;
use crate::jsonutil::{self, Json};
use crate::logbook;
use crate::profile;
use crate::saved;
use crate::state;

pub fn serve() -> i32 {
    let stdin = std::io::stdin();
    let mut reader = BufReader::new(stdin.lock());
    let mut stdout = std::io::stdout().lock();
    let home = state::home_dir();
    let _ = state::ensure_home(&home);
    loop {
        let Some(message) = read_message(&mut reader) else {
            break;
        };
        if let Some(response) = dispatch(&message, &home) {
            let _ = writeln!(stdout, "{response}");
            let _ = stdout.flush();
        }
    }
    0
}

pub fn dispatch(message: &str, home: &Path) -> Option<String> {
    let msg = jsonutil::from_str(message.trim()).ok()?;
    let method = msg.get("method").and_then(|v| v.as_str()).unwrap_or("");
    let id = msg.get("id").cloned()?;
    let result = match method {
        "initialize" => initialize(),
        "ping" => Json::object(vec![]),
        "tools/list" => tools_list(),
        "tools/call" => tools_call(msg.get("params"), home),
        _ => {
            return Some(rpc_error(&id, -32601, "method not found"));
        }
    };
    Some(rpc_ok(&id, &result))
}

fn initialize() -> Json {
    Json::object(vec![
        ("protocolVersion", Json::String("2024-11-05".into())),
        (
            "capabilities",
            Json::object(vec![("tools", Json::object(vec![]))]),
        ),
        (
            "serverInfo",
            Json::object(vec![
                ("name", Json::String("auspex".into())),
                ("version", Json::String(crate::VERSION.into())),
            ]),
        ),
    ])
}

fn tools_list() -> Json {
    Json::object(vec![(
        "tools",
        Json::Array(vec![
            tool(
                "auspex_check",
                "Open a page in local Chrome, look for the exact words, and check a second time.",
                check_schema(),
            ),
            tool(
                "auspex_prove",
                "Confirm a change with a fresh browser. A Hornet pass is not proof.",
                check_schema(),
            ),
            tool(
                "auspex_login",
                "Open the local sign-in door. The agent does not type the password.",
                obj_schema(&[("url", "string"), ("profile", "string")]),
            ),
            tool(
                "auspex_await_login",
                "Read whether Save has stored a login.",
                obj_schema(&[("profile", "string")]),
            ),
            tool(
                "auspex_finalize_login",
                "Classify a saved login. It does not invent a session.",
                obj_schema(&[
                    ("profile", "string"),
                    ("url", "string"),
                    ("expect", "string"),
                ]),
            ),
            tool(
                "auspex_profile_status",
                "Say whether a saved login currently shows the expected words.",
                check_schema(),
            ),
            tool(
                "auspex_profiles",
                "List saved login names. Values are not returned.",
                Json::object(vec![("type", Json::String("object".into()))]),
            ),
            tool(
                "auspex_runs",
                "List recent run summaries.",
                obj_schema(&[("limit", "number")]),
            ),
            tool(
                "auspex_run",
                "Read one run summary and its trace.",
                obj_schema(&[("runId", "string")]),
            ),
            tool(
                "auspex_summary",
                "Read the latest resumable session summary.",
                Json::object(vec![("type", Json::String("object".into()))]),
            ),
            tool(
                "auspex_hornet_status",
                "Say whether Hornet Swarm is installed. Absence is normal.",
                Json::object(vec![("type", Json::String("object".into()))]),
            ),
            tool(
                "auspex_sweep",
                "Check up to 12 pages. Stops on a sign-in wall.",
                obj_schema(&[("plan", "string")]),
            ),
        ]),
    )])
}

fn tool(name: &str, description: &str, schema: Json) -> Json {
    Json::object(vec![
        ("name", Json::String(name.into())),
        ("description", Json::String(description.into())),
        ("inputSchema", schema),
    ])
}

fn check_schema() -> Json {
    obj_schema(&[
        ("url", "string"),
        ("expect", "string"),
        ("name", "string"),
        ("profile", "string"),
        ("verifyWithProfile", "boolean"),
        ("hornetProject", "string"),
        ("hornetLabel", "string"),
        ("hornetRun", "string"),
    ])
}

fn obj_schema(fields: &[(&str, &str)]) -> Json {
    let mut props = Vec::new();
    for (name, kind) in fields {
        props.push((
            (*name).to_string(),
            Json::object(vec![("type", Json::String((*kind).into()))]),
        ));
    }
    Json::object(vec![
        ("type", Json::String("object".into())),
        ("properties", Json::Object(props)),
    ])
}

fn tools_call(params: Option<&Json>, home: &Path) -> Json {
    let name = params
        .and_then(|p| p.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let args = params
        .and_then(|p| p.get("arguments"))
        .cloned()
        .unwrap_or_else(|| Json::object(vec![]));
    let body = match name {
        "auspex_check" => checkflow::execute(home, &request_from(&args, false)).body,
        "auspex_prove" => checkflow::execute(home, &request_from(&args, true)).body,
        "auspex_login" => {
            let url = arg(&args, "url");
            let profile = opt_arg(&args, "profile").or_else(|| verdict_slug(&url));
            match profile {
                Some(profile) if !url.is_empty() => door::login_mint(home, &profile, &url),
                _ => checkflow::error_body("login requires a url", "usage", 2).body,
            }
        }
        "auspex_await_login" => door::await_login(home, &arg(&args, "profile")),
        "auspex_finalize_login" => door::finalize_login(
            home,
            &arg(&args, "profile"),
            &arg(&args, "url"),
            &arg(&args, "expect"),
        ),
        "auspex_profile_status" => profile_status(home, &args),
        "auspex_profiles" => profiles_json(home),
        "auspex_runs" => runs_json(
            home,
            args.get("limit").and_then(|v| v.as_i64()).unwrap_or(20) as usize,
        ),
        "auspex_run" | "auspex_summary" => {
            summary_json(home, args.get("runId").and_then(|v| v.as_str()))
        }
        "auspex_hornet_status" => hornet::status_json(),
        "auspex_sweep" => sweep(home, &arg(&args, "plan")),
        _ => checkflow::error_body("unknown tool", "usage", 2).body,
    };
    let is_error = body.get("code").and_then(|v| v.as_str()) == Some("usage");
    Json::object(vec![
        (
            "content",
            Json::Array(vec![Json::object(vec![
                ("type", Json::String("text".into())),
                ("text", Json::String(jsonutil::to_string(&body))),
            ])]),
        ),
        ("isError", Json::Bool(is_error)),
    ])
}

fn request_from(args: &Json, prove: bool) -> CheckRequest {
    let name = opt_arg(args, "name");
    let config = saved::resolve_path(None);
    let checks = saved::load_all(config.as_deref());
    let saved = name.as_deref().and_then(|n| saved::find(&checks, n));
    let url = if arg(args, "url").is_empty() {
        saved.as_ref().map(|s| s.url.clone()).unwrap_or_default()
    } else {
        arg(args, "url")
    };
    let expect = if arg(args, "expect").is_empty() {
        saved.as_ref().map(|s| s.expect.clone()).unwrap_or_default()
    } else {
        arg(args, "expect")
    };
    let profile = opt_arg(args, "profile").or_else(|| saved.and_then(|s| s.profile));
    CheckRequest {
        url,
        expect,
        name,
        profile,
        verify: None,
        verify_with_profile: args
            .get("verifyWithProfile")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
            || prove && args.get("profile").is_some(),
        fill: None,
        value: None,
        click: None,
        allow_page_actions: false,
        record: false,
        save_profile: false,
        via_hornet: args.get("hornetProject").and_then(|v| v.as_str()).is_some(),
        hornet_project: opt_arg(args, "hornetProject"),
        hornet_label: opt_arg(args, "hornetLabel"),
        prove,
        hornet_run: opt_arg(args, "hornetRun"),
    }
}

fn arg(args: &Json, key: &str) -> String {
    args.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn opt_arg(args: &Json, key: &str) -> Option<String> {
    let value = arg(args, key);
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn verdict_slug(url: &str) -> Option<String> {
    crate::verdict::profile_slug(url).ok()
}

fn profile_status(home: &Path, args: &Json) -> Json {
    let mut req = request_from(args, false);
    req.verify = Some(false);
    req.verify_with_profile = false;
    profile_status_cli(home, &req)
}

pub fn profile_status_cli(home: &Path, req: &CheckRequest) -> Json {
    if req.profile.is_none() {
        return checkflow::error_body("profile-status requires a profile", "usage", 2).body;
    }
    if profile::load(home, req.profile.as_deref().unwrap_or("")).is_err() {
        return Json::object(vec![
            ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
            ("ok", Json::Bool(false)),
            ("status", Json::String("emptySave".into())),
            ("reason", Json::String("emptySave".into())),
            (
                "next",
                Json::String("The profile is missing. Run login.".into()),
            ),
        ]);
    }
    let built = checkflow::execute(home, req);
    let matched = built
        .body
        .get("matched")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let reason = built
        .body
        .get("reason")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let bot = built.body.get("botWall").and_then(|v| v.as_bool()) == Some(true);
    let status = if bot {
        "botWall"
    } else if reason == "needsHuman" {
        "needsHuman"
    } else if matched {
        "loggedIn"
    } else if reason == "loggedOut" || reason == "mismatch" {
        "loggedOut"
    } else {
        reason.as_str()
    };
    let mut body = built.body;
    body.insert("status", Json::String(status.into()));
    body.insert(
        "next",
        Json::String(
            "loggedIn is a live probe. It is not claimOkProfile. Reuse the saved login only when claimOkProfile is true.".into(),
        ),
    );
    body
}

fn profiles_json(home: &Path) -> Json {
    Json::object(vec![
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
    ])
}

fn runs_json(home: &Path, limit: usize) -> Json {
    Json::object(vec![
        ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
        ("ok", Json::Bool(true)),
        (
            "runs",
            Json::Array(logbook::list_sessions(home, limit.clamp(1, 50))),
        ),
        (
            "next",
            Json::String("Use auspex_run with runId to read the trace and continue.".into()),
        ),
    ])
}

fn summary_json(home: &Path, run_id: Option<&str>) -> Json {
    let summary = match run_id {
        Some(id) if !id.is_empty() => logbook::read_session(home, id),
        _ => logbook::latest_session(home),
    };
    let Some(summary) = summary else {
        return Json::object(vec![
            ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
            ("ok", Json::Bool(false)),
            ("error", Json::String("no runs yet".into())),
            ("next", Json::String("Run a check first.".into())),
        ]);
    };
    let id = summary
        .get("runId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let mut body = summary;
    body.insert(
        "traceSteps",
        Json::Array(logbook::read_trace(home, &id, 40)),
    );
    body
}

pub fn sweep(home: &Path, plan_path: &str) -> Json {
    let Ok(text) = std::fs::read_to_string(plan_path) else {
        return checkflow::error_body("could not read the sweep plan", "usage", 2).body;
    };
    let Ok(plan) = jsonutil::from_str(&text) else {
        return checkflow::error_body("the sweep plan is not json", "usage", 2).body;
    };
    let pages = plan
        .get("pages")
        .and_then(|v| v.as_array())
        .map(|items| items.to_vec())
        .unwrap_or_default();
    if pages.is_empty() || pages.len() > 12 {
        return checkflow::error_body("a sweep plan has 1 to 12 pages", "usage", 2).body;
    }
    let profile = plan
        .get("profile")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let mut rows = Vec::new();
    let mut stopped = None;
    for page in pages {
        let req = CheckRequest {
            url: page
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into(),
            expect: page
                .get("expect")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into(),
            name: page
                .get("name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            profile: profile.clone(),
            verify: Some(false),
            verify_with_profile: false,
            fill: None,
            value: None,
            click: None,
            allow_page_actions: false,
            record: false,
            save_profile: false,
            via_hornet: false,
            hornet_project: None,
            hornet_label: None,
            prove: false,
            hornet_run: None,
        };
        let built = checkflow::execute(home, &req);
        let reason = built
            .body
            .get("reason")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let ok = built
            .body
            .get("ok")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        rows.push(Json::object(vec![
            ("url", Json::String(req.url.clone())),
            ("expect", Json::String(req.expect.clone())),
            ("ok", Json::Bool(ok)),
            ("reason", Json::String(reason.clone())),
            (
                "result",
                Json::String(
                    if ok {
                        "pass"
                    } else if reason == "network" {
                        "could not tell"
                    } else {
                        "fail"
                    }
                    .into(),
                ),
            ),
        ]));
        if crate::verdict::is_no_retry_reason(&reason) {
            stopped = built.body.get("nextCall").cloned();
            break;
        }
    }
    let mut body = Json::object(vec![
        ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
        (
            "ok",
            Json::Bool(
                rows.iter()
                    .all(|row| row.get("ok").and_then(|v| v.as_bool()) == Some(true)),
            ),
        ),
        ("pages", Json::Array(rows)),
    ]);
    if let Some(stopped) = stopped {
        body.insert("stopped", stopped);
    }
    let dir = home.join("sweeps").join(state::new_run_id());
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(dir.join("report.json"), jsonutil::to_pretty(&body));
    body
}

fn rpc_ok(id: &Json, result: &Json) -> String {
    jsonutil::to_string(&Json::object(vec![
        ("jsonrpc", Json::String("2.0".into())),
        ("id", id.clone()),
        ("result", result.clone()),
    ]))
}

fn rpc_error(id: &Json, code: i64, message: &str) -> String {
    jsonutil::to_string(&Json::object(vec![
        ("jsonrpc", Json::String("2.0".into())),
        ("id", id.clone()),
        (
            "error",
            Json::object(vec![
                ("code", Json::Number(code as f64)),
                ("message", Json::String(message.into())),
            ]),
        ),
    ]))
}

fn read_message(reader: &mut BufReader<impl Read>) -> Option<String> {
    let mut line = String::new();
    loop {
        line.clear();
        let n = reader.read_line(&mut line).ok()?;
        if n == 0 {
            return None;
        }
        if line.trim().is_empty() {
            continue;
        }
        break;
    }
    if !line.to_ascii_lowercase().starts_with("content-length:") {
        return Some(line);
    }
    let len: usize = line.split(':').nth(1)?.trim().parse().ok()?;
    let mut header = String::new();
    loop {
        header.clear();
        reader.read_line(&mut header).ok()?;
        if header == "\r\n" || header == "\n" {
            break;
        }
    }
    let mut buf = vec![0u8; len];
    reader.read_exact(&mut buf).ok()?;
    String::from_utf8(buf).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newline_initialize_and_tools() {
        let home = std::env::temp_dir().join(format!("auspex-mcp-{}", crate::state::random_hex(3)));
        let init = dispatch(r#"{"jsonrpc":"2.0","id":1,"method":"initialize"}"#, &home).unwrap();
        assert!(init.contains("auspex"));
        assert!(init.contains("\"id\":1"));
        let listed = dispatch(r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#, &home).unwrap();
        assert!(listed.contains("auspex_check"));
        assert!(listed.contains("auspex_hornet_status"));
        let note = dispatch(
            r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#,
            &home,
        );
        assert!(note.is_none());
        let status = dispatch(
            r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"auspex_hornet_status","arguments":{}}}"#,
            &home,
        )
        .unwrap();
        assert!(
            status.contains("present") || status.contains("absent") || status.contains("reason")
        );
        let _ = std::fs::remove_dir_all(&home);
    }
}
