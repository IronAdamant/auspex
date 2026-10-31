//! One page in a local Chrome: navigate, read, screenshot, cookies, one fill, one click.

use std::path::Path;
use std::thread;
use std::time::Duration;

use crate::base64util;
use crate::cdp::Cdp;
use crate::chrome::Chrome;
use crate::jsonutil::{self, Json};
use crate::profile::{OriginBag, Profile, StoragePair, StoredCookie};
use crate::textmatch::is_bot_challenge;

pub struct PageText {
    pub text: String,
    pub title: String,
    pub href: String,
    pub password_field: bool,
    pub ready: bool,
}

pub struct Page {
    /// Held so Chrome is killed when the page is dropped.
    #[allow(dead_code)]
    chrome: Chrome,
    cdp: Cdp,
    session: String,
}

impl Page {
    pub fn open(data_dir: &Path, headed: bool) -> Result<Self, String> {
        let chrome = Chrome::launch(data_dir, headed)?;
        let port = chrome.port;
        let path = chrome.ws_path.clone();
        let mut cdp = Cdp::connect(port, &path)?;
        let created = cdp.call(
            "Target.createTarget",
            Json::object(vec![("url", Json::String("about:blank".into()))]),
            None,
        )?;
        let target = created
            .get("targetId")
            .and_then(|v| v.as_str())
            .ok_or("Chrome did not create a tab")?
            .to_string();
        let attached = cdp.call(
            "Target.attachToTarget",
            Json::object(vec![
                ("targetId", Json::String(target)),
                ("flatten", Json::Bool(true)),
            ]),
            None,
        )?;
        let session = attached
            .get("sessionId")
            .and_then(|v| v.as_str())
            .ok_or("Chrome did not attach to the tab")?
            .to_string();
        let mut page = Page {
            chrome,
            cdp,
            session,
        };
        page.call("Page.enable", Json::Object(vec![]))?;
        page.call("Runtime.enable", Json::Object(vec![]))?;
        page.call("Network.enable", Json::Object(vec![]))?;
        Ok(page)
    }

    pub fn call(&mut self, method: &str, params: Json) -> Result<Json, String> {
        self.cdp.call(method, params, Some(&self.session))
    }

    pub fn goto(&mut self, url: &str) -> Result<(), String> {
        self.call(
            "Page.navigate",
            Json::object(vec![("url", Json::String(url.to_string()))]),
        )?;
        let deadline = std::time::Instant::now() + Duration::from_secs(25);
        while std::time::Instant::now() < deadline {
            let state = self.eval("document.readyState").unwrap_or_default();
            if state == "complete" || state == "interactive" {
                thread::sleep(Duration::from_millis(250));
                return Ok(());
            }
            thread::sleep(Duration::from_millis(150));
        }
        Err("the page did not finish loading".into())
    }

    pub fn read(&mut self) -> Result<PageText, String> {
        let raw = self.eval(&page_text_js())?;
        let json = jsonutil::from_str(&raw).map_err(|_| "page text was not json".to_string())?;
        let text = json
            .get("text")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let title = json
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let href = json
            .get("href")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let password_field = json
            .get("password")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let ready = json.get("ready").and_then(|v| v.as_str()).unwrap_or("") == "complete";
        Ok(PageText {
            text,
            title,
            href,
            password_field,
            ready,
        })
    }

    /// Re-read a short page for up to two seconds. Drawing apps finish late.
    pub fn read_settled(&mut self) -> Result<PageText, String> {
        let first = self.read()?;
        if first.text.trim().chars().count() >= 50 {
            return Ok(first);
        }
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        let mut last = first;
        while std::time::Instant::now() < deadline {
            thread::sleep(Duration::from_millis(200));
            last = self.read()?;
            if last.text.trim().chars().count() >= 50 {
                break;
            }
        }
        Ok(last)
    }

    pub fn screenshot_png(&mut self) -> Result<Vec<u8>, String> {
        let result = self.call(
            "Page.captureScreenshot",
            Json::object(vec![("format", Json::String("png".into()))]),
        )?;
        let data = result
            .get("data")
            .and_then(|v| v.as_str())
            .ok_or("screenshot had no data")?;
        base64util::decode(data)
    }

    pub fn cookies(&mut self) -> Result<Vec<StoredCookie>, String> {
        let result = self
            .cdp
            .call("Network.getAllCookies", Json::Object(vec![]), None)?;
        let list = result
            .get("cookies")
            .and_then(|v| v.as_array())
            .map(|items| items.to_vec())
            .unwrap_or_default();
        Ok(list.iter().filter_map(cookie_from_cdp).collect())
    }

