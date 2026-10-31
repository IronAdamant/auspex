//! Saved logins. The file holds cookies and storage. Receipts and logs get counts only.

use std::fs;
use std::path::{Path, PathBuf};

use crate::jsonutil::{self, Json};
use crate::state;
use crate::verdict::{self, host_of, is_idp_host, same_product_host};

#[derive(Clone, Debug)]
pub struct StoredCookie {
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
    pub secure: bool,
    pub http_only: bool,
    pub same_site: String,
}

#[derive(Clone, Debug)]
pub struct StoragePair {
    pub name: String,
    pub value: String,
}

#[derive(Clone, Debug)]
pub struct OriginBag {
    pub origin: String,
    pub items: Vec<StoragePair>,
}

#[derive(Clone, Debug)]
pub struct Profile {
    pub name: String,
    pub saved_at: String,
    pub app_host: String,
    pub cookies: Vec<StoredCookie>,
    pub local_storage: Vec<OriginBag>,
    pub session_storage: Vec<OriginBag>,
}

impl Profile {
    pub fn empty(name: &str, app_host: &str) -> Self {
        Self {
            name: name.to_string(),
            saved_at: state::now_iso(),
            app_host: app_host.to_string(),
            cookies: Vec::new(),
            local_storage: Vec::new(),
            session_storage: Vec::new(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.cookies.is_empty() && self.local_storage.is_empty() && self.session_storage.is_empty()
    }
}

pub fn path_for(home: &Path, name: &str) -> PathBuf {
    home.join("profiles").join(format!("{name}.json"))
}

pub fn require_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("profile name must be non-empty".into());
    }
    if name.contains('/') || name.contains('\\') || name.chars().any(|c| c.is_control()) {
        return Err("profile name must not contain a path".into());
    }
    Ok(name.to_string())
}

pub fn save(home: &Path, profile: &Profile) -> Result<(), String> {
    let name = require_name(&profile.name)?;
    let _lock = state::Lock::acquire(&home.join("profiles").join(format!("{name}.lock")))
        .map_err(|err| err.to_string())?;
    let body = jsonutil::to_pretty(&profile_to_json(profile));
    state::write_private(&path_for(home, &name), body.as_bytes()).map_err(|err| err.to_string())
}

pub fn load(home: &Path, name: &str) -> Result<Profile, String> {
    let name = require_name(name)?;
    let text = fs::read_to_string(path_for(home, &name)).map_err(|_| "emptySave".to_string())?;
    let json = jsonutil::from_str(&text).map_err(|_| "emptySave".to_string())?;
    profile_from_json(&name, &json)
}

pub fn list_names(home: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(home.join("profiles")) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            if path.extension().and_then(|x| x.to_str()) != Some("json") {
                return None;
            }
            path.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
        })
        .collect();
    names.sort();
    names
}

fn profile_to_json(profile: &Profile) -> Json {
    Json::object(vec![
        ("version", Json::Number(1.0)),
        ("name", Json::String(profile.name.clone())),
        ("savedAt", Json::String(profile.saved_at.clone())),
        ("appHost", Json::String(profile.app_host.clone())),
        (
            "cookies",
            Json::Array(profile.cookies.iter().map(cookie_json).collect()),
        ),
        (
            "localStorage",
            Json::Array(profile.local_storage.iter().map(bag_json).collect()),
        ),
        (
            "sessionStorage",
            Json::Array(profile.session_storage.iter().map(bag_json).collect()),
        ),
    ])
}

fn cookie_json(cookie: &StoredCookie) -> Json {
    Json::object(vec![
        ("name", Json::String(cookie.name.clone())),
        ("value", Json::String(cookie.value.clone())),
        ("domain", Json::String(cookie.domain.clone())),
        ("path", Json::String(cookie.path.clone())),
        ("secure", Json::Bool(cookie.secure)),
        ("httpOnly", Json::Bool(cookie.http_only)),
        ("sameSite", Json::String(cookie.same_site.clone())),
    ])
}

