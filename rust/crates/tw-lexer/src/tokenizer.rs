/// Main tokenizer — converts .tw source into a stream of tokens.
/// Ported faithfully from the TS lexer/tokenizer/index.ts.
///
/// The tokenizer walks the source character by character, identifying:
/// - HTML tags (open, close, self-closing)
/// - Attributes (names, values, bindings, directives, events)
/// - Interpolation {expr}
/// - Script/style blocks
/// - Comments, CDATA, DOCTYPE
/// - JS-like operators, identifiers, keywords, strings, numbers
/// - TWM blocks {% %} and {{ }}

use crate::token::*;
use crate::strings::{read_string, read_number, read_regex, is_string_delimiter, StringReadResult, NumberReadResult, RegexReadResult};
use crate::blocks::{read_comment, read_script_block, read_style_block, BlockReadResult};

#[derive(Debug, Clone, Default)]
pub struct TokenizerOptions {
    pub file_path: Option<String>,
    pub include_whitespace: bool,
    pub include_newlines: bool,
    pub include_comments: bool,
    pub recover_on_error: bool,
    pub max_errors: usize,
}

impl TokenizerOptions {
    pub fn new() -> Self {
        Self {
            recover_on_error: true,
            max_errors: 50,
            ..Default::default()
        }
    }
}

#[derive(Debug, Clone)]
pub struct TokenizerError {
    pub message: String,
    pub line: usize,
    pub col: usize,
    pub offset: usize,
}

#[derive(Debug, Clone)]
pub struct TokenizerResult {
    pub tokens: Vec<Token>,
    pub errors: Vec<TokenizerError>,
}

/// The tokenizer struct holds mutable state that the TS version kept in closures.
struct TokenizerState<'a> {
    source: &'a [char],
    tokens: Vec<Token>,
    errors: Vec<TokenizerError>,
    pos: usize,
    line: usize,
    col: usize,
    prev_char: char,
    error_count: usize,
    max_errors: usize,
    include_whitespace: bool,
    include_newlines: bool,
    include_comments: bool,
    recover_on_error: bool,
}

impl<'a> TokenizerState<'a> {
    fn new(source: &'a [char], opts: &TokenizerOptions) -> Self {
        Self {
            source,
            tokens: Vec::new(),
            errors: Vec::new(),
            pos: 0,
            line: 1,
            col: 1,
            prev_char: '\0',
            error_count: 0,
            max_errors: opts.max_errors,
            include_whitespace: opts.include_whitespace,
            include_newlines: opts.include_newlines,
            include_comments: opts.include_comments,
            recover_on_error: opts.recover_on_error,
        }
    }

    fn current_pos(&self) -> TokenPosition {
        TokenPosition { line: self.line, col: self.col, offset: self.pos }
    }

    fn advance(&mut self, count: usize) {
        for _ in 0..count {
            if self.pos >= self.source.len() { break; }
            if self.source[self.pos] == '\n' {
                self.line += 1;
                self.col = 1;
            } else {
                self.col += 1;
            }
            self.prev_char = self.source[self.pos];
            self.pos += 1;
        }
    }

    fn peek(&self, offset: usize) -> char {
        let idx = self.pos + offset;
        if idx < self.source.len() { self.source[idx] } else { '\0' }
    }

    fn starts_with(&self, s: &str) -> bool {
        let chars: Vec<char> = s.chars().collect();
        if self.pos + chars.len() > self.source.len() { return false; }
        for (i, expected) in chars.iter().enumerate() {
            if self.source[self.pos + i] != *expected { return false; }
        }
        true
    }

    fn preceded_by_whitespace(&self) -> bool {
        self.prev_char == ' ' || self.prev_char == '\t' || self.prev_char == '\n' || self.prev_char == '\r' || self.pos == 0
    }

