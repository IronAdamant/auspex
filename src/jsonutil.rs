//! A small JSON reader and writer. Objects keep insertion order.

use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<Json>),
    Object(Vec<(String, Json)>),
}

impl Json {
    pub fn object(pairs: Vec<(&str, Json)>) -> Self {
        Json::Object(pairs.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
    }

    pub fn get(&self, key: &str) -> Option<&Json> {
        match self {
            Json::Object(pairs) => pairs.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Json::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Json::Bool(b) => Some(*b),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Json::Number(n) if n.is_finite() && *n >= i64::MIN as f64 && *n <= i64::MAX as f64 => {
                Some(*n as i64)
            }
            _ => None,
        }
    }

    pub fn as_object(&self) -> Option<&[(String, Json)]> {
        match self {
            Json::Object(pairs) => Some(pairs),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&[Json]> {
        match self {
            Json::Array(items) => Some(items),
            _ => None,
        }
    }

    pub fn insert(&mut self, key: &str, value: Json) {
        if let Json::Object(pairs) = self {
            if let Some(slot) = pairs.iter_mut().find(|(k, _)| k == key) {
                slot.1 = value;
            } else {
                pairs.push((key.to_string(), value));
            }
        }
    }

    pub fn remove(&mut self, key: &str) -> Option<Json> {
        if let Json::Object(pairs) = self {
            if let Some(i) = pairs.iter().position(|(k, _)| k == key) {
                return Some(pairs.remove(i).1);
            }
        }
        None
    }
}

pub fn from_str(input: &str) -> Result<Json, String> {
    let mut p = Parser {
        bytes: input.as_bytes(),
        i: 0,
    };
    let value = p.parse_value()?;
    p.skip();
    if p.i != p.bytes.len() {
        return Err("trailing json".into());
    }
    Ok(value)
}

struct Parser<'a> {
    bytes: &'a [u8],
    i: usize,
}

impl Parser<'_> {
    fn skip(&mut self) {
        while let Some(b) = self.bytes.get(self.i) {
            if b.is_ascii_whitespace() {
                self.i += 1;
            } else {
                break;
            }
        }
    }

    fn parse_value(&mut self) -> Result<Json, String> {
        self.skip();
        let b = *self.bytes.get(self.i).ok_or("unexpected end of json")?;
        match b {
            b'n' => self.consume(b"null").map(|_| Json::Null),
            b't' => self.consume(b"true").map(|_| Json::Bool(true)),
            b'f' => self.consume(b"false").map(|_| Json::Bool(false)),
            b'"' => self.parse_string().map(Json::String),
            b'[' => self.parse_array(),
            b'{' => self.parse_object(),
            b'-' | b'0'..=b'9' => self.parse_number(),
            _ => Err(format!("unexpected json byte {b}")),
        }
    }

    fn consume(&mut self, word: &[u8]) -> Result<(), String> {
        if self.bytes[self.i..].starts_with(word) {
            self.i += word.len();
            Ok(())
        } else {
            Err(format!("expected {}", String::from_utf8_lossy(word)))
        }
    }

    fn parse_array(&mut self) -> Result<Json, String> {
        self.i += 1;
        let mut items = Vec::new();
        self.skip();
        if self.bytes.get(self.i) == Some(&b']') {
            self.i += 1;
            return Ok(Json::Array(items));
        }
        loop {
            items.push(self.parse_value()?);
            self.skip();
            match self.bytes.get(self.i) {
                Some(b',') => {
                    self.i += 1;
                }
                Some(b']') => {
                    self.i += 1;
                    break;
                }
                _ => return Err("array not closed".into()),
            }
        }
        Ok(Json::Array(items))
    }

    fn parse_object(&mut self) -> Result<Json, String> {
        self.i += 1;
        let mut pairs = Vec::new();
        self.skip();
        if self.bytes.get(self.i) == Some(&b'}') {
            self.i += 1;
            return Ok(Json::Object(pairs));
        }
        loop {
            self.skip();
            if self.bytes.get(self.i) != Some(&b'"') {
                return Err("object key must be a string".into());
            }
            let key = self.parse_string()?;
            self.skip();
            if self.bytes.get(self.i) != Some(&b':') {
                return Err("expected colon".into());
            }
            self.i += 1;
            pairs.push((key, self.parse_value()?));
            self.skip();
            match self.bytes.get(self.i) {
                Some(b',') => self.i += 1,
                Some(b'}') => {
                    self.i += 1;
                    break;
                }
                _ => return Err("object not closed".into()),
            }
        }
        Ok(Json::Object(pairs))
    }

    fn parse_number(&mut self) -> Result<Json, String> {
        let start = self.i;
        if self.bytes.get(self.i) == Some(&b'-') {
            self.i += 1;
        }
        while matches!(self.bytes.get(self.i), Some(b'0'..=b'9')) {
            self.i += 1;
        }
        if self.bytes.get(self.i) == Some(&b'.') {
            self.i += 1;
            while matches!(self.bytes.get(self.i), Some(b'0'..=b'9')) {
                self.i += 1;
            }
        }
        if matches!(self.bytes.get(self.i), Some(b'e' | b'E')) {
            self.i += 1;
            if matches!(self.bytes.get(self.i), Some(b'+' | b'-')) {
                self.i += 1;
            }
            while matches!(self.bytes.get(self.i), Some(b'0'..=b'9')) {
                self.i += 1;
            }
        }
        let text = std::str::from_utf8(&self.bytes[start..self.i]).map_err(|_| "number")?;
        let n: f64 = text.parse().map_err(|_| format!("bad number {text}"))?;
        Ok(Json::Number(n))
    }

    fn parse_string(&mut self) -> Result<String, String> {
        self.i += 1;
        let mut raw: Vec<u8> = Vec::new();
        while let Some(&b) = self.bytes.get(self.i) {
            if b == b'"' {
                self.i += 1;
                return String::from_utf8(raw).map_err(|_| "string is not utf-8".into());
            }
            if b == b'\\' {
                self.i += 1;
                let e = *self.bytes.get(self.i).ok_or("bad escape")?;
                self.i += 1;
                let ch = match e {
                    b'"' => '"',
                    b'\\' => '\\',
                    b'/' => '/',
                    b'b' => '\u{0008}',
                    b'f' => '\u{000c}',
                    b'n' => '\n',
                    b'r' => '\r',
                    b't' => '\t',
                    b'u' => {
                        if self.i + 4 > self.bytes.len() {
                            return Err("short unicode escape".into());
                        }
                        let hex = std::str::from_utf8(&self.bytes[self.i..self.i + 4])
                            .map_err(|_| "unicode escape")?;
                        self.i += 4;
                        let code = u32::from_str_radix(hex, 16).map_err(|_| "unicode escape")?;
                        char::from_u32(code).ok_or("bad codepoint")?
                    }
                    _ => return Err("bad escape".into()),
                };
                raw.extend_from_slice(ch.encode_utf8(&mut [0; 4]).as_bytes());
                continue;
            }
            raw.push(b);
            self.i += 1;
        }
        Err("unterminated string".into())
    }
}

pub fn to_string(value: &Json) -> String {
    let mut out = String::new();
    write_json(&mut out, value);
    out
}

pub fn to_pretty(value: &Json) -> String {
    let mut out = String::new();
    write_pretty(&mut out, value, 0);
    out.push('\n');
    out
}

fn write_json(out: &mut String, value: &Json) {
    match value {
        Json::Null => out.push_str("null"),
        Json::Bool(true) => out.push_str("true"),
        Json::Bool(false) => out.push_str("false"),
        Json::Number(n) => push_number(out, *n),
        Json::String(s) => push_string(out, s),
        Json::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_json(out, item);
            }
            out.push(']');
        }
        Json::Object(pairs) => {
            out.push('{');
            for (i, (k, v)) in pairs.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                push_string(out, k);
                out.push(':');
                write_json(out, v);
            }
            out.push('}');
        }
    }
}