fn bag_json(bag: &OriginBag) -> Json {
    Json::object(vec![
        ("origin", Json::String(bag.origin.clone())),
        (
            "items",
            Json::Array(
                bag.items
                    .iter()
                    .map(|item| {
                        Json::object(vec![
                            ("name", Json::String(item.name.clone())),
                            ("value", Json::String(item.value.clone())),
                        ])
                    })
                    .collect(),
            ),
        ),
    ])
}

fn profile_from_json(name: &str, json: &Json) -> Result<Profile, String> {
    let cookies = json
        .get("cookies")
        .and_then(|v| v.as_array())
        .unwrap_or(&[])
        .iter()
        .filter_map(cookie_from)
        .collect();
    Ok(Profile {
        name: name.to_string(),
        saved_at: json
            .get("savedAt")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        app_host: json
            .get("appHost")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        cookies,
        local_storage: bags_from(json.get("localStorage")),
        session_storage: bags_from(json.get("sessionStorage")),
    })
}

fn cookie_from(json: &Json) -> Option<StoredCookie> {
    Some(StoredCookie {
        name: json.get("name")?.as_str()?.to_string(),
        value: json
            .get("value")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        domain: json
            .get("domain")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        path: json
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or("/")
            .to_string(),
        secure: json
            .get("secure")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        http_only: json
            .get("httpOnly")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        same_site: json
            .get("sameSite")
            .and_then(|v| v.as_str())
            .unwrap_or("Lax")
            .to_string(),
    })
}

fn bags_from(json: Option<&Json>) -> Vec<OriginBag> {
    json.and_then(|v| v.as_array())
        .unwrap_or(&[])
        .iter()
        .filter_map(|bag| {
            let origin = bag.get("origin")?.as_str()?.to_string();
            let items = bag
                .get("items")
                .and_then(|v| v.as_array())
                .unwrap_or(&[])
                .iter()
                .filter_map(|item| {
                    Some(StoragePair {
                        name: item.get("name")?.as_str()?.to_string(),
                        value: item
                            .get("value")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                    })
                })
                .collect();
            Some(OriginBag { origin, items })
        })
        .collect()
}

pub fn cookie_matches_host(domain: &str, host: &str) -> bool {
    let d = domain.trim_start_matches('.').to_ascii_lowercase();
    let h = host.to_ascii_lowercase();
    if d.is_empty() || h.is_empty() {
        return false;
    }
    if d == h {
        return true;
    }
    d.contains('.') && h.ends_with(&format!(".{d}"))
}

pub fn app_cookie_count(profile: &Profile) -> usize {
    profile
        .cookies
        .iter()
        .filter(|c| cookie_matches_host(&c.domain, &profile.app_host))
        .count()
}

fn auth_key(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    const EXACT: &[&str] = &[
        "token",
        "access_token",
        "refresh_token",
        "id_token",
        "auth",
        "session",
        "__session",
    ];
    EXACT.contains(&n.as_str())
        || n.starts_with("sb-") && n.ends_with("-auth-token")
        || n.starts_with("a_session_")
}

pub fn local_auth_key_names(profile: &Profile) -> Vec<String> {
    let mut names = Vec::new();
    for bag in &profile.local_storage {
        let Some(host) = host_of(&bag.origin) else {
            continue;
        };
        if host != profile.app_host && !host.ends_with(&format!(".{}", profile.app_host)) {
            continue;
        }
        for item in &bag.items {
            if auth_key(&item.name) {
                names.push(item.name.clone());
            }
        }
    }
    names.sort();
    names.dedup();
    names
}

pub fn session_count(profile: &Profile) -> usize {
    profile
        .session_storage
        .iter()
        .filter(|bag| {
            host_of(&bag.origin).is_some_and(|h| {
                h == profile.app_host || cookie_matches_host(&profile.app_host, &h)
            })
        })
        .map(|bag| bag.items.len())
        .sum()
}

