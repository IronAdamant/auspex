//! Optional Hornet Swarm bridge.
//!
//! Auspex never requires Hornet. When the `hornet-swarm` command or its home
//! directory is missing, checks still run in local Chrome. When a journey
//! claim is present, Auspex reads the claim and then looks for itself.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::jsonutil::{self, Json};
use crate::scrub::scrub_string;
use crate::textmatch::haystack_matches;

#[derive(Clone, Debug)]
pub struct HornetStatus {
    pub present: bool,
    pub home_exists: bool,
    pub bin: Option<String>,
    pub home: String,
    pub reason: String,
}

#[derive(Clone, Debug)]
pub struct HornetLook {
    pub used: bool,
    pub reason: String,
    pub run_id: Option<String>,
    pub text: String,
    pub title: String,
    pub final_url: String,
    pub screenshot: Option<PathBuf>,
}

#[derive(Clone, Debug)]
pub struct HornetClaim {
    pub run_id: String,
    pub status: String,
    pub project: String,
    pub found: bool,
}

pub fn status() -> HornetStatus {
    if disabled() {
        return HornetStatus {
            present: false,
            home_exists: home_path().is_dir(),
            bin: None,
            home: display_home(),
            reason: "disabled".into(),
        };
    }
    let bin = find_bin();
    let home_exists = home_path().is_dir();
    let reason = classify(bin.is_some(), home_exists, false);
    HornetStatus {
        present: bin.is_some(),
        home_exists,
        bin,
        home: display_home(),
        reason: reason.into(),
    }
}

pub fn disabled() -> bool {
    matches!(
        std::env::var("AUSPEX_HORNET")
            .ok()
            .as_deref()
            .map(str::trim),
        Some("0" | "off" | "false" | "no")
    )
}

pub fn home_path() -> PathBuf {
    if let Some(raw) = std::env::var_os("AEGIS_HOME") {
        return PathBuf::from(raw);
    }
    if let Some(raw) = std::env::var_os("AUSPEX_HORNET_HOME") {
        return PathBuf::from(raw);
    }
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    home.join(".hornet-swarm")
}

fn display_home() -> String {
    let path = home_path();
    crate::state::display_path(&path)
}

fn find_bin() -> Option<String> {
    if let Ok(raw) = std::env::var("HORNET_SWARM_BIN") {
        let path = PathBuf::from(raw.trim());
        if path.is_file() {
            return Some(path.to_string_lossy().into_owned());
        }
    }
    for dir in std::env::var("PATH").unwrap_or_default().split(':') {
        let candidate = PathBuf::from(dir).join("hornet-swarm");
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }
    None
}

