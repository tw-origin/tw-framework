/// String, number, and regex reading — ported from the TS lexer/strings.ts.
/// Handles all JS escape sequences, template literals, hex/octal/binary numbers.

#[derive(Debug, Clone)]
pub struct StringReadResult {
    pub value: String,
    pub raw: String,
    pub end: usize,
    pub has_newline: bool,
    pub is_template: bool,
    pub expressions: Vec<TemplateExpression>,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TemplateExpression {
    pub start: usize,
    pub end: usize,
    pub expression: String,
}

#[derive(Debug, Clone)]
pub struct NumberReadResult {
    pub value: String,
    pub raw: String,
    pub end: usize,
    pub is_float: bool,
    pub is_big_int: bool,
    pub radix: u32,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RegexReadResult {
    pub pattern: String,
    pub flags: String,
    pub raw: String,
    pub end: usize,
    pub error: Option<String>,
}

/// Read a string literal starting at `source[start]`, where `source[start]`
/// is the opening quote character (`"`, `'`, or backtick).
pub fn read_string(source: &[char], start: usize, quote: char) -> StringReadResult {
    if source[start] != quote {
        return StringReadResult {
            value: String::new(),
            raw: String::new(),
            end: start,
            has_newline: false,
            is_template: quote == '`',
            expressions: Vec::new(),
            error: Some(format!("Expected {}", quote)),
        };
    }

    let mut i = start + 1;
    let mut value = String::new();
    let mut has_newline = false;
    let mut expressions = Vec::new();
    let is_template = quote == '`';

    while i < source.len() {
        let ch = source[i];

        // Closing quote
        if ch == quote {
            // For template literals, check it's not escaped
            if !is_template || (i > 0 && source[i - 1] != '\\') {
                let raw: String = source[start..=i].iter().collect();
                return StringReadResult {
                    value,
                    raw,
                    end: i + 1,
                    has_newline,
                    is_template,
                    expressions,
                    error: None,
                };
            }
        }

        // Template literal expression ${...}
        if is_template && ch == '$' && i + 1 < source.len() && source[i + 1] == '{' {
            let expr_start = i + 2;
            let (text, end) = read_template_expression(source, expr_start);
            if end == usize::MAX {
                let raw: String = source[start..i].iter().collect();
                return StringReadResult {
                    value,
                    raw,
                    end: source.len(),
                    has_newline,
                    is_template,
                    expressions,
                    error: Some("Unclosed template expression".into()),
                };
            }
            expressions.push(TemplateExpression {
                start: expr_start,
                end,
                expression: text,
            });
            value.push('\x00');
            i = end + 1;
            continue;
        }

        // Escape sequences
        if ch == '\\' {
            let (escaped_val, end, err) = read_escape(source, i);
            if let Some(e) = err {
                let raw: String = source[start..i].iter().collect();
                return StringReadResult {
                    value,
                    raw,
                    end: i,
                    has_newline,
                    is_template,
                    expressions,
                    error: Some(e),
                };
            }
            value.push_str(&escaped_val);
            if is_line_terminator_char(escaped_val.chars().next().unwrap_or('\0')) {
                has_newline = true;
            }
            i = end;
            continue;
        }

        // Line terminators
        if is_line_terminator(ch) {
            if !is_template {
                let raw: String = source[start..i].iter().collect();
                return StringReadResult {
                    value,
                    raw,
                    end: i,
                    has_newline: true,
                    is_template,
                    expressions,
                    error: Some("Unterminated string literal".into()),
                };
            }
            has_newline = true;
        }

        value.push(ch);
        i += 1;
    }

    let raw: String = source[start..].iter().collect();
    StringReadResult {
        value,
        raw,
        end: source.len(),
        has_newline,
        is_template,
        expressions,
        error: Some("Unterminated string literal".into()),
    }
}

fn read_template_expression(source: &[char], start: usize) -> (String, usize) {
    let mut i = start;
    let mut depth = 1;
    let mut text = String::new();

    while i < source.len() {
        let ch = source[i];

        if ch == '{' {
            depth += 1;
        } else if ch == '}' {
            depth -= 1;
            if depth == 0 {
                return (text, i);
            }
        }

        // Skip nested strings
        if ch == '"' || ch == '\'' || ch == '`' {
            let str_result = read_string(source, i, ch);
            let raw_chars: String = str_result.raw.chars().collect();
            text.push_str(&raw_chars);
            i = str_result.end;
            continue;
        }

        text.push(ch);
        i += 1;
    }

    (text, usize::MAX)
}

fn read_escape(source: &[char], start: usize) -> (String, usize, Option<String>) {
    // start is at '\', next char determines escape type
    if start + 1 >= source.len() {
        return ("\\".into(), start + 1, Some("Unterminated escape sequence".into()));
    }

    let ch = source[start + 1];

    // Simple escapes
    let simple = match ch {
        'n' => Some('\n'),
        'r' => Some('\r'),
        't' => Some('\t'),
        'b' => Some('\u{0008}'),
        'f' => Some('\u{000C}'),
        'v' => Some('\u{000B}'),
        '0' => Some('\0'),
        '\\' => Some('\\'),
        '\'' => Some('\''),
        '"' => Some('"'),
        '`' => Some('`'),
        '$' => Some('$'),
        '/' => Some('/'),
        _ => None,
    };

    if let Some(c) = simple {
        return (c.to_string(), start + 2, None);
    }

    // Unicode escape \uXXXX or \u{XXXXX}
    if ch == 'u' {
        if start + 2 < source.len() && source[start + 2] == '{' {
            // \u{XXXXX} — code point escape
            let mut end = start + 3;
            while end < source.len() && source[end] != '}' {
                end += 1;
            }
            if end >= source.len() {
                return (String::new(), start + 2, Some("Unterminated Unicode code point escape".into()));
            }
            let hex: String = source[start + 3..end].iter().collect();
            match u32::from_str_radix(&hex, 16) {
                Ok(cp) if cp <= 0x10FFFF => {
                    if let Some(c) = char::from_u32(cp) {
                        return (c.to_string(), end + 1, None);
                    }
                }
                _ => {}
            }
            return (String::new(), end, Some("Invalid Unicode code point".into()));
        }

        // \uXXXX — fixed-length
        if start + 6 <= source.len() {
            let hex: String = source[start + 2..start + 6].iter().collect();
            if hex.chars().all(|c| c.is_ascii_hexdigit()) {
                if let Ok(cp) = u32::from_str_radix(&hex, 16) {
                    if let Some(c) = char::from_u32(cp) {
                        return (c.to_string(), start + 6, None);
                    }
                }
            }
        }
        return (String::new(), start + 2, Some("Invalid Unicode escape sequence".into()));
    }

    // Hex escape \xXX
    if ch == 'x' {
        if start + 4 <= source.len() {
            let hex: String = source[start + 2..start + 4].iter().collect();
            if hex.chars().all(|c| c.is_ascii_hexdigit()) {
                if let Ok(cp) = u32::from_str_radix(&hex, 16) {
                    if let Some(c) = char::from_u32(cp) {
                        return (c.to_string(), start + 4, None);
                    }
                }
            }
        }
        return (String::new(), start + 2, Some("Invalid hex escape sequence".into()));
    }

    // Octal escape
    if ch.is_ascii_digit() && ch >= '0' && ch <= '7' {
        let mut octal = String::new();
        octal.push(ch);
        let mut j = start + 2;
        while j < source.len() && source[j] >= '0' && source[j] <= '7' && octal.len() < 3 {
            octal.push(source[j]);
            j += 1;
        }
        if let Ok(cp) = u32::from_str_radix(&octal, 8) {
            if cp <= 255 {
                if let Some(c) = char::from_u32(cp) {
                    return (c.to_string(), j, None);
                }
            }
        }
        return (String::new(), j, Some("Octal escape out of range".into()));
    }

    // Line continuation (backslash + line terminator)
    if is_line_terminator(ch) {
        return (String::new(), start + 2, None);
    }

    // Unknown escape — keep character as-is
    (ch.to_string(), start + 2, None)
}

fn is_line_terminator(ch: char) -> bool {
    ch == '\n' || ch == '\r' || ch == '\u{2028}' || ch == '\u{2029}'
}

fn is_line_terminator_char(ch: char) -> bool {
    is_line_terminator(ch)
}

pub fn is_string_delimiter(ch: char) -> bool {
    ch == '"' || ch == '\'' || ch == '`'
}

/// Read a numeric literal starting at source[start].
pub fn read_number(source: &[char], start: usize) -> NumberReadResult {
    let mut i = start;
    let mut value = String::new();
    let mut is_float = false;
    let mut is_big_int = false;
    let mut radix: u32 = 10;

    // Check for hex, octal, binary
    if source[i] == '0' && i + 1 < source.len() {
        let next = source[i + 1].to_ascii_lowercase();
        match next {
            'x' => {
                radix = 16;
                i += 2;
                while i < source.len() && (source[i].is_ascii_hexdigit() || source[i] == '_') {
                    value.push(source[i]);
                    i += 1;
                }
                let raw: String = source[start..i].iter().collect();
                return NumberReadResult { value, raw, end: i, is_float: false, is_big_int, radix, error: None };
            }
            'o' => {
                radix = 8;
                i += 2;
                while i < source.len() && (source[i] >= '0' && source[i] <= '7' || source[i] == '_') {
                    value.push(source[i]);
                    i += 1;
                }
                let raw: String = source[start..i].iter().collect();
                return NumberReadResult { value, raw, end: i, is_float: false, is_big_int, radix, error: None };
            }
            'b' => {
                radix = 2;
                i += 2;
                while i < source.len() && (source[i] == '0' || source[i] == '1' || source[i] == '_') {
                    value.push(source[i]);
                    i += 1;
                }
                let raw: String = source[start..i].iter().collect();
                return NumberReadResult { value, raw, end: i, is_float: false, is_big_int, radix, error: None };
            }
            _ => {}
        }
    }

    // Decimal integer part
    while i < source.len() && (source[i].is_ascii_digit() || source[i] == '_') {
        value.push(source[i]);
        i += 1;
    }

    // Fractional part
    if i < source.len() && source[i] == '.' && i + 1 < source.len() && source[i + 1].is_ascii_digit() {
        is_float = true;
        value.push('.');
        i += 1;
        while i < source.len() && (source[i].is_ascii_digit() || source[i] == '_') {
            value.push(source[i]);
            i += 1;
        }
    }

    // Exponent
    if i < source.len() && (source[i] == 'e' || source[i] == 'E') {
        is_float = true;
        value.push(source[i]);
        i += 1;
        if i < source.len() && (source[i] == '+' || source[i] == '-') {
            value.push(source[i]);
            i += 1;
        }
        while i < source.len() && (source[i].is_ascii_digit() || source[i] == '_') {
            value.push(source[i]);
            i += 1;
        }
    }

    // BigInt suffix
    if i < source.len() && source[i] == 'n' {
        is_big_int = true;
        i += 1;
    }

    let raw: String = source[start..i].iter().collect();
    NumberReadResult { value, raw, end: i, is_float, is_big_int, radix, error: None }
}

/// Read a regex literal /pattern/flags starting at source[start].
pub fn read_regex(source: &[char], start: usize) -> RegexReadResult {
    if source[start] != '/' {
        return RegexReadResult {
            pattern: String::new(),
            flags: String::new(),
            raw: String::new(),
            end: start,
            error: Some("Expected /".into()),
        };
    }

    let mut i = start + 1;
    let mut pattern = String::new();
    let mut in_class = false;

    while i < source.len() {
        let ch = source[i];

        if ch == '\\' {
            pattern.push(ch);
            if i + 1 < source.len() {
                pattern.push(source[i + 1]);
                i += 2;
                continue;
            }
        }

        if ch == '[' { in_class = true; }
        if ch == ']' { in_class = false; }

        if ch == '/' && !in_class {
            i += 1;
            let mut flags = String::new();
            while i < source.len() && "gimsuyd".contains(source[i]) {
                flags.push(source[i]);
                i += 1;
            }
            let raw: String = source[start..i].iter().collect();
            return RegexReadResult { pattern, flags, raw, end: i, error: None };
        }

        if ch == '\n' || ch == '\r' {
            let raw: String = source[start..i].iter().collect();
            return RegexReadResult { pattern, flags: String::new(), raw, end: i, error: Some("Unterminated regex literal".into()) };
        }

        pattern.push(ch);
        i += 1;
    }

    let raw: String = source[start..].iter().collect();
    RegexReadResult { pattern, flags: String::new(), raw, end: source.len(), error: Some("Unterminated regex literal".into()) }
}

/// Escape a string for output, adding surrounding quotes.
pub fn escape_string(s: &str, quote: char) -> String {
    let mut result = String::new();
    result.push(quote);

    for ch in s.chars() {
        match ch {
            '\\' => { result.push_str("\\\\"); }
            c if c == quote => { result.push('\\'); result.push(c); }
            '\n' => { result.push_str("\\n"); }
            '\r' => { result.push_str("\\r"); }
            '\t' => { result.push_str("\\t"); }
            '\u{0008}' => { result.push_str("\\b"); }
            '\u{000C}' => { result.push_str("\\f"); }
            '\u{000B}' => { result.push_str("\\v"); }
            '\0' => { result.push_str("\\0"); }
            c if (c as u32) < 0x20 => {
                result.push_str(&format!("\\x{:02x}", c as u32));
            }
            c if (c as u32) > 0xFFFF => {
                result.push_str(&format!("\\u{{{:x}}}", c as u32));
            }
            c if (c as u32) > 0x7E => {
                result.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => { result.push(c); }
        }
    }

    result.push(quote);
    result
}
