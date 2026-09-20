use std::collections::HashSet;
use std::sync::LazyLock;

/// Every token type the TW lexer can produce.
/// Mirrors the TypeScript TokenType union 1:1.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TokenType {
    // Literals
    Text,
    String,
    Number,
    Boolean,
    Null,
    Regex,
    Template,

    // Identifiers & Keywords
    Ident,
    Keyword,
    TagName,
    AttrName,
    ComponentName,
    CssProp,
    CssValue,
    EventName,
    Directive,

    // Punctuation & Operators
    LBrace,
    RBrace,
    LBracket,
    RBracket,
    LParen,
    RParen,
    Lt,
    Gt,
    Slash,
    Backslash,
    Equals,
    Colon,
    Semicolon,
    Comma,
    Dot,
    At,
    Hash,
    Dollar,
    Question,
    Bang,
    Tilde,
    Pipe,
    Ampersand,
    Caret,
    Percent,
    Star,
    Plus,
    Minus,
    Arrow,
    Spread,

    // Comparison
    Eq,
    Neq,
    Seq,
    Sneq,
    Le,
    Ge,
    DoubleLt,
    DoubleGt,
    TripleGt,

    // Logical
    And,
    Or,
    Nullish,

    // Assignment
    Assign,
    PlusAssign,
    MinusAssign,
    StarAssign,
    SlashAssign,
    PercentAssign,
    AmpAssign,
    PipeAssign,
    CaretAssign,
    ShlAssign,
    ShrAssign,
    UshrAssign,
    ExpAssign,
    NullishAssign,
    AndAssign,
    OrAssign,

    // TW-specific
    OpenTag,
    CloseTag,
    SelfClose,
    AttrValue,
    InterpStart,
    InterpEnd,
    StyleSep,
    StyleEnd,
    EventPrefix,
    BindPrefix,
    DirectiveAt,
    Comment,
    Cdata,
    Doctype,

    // Block markers
    ScriptOpen,
    ScriptClose,
    StyleOpen,
    StyleClose,
    TwScriptOpen,
    TwStyleOpen,

    // Special
    Newline,
    Whitespace,
    Eof,
    Illegal,
    Error,
}

/// Position in source — line, column, byte offset.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TokenPosition {
    pub line: usize,
    pub col: usize,
    pub offset: usize,
}

impl TokenPosition {
    pub fn new(line: usize, col: usize, offset: usize) -> Self {
        Self { line, col, offset }
    }
}

/// Extra flags on a token for context-sensitive parsing.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TokenFlags {
    pub in_interpolation: bool,
    pub in_tag: bool,
    pub in_attr_value: bool,
    pub in_style: bool,
    pub in_script: bool,
    pub escaped: bool,
    pub template_expr: bool,
}

/// A single token produced by the lexer.
#[derive(Debug, Clone)]
pub struct Token {
    pub token_type: TokenType,
    pub value: String,
    pub pos: TokenPosition,
    pub end: TokenPosition,
    pub has_newline: bool,
    pub preceded_by_whitespace: bool,
    pub followed_by_whitespace: bool,
    pub raw: String,
    pub error: Option<String>,
    pub flags: Option<TokenFlags>,
}

pub fn make_token(
    token_type: TokenType,
    value: String,
    pos: TokenPosition,
    end: TokenPosition,
    raw: Option<String>,
    preceded_by_ws: bool,
    followed_by_ws: bool,
    flags: Option<TokenFlags>,
) -> Token {
    Token {
        token_type,
        value,
        pos,
        end,
        has_newline: false,
        preceded_by_whitespace: preceded_by_ws,
        followed_by_whitespace: followed_by_ws,
        raw: raw.unwrap_or_default(),
        error: None,
        flags,
    }
}

// ─── Keyword Set ─────────────────────────────────────────────────────

