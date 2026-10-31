//! Local sign-in door. A person types on this page. The agent never sees the keys.
//!
//! The page is the same on a phone and a computer. Keys are forwarded into the
//! local Chrome and are not written to the log. Save stores the browser's
//! cookies in the profile file only.

use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};

use crate::browser::Page;
use crate::jsonutil::{self, Json};
use crate::logbook::RunRecord;
use crate::profile::{self, Profile};
use crate::state;
use crate::verdict;

const DOOR_HTML: &str = r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Auspex sign-in</title>
<style>
body { font: 16px/1.4 system-ui, sans-serif; margin: 0; background: #111; color: #eee; }
img { width: 100%; background: #000; min-height: 180px; object-fit: contain; }
form { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
input[type=text], input[type=password] { font: 18px/1.2 system-ui, sans-serif; padding: 10px; }
button { font: 16px system-ui, sans-serif; padding: 10px; }
</style>
</head>
<body>
<img id="screen" alt="Remote browser">
<form id="door" autocomplete="off">
<label>Type here. Click the remote address bar or field first.</label>
<input id="box" type="text" autocomplete="off" autocapitalize="off" spellcheck="false">
<label><input id="bullets" type="checkbox"> Show as bullets</label>
<label><input id="otp" type="checkbox"> SMS or email code</label>
<button type="submit" id="go">Enter</button>
<button type="button" id="clear">Clear</button>
<button type="button" id="save">Save</button>
<p id="status">Waiting for Save.</p>
</form>
<script>
const box = document.getElementById('box');
const screen = document.getElementById('screen');
let sent = '';
function post(path, body) {
  return fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
}
box.addEventListener('input', () => {
  const next = box.value;
  let extra = '';
  if (next.startsWith(sent)) extra = next.slice(sent.length);
  else { post('/clear', {}); sent = ''; extra = next; }
  sent = next;
  if (extra) post('/type', {text: extra});
});
document.getElementById('bullets').addEventListener('change', (ev) => {
  box.type = ev.target.checked ? 'password' : 'text';
});
document.getElementById('otp').addEventListener('change', (ev) => {
  box.setAttribute('autocomplete', ev.target.checked ? 'one-time-code' : 'off');
  box.setAttribute('inputmode', ev.target.checked ? 'numeric' : 'text');
});
document.getElementById('door').addEventListener('submit', (ev) => {
  ev.preventDefault();
  post('/key', {key: 'Enter'});
  box.value = '';
  sent = '';
});
document.getElementById('clear').addEventListener('click', () => {
  post('/clear', {});
  box.value = '';
  sent = '';
});
document.getElementById('save').addEventListener('click', async () => {
  document.getElementById('status').textContent = 'Saving.';
  const res = await post('/save', {});
  const data = await res.json();
  document.getElementById('status').textContent = data.status || 'saved';
});
setInterval(() => { screen.src = '/frame?' + Date.now(); }, 800);
</script>
</body>
</html>
"#;

pub fn state_path(home: &Path, profile: &str) -> std::path::PathBuf {
    home.join("doors").join(format!("{profile}.json"))
}

pub fn login_mint(home: &Path, profile: &str, url: &str) -> Json {
    let _ = state::ensure_home(home);
    let exe = std::env::current_exe().unwrap_or_default();
    let state = state_path(home, profile);
    let _ = fs::remove_file(&state);
    let mut child = match std::process::Command::new(exe)
        .args([
            "door-hold",
            "--profile",
            profile,
            "--url",
            url,
            "--home",
            &home.to_string_lossy(),
        ])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(err) => {
            return fail(&format!("could not start the sign-in door: {err}"));
        }
    };
    let deadline = Instant::now() + Duration::from_secs(20);
    let mut door_url = String::new();
    while Instant::now() < deadline {
        if let Ok(text) = fs::read_to_string(&state) {
            if let Ok(json) = jsonutil::from_str(&text) {
                if let Some(url) = json.get("doorUrl").and_then(|v| v.as_str()) {
                    door_url = url.to_string();
                    break;
                }
            }
        }
        if child.try_wait().ok().flatten().is_some() {
            break;
        }
        thread::sleep(Duration::from_millis(50));
    }
    if door_url.is_empty() {
        let _ = child.kill();
        return fail("the sign-in door did not open. Chrome may be missing.");
    }
    // Reap the door when it exits so a long-lived MCP server does not leave a zombie.
    // The door process itself keeps running after this function returns.
    thread::spawn(move || {
        let _ = child.wait();
    });
    let slug = verdict::profile_slug(url).unwrap_or_else(|_| profile.to_string());
    let host_match = profile::host_match(profile, url);
    let mut body = Json::object(vec![
        ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
        ("ok", Json::Bool(true)),
        ("profile", Json::String(profile.into())),
        ("url", Json::String(url.into())),
        ("profileHostMatch", Json::Bool(host_match.0)),
        (
            "handoff",
            Json::object(vec![
                ("url", Json::String(door_url.clone())),
                ("mobileUrl", Json::String(door_url.clone())),
                (
                    "oneLiner",
                    Json::String("Open the door, sign in on the remote browser, tap Save.".into()),
                ),
            ]),
        ),
        (
            "next",
            Json::String(format!(
                "A person opens handoff.url, signs in, and taps Save. Then run auspex await-login --profile {profile}."
            )),
        ),
        (
            "nextCall",
            Json::object(vec![
                ("tool", Json::String("auspex_await_login".into())),
                ("profile", Json::String(profile.into())),
                ("saveEditor", Json::Bool(true)),
            ]),
        ),
    ]);
    if !host_match.0 {
        if let Some(suggested) = host_match.1 {
            body.insert("suggestedProfile", Json::String(suggested));
        } else {
            body.insert("suggestedProfile", Json::String(slug));
        }
    }
    body
}

pub fn hold(home: &Path, profile: &str, url: &str) -> i32 {
    let _ = state::ensure_home(home);
    let run = match RunRecord::start(home, "login") {
        Ok(run) => run,
        Err(_) => return 1,
    };
    let _ = run.event("door", &[("url", Json::String(url.into()))]);
    let dir = run.run_dir.join("chrome-door");
    let mut page = match Page::open(&dir, true) {
        Ok(page) => page,
        Err(err) => {
            write_state(home, profile, url, "network", "", &err);
            let _ = run.finish(&fail(&err));
            return 1;
        }
    };
    if page.goto(url).is_err() {
        write_state(home, profile, url, "network", "", "navigation failed");
        return 1;
    }
    let listener = match TcpListener::bind(door_bind()) {
        Ok(listener) => listener,
        Err(err) => {
            write_state(home, profile, url, "network", "", &err.to_string());
            return 1;
        }
    };
    let _ = listener.set_nonblocking(true);
    let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
    let door_url = format!("http://127.0.0.1:{port}/");
    write_state(home, profile, url, "waiting", &door_url, "");
    let deadline = Instant::now() + Duration::from_secs(door_seconds());
    loop {
        if Instant::now() > deadline {
            write_state(home, profile, url, "timeout", &door_url, "");
            let _ = run.finish(&fail("the sign-in door timed out before Save"));
            return 1;
        }
        match listener.accept() {
            Ok((stream, _)) => {
                if handle_client(stream, &mut page, home, profile, url, &door_url, &run) {
                    return 0;
                }
            }
            Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(30));
            }
            Err(_) => thread::sleep(Duration::from_millis(30)),
        }
    }
}