    fn push_token(&mut self, tt: TokenType, value: String, start: TokenPosition, raw: Option<String>) {
        let end = self.current_pos();
        let pre_ws = if start.offset > 0 { self.preceded_by_whitespace() } else { true };
        let next_ch = self.peek(0);
        let post_ws = next_ch == ' ' || next_ch == '\t' || next_ch == '\n' || next_ch == '\r' || next_ch == '\0';

        let raw_val = raw.unwrap_or_else(|| value.clone());

        self.tokens.push(make_token(
            tt,
            value,
            start,
            end,
            Some(raw_val),
            pre_ws,
            post_ws,
            None,
        ));
    }

    fn add_error(&mut self, message: String) {
        if self.error_count >= self.max_errors { return; }
        self.errors.push(TokenizerError {
            message,
            line: self.line,
            col: self.col,
            offset: self.pos,
        });
        self.error_count += 1;
    }
}

/// Convert source string into tokens. Main entry point.
pub fn tokenize(source: &str, opts: Option<TokenizerOptions>) -> TokenizerResult {
    let opts = opts.unwrap_or_else(TokenizerOptions::new);
    let chars: Vec<char> = source.chars().collect();
    let mut state = TokenizerState::new(&chars, &opts);

    while state.pos < state.source.len() {
        let start = state.current_pos();
        let ch = state.source[state.pos];

        // ─── Whitespace ──────────────────────────────────────────────────────
        if ch == ' ' || ch == '\t' {
            let mut ws = String::new();
            while state.pos < state.source.len() && (state.source[state.pos] == ' ' || state.source[state.pos] == '\t') {
                ws.push(state.source[state.pos]);
                state.advance(1);
            }
            if state.include_whitespace {
                state.push_token(TokenType::Whitespace, ws, start, None);
            }
            continue;
        }

        // ─── Newlines ────────────────────────────────────────────────────────
        if ch == '\n' || ch == '\r' {
            let nl;
            if ch == '\r' && state.peek(1) == '\n' {
                nl = "\r\n".to_string();
                state.advance(2);
            } else {
                nl = ch.to_string();
                state.advance(1);
            }
            if state.include_newlines {
                state.push_token(TokenType::Newline, nl, start, None);
            }
            continue;
        }

        // ─── Comments ────────────────────────────────────────────────────────
        if state.starts_with("<!--") {
            let block = read_comment(state.source, state.pos);
            state.advance(block.end - state.pos);
            if state.include_comments {
                state.push_token(TokenType::Comment, block.content, start, Some(block.raw));
            }
            if let Some(e) = block.error {
                state.add_error(e);
            }
            continue;
        }

        // ─── CDATA ──────────────────────────────────────────────────────────
        if state.starts_with("<![CDATA[") {
            let block_start = state.pos;
            let close_idx = find_subsequence(state.source, state.pos + 9, &['[', ']', ']', '>']);
            // Actually we need ]]>  not []]>
            let close_idx = find_subsequence(state.source, state.pos + 9, &[']', ']', '>']);
            match close_idx {
                Some(idx) => {
                    let content: String = state.source[state.pos + 9..idx].iter().collect();
                    let raw: String = state.source[block_start..idx + 3].iter().collect();
                    state.advance(idx + 3 - state.pos);
                    state.push_token(TokenType::Cdata, content, start, Some(raw));
                }
                None => {
                    state.add_error("Unclosed CDATA section".into());
                    state.advance(state.source.len() - state.pos);
                }
            }
            continue;
        }

        // ─── DOCTYPE ────────────────────────────────────────────────────────
        if state.starts_with("<!doctype") || state.starts_with("<!DOCTYPE") {
            let close_idx = find_char(state.source, state.pos, '>');
            match close_idx {
                Some(idx) => {
                    let content: String = state.source[state.pos..=idx].iter().collect();
                    state.advance(idx + 1 - state.pos);
                    state.push_token(TokenType::Doctype, content, start, None);
                }
                None => {
                    state.add_error("Unclosed DOCTYPE".into());
                    state.advance(state.source.len() - state.pos);
                }
            }
            continue;
        }

        // ─── Script Block ──────────────────────────────────────────────────
        if state.starts_with("<script") || state.starts_with("<SCRIPT") {
            let block = read_script_block(state.source, state.pos);
            if let Some(e) = &block.error {
                state.add_error(e.clone());
                if !state.recover_on_error { break; }
                let advance_amt = std::cmp::max(1, block.end - state.pos);
                state.advance(advance_amt);
            } else {
                state.advance(block.end - state.pos);
                state.push_token(
                    TokenType::ScriptOpen,
                    block.attrs.clone().unwrap_or_default(),
                    start.clone(),
                    Some(block.raw.clone()),
                );
                if !block.content.is_empty() {
                    let text_start = TokenPosition::new(start.line, start.col + 7, start.offset + 7);
                    state.push_token(TokenType::Text, block.content, text_start, None);
                }
                // Find </script>
                let close_idx = find_subsequence_ci(state.source, state.pos, "</script>");
                if let Some(idx) = close_idx {
                    let close_start = state.current_pos();
                    state.advance(idx + 9 - state.pos);
                    state.push_token(TokenType::ScriptClose, "</script>".into(), close_start, None);
                }
            }
            continue;
        }

        // ─── Style Block ───────────────────────────────────────────────────
        if state.starts_with("<style") || state.starts_with("<STYLE") {
            let block = read_style_block(state.source, state.pos);
            if let Some(e) = &block.error {
                state.add_error(e.clone());
                if !state.recover_on_error { break; }
                let advance_amt = std::cmp::max(1, block.end - state.pos);
                state.advance(advance_amt);
            } else {
                state.push_token(
                    TokenType::StyleOpen,
                    block.attrs.clone().unwrap_or_default(),
                    start.clone(),
                    Some(block.raw.clone()),
                );
                state.advance(block.end - state.pos);
                if !block.content.is_empty() {
                    let text_start = TokenPosition::new(start.line, start.col + 6, start.offset + 6);
                    state.push_token(TokenType::Text, block.content, text_start, None);
                }
                let close_idx = find_subsequence_ci(state.source, state.pos, "</style>");
                if let Some(idx) = close_idx {
                    let close_start = state.current_pos();
                    state.advance(idx + 8 - state.pos);
                    state.push_token(TokenType::StyleClose, "</style>".into(), close_start, None);
                }
            }
            continue;
        }

        // ─── Closing Tag </tag> ─────────────────────────────────────────────
        if state.starts_with("</") {
            state.advance(2); // skip </
            let mut tag_name = String::new();
            while state.pos < state.source.len() && is_tag_char(state.source[state.pos]) {
                tag_name.push(state.source[state.pos]);
                state.advance(1);
            }
            // skip to >
            while state.pos < state.source.len() && state.source[state.pos] != '>' {
                state.advance(1);
            }
            if state.pos < state.source.len() && state.source[state.pos] == '>' {
                state.advance(1);
            }
            let raw = format!("</{}>", tag_name);
            state.push_token(TokenType::CloseTag, tag_name, start, Some(raw));
            continue;
        }

        // ─── Opening Tag <tag ──────────────────────────────────────────────
        if ch == '<' && is_alpha(state.peek(1)) {
            state.advance(1); // skip <
            let mut tag_name = String::new();
            while state.pos < state.source.len() && is_tag_char(state.source[state.pos]) {
                tag_name.push(state.source[state.pos]);
                state.advance(1);
            }

            let is_component = tag_name.starts_with(|c: char| c.is_ascii_uppercase());
            let raw = format!("<{}", tag_name);
            state.push_token(
                if is_component { TokenType::ComponentName } else { TokenType::OpenTag },
                tag_name, start, Some(raw),
            );

            // Read attributes until > or />
            while state.pos < state.source.len() {
                let attr_start = state.current_pos();
                let attr_ch = state.source[state.pos];

                // Skip whitespace
                if attr_ch == ' ' || attr_ch == '\t' || attr_ch == '\n' {
                    state.advance(1);
                    continue;
                }

                // Self-closing
                if attr_ch == '/' && state.peek(1) == '>' {
                    state.advance(2);
                    state.push_token(TokenType::SelfClose, "/>".into(), attr_start, None);
                    break;
                }

                // Closing
                if attr_ch == '>' {
                    state.advance(1);
                    break;
                }

                // Event binding on:event
                if attr_ch == 'o' && state.pos + 2 < state.source.len()
                    && state.source[state.pos] == 'o'
                    && state.source[state.pos + 1] == 'n'
                    && state.source[state.pos + 2] == ':'
                {
                    state.advance(3);
                    let mut event_name = String::new();
                    while state.pos < state.source.len() && state.source[state.pos].is_ascii_alphabetic() {
                        event_name.push(state.source[state.pos]);
                        state.advance(1);
                    }
                    let raw = format!("on:{}", event_name);
                    state.push_token(TokenType::EventPrefix, raw, attr_start, None);
                    continue;
                }

                // Bind prefix :prop
                if attr_ch == ':' {
                    state.advance(1);
                    let mut bind_name = String::new();
                    while state.pos < state.source.len() && is_tag_char(state.source[state.pos]) {
                        bind_name.push(state.source[state.pos]);
                        state.advance(1);
                    }
                    let raw = format!(":{}", bind_name);
                    state.push_token(TokenType::BindPrefix, raw, attr_start, None);
                    // Read = value
                    if state.pos < state.source.len() && state.source[state.pos] == '=' {
                        state.advance(1);
                        let val_start = state.current_pos();
                        let quote = state.peek(0);
                        if quote == '"' || quote == '\'' {
                            let str_result = read_string(state.source, state.pos, quote);
                            state.advance(str_result.end - state.pos);
                            state.push_token(TokenType::AttrValue, str_result.value, val_start, Some(str_result.raw));
                        }
                    }
                    continue;
                }

                // Directive @directive
                if attr_ch == '@' {
                    state.advance(1);
                    let mut dir_name = String::new();
                    while state.pos < state.source.len() && is_tag_char(state.source[state.pos]) {
                        dir_name.push(state.source[state.pos]);
                        state.advance(1);
                    }
                    let raw = format!("@{}", dir_name);
                    state.push_token(TokenType::Directive, raw, attr_start, None);
                    continue;
                }

                // Attribute name
                if is_attr_name_start(attr_ch) {
                    let mut attr_name = String::new();
                    while state.pos < state.source.len() && is_attr_name_char(state.source[state.pos]) {
                        attr_name.push(state.source[state.pos]);
                        state.advance(1);
                    }
                    state.push_token(TokenType::AttrName, attr_name, attr_start, None);

                    // Check for = value
                    if state.pos < state.source.len() && state.source[state.pos] == '=' {
                        state.advance(1);
                        let val_start = state.current_pos();
                        let quote = state.peek(0);
                        if quote == '"' || quote == '\'' {
                            let str_result = read_string(state.source, state.pos, quote);
                            state.advance(str_result.end - state.pos);
                            state.push_token(TokenType::AttrValue, str_result.value, val_start, Some(str_result.raw));
                        } else if state.peek(0) == '{' {
                            // Interpolated value {expr}
                            state.advance(1);
                            let mut expr = String::new();
                            let mut depth = 1;
                            while state.pos < state.source.len() && depth > 0 {
                                if state.source[state.pos] == '{' { depth += 1; }
                                else if state.source[state.pos] == '}' { depth -= 1; }
                                if depth > 0 { expr.push(state.source[state.pos]); }
                                state.advance(1);
                            }
                            let raw = format!("{{{}}}", expr);
                            state.push_token(TokenType::AttrValue, expr, val_start, Some(raw));
                        }
                    }
                    continue;
                }

                // Unknown — skip
                state.advance(1);
            }
            continue;
        }

        // ─── Interpolation {expr} ───────────────────────────────────────────
        if ch == '{' && state.peek(1) != '{' && state.peek(1) != '%' {
            state.advance(1); // skip {
            state.push_token(TokenType::InterpStart, "{".into(), start, None);

            // Read until matching }
            let mut depth = 1;
            while state.pos < state.source.len() && depth > 0 {
                let expr_start = state.current_pos();
                let expr_ch = state.source[state.pos];

                if expr_ch == '{' {
                    depth += 1;
                    state.advance(1);
                    state.push_token(TokenType::LBrace, "{".into(), expr_start, None);
                    continue;
                }
                if expr_ch == '}' {
                    depth -= 1;
                    state.advance(1);
                    if depth == 0 {
                        state.push_token(TokenType::InterpEnd, "}".into(), expr_start, None);
                    } else {
                        state.push_token(TokenType::RBrace, "}".into(), expr_start, None);
                    }
                    continue;
                }
                if is_string_delimiter(expr_ch) {
                    let str_result = read_string(state.source, state.pos, expr_ch);
                    if let Some(e) = str_result.error {
                        state.add_error(e);
                        state.advance(str_result.end - state.pos);
                    } else {
                        state.advance(str_result.end - state.pos);
                        state.push_token(TokenType::String, str_result.value, expr_start, Some(str_result.raw));
                    }
                    continue;
                }
                if expr_ch.is_ascii_digit() || (expr_ch == '.' && state.peek(1).is_ascii_digit()) {
                    let num_result = read_number(state.source, state.pos);
                    state.advance(num_result.end - state.pos);
                    state.push_token(TokenType::Number, num_result.value, expr_start, Some(num_result.raw));
                    continue;
                }
                if is_ident_start(expr_ch) {
                    let mut ident = String::new();
                    while state.pos < state.source.len() && is_ident_char(state.source[state.pos]) {
                        ident.push(state.source[state.pos]);
                        state.advance(1);
                    }
                    if is_keyword(&ident) {
                        state.push_token(TokenType::Keyword, ident, expr_start, None);
                    } else {
                        state.push_token(TokenType::Ident, ident, expr_start, None);
                    }
                    continue;
                }
                // Operators
                if let Some(op) = read_operator(state.source, state.pos) {
                    state.advance(op.len());
                    let tt = op_type(&op);
                    state.push_token(tt, op, expr_start, None);
                    continue;
                }
                state.advance(1);
            }
            continue;
        }

        // ─── TWM Block {% ... %} or {{ ... }} ─────────────────────────────
        if state.starts_with("{%") || state.starts_with("{{") {
            let block_start = state.pos;
            let close_tag: &[char] = if state.starts_with("{%") { &['%', '}'] } else { &['}', '}'] };
            state.advance(2);
            let mut content = String::new();
            while state.pos < state.source.len() && !starts_at(state.source, state.pos, close_tag) {
                content.push(state.source[state.pos]);
                state.advance(1);
            }
            if starts_at(state.source, state.pos, close_tag) {
                state.advance(close_tag.len());
            } else {
                state.add_error("Unclosed TWM block".into());
            }
            let raw: String = state.source[block_start..state.pos].iter().collect();
            state.push_token(TokenType::Text, content, start, Some(raw));
            continue;
        }

        // ─── String Literals ────────────────────────────────────────────────
        if is_string_delimiter(ch) {
            let str_result = read_string(state.source, state.pos, ch);
            if let Some(e) = &str_result.error {
                state.add_error(e.clone());
                if !state.recover_on_error { break; }
            }
            state.advance(str_result.end - state.pos);
            state.push_token(TokenType::String, str_result.value, start, Some(str_result.raw));
            continue;
        }

        // ─── Numbers ────────────────────────────────────────────────────────
        if ch.is_ascii_digit() || (ch == '.' && state.peek(1).is_ascii_digit()) {
            let num_result = read_number(state.source, state.pos);
            state.advance(num_result.end - state.pos);
            state.push_token(TokenType::Number, num_result.value, start, Some(num_result.raw));
            continue;
        }

        // ─── Regex ──────────────────────────────────────────────────────────
        if ch == '/' && state.prev_char != ')' && !is_ident_char(state.prev_char) && state.prev_char != '\0' {
            let reg_result = read_regex(state.source, state.pos);
            if reg_result.error.is_none() {
                state.advance(reg_result.end - state.pos);
                let val = format!("{}/{}", reg_result.pattern, reg_result.flags);
                state.push_token(TokenType::Regex, val, start, Some(reg_result.raw));
                continue;
            }
        }

        // ─── Identifiers & Keywords ─────────────────────────────────────────
        if is_ident_start(ch) {
            let mut ident = String::new();
            while state.pos < state.source.len() && is_ident_char(state.source[state.pos]) {
                ident.push(state.source[state.pos]);
                state.advance(1);
            }
            if is_keyword(&ident) {
                state.push_token(TokenType::Keyword, ident, start, None);
            } else {
                state.push_token(TokenType::Ident, ident, start, None);
            }
            continue;
        }

        // ─── Text content (plain text between tags) ─────────────────────────
        // Any other character that's not < starts a text token
        if ch != '<' {
            let mut text = String::new();
            while state.pos < state.source.len() && state.source[state.pos] != '<' && state.source[state.pos] != '{' {
                text.push(state.source[state.pos]);
                state.advance(1);
            }
            if !text.is_empty() {
                state.push_token(TokenType::Text, text, start, None);
                continue;
            }
        }

        // ─── Operators & Punctuation ────────────────────────────────────────
        if let Some(op) = read_operator(state.source, state.pos) {
            state.advance(op.len());
            let tt = op_type(&op);
            state.push_token(tt, op, start, None);
            continue;
        }

        // ─── Unknown character ──────────────────────────────────────────────
        state.add_error(format!("Unexpected character: {}", ch));
        if !state.recover_on_error { break; }
        state.advance(1);
    }

    // EOF token
    let eof_pos = state.current_pos();
    state.tokens.push(make_token(
        TokenType::Eof,
        String::new(),
        eof_pos.clone(),
        eof_pos,
        None,
        true,
        true,
        None,
    ));

    TokenizerResult {
        tokens: state.tokens,
        errors: state.errors,
    }
}

