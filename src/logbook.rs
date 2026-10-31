//! Append-only log, per-run trace, and a short session summary.
//!
//! An agent that loses its place reads the summary and continues. Nothing
//! written here may contain a password, cookie, token, or session value.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::jsonutil::{self, Json};
use crate::scrub::scrub_json;
use crate::state::{self, Lock};

#[derive(Clone, Debug)]
pub struct RunRecord {
    pub home: PathBuf,
    pub run_id: String,
    pub run_dir: PathBuf,
    pub command: String,
}

impl RunRecord {
    pub fn start(home: &Path, command: &str) -> std::io::Result<Self> {
        state::ensure_home(home)?;
        let run_id = state::new_run_id();
        let run_dir = home.join("runs").join(&run_id);
        fs::create_dir(&run_dir)?;
        let record = Self {
            home: home.to_path_buf(),
            run_id,
            run_dir,
            command: command.to_string(),
        };
        record.event("start", &[("command", Json::String(command.to_string()))])?;
        Ok(record)
    }

    pub fn event(&self, step: &str, fields: &[(&str, Json)]) -> std::io::Result<()> {
        let mut pairs = vec![
            ("ts".into(), Json::String(state::now_iso())),
            ("runId".into(), Json::String(self.run_id.clone())),
            ("step".into(), Json::String(step.to_string())),
        ];
        for (key, value) in fields {
            pairs.push(((*key).to_string(), value.clone()));
        }
        let clean = scrub_json(&Json::Object(pairs));
        let line = jsonutil::to_string(&clean);
        append_line(&self.home.join("logs").join("auspex.jsonl"), &line)?;
        append_line(
            &self
                .home
                .join("traces")
                .join(format!("{}.jsonl", self.run_id)),
            &line,
        )?;
        Ok(())
    }

    pub fn finish(&self, body: &Json) -> std::io::Result<PathBuf> {
        let clean = scrub_json(body);
        let summary = Json::object(vec![
            ("schemaVersion", Json::Number(crate::SCHEMA_VERSION as f64)),
            ("runId", Json::String(self.run_id.clone())),
            ("command", Json::String(self.command.clone())),
            ("ok", clean.get("ok").cloned().unwrap_or(Json::Bool(false))),
            (
                "reason",
                clean
                    .get("reason")
                    .cloned()
                    .or_else(|| clean.get("error").cloned())
                    .unwrap_or(Json::String("unknown".into())),
            ),
            (
                "url",
                clean.get("url").cloned().unwrap_or(Json::String(String::new())),
            ),
            (
                "expect",
                clean.get("expect").cloned().unwrap_or(Json::String(String::new())),
            ),
            (
                "next",
                clean.get("next").cloned().unwrap_or(Json::String(String::new())),
            ),
            ("finishedAt", Json::String(state::now_iso())),
            (
                "log",
                Json::String(state::display_path(&self.home.join("logs").join("auspex.jsonl"))),
            ),
            (
                "trace",
                Json::String(state::display_path(
                    &self.home.join("traces").join(format!("{}.jsonl", self.run_id)),
                )),
            ),
            (
                "resume",
                Json::String(
                    "Read this summary, then the trace. Continue from next. Do not repeat a step that already has a verdict.".into(),
                ),
            ),
        ]);
        let path = self
            .home
            .join("sessions")
            .join(format!("{}.json", self.run_id));
        state::write_private(&path, jsonutil::to_pretty(&summary).as_bytes())?;
        let _ = self.event(
            "finish",
            &[
                (
                    "ok",
                    summary.get("ok").cloned().unwrap_or(Json::Bool(false)),
                ),
                (
                    "reason",
                    summary.get("reason").cloned().unwrap_or(Json::Null),
                ),
            ],
        );
        Ok(path)
    }
}

fn append_line(path: &Path, line: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let lock_path = path.with_extension("lock");
    let _lock = Lock::acquire(&lock_path)?;
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    writeln!(file, "{line}")?;
    file.flush()?;
    Ok(())
}