    pub fn set_cookies(&mut self, cookies: &[StoredCookie]) -> Result<(), String> {
        for cookie in cookies {
            let mut params = vec![
                ("name", Json::String(cookie.name.clone())),
                ("value", Json::String(cookie.value.clone())),
                ("domain", Json::String(cookie.domain.clone())),
                (
                    "path",
                    Json::String(if cookie.path.is_empty() {
                        "/".into()
                    } else {
                        cookie.path.clone()
                    }),
                ),
                ("secure", Json::Bool(cookie.secure)),
                ("httpOnly", Json::Bool(cookie.http_only)),
            ];
            if !cookie.same_site.is_empty() {
                params.push(("sameSite", Json::String(cookie.same_site.clone())));
            }
            // Values stay in this process. The call is not logged.
            let _ = self.cdp.call(
                "Network.setCookie",
                Json::Object(
                    params
                        .into_iter()
                        .map(|(k, v)| (k.to_string(), v))
                        .collect(),
                ),
                None,
            );
        }
        Ok(())
    }

    pub fn install_storage(&mut self, profile: &Profile) -> Result<(), String> {
        let source = storage_script(profile);
        if source.is_empty() {
            return Ok(());
        }
        self.call(
            "Page.addScriptToEvaluateOnNewDocument",
            Json::object(vec![("source", Json::String(source))]),
        )?;
        Ok(())
    }

    pub fn capture_storage(&mut self) -> Result<(Vec<OriginBag>, Vec<OriginBag>), String> {
        let raw = self.eval(
            r#"JSON.stringify({origin: location.origin, local: Object.entries(localStorage), session: Object.entries(sessionStorage)})"#,
        )?;
        let json = jsonutil::from_str(&raw).unwrap_or(Json::Null);
        let origin = json
            .get("origin")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let local = entries_from(json.get("local"), &origin);
        let session = entries_from(json.get("session"), &origin);
        Ok((local, session))
    }

    pub fn fill(&mut self, selector: &str, value: &str) -> Result<String, String> {
        if bad_fill_selector(selector) {
            return Err("fill needs a CSS selector. text=, role=, and >> are refused".into());
        }
        let probe = format!(
            "(() => {{ const el = document.querySelector({}); if (!el) return 'missing'; const type = (el.getAttribute('type') || '').toLowerCase(); if (type === 'password') return 'password'; el.focus(); return 'ok'; }})()",
            jsonutil::to_string(&Json::String(selector.to_string()))
        );
        match self.eval(&probe)?.as_str() {
            "missing" => return Err("nothing matched that selector".into()),
            "password" => return Err("password".into()),
            _ => {}
        }
        self.call(
            "Input.insertText",
            Json::object(vec![("text", Json::String(value.to_string()))]),
        )?;
        let read = format!(
            "(() => {{ const el = document.querySelector({}); if (!el) return ''; return el.value || el.innerText || ''; }})()",
            jsonutil::to_string(&Json::String(selector.to_string()))
        );
        self.eval(&read)
    }

    pub fn click(&mut self, selector: &str) -> Result<(), String> {
        let js = if let Some(text) = selector.strip_prefix("text=") {
            format!(
                "(() => {{ const want = {}; const nodes = document.querySelectorAll('button, a, [role=button], input[type=submit], input[type=button]'); for (const el of nodes) {{ const label = (el.innerText || el.value || '').trim(); if (label === want) {{ el.click(); return 'clicked'; }} }} return 'missing'; }})()",
                jsonutil::to_string(&Json::String(text.to_string()))
            )
        } else {
            format!(
                "(() => {{ const el = document.querySelector({}); if (!el) return 'missing'; el.click(); return 'clicked'; }})()",
                jsonutil::to_string(&Json::String(selector.to_string()))
            )
        };
        match self.eval(&js)?.as_str() {
            "clicked" => Ok(()),
            _ => Err("the click target was not found".into()),
        }
    }

    pub fn insert_text(&mut self, text: &str) -> Result<(), String> {
        self.call(
            "Input.insertText",
            Json::object(vec![("text", Json::String(text.to_string()))]),
        )?;
        Ok(())
    }