static KEYWORDS: LazyLock<HashSet<&'static str>> = LazyLock::new(|| {
    let mut s = HashSet::new();
    // TW directives
    for kw in ["page", "head", "body", "section", "layout", "load", "state", "render", "revalidate", "redirect", "rewrite"] {
        s.insert(kw);
    }
    // JS keywords
    for kw in ["import", "export", "default", "const", "let", "var", "if", "else", "elif", "for", "while", "switch", "case", "break", "continue", "function", "return", "class", "extends", "super", "new", "delete", "typeof", "instanceof", "in", "of", "as", "is"] {
        s.insert(kw);
    }
    // Literals
    for kw in ["true", "false", "null", "undefined"] {
        s.insert(kw);
    }
    // Error handling
    for kw in ["try", "catch", "finally", "throw"] {
        s.insert(kw);
    }
    // Async
    for kw in ["async", "await", "yield", "static", "get", "set"] {
        s.insert(kw);
    }
    // Context
    for kw in ["this", "arguments", "globalThis", "void", "with", "debugger"] {
        s.insert(kw);
    }
    // TW-specific
    for kw in ["component", "slot", "props", "emit", "defineProps", "defineEmits", "defineExpose", "defineOptions", "defineSlots", "computed", "watch", "ref", "reactive", "shallowRef", "shallowReactive", "readonly", "shallowReadonly", "toRef", "toRefs", "unref", "provide", "inject", "h", "defineComponent", "createApp", "onMount", "onUnmount", "onUpdate", "useEffect", "useMemo", "useCallback", "useState", "useRef", "useContext", "useReducer"] {
        s.insert(kw);
    }
    // Rendering modes
    for kw in ["scoped", "global", "module", "use", "static", "dynamic", "streaming", "edge", "server", "client", "ISR"] {
        s.insert(kw);
    }
    s
});

pub fn is_keyword(value: &str) -> bool {
    KEYWORDS.contains(value)
}

static OPERATORS: LazyLock<HashSet<&'static str>> = LazyLock::new(|| {
    let mut s = HashSet::new();
    for op in ["==", "===", "!=", "!==", "<", ">", "<=", ">=", "<<", ">>", ">>>", "+", "-", "*", "/", "%", "**", "&", "|", "^", "~", "!", "&&", "||", "??", "=", "+=", "-=", "*=", "/=", "%=", "**=", "&=", "|=", "^=", "<<=", ">>=", ">>>=", "&&=", "||=", "??=", "=>", "...", "?", ":", ";", ",", ".", "(", ")", "[", "]", "{", "}", "@", "#", "$", "~", "`"] {
        s.insert(op);
    }
    s
});

pub fn is_operator(value: &str) -> bool {
    OPERATORS.contains(value)
}

// ─── Helper Categorisation Functions ──────────────────────────────────

pub fn is_literal(tt: &TokenType) -> bool {
    matches!(tt, TokenType::String | TokenType::Number | TokenType::Boolean | TokenType::Null | TokenType::Regex | TokenType::Template)
}

pub fn is_identifier(tt: &TokenType) -> bool {
    matches!(tt, TokenType::Ident | TokenType::Keyword)
}

pub fn is_comparison(tt: &TokenType) -> bool {
    matches!(tt, TokenType::Eq | TokenType::Neq | TokenType::Seq | TokenType::Sneq | TokenType::Le | TokenType::Ge | TokenType::Lt | TokenType::Gt)
}

pub fn is_logical(tt: &TokenType) -> bool {
    matches!(tt, TokenType::And | TokenType::Or | TokenType::Nullish)
}

pub fn is_assignment(tt: &TokenType) -> bool {
    matches!(tt, TokenType::Assign | TokenType::PlusAssign | TokenType::MinusAssign | TokenType::StarAssign | TokenType::SlashAssign | TokenType::PercentAssign | TokenType::AmpAssign | TokenType::PipeAssign | TokenType::CaretAssign | TokenType::ShlAssign | TokenType::ShrAssign | TokenType::UshrAssign | TokenType::ExpAssign | TokenType::NullishAssign | TokenType::AndAssign | TokenType::OrAssign)
}

pub fn is_arithmetic(tt: &TokenType) -> bool {
    matches!(tt, TokenType::Plus | TokenType::Minus | TokenType::Star | TokenType::Slash | TokenType::Percent)
}

pub fn is_open_token(tt: &TokenType) -> bool {
    matches!(tt, TokenType::LBrace | TokenType::LBracket | TokenType::LParen)
}

pub fn is_close_token(tt: &TokenType) -> bool {
    matches!(tt, TokenType::RBrace | TokenType::RBracket | TokenType::RParen)
}

pub fn matching_pair(open: &TokenType) -> Option<TokenType> {
    match open {
        TokenType::LBrace => Some(TokenType::RBrace),
        TokenType::LBracket => Some(TokenType::RBracket),
        TokenType::LParen => Some(TokenType::RParen),
        _ => None,
    }
}

