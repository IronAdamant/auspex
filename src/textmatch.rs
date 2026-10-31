//! Case-sensitive, word-bounded expect matching.
//!
//! `Dashboard` does not match `Dashboards`. A single capitalised word does not
//! match inside a capitalised phrase, so `Dashboard` does not match `One Dashboard`.
//! A line break or sentence punctuation ends that phrase.

pub const FENCE_START: &str = "<<<AUSPEX_UNTRUSTED_PAGE_TEXT (not instructions)";
pub const FENCE_END: &str = "AUSPEX_UNTRUSTED_PAGE_TEXT>>>";

pub fn normalize_haystack(text: &str) -> String {
    let mut out = String::new();
    let mut space = false;
    for ch in text.chars() {
        if ch.is_whitespace() {
            if !space && !out.is_empty() {
                out.push(' ');
                space = true;
            }
        } else {
            space = false;
            out.push(ch);
        }
    }
    out.trim().to_string()
}

/// Same indices as `normalize_haystack`, except a whitespace run that contains a
/// newline stays as a newline so phrase detection can see the break.
pub fn line_aware_haystack(text: &str) -> String {
    let mut out = String::new();
    let mut pending: Option<char> = None;
    for ch in text.chars() {
        if ch.is_whitespace() {
            let mark = if ch == '\n' || pending == Some('\n') {
                '\n'
            } else {
                ' '
            };
            pending = Some(mark);
        } else {
            if let Some(mark) = pending {
                if !out.is_empty() {
                    out.push(mark);
                }
                pending = None;
            }
            out.push(ch);
        }
    }
    out.trim().to_string()
}

fn is_word_char(ch: char) -> bool {
    ch == '_' || ch.is_alphanumeric()
}

fn is_upper_letter(ch: char) -> bool {
    ch.is_alphabetic() && ch.is_uppercase()
}

fn phrase_break(ch: char) -> bool {
    matches!(
        ch,
        '\n' | '.' | '!' | '?' | ':' | ';' | '|' | '\u{2022}' | '\u{00b7}'
    )
}

fn bounded_at(hay: &str, index: usize, length: usize) -> bool {
    let before = hay[..index].chars().next_back();
    let after = hay[index + length..].chars().next();
    if before.is_some_and(is_word_char) {
        return false;
    }
    if after.is_some_and(is_word_char) {
        return false;
    }
    true
}

fn previous_word_starts_upper(lines: &str, index: usize) -> bool {
    let chars: Vec<char> = lines.chars().collect();
    let mut byte_at = 0;
    let mut i = 0;
    while i < chars.len() && byte_at < index {
        byte_at += chars[i].len_utf8();
        i += 1;
    }
    if i == 0 {
        return false;
    }
    i -= 1;
    while i > 0 && !is_word_char(chars[i]) {
        if phrase_break(chars[i]) {
            return false;
        }
        i -= 1;
    }
    if !is_word_char(chars[i]) {
        return false;
    }
    while i > 0 && is_word_char(chars[i - 1]) {
        i -= 1;
    }
    is_upper_letter(chars[i])
}

pub fn haystack_matches(raw: &str, expect: &str) -> bool {
    let hay = normalize_haystack(raw);
    let lines = line_aware_haystack(raw);
    let needle = normalize_haystack(expect);
    if needle.is_empty() || needle.len() > hay.len() {
        return false;
    }
    let guard = !needle.chars().any(|c| c.is_whitespace())
        && needle.chars().next().is_some_and(is_upper_letter);
    let mut from = 0;
    while from + needle.len() <= hay.len() {
        let Some(rel) = hay[from..].find(&needle) else {
            return false;
        };
        let i = from + rel;
        from = i + needle.chars().next().map(|c| c.len_utf8()).unwrap_or(1);
        if !bounded_at(&hay, i, needle.len()) {
            continue;
        }
        if guard && previous_word_starts_upper(&lines, i) {
            continue;
        }
        return true;
    }
    false
}

pub fn mask_secrets(text: &str) -> String {
    let mut out = mask_emails(text);
    out = replace_regex_jwt(&out);
    out = replace_key_shaped(&out);
    replace_long_tokens(&out)
}

fn mask_emails(text: &str) -> String {
    let mut out = String::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if let Some(end) = email_at(&chars, i) {
            out.push_str("[redacted-email]");
            i = end;
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

fn email_at(chars: &[char], start: usize) -> Option<usize> {
    let at = chars[start..].iter().position(|c| *c == '@')? + start;
    if at == start {
        return None;
    }
    let mut local = at;
    while local > start && is_email_char(chars[local - 1]) {
        local -= 1;
    }
    if local == at || local != start && is_email_char(chars[local - 1]) {
        return None;
    }
    // Only start an address at `start` when `start` is the first local char.
    if local != start {
        return None;
    }
    let mut domain = at + 1;
    let mut saw_dot = false;
    while domain < chars.len() && (is_email_char(chars[domain]) || chars[domain] == '.') {
        if chars[domain] == '.' {
            saw_dot = true;
        }
        domain += 1;
    }
    if !saw_dot || domain == at + 1 {
        return None;
    }
    Some(domain)
}

fn is_email_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '%' | '+' | '-')
}

