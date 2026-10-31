//! Plain no-login fetch. This is the anonymous second look.
//!
//! Rust's standard library has no TLS, so the fetch is the system `curl`
//! binary. It sends no cookies. It is a different program from the Chrome
//! look, which is the point of the second check.

use std::process::Command;
use std::time::Duration;

use crate::textmatch::html_to_text;

pub struct Fetch {
    pub ok: bool,
    pub title: String,
    pub text: String,
    pub error: Option<String>,
}

pub fn anonymous(url: &str) -> Fetch {
    let curl = std::env::var("AUSPEX_CURL").unwrap_or_else(|_| "curl".into());
    let output = Command::new(&curl)
        .args([
            "-sS",
            "-L",
            "--max-time",
            "25",
            "--max-redirs",
            "5",
            "-A",
            "auspex",
            "-H",
            "Accept: text/html",
            "--",
            url,
        ])
        .output();
    let Ok(output) = output else {
        return Fetch {
            ok: false,
            title: String::new(),
            text: String::new(),
            error: Some("curl is not installed, so the plain fetch did not run".into()),
        };
    };
    if !output.status.success() && output.stdout.is_empty() {
        let err = String::from_utf8_lossy(&output.stderr);
        let line = err.lines().next().unwrap_or("curl failed");
        return Fetch {
            ok: false,
            title: String::new(),
            text: String::new(),
            error: Some(format!("fetch failed: {line}")),
        };
    }
    let body = String::from_utf8_lossy(&output.stdout);
    let capped: String = body.chars().take(1_500_000).collect();
    let (title, text) = html_to_text(&capped);
    let _ = Duration::from_secs(0);
    Fetch {
        ok: true,
        title,
        text,
        error: None,
    }
}
