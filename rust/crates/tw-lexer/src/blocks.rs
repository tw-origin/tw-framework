/// Block matching — script blocks, style blocks, comments, CDATA, DOCTYPE, TWM blocks.
/// Ported from the TS lexer/blocks.ts.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BlockType {
    Script,
    Style,
    Twm,
    Comment,
    Cdata,
    Doctype,
    Raw,
}

#[derive(Debug, Clone)]
pub struct BlockReadResult {
    pub block_type: BlockType,
    pub content: String,
    pub raw: String,
    pub start: usize,
    pub end: usize,
    pub attrs: Option<String>,
    pub lang: Option<String>,
    pub is_module: bool,
    pub error: Option<String>,
}

pub fn detect_block_type(source: &[char], pos: usize) -> Option<BlockType> {
    let remaining = &source[pos..];
    if starts_with(remaining, "<!--") { return Some(BlockType::Comment); }
    if starts_with(remaining, "<![CDATA[") { return Some(BlockType::Cdata); }
    if starts_with_ci(remaining, "<!doctype") { return Some(BlockType::Doctype); }
    if starts_with_ci(remaining, "<script") { return Some(BlockType::Script); }
    if starts_with_ci(remaining, "<style") { return Some(BlockType::Style); }
    if pos < source.len() && source[pos] == '{' && pos + 1 < source.len() && (source[pos + 1] == '%' || source[pos + 1] == '{') {
        return Some(BlockType::Twm);
    }
    None
}

pub fn read_block(source: &[char], pos: usize) -> BlockReadResult {
    match detect_block_type(source, pos) {
        Some(BlockType::Comment) => read_comment(source, pos),
        Some(BlockType::Cdata) => read_cdata(source, pos),
        Some(BlockType::Doctype) => read_doctype(source, pos),
        Some(BlockType::Script) => read_script_block(source, pos),
        Some(BlockType::Style) => read_style_block(source, pos),
        Some(BlockType::Twm) => read_twm_block(source, pos),
        _ => BlockReadResult {
            block_type: BlockType::Raw,
            content: String::new(),
            raw: String::new(),
            start: pos,
            end: pos,
            attrs: None,
            lang: None,
            is_module: false,
            error: Some("Unknown block type".into()),
        },
    }
}

pub fn read_script_block(source: &[char], start: usize) -> BlockReadResult {
    let mut i = start;
    let remaining = &source[i..];

    if !starts_with_ci(remaining, "<script") {
        return BlockReadResult {
            block_type: BlockType::Script,
            content: String::new(), raw: String::new(),
            start, end: i, attrs: None, lang: None, is_module: false,
            error: Some("Expected <script>".into()),
        };
    }

    i += 7;

    // Read attributes until >
    let mut attrs = String::new();
    while i < source.len() && source[i] != '>' {
        attrs.push(source[i]);
        i += 1;
    }

    if i >= source.len() {
        let raw: String = source[start..i].iter().collect();
        return BlockReadResult {
            block_type: BlockType::Script,
            content: String::new(), raw,
            start, end: i, attrs: Some(attrs), lang: None, is_module: false,
            error: Some("Unclosed <script> tag".into()),
        };
    }

    i += 1; // skip >

    let is_module = attrs.contains("type") && (attrs.contains("\"module\"") || attrs.contains("'module'"));
    let lang = extract_attr_value(&attrs, "lang").unwrap_or_else(|| "javascript".into());

    // Find </script>
    let close_idx = find_closing_tag(source, i, "</script");
    if close_idx == usize::MAX {
        let content: String = source[i..].iter().collect();
        let raw: String = source[start..].iter().collect();
        return BlockReadResult {
            block_type: BlockType::Script,
            content, raw,
            start, end: source.len(), attrs: Some(attrs), lang: Some(lang), is_module,
            error: Some("Unclosed <script> block".into()),
        };
    }

    let content: String = source[i..close_idx].iter().collect();
    let end = find_tag_end(source, close_idx);
    let raw: String = source[start..end].iter().collect();

    BlockReadResult {
        block_type: BlockType::Script,
        content, raw,
        start, end, attrs: Some(attrs), lang: Some(lang), is_module,
        error: None,
    }
}