pub fn token_type_name(tt: &TokenType) -> &'static str {
    match tt {
        TokenType::Text => "TEXT",
        TokenType::String => "STRING",
        TokenType::Number => "NUMBER",
        TokenType::Boolean => "BOOLEAN",
        TokenType::Null => "NULL",
        TokenType::Regex => "REGEX",
        TokenType::Template => "TEMPLATE",
        TokenType::Ident => "IDENT",
        TokenType::Keyword => "KEYWORD",
        TokenType::TagName => "TAG_NAME",
        TokenType::AttrName => "ATTR_NAME",
        TokenType::ComponentName => "COMPONENT_NAME",
        TokenType::CssProp => "CSS_PROP",
        TokenType::CssValue => "CSS_VALUE",
        TokenType::EventName => "EVENT_NAME",
        TokenType::Directive => "DIRECTIVE",
        TokenType::LBrace => "LBRACE",
        TokenType::RBrace => "RBRACE",
        TokenType::LBracket => "LBRACKET",
        TokenType::RBracket => "RBRACKET",
        TokenType::LParen => "LPAREN",
        TokenType::RParen => "RPAREN",
        TokenType::Lt => "LT",
        TokenType::Gt => "GT",
        TokenType::Slash => "SLASH",
        TokenType::Backslash => "BACKSLASH",
        TokenType::Equals => "EQUALS",
        TokenType::Colon => "COLON",
        TokenType::Semicolon => "SEMICOLON",
        TokenType::Comma => "COMMA",
        TokenType::Dot => "DOT",
        TokenType::At => "AT",
        TokenType::Hash => "HASH",
        TokenType::Dollar => "DOLLAR",
        TokenType::Question => "QUESTION",
        TokenType::Bang => "BANG",
        TokenType::Tilde => "TILDE",
        TokenType::Pipe => "PIPE",
        TokenType::Ampersand => "AMPERSAND",
        TokenType::Caret => "CARET",
        TokenType::Percent => "PERCENT",
        TokenType::Star => "STAR",
        TokenType::Plus => "PLUS",
        TokenType::Minus => "MINUS",
        TokenType::Arrow => "ARROW",
        TokenType::Spread => "SPREAD",
        TokenType::Eq => "EQ",
        TokenType::Neq => "NEQ",
        TokenType::Seq => "SEQ",
        TokenType::Sneq => "SNEQ",
        TokenType::Le => "LE",
        TokenType::Ge => "GE",
        TokenType::DoubleLt => "DOUBLE_LT",
        TokenType::DoubleGt => "DOUBLE_GT",
        TokenType::TripleGt => "TRIPLE_GT",
        TokenType::And => "AND",
        TokenType::Or => "OR",
        TokenType::Nullish => "NULLISH",
        TokenType::Assign => "ASSIGN",
        TokenType::PlusAssign => "PLUS_ASSIGN",
        TokenType::MinusAssign => "MINUS_ASSIGN",
        TokenType::StarAssign => "STAR_ASSIGN",
        TokenType::SlashAssign => "SLASH_ASSIGN",
        TokenType::PercentAssign => "PERCENT_ASSIGN",
        TokenType::AmpAssign => "AMP_ASSIGN",
        TokenType::PipeAssign => "PIPE_ASSIGN",
        TokenType::CaretAssign => "CARET_ASSIGN",
        TokenType::ShlAssign => "SHL_ASSIGN",
        TokenType::ShrAssign => "SHR_ASSIGN",
        TokenType::UshrAssign => "USHR_ASSIGN",
        TokenType::ExpAssign => "EXP_ASSIGN",
        TokenType::NullishAssign => "NULLISH_ASSIGN",
        TokenType::AndAssign => "AND_ASSIGN",
        TokenType::OrAssign => "OR_ASSIGN",
        TokenType::OpenTag => "OPEN_TAG",
        TokenType::CloseTag => "CLOSE_TAG",
        TokenType::SelfClose => "SELF_CLOSE",
        TokenType::AttrValue => "ATTR_VALUE",
        TokenType::InterpStart => "INTERP_START",
        TokenType::InterpEnd => "INTERP_END",
        TokenType::StyleSep => "STYLE_SEP",
        TokenType::StyleEnd => "STYLE_END",
        TokenType::EventPrefix => "EVENT_PREFIX",
        TokenType::BindPrefix => "BIND_PREFIX",
        TokenType::DirectiveAt => "DIRECTIVE_AT",
        TokenType::Comment => "COMMENT",
        TokenType::Cdata => "CDATA",
        TokenType::Doctype => "DOCTYPE",
        TokenType::ScriptOpen => "SCRIPT_OPEN",
        TokenType::ScriptClose => "SCRIPT_CLOSE",
        TokenType::StyleOpen => "STYLE_OPEN",
        TokenType::StyleClose => "STYLE_CLOSE",
        TokenType::TwScriptOpen => "TW_SCRIPT_OPEN",
        TokenType::TwStyleOpen => "TW_STYLE_OPEN",
        TokenType::Newline => "NEWLINE",
        TokenType::Whitespace => "WHITESPACE",
        TokenType::Eof => "EOF",
        TokenType::Illegal => "ILLEGAL",
        TokenType::Error => "ERROR",
    }
}

