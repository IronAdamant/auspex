//! Local state. Each run has its own directory. Writes take a lock file so
//! two agents do not tear a shared log.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub fn home_dir() -> PathBuf {
    if let Some(raw) = std::env::var_os("AUSPEX_HOME") {
        let path = PathBuf::from(raw);
        if !path.as_os_str().is_empty() {
            return path;
        }
    }
    dirs_home().join(".auspex")
}

fn dirs_home() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn ensure_home(home: &Path) -> std::io::Result<()> {
    for name in [
        "runs", "logs", "traces", "sessions", "profiles", "doors", "sweeps",
    ] {
        fs::create_dir_all(home.join(name))?;
    }
    Ok(())
}

pub fn display_path(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    if let Some(home) = std::env::var_os("HOME") {
        let home = home.to_string_lossy().replace('\\', "/");
        if let Some(rest) = text.strip_prefix(&home) {
            return format!("~{rest}");
        }
    }
    text
}

pub fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

pub fn now_iso() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format_unix(secs)
}

fn format_unix(secs: u64) -> String {
    let days = secs / 86_400;
    let time = secs % 86_400;
    let (year, month, day) = civil_from_days(days as i64);
    let hour = time / 3600;
    let min = (time % 3600) / 60;
    let sec = time % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{min:02}:{sec:02}Z")
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    // Howard Hinnant civil_from_days, public domain algorithm.
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m as u32, d as u32)
}

pub fn random_hex(n: usize) -> String {
    let mut buf = vec![0u8; n];
    if let Ok(mut file) = File::open("/dev/urandom") {
        let _ = file.read_exact(&mut buf);
    } else {
        let mixed = now_millis() ^ (std::process::id() as u128);
        for (i, byte) in buf.iter_mut().enumerate() {
            *byte = ((mixed >> ((i % 16) * 8)) & 0xff) as u8;
        }
    }
    let mut out = String::with_capacity(buf.len() * 2);
    for byte in &buf {
        const HEX: &[u8] = b"0123456789abcdef";
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0xf) as usize] as char);
    }
    out
}

pub fn new_run_id() -> String {
    format!("{}-{}-{}", now_millis(), std::process::id(), random_hex(4))
}

pub struct Lock {
    path: PathBuf,
}

impl Lock {
    pub fn acquire(path: &Path) -> std::io::Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let deadline = Instant::now() + Duration::from_secs(15);
        loop {
            match OpenOptions::new().write(true).create_new(true).open(path) {
                Ok(mut file) => {
                    let _ = writeln!(file, "{}", std::process::id());
                    return Ok(Lock {
                        path: path.to_path_buf(),
                    });
                }
                Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
                    if lock_is_stale(path) {
                        let _ = fs::remove_file(path);
                        continue;
                    }
                    if Instant::now() > deadline {
                        return Err(std::io::Error::new(
                            std::io::ErrorKind::TimedOut,
                            "timed out waiting for the auspex lock",
                        ));
                    }
                    thread::sleep(Duration::from_millis(20));
                }
                Err(err) => return Err(err),
            }
        }
    }
}

impl Drop for Lock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn lock_is_stale(path: &Path) -> bool {
    let Ok(text) = fs::read_to_string(path) else {
        return true;
    };
    let Some(pid) = text.trim().parse::<u32>().ok() else {
        return true;
    };
    if pid == std::process::id() {
        return false;
    }
    // Linux and macOS: a live process has a /proc entry only on Linux.
    if cfg!(target_os = "linux") {
        return !Path::new(&format!("/proc/{pid}")).exists();
    }
    false
}

pub fn write_private(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path)?;
        file.write_all(bytes)?;
        Ok(())
    }
    #[cfg(not(unix))]
    {
        fs::write(path, bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_epoch() {
        assert_eq!(format_unix(0), "1970-01-01T00:00:00Z");
    }
}