pub fn readiness(profile: &Profile) -> &'static str {
    if profile.is_empty() {
        return "empty";
    }
    if app_cookie_count(profile) > 0 {
        return "cookie-strong";
    }
    if !local_auth_key_names(profile).is_empty() {
        return "local-storage-auth";
    }
    if session_count(profile) > 0 {
        return "session-strong";
    }
    let hosts: Vec<String> = profile
        .cookies
        .iter()
        .map(|c| c.domain.trim_start_matches('.').to_ascii_lowercase())
        .filter(|h| !h.is_empty())
        .collect();
    if !hosts.is_empty() && hosts.iter().all(|h| is_idp_host(h)) {
        return "idp-only";
    }
    "weak-seed"
}

pub fn refuse_profile_claim(readiness: &str) -> Option<&'static str> {
    match readiness {
        "weak-seed" => Some("weakSeed"),
        "empty" => Some("emptySave"),
        "idp-only" => Some("idp-only-save"),
        _ => None,
    }
}

pub fn host_match(profile_name: &str, url: &str) -> (bool, Option<String>) {
    let Ok(slug) = verdict::profile_slug(url) else {
        return (false, None);
    };
    let name = profile_name.trim().to_ascii_lowercase();
    if name == slug {
        return (true, None);
    }
    if name == "consistencyhub" {
        if let Some(host) = host_of(url) {
            if host == "consistencyhub.io" || host.ends_with(".consistencyhub.io") {
                return (true, None);
            }
        }
    }
    if let Some(saved) = host_of(url) {
        if same_product_host(&saved, &slug) {
            return (true, None);
        }
    }
    (false, Some(slug))
}

/// Counts only. Values stay in the profile file.
pub fn seed_summary(profile: &Profile) -> Json {
    Json::object(vec![
        ("cookies", Json::Number(profile.cookies.len() as f64)),
        ("origins", Json::Number(profile.local_storage.len() as f64)),
        (
            "sessionStorage",
            Json::Number(session_count(profile) as f64),
        ),
        (
            "appOriginCookieCount",
            Json::Number(app_cookie_count(profile) as f64),
        ),
        (
            "localStorageAuthKeyNames",
            Json::Array(
                local_auth_key_names(profile)
                    .into_iter()
                    .map(Json::String)
                    .collect(),
            ),
        ),
    ])
}

pub fn profiles_for_host(home: &Path, host: &str) -> Vec<String> {
    list_names(home)
        .into_iter()
        .filter(|name| load(home, name).ok().is_some_and(|p| p.app_host == host))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cookie(domain: &str) -> StoredCookie {
        StoredCookie {
            name: "sid".into(),
            value: "secret-cookie-value".into(),
            domain: domain.into(),
            path: "/".into(),
            secure: true,
            http_only: true,
            same_site: "Lax".into(),
        }
    }

    #[test]
    fn readiness_and_scrubbed_summary() {
        let mut profile = Profile::empty("app-example", "app.example");
        assert_eq!(readiness(&profile), "empty");
        assert_eq!(refuse_profile_claim("empty"), Some("emptySave"));
        profile.cookies.push(cookie("accounts.google.com"));
        assert_eq!(readiness(&profile), "idp-only");
        profile.cookies.push(cookie(".app.example"));
        assert_eq!(readiness(&profile), "cookie-strong");
        assert!(refuse_profile_claim("cookie-strong").is_none());
        let summary = jsonutil::to_string(&seed_summary(&profile));
        assert!(!summary.contains("secret-cookie-value"));
        assert!(summary.contains("appOriginCookieCount"));
    }

    #[test]
    fn weak_seed_when_session_storage_is_empty() {
        let mut profile = Profile::empty("app-example", "app.example");
        profile.local_storage.push(OriginBag {
            origin: "https://app.example".into(),
            items: vec![StoragePair {
                name: "theme".into(),
                value: "dark".into(),
            }],
        });
        assert_eq!(readiness(&profile), "weak-seed");
        profile.local_storage[0].items.push(StoragePair {
            name: "access_token".into(),
            value: "should-not-leak".into(),
        });
        assert_eq!(readiness(&profile), "local-storage-auth");
        let summary = jsonutil::to_string(&seed_summary(&profile));
        assert!(summary.contains("access_token"));
        assert!(!summary.contains("should-not-leak"));
    }
}