pub fn read_style_block(source: &[char], start: usize) -> BlockReadResult {
    let mut i = start;
    let remaining = &source[i..];

    if !starts_with_ci(remaining, "<style") {
        return BlockReadResult {
            block_type: BlockType::Style,
            content: String::new(), raw: String::new(),
            start, end: i, attrs: None, lang: None, is_module: false,
            error: Some("Expected <style>".into()),
        };
    }

    i += 6;

    let mut attrs = String::new();
    while i < source.len() && source[i] != '>' {
        attrs.push(source[i]);
        i += 1;
    }

    if i >= source.len() {
        let raw: String = source[start..i].iter().collect();
        return BlockReadResult {
            block_type: BlockType::Style,
            content: String::new(), raw,
            start, end: i, attrs: Some(attrs), lang: None, is_module: false,
            error: Some("Unclosed <style> tag".into()),
        };
    }

    i += 1; // skip >

    let lang = extract_attr_value(&attrs, "lang").unwrap_or_else(|| "css".into());
    let scoped = attrs.split_whitespace().any(|w| w.eq_ignore_ascii_case("scoped"));
    let final_attrs = if scoped && !attrs.contains("scoped") {
        format!("{} scoped", attrs)
    } else {
        attrs.clone()
    };

    let close_idx = find_closing_tag(source, i, "</style");
    if close_idx == usize::MAX {
        let content: String = source[i..].iter().collect();
        let raw: String = source[start..].iter().collect();
        return BlockReadResult {
            block_type: BlockType::Style,
            content, raw,
            start, end: source.len(), attrs: Some(final_attrs), lang: Some(lang), is_module: false,
            error: Some("Unclosed <style> block".into()),
        };
    }

    let content: String = source[i..close_idx].iter().collect();
    let end = find_tag_end(source, close_idx);
    let raw: String = source[start..end].iter().collect();

    BlockReadResult {
        block_type: BlockType::Style,
        content, raw,
        start, end, attrs: Some(final_attrs), lang: Some(lang), is_module: false,
        error: None,
    }
}

pub fn read_twm_block(source: &[char], start: usize) -> BlockReadResult {
    if start + 1 >= source.len() {
        return BlockReadResult {
            block_type: BlockType::Twm,
            content: String::new(), raw: String::new(),
            start, end: start, attrs: None, lang: None, is_module: false,
            error: Some("Expected {%% or {{ }}".into()),
        };
    }

    let open_type = if source[start] == '{' && source[start + 1] == '%' { "twm" }
        else if source[start] == '{' && source[start + 1] == '{' { "interpolate" }
        else {
            return BlockReadResult {
                block_type: BlockType::Twm,
                content: String::new(), raw: String::new(),
                start, end: start, attrs: None, lang: None, is_module: false,
                error: Some("Expected {%% or {{ }}".into()),
            };
        };

    let close_tag: &[char] = if open_type == "twm" { &['%', '}'] } else { &['}', '}'] };
    let mut i = start + 2;
    let mut content = String::new();

    while i < source.len() {
        if i + 1 < source.len() && source[i] == close_tag[0] && source[i + 1] == close_tag[1] {
            let raw: String = source[start..i + 2].iter().collect();
            return BlockReadResult {
                block_type: BlockType::Twm,
                content, raw,
                start, end: i + 2, attrs: None, lang: None, is_module: false,
                error: None,
            };
        }

        content.push(source[i]);
        i += 1;
    }

    let raw: String = source[start..].iter().collect();
    BlockReadResult {
        block_type: BlockType::Twm,
        content, raw,
        start, end: source.len(), attrs: None, lang: None, is_module: false,
        error: Some("Unclosed TWM block".into()),
    }
}

pub fn read_comment(source: &[char], start: usize) -> BlockReadResult {
    if !starts_with(&source[start..], "<!--") {
        return BlockReadResult {
            block_type: BlockType::Comment,
            content: String::new(), raw: String::new(),
            start, end: start, attrs: None, lang: None, is_module: false,
            error: Some("Expected <!--".into()),
        };
    }

    let close_idx = find_subsequence(source, start + 4, &['-', '-', '>']);
    match close_idx {
        Some(idx) => {
            let content: String = source[start + 4..idx].iter().collect();
            let raw: String = source[start..idx + 3].iter().collect();
            BlockReadResult {
                block_type: BlockType::Comment,
                content, raw,
                start, end: idx + 3, attrs: None, lang: None, is_module: false,
                error: None,
            }
        }
        None => {
            let content: String = source[start + 4..].iter().collect();
            let raw: String = source[start..].iter().collect();
            BlockReadResult {
                block_type: BlockType::Comment,
                content, raw,
                start, end: source.len(), attrs: None, lang: None, is_module: false,
                error: Some("Unclosed comment".into()),
            }
        }
    }
}

