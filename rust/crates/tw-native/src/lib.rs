#![deny(clippy::all)]

/// TW Framework native binding via napi-rs.
///
/// This crate exposes the Rust compiler as a native Node.js addon (.node file).
/// After building, the resulting .node file is loaded directly by Node/Bun —
/// no child process, no IPC overhead, function calls go through V8's FFI.
///
/// Build:
///   cd rust && cargo build -p tw-native --release
///   # or via napi-rs CLI:
///   napi build --release --platform
///
/// Usage from TS:
///   import { compile } from "@tw/native";
///   const result = compile("<div>hello</div>");
///   // result.html, result.css, result.js, result.diagnostics

use napi::bindgen_prelude::*;
use napi_derive::napi;

use tw_lexer::{tokenize, TokenizerOptions};
use tw_parser::parse_with_options;
use tw_codegen::generate;

/// Compile a .tw source string into HTML/CSS/JS.
/// Returns a JSON string (parsed on the JS side).
///
/// This is the primary entry point — same as the child process bridge
/// but called directly in-process with zero IPC overhead.
#[napi]
pub fn compile(source: String, file_path: Option<String>) -> String {
    let mut opts = TokenizerOptions::new();
    if let Some(ref path) = file_path {
        opts.file_path = Some(path.clone());
    }

    let parse_result = parse_with_options(&source, Some(opts));
    let output = generate(&parse_result.program);

    serde_json::json!({
        "html": output.html,
        "css": output.css,
        "js": output.js,
        "diagnostics": output.diagnostics,
        "metadata": {
            "totalTimeUs": output.metadata.total_time_us,
            "nodeCount": output.metadata.node_count,
            "directiveCount": output.metadata.directive_count,
        }
    }).to_string()
}

/// Compile and return only the HTML — faster when you don't need CSS/JS/diagnostics.
#[napi]
pub fn compile_html(source: String) -> String {
    let parse_result = parse_with_options(&source, None);
    let output = generate(&parse_result.program);
    output.html
}

/// Tokenize source and return token count. Useful for debugging and benchmarks.
#[napi]
pub fn count_tokens(source: String) -> u32 {
    tokenize(&source, None).tokens.len() as u32
}

/// Tokenize source and return a JSON array of tokens (for debugging/LSP).
#[napi]
pub fn tokenize_json(source: String) -> String {
    let result = tokenize(&source, None);
    let tokens: Vec<serde_json::Value> = result.tokens.iter().map(|t| {
        serde_json::json!({
            "type": format!("{:?}", t.token_type),
            "value": t.value,
            "line": t.pos.line,
            "col": t.pos.col,
            "offset": t.pos.offset,
        })
    }).collect();

    serde_json::json!({
        "tokens": tokens,
        "errors": result.errors.iter().map(|e| {
            serde_json::json!({
                "message": e.message,
                "line": e.line,
                "col": e.col,
                "offset": e.offset,
            })
        }).collect::<Vec<_>>(),
    }).to_string()
}

/// Parse source and return AST as JSON (for debugging/LSP/tools).
#[napi]
pub fn parse_json(source: String) -> String {
    let parse_result = parse_with_options(&source, None);

    let body: Vec<serde_json::Value> = parse_result.program.body.iter().map(|n| {
        serde_json::json!({
            "type": format!("{:?}", n),
        })
    }).collect();

    let directives: Vec<serde_json::Value> = parse_result.program.directives.iter().map(|d| {
        serde_json::json!({
            "kind": format!("{:?}", d.kind),
            "name": d.name,
            "body": d.body,
        })
    }).collect();

    serde_json::json!({
        "body": body,
        "directives": directives,
        "errors": parse_result.errors.iter().map(|e| {
            serde_json::json!({
                "message": e.message,
                "line": e.line,
                "col": e.col,
            })
        }).collect::<Vec<_>>(),
    }).to_string()
}

/// Check if the native binding is available (always returns true — this IS the native binding).
/// Used by the hybrid compiler to detect which backend to use.
#[napi]
pub fn is_native() -> bool {
    true
}

/// Get the version of the native compiler.
#[napi]
pub fn native_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
