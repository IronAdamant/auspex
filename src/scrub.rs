//! Scrub secrets before they reach a receipt, log, trace, or summary.
//!
//! Cookie jars and saved profiles stay on disk in their own files. They are
//! never copied into these records.

use crate::jsonutil::Json;
use crate::textmatch::mask_secrets;

const DROP_KEY: &[&str] = &[
    "password",
    "passwd",
    "token",
    "secret",
    "cookie",
    "cookies",
    "authorization",
    "apikey",
    "api_key",
    "accesstoken",
    "refreshtoken",
    "handofftoken",
    "sessionid",
    "solarikey",
    "otp",
    "set-cookie",
    "sessionstorage",
    "localstorage",
];

pub fn scrub_string(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return scrub_url(trimmed);
    }
    mask_secrets(value)
}

pub fn scrub_url(value: &str) -> String {
    let masked = mask_secrets(value);
    let Some((scheme, rest)) = split_scheme(&masked) else {
        return masked;
    };
    let (before_hash, hash) = match rest.split_once('#') {
        Some((a, b)) => (a, Some(b)),
        None => (rest, None),
    };
    let (before_query, query) = match before_hash.split_once('?') {
        Some((a, b)) => (a, Some(b)),
        None => (before_hash, None),
    };
    let mut auth_and_host = before_query;
    if let Some((auth, host)) = before_query.split_once('@') {
        let user = auth.split(':').next().unwrap_or("");
        if !user.is_empty() || auth.contains(':') {
            auth_and_host = host;
        }
    }
    let mut out = format!("{scheme}://{auth_and_host}");
    if let Some(query) = query {
        out.push('?');
        out.push_str(&scrub_query(query));
    }
    if let Some(hash) = hash {
        if hash.contains('=') {
            out.push('#');
            out.push_str(&scrub_query(hash));
        } else if !hash.is_empty() {
            out.push('#');
            out.push_str(hash);
        }
    }
    out
}

fn split_scheme(value: &str) -> Option<(&str, &str)> {
    if let Some(rest) = value.strip_prefix("https://") {
        Some(("https", rest))
    } else {
        value.strip_prefix("http://").map(|rest| ("http", rest))
    }
}

fn scrub_query(query: &str) -> String {
    let mut parts = Vec::new();
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (key, val) = pair.split_once('=').unwrap_or((pair, ""));
        if secret_param(key) {
            parts.push(format!("{key}=redacted"));
        } else if val.is_empty() && !pair.contains('=') {
            parts.push(key.to_string());
        } else {
            parts.push(format!("{key}={}", mask_secrets(val)));
        }
    }
    parts.join("&")
}

fn secret_param(key: &str) -> bool {
    let k = key.to_ascii_lowercase();
    [
        "token", "secret", "key", "password", "auth", "jwt", "otp", "code", "state", "session",
        "sig",
    ]
    .iter()
    .any(|needle| k.contains(needle))
}

pub fn scrub_json(value: &Json) -> Json {
    match value {
        Json::String(s) => Json::String(scrub_string(s)),
        Json::Array(items) => Json::Array(items.iter().map(scrub_json).collect()),
        Json::Object(pairs) => {
            let mut out = Vec::new();
            for (key, raw) in pairs {
                if drop_key(key) {
                    continue;
                }
                out.push((key.clone(), scrub_json(raw)));
            }
            Json::Object(out)
        }
        other => other.clone(),
    }
}

fn drop_key(key: &str) -> bool {
    let folded = key.to_ascii_lowercase().replace(['-', '_'], "");
    DROP_KEY.iter().any(|name| {
        let folded_name = name.replace(['-', '_'], "");
        folded == folded_name
    })
}

/// True when a planted secret survived into text that will be stored.
pub fn contains_secret(text: &str, secret: &str) -> bool {
    !secret.is_empty() && text.contains(secret)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jsonutil::{from_str, to_string};

    #[test]
    fn drops_cookie_and_redacts_oauth_code() {
        let raw = from_str(
            r#"{"password":"hunter2","cookies":[{"value":"abc"}],"url":"https://app.example/cb?code=secretcode&ok=1#access_token=tok"}"#,
        )
        .unwrap();
        let clean = to_string(&scrub_json(&raw));
        assert!(!clean.contains("hunter2"));
        assert!(!clean.contains("secretcode"));
        assert!(!clean.contains("\"cookies\""));
        assert!(clean.contains("code=redacted"));
        assert!(clean.contains("access_token=redacted"));
        assert!(clean.contains("ok=1"));
    }
}
