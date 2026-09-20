/// TW bridge — exposes the Rust compiler as a library that can be called from
/// TypeScript via a child process (stdin/stdout JSON protocol) or via napi-rs.
///
/// The bridge accepts a .tw source string and returns JSON with:
///   { html, css, js, diagnostics, metadata }

use serde::{Deserialize, Serialize};
use tw_lexer::{tokenize, TokenizerOptions};
use tw_parser::parse_with_options;
use tw_codegen::{generate, CompileOutput};

#[derive(Debug, Serialize, Deserialize)]
pub struct BridgeRequest {
    pub source: String,
    #[serde(default)]
    pub file_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BridgeResponse {
    pub html: String,
    pub css: String,
    pub js: String,
    pub diagnostics: Vec<String>,
    pub metadata: BridgeMetadata,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BridgeMetadata {
    pub total_time_us: u64,
    pub node_count: usize,
    pub directive_count: usize,
}

impl From<CompileOutput> for BridgeResponse {
    fn from(out: CompileOutput) -> Self {
        BridgeResponse {
            html: out.html,
            css: out.css,
            js: out.js,
            diagnostics: out.diagnostics,
            metadata: BridgeMetadata {
                total_time_us: out.metadata.total_time_us,
                node_count: out.metadata.node_count,
                directive_count: out.metadata.directive_count,
            },
        }
    }
}

/// Compile a .tw source string — the main entry point for the bridge.
pub fn compile(source: &str, file_path: Option<&str>) -> BridgeResponse {
    let mut opts = TokenizerOptions::new();
    if let Some(path) = file_path {
        opts.file_path = Some(path.to_string());
    }

    let parse_result = parse_with_options(source, Some(opts));
    let output = generate(&parse_result.program);
    output.into()
}

/// Compile from JSON request to JSON response string.
/// Used by the CLI binary for stdin/stdout protocol.
pub fn compile_json(input: &str) -> Result<String, serde_json::Error> {
    let req: BridgeRequest = serde_json::from_str(input)?;
    let resp = compile(&req.source, req.file_path.as_deref());
    serde_json::to_string(&resp)
}

/// Compile and return just the HTML.
pub fn compile_to_html(source: &str) -> String {
    compile(source, None).html
}

/// Tokenize and return token count (for debugging).
pub fn count_tokens(source: &str) -> usize {
    tokenize(source, None).tokens.len()
}