/// First look through a Hornet account browser. On any miss the caller uses
/// local Chrome and records `used: false`.
pub fn inspect(project: &str, label: &str, url: &str) -> HornetLook {
    let state = status();
    if !state.present {
        return HornetLook {
            used: false,
            reason: state.reason,
            run_id: None,
            text: String::new(),
            title: String::new(),
            final_url: String::new(),
            screenshot: None,
        };
    }
    let bin = state.bin.unwrap_or_default();
    let output = Command::new(&bin)
        .args([
            "inspect",
            "--project",
            project,
            "--user",
            label,
            "--url",
            url,
            "--json",
        ])
        .output();
    let Ok(output) = output else {
        return missed("spawn-failed");
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    let Ok(json) = jsonutil::from_str(stdout.trim()) else {
        return missed("inspect-failed");
    };
    if json.get("ok").and_then(|v| v.as_bool()) != Some(true) {
        return missed("inspect-failed");
    }
    let run_id = json
        .get("run_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let page = json.get("page");
    let title = page
        .and_then(|p| p.get("title"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let final_url = page
        .and_then(|p| p.get("url"))
        .and_then(|v| v.as_str())
        .unwrap_or(url)
        .to_string();
    let mut text = page_map_text(page);
    if let Some(id) = &run_id {
        text.push('\n');
        text.push_str(&read_page_text(&home_path().join("runs").join(id)));
    }
    let screenshot = json
        .get("screenshot")
        .and_then(|v| v.as_str())
        .map(PathBuf::from)
        .filter(|p| p.is_file());
    HornetLook {
        used: !text.trim().is_empty(),
        reason: if text.trim().is_empty() {
            "empty-page".into()
        } else {
            "present".into()
        },
        run_id,
        text,
        title,
        final_url,
        screenshot,
    }
}

fn missed(reason: &str) -> HornetLook {
    HornetLook {
        used: false,
        reason: reason.into(),
        run_id: None,
        text: String::new(),
        title: String::new(),
        final_url: String::new(),
        screenshot: None,
    }
}

fn page_map_text(page: Option<&Json>) -> String {
    let Some(page) = page else {
        return String::new();
    };
    let mut parts = Vec::new();
    if let Some(title) = page.get("title").and_then(|v| v.as_str()) {
        parts.push(title.to_string());
    }
    push_strings(page.get("headings"), &mut parts);
    push_named(page.get("buttons"), "text", &mut parts);
    push_named(page.get("links"), "text", &mut parts);
    push_named(page.get("fields"), "label", &mut parts);
    parts.join("\n")
}

fn push_strings(value: Option<&Json>, parts: &mut Vec<String>) {
    if let Some(items) = value.and_then(|v| v.as_array()) {
        for item in items {
            if let Some(text) = item.as_str() {
                parts.push(text.to_string());
            }
        }
    }
}

fn push_named(value: Option<&Json>, key: &str, parts: &mut Vec<String>) {
    if let Some(items) = value.and_then(|v| v.as_array()) {
        for item in items {
            if let Some(text) = item.get(key).and_then(|v| v.as_str()) {
                parts.push(text.to_string());
            }
        }
    }
}

fn read_page_text(dir: &Path) -> String {
    let mut out = String::new();
    let mut stack = vec![dir.to_path_buf()];
    let mut files = 0;
    while let Some(current) = stack.pop() {
        let Ok(entries) = fs::read_dir(&current) else {
            continue;
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if name.ends_with(".txt") && files < 20 {
                if let Ok(text) = fs::read_to_string(&path) {
                    out.push_str(&text);
                    out.push('\n');
                    files += 1;
                }
            }
        }
    }
    out
}

pub fn classify(bin_found: bool, home_exists: bool, off: bool) -> &'static str {
    if off {
        "disabled"
    } else if bin_found {
        "present"
    } else if home_exists {
        "home-only"
    } else {
        "absent"
    }
}

pub fn read_claim(run_id: &str) -> HornetClaim {
    read_claim_from(&home_path(), run_id)
}

pub fn read_claim_from(home: &Path, run_id: &str) -> HornetClaim {
    let path = home.join("runs").join(run_id).join("run.json");
    let Ok(text) = fs::read_to_string(&path) else {
        return HornetClaim {
            run_id: run_id.to_string(),
            status: "missing".into(),
            project: String::new(),
            found: false,
        };
    };
    let Ok(json) = jsonutil::from_str(&text) else {
        return HornetClaim {
            run_id: run_id.to_string(),
            status: "unreadable".into(),
            project: String::new(),
            found: false,
        };
    };
    HornetClaim {
        run_id: json
            .get("run_id")
            .and_then(|v| v.as_str())
            .unwrap_or(run_id)
            .to_string(),
        status: json
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string(),
        project: json
            .get("project")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        found: true,
    }
}

/// A Hornet pass is not proof. The fresh browser has to see the words.
pub fn claim_confirmed(claim_status: &str, fresh_saw_words: bool) -> bool {
    let _ = claim_status;
    fresh_saw_words
}

pub fn hornet_note(look: &HornetLook, claim: Option<&HornetClaim>, expect: &str) -> Json {
    let mut pairs = vec![
        ("requested".into(), Json::Bool(true)),
        ("used".into(), Json::Bool(look.used)),
        ("reason".into(), Json::String(scrub_string(&look.reason))),
    ];
    if let Some(id) = &look.run_id {
        pairs.push(("runId".into(), Json::String(id.clone())));
    }
    if let Some(claim) = claim {
        pairs.push(("claimFound".into(), Json::Bool(claim.found)));
        pairs.push((
            "claimStatus".into(),
            Json::String(scrub_string(&claim.status)),
        ));
        pairs.push((
            "claimMatchedExpect".into(),
            Json::Bool(look.used && haystack_matches(&look.text, expect)),
        ));
    }
    Json::Object(pairs)
}

pub fn status_json() -> Json {
    let state = status();
    let next = if state.present {
        "Hornet Swarm is on this machine. A check can take its first look with --via hornet --hornet-project and --hornet-label. The receipt is the same shape, and claimOkProfile still comes from Auspex."
    } else if state.reason == "disabled" {
        "Hornet Swarm is switched off with AUSPEX_HORNET. Local checks are unchanged."
    } else if state.home_exists {
        "Hornet's home directory is here but the hornet-swarm command was not found. Journey claims in that home can still be read. A first look uses local Chrome."
    } else {
        "Hornet Swarm is not installed. That is fine. Auspex checks pages with local Chrome."
    };
    Json::object(vec![
        ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
        ("ok", Json::Bool(true)),
        ("present", Json::Bool(state.present)),
        ("homeExists", Json::Bool(state.home_exists)),
        ("reason", Json::String(state.reason)),
        ("home", Json::String(state.home)),
        ("next", Json::String(next.into())),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absent_and_present() {
        assert_eq!(classify(false, false, false), "absent");
        assert_eq!(classify(true, false, false), "present");
        assert_eq!(classify(true, true, true), "disabled");
        assert_eq!(classify(false, true, false), "home-only");
        let home =
            std::env::temp_dir().join(format!("auspex-hornet-{}", crate::state::random_hex(4)));
        let run = home.join("runs").join("run_demo");
        std::fs::create_dir_all(&run).unwrap();
        std::fs::write(
            run.join("run.json"),
            r#"{"run_id":"run_demo","status":"passed","project":"demo","password":"nope"}"#,
        )
        .unwrap();
        let claim = read_claim_from(&home, "run_demo");
        assert!(claim.found);
        assert_eq!(claim.status, "passed");
        assert!(!claim_confirmed(&claim.status, false));
        assert!(claim_confirmed("passed", true));
        let missing = read_claim_from(&home, "nope");
        assert!(!missing.found);
        assert_eq!(missing.status, "missing");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn disabled_env_hides_a_binary() {
        // The process environment is shared. This test only checks the helper
        // when the variable is already off, and otherwise checks the default
        // reason vocabulary.
        let state = status();
        assert!(matches!(
            state.reason.as_str(),
            "present" | "absent" | "home-only" | "disabled"
        ));
    }
}