    pub fn press(&mut self, key: &str) -> Result<(), String> {
        if key == "Clear" {
            self.key_event("keyDown", "a", 65, Some(2))?;
            self.key_event("keyUp", "a", 65, Some(2))?;
            self.key_event("keyDown", "Backspace", 8, None)?;
            self.key_event("keyUp", "Backspace", 8, None)?;
            return Ok(());
        }
        let (name, code) = match key {
            "Enter" => ("Enter", 13),
            "Backspace" => ("Backspace", 8),
            other => (other, 0),
        };
        self.key_event("keyDown", name, code, None)?;
        self.key_event("keyUp", name, code, None)?;
        Ok(())
    }

    fn key_event(
        &mut self,
        kind: &str,
        key: &str,
        vk: i64,
        modifiers: Option<i64>,
    ) -> Result<(), String> {
        let mut params = vec![
            ("type", Json::String(kind.into())),
            ("key", Json::String(key.into())),
            ("windowsVirtualKeyCode", Json::Number(vk as f64)),
            ("nativeVirtualKeyCode", Json::Number(vk as f64)),
        ];
        if let Some(modifiers) = modifiers {
            params.push(("modifiers", Json::Number(modifiers as f64)));
        }
        self.call(
            "Input.dispatchKeyEvent",
            Json::Object(
                params
                    .into_iter()
                    .map(|(k, v)| (k.to_string(), v))
                    .collect(),
            ),
        )?;
        Ok(())
    }

    fn eval(&mut self, expression: &str) -> Result<String, String> {
        let result = self.call(
            "Runtime.evaluate",
            Json::object(vec![
                ("expression", Json::String(expression.to_string())),
                ("returnByValue", Json::Bool(true)),
            ]),
        )?;
        if let Some(exc) = result.get("exceptionDetails") {
            return Err(jsonutil::to_string(exc));
        }
        let value = result.get("result").and_then(|r| r.get("value"));
        match value {
            Some(Json::String(s)) => Ok(s.clone()),
            Some(other) => Ok(jsonutil::to_string(other)),
            None => Ok(String::new()),
        }
    }
}

pub fn bad_fill_selector(selector: &str) -> bool {
    let s = selector.trim();
    s.is_empty()
        || s.starts_with("text=")
        || s.starts_with("role=")
        || s.contains(">>")
        || s.starts_with("xpath=")
}

fn page_text_js() -> String {
    r#"(() => {
  const main = document.querySelector('main') || document.body;
  let text = main ? (main.innerText || '') : '';
  const labels = [];
  document.querySelectorAll('input[type="submit"], input[type="button"], input[type="reset"]').forEach((el) => {
    if (el.value) labels.push(el.value);
  });
  if (labels.length) text += '\n' + labels.join('\n');
  return JSON.stringify({
    text,
    title: document.title || '',
    href: location.href,
    password: !!document.querySelector('input[type="password"]'),
    ready: document.readyState
  });
})()"#
        .to_string()
}

fn cookie_from_cdp(json: &Json) -> Option<StoredCookie> {
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

fn entries_from(value: Option<&Json>, origin: &str) -> Vec<OriginBag> {
    let Some(items) = value.and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    let pairs: Vec<StoragePair> = items
        .iter()
        .filter_map(|row| {
            let pair = row.as_array()?;
            if pair.len() < 2 {
                return None;
            }
            Some(StoragePair {
                name: pair[0].as_str()?.to_string(),
                value: match &pair[1] {
                    Json::String(s) => s.clone(),
                    other => jsonutil::to_string(other),
                },
            })
        })
        .collect();
    if pairs.is_empty() || origin.is_empty() {
        return Vec::new();
    }
    vec![OriginBag {
        origin: origin.to_string(),
        items: pairs,
    }]
}

fn storage_script(profile: &Profile) -> String {
    let mut lines = Vec::new();
    push_storage(&mut lines, "localStorage", &profile.local_storage);
    push_storage(&mut lines, "sessionStorage", &profile.session_storage);
    lines.join("\n")
}

fn push_storage(lines: &mut Vec<String>, store: &str, bags: &[OriginBag]) {
    for bag in bags {
        for item in &bag.items {
            let name = jsonutil::to_string(&Json::String(item.name.clone()));
            let value = jsonutil::to_string(&Json::String(item.value.clone()));
            lines.push(format!(
                "try{{{store}.setItem({name},{value})}}catch(e){{}}"
            ));
        }
    }
}

pub fn looks_like_bot(text: &PageText) -> bool {
    is_bot_challenge(&text.title, &text.text)
}