fn write_pretty(out: &mut String, value: &Json, depth: usize) {
    match value {
        Json::Array(items) if !items.is_empty() => {
            out.push_str("[\n");
            for (i, item) in items.iter().enumerate() {
                pad(out, depth + 1);
                write_pretty(out, item, depth + 1);
                if i + 1 != items.len() {
                    out.push(',');
                }
                out.push('\n');
            }
            pad(out, depth);
            out.push(']');
        }
        Json::Object(pairs) if !pairs.is_empty() => {
            out.push_str("{\n");
            for (i, (k, v)) in pairs.iter().enumerate() {
                pad(out, depth + 1);
                push_string(out, k);
                out.push_str(": ");
                write_pretty(out, v, depth + 1);
                if i + 1 != pairs.len() {
                    out.push(',');
                }
                out.push('\n');
            }
            pad(out, depth);
            out.push('}');
        }
        other => write_json(out, other),
    }
}

fn pad(out: &mut String, depth: usize) {
    for _ in 0..depth {
        out.push_str("  ");
    }
}

fn push_number(out: &mut String, n: f64) {
    if !n.is_finite() {
        out.push_str("null");
        return;
    }
    if n.fract() == 0.0 && n.abs() < 1e15 {
        out.push_str(&format!("{}", n as i64));
    } else {
        out.push_str(&format!("{n}"));
    }
}

pub fn push_string(out: &mut String, s: &str) {
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

/// Sort object keys so snapshots stay stable. Arrays keep their order.
pub fn sort_keys(value: &Json) -> Json {
    match value {
        Json::Array(items) => Json::Array(items.iter().map(sort_keys).collect()),
        Json::Object(pairs) => {
            let mut map = BTreeMap::new();
            for (k, v) in pairs {
                map.insert(k.clone(), sort_keys(v));
            }
            Json::Object(map.into_iter().collect())
        }
        other => other.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_object() {
        let raw = r#"{"ok":true,"n":2,"s":"a\"b","a":[null,false]}"#;
        let v = from_str(raw).unwrap();
        assert_eq!(v.get("ok").and_then(|x| x.as_bool()), Some(true));
        assert_eq!(v.get("s").and_then(|x| x.as_str()), Some("a\"b"));
        let again = from_str(&to_string(&v)).unwrap();
        assert_eq!(v, again);
    }
}