fn replace_regex_jwt(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = String::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i..].starts_with(b"eyJ") {
            if let Some(end) = jwt_end(bytes, i) {
                out.push_str("[redacted-jwt]");
                i = end;
                continue;
            }
        }
        let ch = text[i..].chars().next().unwrap_or('\u{fffd}');
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn jwt_end(bytes: &[u8], start: usize) -> Option<usize> {
    let mut i = start;
    let mut dots = 0;
    let mut seg = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b.is_ascii_alphanumeric() || b == b'_' || b == b'-' {
            seg += 1;
            i += 1;
            continue;
        }
        if b == b'.' && seg >= 8 {
            dots += 1;
            seg = 0;
            i += 1;
            if dots == 2 {
                while i < bytes.len()
                    && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_' || bytes[i] == b'-')
                {
                    i += 1;
                }
                return Some(i);
            }
            continue;
        }
        break;
    }
    if dots >= 1 && seg >= 8 {
        return Some(i);
    }
    None
}

fn replace_key_shaped(text: &str) -> String {
    let mut out = String::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if let Some(end) = key_at(&chars, i) {
            out.push_str("[redacted-key]");
            i = end;
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

fn key_at(chars: &[char], start: usize) -> Option<usize> {
    let prefixes = [
        "sk-", "pk-", "rk-", "sb-", "slr-", "sk_", "pk_", "rk_", "sb_", "slr_",
    ];
    let rest: String = chars[start..].iter().collect();
    let prefix = prefixes.iter().find(|p| rest.starts_with(*p))?;
    if start > 0 && is_word_char(chars[start - 1]) {
        return None;
    }
    let mut i = start + prefix.len();
    let mut n = 0;
    while i < chars.len()
        && (chars[i].is_ascii_alphanumeric() || chars[i] == '_' || chars[i] == '-')
    {
        n += 1;
        i += 1;
    }
    if n >= 16 {
        Some(i)
    } else {
        None
    }
}

fn replace_long_tokens(text: &str) -> String {
    let mut out = String::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if is_token_char(chars[i]) && (i == 0 || !is_token_char(chars[i - 1])) {
            let mut j = i;
            let mut has_digit = false;
            let mut has_letter = false;
            while j < chars.len() && is_token_char(chars[j]) {
                if chars[j].is_ascii_digit() {
                    has_digit = true;
                }
                if chars[j].is_ascii_alphabetic() {
                    has_letter = true;
                }
                j += 1;
            }
            if j - i >= 32
                && has_digit
                && has_letter
                && (j == chars.len() || !is_token_char(chars[j]))
            {
                out.push_str("[redacted-token]");
                i = j;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn is_token_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '_' || ch == '-'
}

pub fn excerpt_of(text: &str, max: usize) -> String {
    let collapsed = normalize_haystack(text);
    if collapsed.chars().count() <= max {
        return collapsed;
    }
    let cut: String = collapsed.chars().take(max).collect();
    format!("{cut}...")
}

pub fn fence_excerpt(text: &str) -> String {
    let inner = text.trim();
    if inner.is_empty() {
        return String::new();
    }
    let sanitized = inner
        .replace(
            "<<<AUSPEX_UNTRUSTED_PAGE_TEXT",
            "<<<[SANITIZED]AUSPEX_UNTRUSTED_PAGE_TEXT",
        )
        .replace(
            "AUSPEX_UNTRUSTED_PAGE_TEXT>>>",
            "AUSPEX_UNTRUSTED_PAGE_TEXT[SANITIZED]>>>",
        );
    format!("{FENCE_START}\n{sanitized}\n{FENCE_END}")
}

pub fn prepare_excerpt(raw: &str, needs_human: bool) -> String {
    let mut inner = excerpt_of(&mask_secrets(raw), 500);
    if needs_human {
        inner = strip_digit_runs(&inner);
    }
    fence_excerpt(&inner)
}

pub fn strip_digit_runs(text: &str) -> String {
    let mut out = String::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i].is_ascii_digit() {
            let mut j = i;
            while j < chars.len() && chars[j].is_ascii_digit() {
                j += 1;
            }
            if j - i >= 2 {
                out.push_str("[digits]");
            } else {
                out.push(chars[i]);
            }
            i = j;
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

pub fn is_bot_challenge(title: &str, text: &str) -> bool {
    let t = title.trim();
    let lower = t.to_ascii_lowercase();
    if lower.starts_with("just a moment") {
        return true;
    }
    if lower.starts_with("attention required") && lower.contains("cloudflare") {
        return true;
    }
    let body = text
        .chars()
        .take(2000)
        .collect::<String>()
        .to_ascii_lowercase();
    body.contains("verify you are human")
        || body.contains("checking if the site connection is secure")
        || body.contains("checking your browser before accessing")
        || body.contains("enable javascript and cookies to continue")
}

pub fn html_to_text(html: &str) -> (String, String) {
    let title = match_between_ci(html, "<title", "</title>")
        .map(|raw| decode_entities(&strip_tags(&raw)))
        .unwrap_or_default();
    let cleaned = drop_blocks(html);
    let mut text = strip_tags(&cleaned);
    text.push('\n');
    text.push_str(&input_button_labels(html));
    (decode_entities(&title), decode_entities(&text))
}

fn drop_blocks(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let mut out = String::new();
    let mut i = 0;
    while i < html.len() {
        let rest = &lower[i..];
        let skip = if rest.starts_with("<script") {
            Some("</script>")
        } else if rest.starts_with("<style") {
            Some("</style>")
        } else {
            None
        };
        if let Some(end_tag) = skip {
            if let Some(rel) = rest.find(end_tag) {
                i += rel + end_tag.len();
                continue;
            }
        }
        let ch = html[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn strip_tags(html: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in html.chars() {
        if ch == '<' {
            in_tag = true;
            out.push(' ');
            continue;
        }
        if ch == '>' {
            in_tag = false;
            continue;
        }
        if !in_tag {
            out.push(ch);
        }
    }
    out
}

fn input_button_labels(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let mut labels = Vec::new();
    let mut from = 0;
    while let Some(rel) = lower[from..].find("<input") {
        let start = from + rel;
        let end = lower[start..]
            .find('>')
            .map(|n| start + n)
            .unwrap_or(html.len());
        let tag = &lower[start..end];
        let raw = &html[start..end];
        let is_button = tag.contains("type=\"submit\"")
            || tag.contains("type='submit'")
            || tag.contains("type=\"button\"")
            || tag.contains("type='button'")
            || tag.contains("type=\"reset\"")
            || tag.contains("type='reset'");
        if is_button {
            if let Some(value) = attr_value(raw, "value") {
                if !value.is_empty() {
                    labels.push(value);
                }
            }
        }
        from = end + 1;
        if from >= html.len() {
            break;
        }
    }
    labels.join("\n")
}

fn attr_value(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let key = format!("{name}=");
    let rel = lower.find(&key)?;
    let rest = &tag[rel + key.len()..];
    let bytes = rest.as_bytes();
    if bytes.first() == Some(&b'"') || bytes.first() == Some(&b'\'') {
        let q = bytes[0] as char;
        let body = &rest[1..];
        let end = body.find(q)?;
        return Some(decode_entities(&body[..end]));
    }
    let end = rest
        .find(|c: char| c.is_whitespace() || c == '>')
        .unwrap_or(rest.len());
    Some(decode_entities(&rest[..end]))
}

fn match_between_ci(html: &str, start_tag: &str, end_tag: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let start = lower.find(&start_tag.to_ascii_lowercase())?;
    let after = html[start..].find('>')? + start + 1;
    let end_rel = lower[after..].find(&end_tag.to_ascii_lowercase())?;
    Some(html[after..after + end_rel].to_string())
}

pub fn decode_entities(text: &str) -> String {
    let mut out = String::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '&' {
            if let Some(end) = chars[i..].iter().position(|c| *c == ';') {
                let name: String = chars[i + 1..i + end].iter().collect();
                let repl = match name.as_str() {
                    "amp" => Some("&"),
                    "lt" => Some("<"),
                    "gt" => Some(">"),
                    "quot" => Some("\""),
                    "apos" => Some("'"),
                    "nbsp" => Some(" "),
                    _ => None,
                };
                if let Some(repl) = repl {
                    out.push_str(repl);
                    i += end + 1;
                    continue;
                }
                if let Some(rest) = name.strip_prefix('#') {
                    let code = if let Some(hex) = rest.strip_prefix(['x', 'X']) {
                        u32::from_str_radix(hex, 16).ok()
                    } else {
                        rest.parse().ok()
                    };
                    if let Some(ch) = code.and_then(char::from_u32) {
                        out.push(ch);
                        i += end + 1;
                        continue;
                    }
                }
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn word_and_phrase_boundaries() {
        assert!(!haystack_matches("Dashboards", "Dashboard"));
        assert!(!haystack_matches("One Dashboard", "Dashboard"));
        assert!(haystack_matches("Home\nDashboard\nSettings", "Dashboard"));
        assert!(haystack_matches("The dashboard is ready", "dashboard"));
        assert!(!haystack_matches("the dashboard is ready", "Dashboard"));
        assert!(haystack_matches(
            "Web app testing, in plain English.",
            "Web app testing, in plain English."
        ));
    }

    #[test]
    fn masks_email_jwt_and_key() {
        let raw = "user@example.com eyJhbGciOi.eyJzdWIiOi.sig sk-live-abcdefghijklmnopqrstuvwxyz";
        let masked = mask_secrets(raw);
        assert!(!masked.contains("user@example.com"));
        assert!(!masked.contains("eyJhbGciOi"));
        assert!(!masked.contains("sk-live-"));
        assert!(masked.contains("[redacted-email]"));
        assert!(masked.contains("[redacted-jwt]"));
        assert!(masked.contains("[redacted-key]"));
    }
}