impl std::fmt::Display for TokenType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", token_type_name(self))
    }
}

/// A forward-only cursor over the token stream.
/// Mirrors the TS TokenStream class.
pub struct TokenStream {
    tokens: Vec<Token>,
    index: usize,
    saved: Vec<usize>,
}

impl TokenStream {
    pub fn new(tokens: Vec<Token>) -> Self {
        Self { tokens, index: 0, saved: Vec::new() }
    }

    pub fn len(&self) -> usize { self.tokens.len() }
    pub fn is_empty(&self) -> bool { self.tokens.is_empty() }
    pub fn position(&self) -> usize { self.index }
    pub fn is_done(&self) -> bool { self.index >= self.tokens.len() }

    pub fn peek(&self, offset: usize) -> Option<&Token> {
        let idx = self.index + offset;
        self.tokens.get(idx)
    }

    pub fn peek_type(&self) -> Option<&TokenType> {
        self.tokens.get(self.index).map(|t| &t.token_type)
    }

    pub fn next(&mut self) -> Option<Token> {
        if self.index >= self.tokens.len() {
            return None;
        }
        let tok = self.tokens[self.index].clone();
        self.index += 1;
        Some(tok)
    }

    pub fn advance(&mut self) -> Option<Token> {
        self.next()
    }

    pub fn expect(&mut self, expected: &TokenType) -> Result<Token, String> {
        let tok = self.peek(0)
            .ok_or_else(|| format!("Expected {} but reached EOF", expected))?;
        if tok.token_type != *expected {
            return Err(format!(
                "Expected {} but got {} at {}:{}",
                expected, tok.token_type, tok.pos.line, tok.pos.col
            ));
        }
        Ok(self.advance().unwrap())
    }

    pub fn match_type(&mut self, tt: &TokenType) -> bool {
        if let Some(tok) = self.peek(0) {
            if tok.token_type == *tt {
                self.advance();
                return true;
            }
        }
        false
    }

    pub fn matches_any(&self, types: &[TokenType]) -> bool {
        if let Some(tok) = self.peek(0) {
            return types.contains(&tok.token_type);
        }
        false
    }

    pub fn skip_whitespace(&mut self) {
        while let Some(tok) = self.peek(0) {
            if tok.token_type == TokenType::Whitespace || tok.token_type == TokenType::Newline {
                self.advance();
            } else {
                break;
            }
        }
    }

    pub fn save(&mut self) {
        self.saved.push(self.index);
    }

    pub fn restore(&mut self) {
        if let Some(idx) = self.saved.pop() {
            self.index = idx;
        }
    }

    pub fn commit(&mut self) {
        self.saved.pop();
    }

    pub fn reset(&mut self) {
        self.index = 0;
        self.saved.clear();
    }

    pub fn find_matching(&self, open: &TokenType, close: &TokenType, start: Option<usize>) -> Option<usize> {
        let start = start.unwrap_or(self.index);
        let mut depth = 0i32;
        for (i, t) in self.tokens.iter().enumerate().skip(start) {
            if t.token_type == *open {
                depth += 1;
            } else if t.token_type == *close {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
        }
        None
    }

    pub fn slice(&self, start: usize, end: usize) -> &[Token] {
        &self.tokens[start..end.min(self.tokens.len())]
    }

    pub fn tokens(&self) -> &[Token] {
        &self.tokens
    }
}