pub fn list_sessions(home: &Path, limit: usize) -> Vec<Json> {
    let dir = home.join("sessions");
    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut files: Vec<PathBuf> = entries.filter_map(|e| e.ok().map(|e| e.path())).collect();
    files.sort();
    files.reverse();
    files
        .into_iter()
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .take(limit)
        .filter_map(|path| {
            let text = fs::read_to_string(&path).ok()?;
            jsonutil::from_str(&text).ok()
        })
        .collect()
}

pub fn read_session(home: &Path, run_id: &str) -> Option<Json> {
    let path = home.join("sessions").join(format!("{run_id}.json"));
    let text = fs::read_to_string(path).ok()?;
    jsonutil::from_str(&text).ok()
}

pub fn read_trace(home: &Path, run_id: &str, limit: usize) -> Vec<Json> {
    let path = home.join("traces").join(format!("{run_id}.jsonl"));
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let mut rows: Vec<Json> = text
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| jsonutil::from_str(line).ok())
        .collect();
    if rows.len() > limit {
        rows = rows.split_off(rows.len() - limit);
    }
    rows
}

pub fn latest_session(home: &Path) -> Option<Json> {
    list_sessions(home, 1).into_iter().next()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Barrier};
    use std::thread;

    #[test]
    fn writes_summary_and_resumes() {
        let home = std::env::temp_dir().join(format!("auspex-log-{}", state::random_hex(4)));
        let _ = fs::remove_dir_all(&home);
        let run = RunRecord::start(&home, "check").unwrap();
        run.event(
            "asked",
            &[
                ("url", Json::String("https://ironadamant.com".into())),
                (
                    "expect",
                    Json::String("Web app testing, in plain English.".into()),
                ),
                ("password", Json::String("SuperSecret99!".into())),
            ],
        )
        .unwrap();
        let body = Json::object(vec![
            ("ok", Json::Bool(true)),
            ("reason", Json::String("matched".into())),
            ("url", Json::String("https://ironadamant.com".into())),
            (
                "expect",
                Json::String("Web app testing, in plain English.".into()),
            ),
            ("next", Json::String("".into())),
            ("cookies", Json::String("session=abc".into())),
        ]);
        run.finish(&body).unwrap();
        let summary = read_session(&home, &run.run_id).unwrap();
        assert_eq!(summary.get("ok").and_then(|v| v.as_bool()), Some(true));
        assert_eq!(
            summary.get("reason").and_then(|v| v.as_str()),
            Some("matched")
        );
        let dumped = jsonutil::to_string(&summary);
        assert!(!dumped.contains("SuperSecret99!"));
        assert!(!dumped.contains("session=abc"));
        let trace =
            fs::read_to_string(home.join("traces").join(format!("{}.jsonl", run.run_id))).unwrap();
        assert!(trace.contains("asked"));
        assert!(!trace.contains("SuperSecret99!"));
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn concurrent_appends_stay_one_json_per_line() {
        let home = std::env::temp_dir().join(format!("auspex-conc-{}", state::random_hex(4)));
        let _ = fs::remove_dir_all(&home);
        state::ensure_home(&home).unwrap();
        let barrier = Arc::new(Barrier::new(2));
        let mut handles = Vec::new();
        for n in 0..2 {
            let home = home.clone();
            let barrier = Arc::clone(&barrier);
            handles.push(thread::spawn(move || {
                barrier.wait();
                let run = RunRecord::start(&home, "check").unwrap();
                for i in 0..30 {
                    run.event(
                        "step",
                        &[
                            ("n", Json::Number(i as f64)),
                            ("agent", Json::Number(n as f64)),
                        ],
                    )
                    .unwrap();
                }
                run.run_id
            }));
        }
        let ids: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
        let log = fs::read_to_string(home.join("logs").join("auspex.jsonl")).unwrap();
        for line in log.lines().filter(|l| !l.is_empty()) {
            jsonutil::from_str(line).unwrap_or_else(|err| panic!("torn line {err}: {line}"));
        }
        for id in &ids {
            assert!(log.contains(id), "missing run {id}");
            assert!(home.join("runs").join(id).is_dir());
        }
        let _ = fs::remove_dir_all(&home);
    }
}