// ─── Operator Reader ──────────────────────────────────────────────────

fn read_operator(source: &[char], pos: usize) -> Option<String> {
    let remaining = &source[pos..];
    if remaining.is_empty() { return None; }

    // 3-char operators
    let ops3 = ["===", "!==", ">>>", "**=", "...", "<<=", ">>=", ">>>=", "&&=", "||=", "??="];
    for op in &ops3 {
        let oc: Vec<char> = op.chars().collect();
        if remaining.len() >= oc.len() && remaining[..oc.len()] == oc[..] {
            return Some(op.to_string());
        }
    }

    // 2-char operators (check ?. first, then others)
    let ops2 = ["?.", "==", "!=", "<=", ">=", "&&", "||", "??", "=>", "<<", ">>", "**", "++", "--",
                "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "~="];
    for op in &ops2 {
        let oc: Vec<char> = op.chars().collect();
        if remaining.len() >= oc.len() && remaining[..oc.len()] == oc[..] {
            return Some(op.to_string());
        }
    }

    // 1-char operators
    let ops1 = ['+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~', '?',
                ':', ';', ',', '.', '(', ')', '[', ']', '{', '}', '@', '#', '$', '`', '\\'];
    for &op in &ops1 {
        if remaining[0] == op {
            return Some(op.to_string());
        }
    }

    None
}

fn op_type(op: &str) -> TokenType {
    match op {
        "===" => TokenType::Seq,
        "!==" => TokenType::Sneq,
        "==" => TokenType::Eq,
        "!=" => TokenType::Neq,
        "<=" => TokenType::Le,
        ">=" => TokenType::Ge,
        "&&" => TokenType::And,
        "||" => TokenType::Or,
        "??" => TokenType::Nullish,
        "=>" => TokenType::Arrow,
        "..." => TokenType::Spread,
        "<<" => TokenType::DoubleLt,
        ">>" => TokenType::DoubleGt,
        ">>>" => TokenType::TripleGt,
        "**" => TokenType::Star,
        "++" => TokenType::Plus,
        "--" => TokenType::Minus,
        "+=" => TokenType::PlusAssign,
        "-=" => TokenType::MinusAssign,
        "*=" => TokenType::StarAssign,
        "/=" => TokenType::SlashAssign,
        "%=" => TokenType::PercentAssign,
        "&=" => TokenType::AmpAssign,
        "|=" => TokenType::PipeAssign,
        "^=" => TokenType::CaretAssign,
        "<<=" => TokenType::ShlAssign,
        ">>=" => TokenType::ShrAssign,
        ">>>=" => TokenType::UshrAssign,
        "&&=" => TokenType::AndAssign,
        "||=" => TokenType::OrAssign,
        "??=" => TokenType::NullishAssign,
        "**=" => TokenType::ExpAssign,
        "+" => TokenType::Plus,
        "-" => TokenType::Minus,
        "*" => TokenType::Star,
        "/" => TokenType::Slash,
        "%" => TokenType::Percent,
        "=" => TokenType::Assign,
        "<" => TokenType::Lt,
        ">" => TokenType::Gt,
        "!" => TokenType::Bang,
        "&" => TokenType::Ampersand,
        "|" => TokenType::Pipe,
        "^" => TokenType::Caret,
        "~" => TokenType::Tilde,
        "?" => TokenType::Question,
        ":" => TokenType::Colon,
        ";" => TokenType::Semicolon,
        "," => TokenType::Comma,
        "." => TokenType::Dot,
        "(" => TokenType::LParen,
        ")" => TokenType::RParen,
        "[" => TokenType::LBracket,
        "]" => TokenType::RBracket,
        "{" => TokenType::LBrace,
        "}" => TokenType::RBrace,
        "@" => TokenType::At,
        "#" => TokenType::Hash,
        "$" => TokenType::Dollar,
        "`" => TokenType::Template,
        "\\" => TokenType::Backslash,
        "?." => TokenType::Dot,
        _ => TokenType::Illegal,
    }
}

// ─── Character Classification ──────────────────────────────────────────

fn is_alpha(ch: char) -> bool {
    ch.is_ascii_alphabetic()
}

fn is_tag_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '-'
}