fn handle_client(
    mut stream: TcpStream,
    page: &mut Page,
    home: &Path,
    profile: &str,
    url: &str,
    door_url: &str,
    run: &RunRecord,
) -> bool {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buf = vec![0u8; 8192];
    let Ok(n) = stream.read(&mut buf) else {
        return false;
    };
    buf.truncate(n);
    let text = String::from_utf8_lossy(&buf);
    let mut lines = text.lines();
    let request = lines.next().unwrap_or("");
    let mut parts = request.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("/");
    let path = path.split('?').next().unwrap_or("/");
    // Body is not logged. The access line is method and path only.
    let _ = run.event(
        "door-http",
        &[
            ("method", Json::String(method.into())),
            ("path", Json::String(path.into())),
        ],
    );
    let body = text.split("\r\n\r\n").nth(1).unwrap_or("");
    match (method, path) {
        ("GET", "/") => {
            respond(
                &mut stream,
                200,
                "text/html; charset=utf-8",
                DOOR_HTML.as_bytes(),
            );
        }
        ("GET", "/frame") => match page.screenshot_png() {
            Ok(png) => respond(&mut stream, 200, "image/png", &png),
            Err(_) => respond(&mut stream, 500, "text/plain", b"no frame"),
        },
        ("POST", "/type") => {
            if let Some(typed) = json_field(body, "text") {
                let _ = page.insert_text(&typed);
            }
            respond(&mut stream, 204, "text/plain", b"");
        }
        ("POST", "/key") => {
            let key = json_field(body, "key").unwrap_or_else(|| "Enter".into());
            if key == "Enter" || key == "Backspace" {
                let _ = page.press(&key);
            }
            respond(&mut stream, 204, "text/plain", b"");
        }
        ("POST", "/clear") => {
            let _ = page.press("Clear");
            respond(&mut stream, 204, "text/plain", b"");
        }
        ("POST", "/save") => {
            let status = save_profile(page, home, profile, url);
            write_state(home, profile, url, &status, door_url, "");
            let payload = jsonutil::to_string(&Json::object(vec![(
                "status",
                Json::String(status.clone()),
            )]));
            respond(&mut stream, 200, "application/json", payload.as_bytes());
            let _ = run.finish(&Json::object(vec![
                ("ok", Json::Bool(status == "completed")),
                ("reason", Json::String(status.clone())),
                ("url", Json::String(url.into())),
                ("expect", Json::String(String::new())),
                (
                    "next",
                    Json::String("Run await-login for this profile.".into()),
                ),
            ]));
            return status == "completed" || status == "idp-only-save" || status == "empty-save";
        }
        ("GET", "/status") => {
            let current =
                fs::read_to_string(state_path(home, profile)).unwrap_or_else(|_| "{}".into());
            respond(&mut stream, 200, "application/json", current.as_bytes());
        }
        _ => respond(&mut stream, 404, "text/plain", b"not found"),
    }
    false
}

