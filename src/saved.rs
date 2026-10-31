//! Named checks from auspex.yml. The file is a small subset of YAML, not a
//! general parser.

use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SavedCheck {
    pub name: String,
    pub url: String,
    pub expect: String,
    pub profile: Option<String>,
}

pub fn bundled() -> Vec<SavedCheck> {
    vec![
        SavedCheck {
            name: "ironadamant".into(),
            url: "https://ironadamant.com".into(),
            expect: "Web app testing, in plain English.".into(),
            profile: None,
        },
        SavedCheck {
            name: "checkpoint".into(),
            url: "https://checkpointprojects.com".into(),
            expect: "Checkpoint".into(),
            profile: None,
        },
        SavedCheck {
            name: "consistencyhub".into(),
            url: "https://consistencyhub.io".into(),
            expect: "Document Editor".into(),
            profile: Some("consistencyhub".into()),
        },
    ]
}

pub fn resolve_path(explicit: Option<&str>) -> Option<PathBuf> {
    if let Some(path) = explicit {
        return Some(PathBuf::from(path));
    }
    if let Some(env) = std::env::var_os("AUSPEX_CONFIG") {
        return Some(PathBuf::from(env));
    }
    let cwd = PathBuf::from("auspex.yml");
    if cwd.is_file() {
        return Some(cwd);
    }
    None
}

pub fn load_all(path: Option<&Path>) -> Vec<SavedCheck> {
    let mut checks = bundled();
    let Some(path) = path else {
        return checks;
    };
    let Ok(text) = fs::read_to_string(path) else {
        return checks;
    };
    if let Some(parsed) = parse_checks(&text) {
        for row in parsed {
            if let Some(slot) = checks.iter_mut().find(|c| c.name == row.name) {
                *slot = row;
            } else {
                checks.push(row);
            }
        }
    }
    checks
}

pub fn find(checks: &[SavedCheck], name: &str) -> Option<SavedCheck> {
    let key = name.trim().to_ascii_lowercase();
    checks.iter().find(|c| c.name == key).cloned()
}

fn parse_checks(text: &str) -> Option<Vec<SavedCheck>> {
    let mut checks = Vec::new();
    let mut current: Option<SavedCheck> = None;
    let mut in_checks = false;
    for raw in text.lines() {
        let line = raw.trim_end();
        if line.trim().is_empty() || line.trim_start().starts_with('#') {
            continue;
        }
        if line.trim() == "checks:" {
            in_checks = true;
            continue;
        }
        if !in_checks {
            continue;
        }
        if !line.starts_with(' ') && !line.starts_with('\t') {
            break;
        }
        let trimmed = line.trim();
        if trimmed.ends_with(':')
            && !trimmed.contains(' ')
            && line.starts_with("  ")
            && !line.starts_with("    ")
        {
            if let Some(done) = current.take() {
                checks.push(done);
            }
            let name = trimmed.trim_end_matches(':').to_string();
            current = Some(SavedCheck {
                name,
                url: String::new(),
                expect: String::new(),
                profile: None,
            });
            continue;
        }
        let Some(check) = current.as_mut() else {
            continue;
        };
        if let Some((key, value)) = trimmed.split_once(':') {
            let value = unquote(value.trim());
            match key.trim() {
                "url" => check.url = value,
                "expect" => check.expect = value,
                "profile" => check.profile = Some(value),
                _ => {}
            }
        }
    }
    if let Some(done) = current.take() {
        checks.push(done);
    }
    if checks.is_empty() {
        None
    } else {
        Some(checks)
    }
}

fn unquote(value: &str) -> String {
    let bytes = value.as_bytes();
    if bytes.len() >= 2 {
        let a = bytes[0];
        let b = bytes[bytes.len() - 1];
        if (a == b'"' && b == b'"') || (a == b'\'' && b == b'\'') {
            return value[1..value.len() - 1].to_string();
        }
    }
    value.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_named_checks() {
        let yaml = r#"
checks:
  ironadamant:
    url: https://ironadamant.com
    expect: "Web app testing, in plain English."
  demo:
    url: https://app.example/home
    expect: Workspace ready
    profile: app-example
"#;
        let rows = parse_checks(yaml).unwrap();
        assert_eq!(rows[0].expect, "Web app testing, in plain English.");
        assert_eq!(rows[1].profile.as_deref(), Some("app-example"));
    }
}