fn is_ident_start(ch: char) -> bool {
    ch.is_ascii_alphabetic() || ch == '_' || ch == '$'
}

fn is_ident_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '_' || ch == '$'
}

fn is_attr_name_start(ch: char) -> bool {
    ch.is_ascii_alphabetic() || ch == '_' || ch == ':' || ch == '@'
}

fn is_attr_name_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '_' || ch == ':' || ch == '@' || ch == '.' || ch == '-'
}

// ─── Search Helpers ────────────────────────────────────────────────────

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

fn find_subsequence_ci(haystack: &[char], start: usize, needle: &str) -> Option<usize> {
    let needle_lower: String = needle.to_lowercase();
    let needle_chars: Vec<char> = needle_lower.chars().collect();
    if needle_chars.is_empty() || start >= haystack.len() { return None; }
    'outer: for i in start..=haystack.len().saturating_sub(needle_chars.len()) {
        for (j, expected) in needle_chars.iter().enumerate() {
            if i + j >= haystack.len() || haystack[i + j].to_ascii_lowercase() != *expected {
                continue 'outer;
            }
        }
        return Some(i);
    }
    None
}

fn find_char(haystack: &[char], start: usize, target: char) -> Option<usize> {
    haystack[start..].iter().position(|&c| c == target).map(|p| start + p)
}

fn starts_at(source: &[char], pos: usize, needle: &[char]) -> bool {
    if pos + needle.len() > source.len() { return false; }
    for (i, &n) in needle.iter().enumerate() {
        if source[pos + i] != n { return false; }
    }
    true
}
