//! Launch a locally installed Chrome or Chromium and read its DevTools port.
//!
//! Auspex drives that browser itself. There is no cloud browser and no API key.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

pub struct Chrome {
    child: Child,
    pub port: u16,
    pub ws_path: String,
    pub data_dir: PathBuf,
}

impl Chrome {
    pub fn launch(data_dir: &Path, headed: bool) -> Result<Self, String> {
        let bin = find_chrome().ok_or_else(|| {
            "Chrome or Chromium was not found. Install it, or set CHROME_PATH.".to_string()
        })?;
        fs::create_dir_all(data_dir).map_err(|err| err.to_string())?;
        let mut args = vec![
            "--disable-gpu".to_string(),
            "--no-first-run".to_string(),
            "--no-default-browser-check".to_string(),
            "--disable-dev-shm-usage".to_string(),
            "--disable-sync".to_string(),
            "--disable-background-networking".to_string(),
            "--remote-debugging-port=0".to_string(),
            format!("--user-data-dir={}", data_dir.display()),
            "--remote-allow-origins=*".to_string(),
            "--window-size=1280,900".to_string(),
        ];
        let show = headed && std::env::var_os("DISPLAY").is_some();
        if !show {
            args.insert(0, "--headless=new".into());
        }
        args.push("about:blank".into());
        let mut child = Command::new(&bin)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|err| format!("could not start Chrome: {err}"))?;
        match wait_port(data_dir) {
            Ok((port, ws_path)) => Ok(Chrome {
                child,
                port,
                ws_path,
                data_dir: data_dir.to_path_buf(),
            }),
            Err(err) => {
                let _ = child.kill();
                let _ = child.wait();
                Err(err)
            }
        }
    }
}

impl Drop for Chrome {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = fs::remove_dir_all(&self.data_dir);
    }
}

pub fn find_chrome() -> Option<PathBuf> {
    if let Some(raw) = std::env::var_os("CHROME_PATH").or_else(|| std::env::var_os("AUSPEX_CHROME"))
    {
        let path = PathBuf::from(raw);
        if path.is_file() {
            return Some(path);
        }
    }
    let names = [
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
        "chrome",
    ];
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            for name in names {
                let candidate = dir.join(name);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    for candidate in [
        "/usr/bin/google-chrome-stable",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ] {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

fn wait_port(data_dir: &Path) -> Result<(u16, String), String> {
    let file = data_dir.join("DevToolsActivePort");
    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        if let Ok(text) = fs::read_to_string(&file) {
            let mut lines = text.lines();
            if let (Some(port), Some(path)) = (lines.next(), lines.next()) {
                if let Ok(port) = port.trim().parse::<u16>() {
                    return Ok((port, path.trim().to_string()));
                }
            }
        }
        thread::sleep(Duration::from_millis(50));
    }
    Err("Chrome did not open a DevTools port".into())
}