pub fn read_cdata(source: &[char], start: usize) -> BlockReadResult {
    if !starts_with(&source[start..], "<![CDATA[") {
        return BlockReadResult {
            block_type: BlockType::Cdata,
            content: String::new(), raw: String::new(),
            start, end: start, attrs: None, lang: None, is_module: false,
            error: Some("Expected <![CDATA[".into()),
        };
    }

    let close_idx = find_subsequence(source, start + 9, &[']', ']', '>']);
    match close_idx {
        Some(idx) => {
            let content: String = source[start + 9..idx].iter().collect();
            let raw: String = source[start..idx + 3].iter().collect();
            BlockReadResult {
                block_type: BlockType::Cdata,
                content, raw,
                start, end: idx + 3, attrs: None, lang: None, is_module: false,
                error: None,
            }
        }
        None => {
            let content: String = source[start + 9..].iter().collect();
            let raw: String = source[start..].iter().collect();
            BlockReadResult {
                block_type: BlockType::Cdata,
                content, raw,
                start, end: source.len(), attrs: None, lang: None, is_module: false,
                error: Some("Unclosed CDATA section".into()),
            }
        }
    }
}

pub fn read_doctype(source: &[char], start: usize) -> BlockReadResult {
    let close_idx = source[start..].iter().position(|&c| c == '>')
        .map(|p| start + p);

    match close_idx {
        Some(idx) => {
            let content: String = source[start..=idx].iter().collect();
            BlockReadResult {
                block_type: BlockType::Doctype,
                content: content.clone(),
                raw: content,
                start, end: idx + 1, attrs: None, lang: None, is_module: false,
                error: None,
            }
        }
        None => {
            let content: String = source[start..].iter().collect();
            BlockReadResult {
                block_type: BlockType::Doctype,
                content: content.clone(),
                raw: content,
                start, end: source.len(), attrs: None, lang: None, is_module: false,
                error: Some("Unclosed DOCTYPE".into()),
            }
        }
    }
}

// ─── Helper Functions ─────────────────────────────────────────────────

fn starts_with(remaining: &[char], s: &str) -> bool {
    let s_chars: Vec<char> = s.chars().collect();
    remaining.len() >= s_chars.len() && remaining[..s_chars.len()] == s_chars[..]
}

fn starts_with_ci(remaining: &[char], s: &str) -> bool {
    let s_lower: String = s.to_lowercase();
    let s_chars: Vec<char> = s_lower.chars().collect();
    if remaining.len() < s_chars.len() { return false; }
    for (i, expected) in s_chars.iter().enumerate() {
        if remaining[i].to_ascii_lowercase() != *expected {
            return false;
        }
    }
    true
}

fn find_closing_tag(source: &[char], start: usize, close_tag: &str) -> usize {
    let close_chars: Vec<char> = close_tag.chars().collect();
    find_subsequence(source, start, &close_chars).unwrap_or(usize::MAX)
}

fn find_tag_end(source: &[char], tag_start: usize) -> usize {
    let mut i = tag_start;
    while i < source.len() && source[i] != '>' {
        i += 1;
    }
    if i < source.len() { i + 1 } else { i }
}

fn find_subsequence(haystack: &[char], start: usize, needle: &[char]) -> Option<usize> {
    if needle.is_empty() || start >= haystack.len() { return None; }
    'outer: for i in start..=haystack.len().saturating_sub(needle.len()) {
        for (j, &n) in needle.iter().enumerate() {
            if i + j >= haystack.len() || haystack[i + j] != n {
                continue 'outer;
            }
        }
        return Some(i);
    }
    None
}

fn extract_attr_value(attrs: &str, name: &str) -> Option<String> {
    let name_lower = name.to_lowercase();
    for part in attrs.split_whitespace() {
        if part.to_lowercase().starts_with(&format!("{}=", name_lower)) {
            let val = &part[name_lower.len() + 1..];
            let val = val.trim_matches(|c| c == '"' || c == '\'');
            return Some(val.to_string());
        }
    }
    None
}