fn save_profile(page: &mut Page, home: &Path, name: &str, url: &str) -> String {
    let cookies = page.cookies().unwrap_or_default();
    let (local, session) = page.capture_storage().unwrap_or_default();
    let host = verdict::host_of(url).unwrap_or_default();
    let mut stored = Profile::empty(name, &host);
    // Prefer the live host when the browser has moved.
    if let Ok(text) = page.read() {
        if let Some(live) = verdict::host_of(&text.href) {
            stored.app_host = live;
        }
    }
    stored.cookies = cookies;
    stored.local_storage = local;
    stored.session_storage = session;
    if stored.is_empty() {
        return "empty-save".into();
    }
    if profile::save(home, &stored).is_err() {
        return "network".into();
    }
    match profile::readiness(&stored) {
        "idp-only" => "idp-only-save".into(),
        _ => "completed".into(),
    }
}

fn json_field(body: &str, key: &str) -> Option<String> {
    let json = jsonutil::from_str(body.trim()).ok()?;
    json.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

pub fn read_state(home: &Path, profile: &str) -> Option<Json> {
    let text = fs::read_to_string(state_path(home, profile)).ok()?;
    jsonutil::from_str(&text).ok()
}

fn write_state(home: &Path, profile: &str, url: &str, status: &str, door_url: &str, error: &str) {
    let _ = state::ensure_home(home);
    let body = Json::object(vec![
        ("status", Json::String(status.into())),
        ("profile", Json::String(profile.into())),
        ("url", Json::String(url.into())),
        ("doorUrl", Json::String(door_url.into())),
        ("pid", Json::Number(std::process::id() as f64)),
        ("error", Json::String(error.into())),
        ("updatedAt", Json::String(state::now_iso())),
    ]);
    let _ = state::write_private(
        &state_path(home, profile),
        jsonutil::to_pretty(&body).as_bytes(),
    );
}

fn respond(stream: &mut TcpStream, code: u16, content_type: &str, body: &[u8]) {
    let header = format!(
        "HTTP/1.1 {code} OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
}

fn door_bind() -> String {
    std::env::var("AUSPEX_DOOR_BIND").unwrap_or_else(|_| "127.0.0.1:0".into())
}

fn door_seconds() -> u64 {
    std::env::var("AUSPEX_DOOR_SECONDS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(15 * 60)
}

fn fail(message: &str) -> Json {
    Json::object(vec![
        ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
        ("ok", Json::Bool(false)),
        ("error", Json::String(message.into())),
        ("code", Json::String("network".into())),
        ("next", Json::String(message.into())),
    ])
}

pub fn await_login(home: &Path, profile: &str) -> Json {
    let Some(state) = read_state(home, profile) else {
        return Json::object(vec![
            ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
            ("ok", Json::Bool(false)),
            ("status", Json::String("empty-save".into())),
            ("reason", Json::String("emptySave".into())),
            ("profile", Json::String(profile.into())),
            (
                "next",
                Json::String("No sign-in door is waiting. Run auspex login --url <https>.".into()),
            ),
            (
                "nextCall",
                Json::object(vec![("tool", Json::String("auspex_login".into()))]),
            ),
        ]);
    };
    let status = state
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("waiting");
    let loaded = profile::load(home, profile).ok();
    let shape = loaded.as_ref().map(profile::readiness).unwrap_or("empty");
    let ok = status == "completed" && shape != "empty";
    let next = match status {
        "waiting" => "Still waiting for Save. Do not start another login.",
        "completed"
            if shape == "cookie-strong"
                || shape == "local-storage-auth"
                || shape == "session-strong" =>
        {
            "Save stored a login. Run check --verify-with-profile and read claimOkProfile."
        }
        "completed" => "Save finished but the jar is not ready to reuse. Read seedReadiness.",
        "idp-only-save" => {
            "Save holds only the sign-in provider. Do not treat that as the app login."
        }
        "empty-save" => "Save stored nothing. Run login again.",
        "timeout" => "The door timed out before Save. Run login again.",
        _ => "Read status and run the next command it names.",
    };
    let mut body = Json::object(vec![
        ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
        ("ok", Json::Bool(ok)),
        ("status", Json::String(status.into())),
        ("profile", Json::String(profile.into())),
        (
            "seedReadiness",
            Json::object(vec![("shape", Json::String(shape.into()))]),
        ),
        ("next", Json::String(next.into())),
    ]);
    if let Some(profile) = &loaded {
        body.insert("profileSeed", profile::seed_summary(profile));
    }
    body
}

pub fn finalize_login(home: &Path, profile_name: &str, url: &str, expect: &str) -> Json {
    let loaded = match profile::load(home, profile_name) {
        Ok(profile) => profile,
        Err(_) => {
            return Json::object(vec![
                ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
                ("ok", Json::Bool(false)),
                ("reason", Json::String("emptySave".into())),
                ("profile", Json::String(profile_name.into())),
                ("url", Json::String(url.into())),
                ("expect", Json::String(expect.into())),
                (
                    "next",
                    Json::String("The profile is missing. Run login again.".into()),
                ),
                (
                    "nextCall",
                    Json::object(vec![
                        ("tool", Json::String("auspex_login".into())),
                        ("profile", Json::String(profile_name.into())),
                        ("url", Json::String(url.into())),
                    ]),
                ),
            ]);
        }
    };
    let shape = profile::readiness(&loaded);
    let (ok, next, tool) = match shape {
        "cookie-strong" | "local-storage-auth" | "session-strong" => (
            true,
            "The save is stored. It is reusable only after check --verify-with-profile returns claimOkProfile true.",
            "auspex_check",
        ),
        "idp-only" => (
            false,
            "Save holds only the sign-in provider. There is no next step that invents an app session.",
            "",
        ),
        "weak-seed" => (
            false,
            "The save has no app session. A person signs in again. Do not run verify-with-profile.",
            "auspex_login",
        ),
        _ => (false, "The profile is empty. Run login again.", "auspex_login"),
    };
    let mut body = Json::object(vec![
        ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
        ("ok", Json::Bool(ok)),
        (
            "reason",
            Json::String(if ok { "matched" } else { "needsHuman" }.into()),
        ),
        ("profile", Json::String(profile_name.into())),
        ("url", Json::String(url.into())),
        ("expect", Json::String(expect.into())),
        (
            "seedReadiness",
            Json::object(vec![("shape", Json::String(shape.into()))]),
        ),
        ("profileSeed", profile::seed_summary(&loaded)),
        ("next", Json::String(next.into())),
    ]);
    if !tool.is_empty() {
        let mut call = vec![
            ("tool".into(), Json::String(tool.into())),
            ("profile".into(), Json::String(profile_name.into())),
            ("url".into(), Json::String(url.into())),
            ("expect".into(), Json::String(expect.into())),
        ];
        if tool == "auspex_check" {
            call.push(("verifyWithProfile".into(), Json::Bool(true)));
        }
        body.insert("nextCall", Json::Object(call));
    }
    body
}

/// What an access log is allowed to keep. The typed text is not one of these fields.
pub fn access_fields(method: &str, path: &str) -> Json {
    Json::object(vec![
        ("method", Json::String(method.into())),
        ("path", Json::String(path.into())),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn door_page_has_a_real_field_and_logs_skip_the_password() {
        assert!(DOOR_HTML.contains("<input id=\"box\""));
        assert!(DOOR_HTML.contains("Show as bullets"));
        let secret = "SuperSecret99!";
        let logged = jsonutil::to_string(&access_fields("POST", "/type"));
        assert!(!logged.contains(secret));
        assert!(logged.contains("/type"));
    }
}
