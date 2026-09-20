//! tw-rust CLI binary — compiles .tw files using the Rust compiler.
//!
//! Usage:
//!   tw-rust <file.tw>          — compile and print HTML
//!   tw-rust --json < file.tw   — stdin JSON protocol
//!   tw-rust --tokens <file.tw> — print token count
//!   tw-rust --version          — print version

use std::io::{self, Read, Write};
use std::fs;
use std::path::PathBuf;
use tw_bridge::{compile, compile_json, compile_to_html, count_tokens};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let prog = args.first().map(|s| s.as_str()).unwrap_or("tw-rust");

    if args.len() < 2 {
        eprintln!("Usage: {} <file.tw> [--json|--tokens|--version]", prog);
        std::process::exit(1);
    }

    match args[1].as_str() {
        "--version" | "-V" => {
            println!("tw-rust {}", env!("CARGO_PKG_VERSION"));
            return;
        }
        "--json" => {
            // Read JSON from stdin
            let mut input = String::new();
            io::stdin().read_to_string(&mut input).unwrap_or(0);
            match compile_json(&input) {
                Ok(json) => {
                    println!("{}", json);
                }
                Err(e) => {
                    eprintln!("Error: {}", e);
                    std::process::exit(1);
                }
            }
            return;
        }
        "--tokens" => {
            let file = &args[2];
            match fs::read_to_string(file) {
                Ok(source) => {
                    let count = count_tokens(&source);
                    println!("{} tokens", count);
                }
                Err(e) => {
                    eprintln!("Cannot read {}: {}", file, e);
                    std::process::exit(1);
                }
            }
            return;
        }
        "--help" | "-h" => {
            println!("tw-rust {} — TW Framework Rust compiler", env!("CARGO_PKG_VERSION"));
            println!();
            println!("Usage:");
            println!("  tw-rust <file.tw>         Compile and print HTML");
            println!("  tw-rust --json            Read JSON from stdin, output JSON");
            println!("  tw-rust --tokens <file>   Print token count");
            println!("  tw-rust --version         Print version");
            println!("  tw-rust --help            Show this help");
            return;
        }
        file_path => {
            let path = PathBuf::from(file_path);
            match fs::read_to_string(&path) {
                Ok(source) => {
                    let file_path_str = path.to_str();
                    let response = compile(&source, file_path_str);
                    if !response.html.is_empty() {
                        let stdout = io::stdout();
                        let _ = write!(stdout.lock(), "{}", response.html);
                    }
                    if !response.diagnostics.is_empty() {
                        for d in &response.diagnostics {
                            eprintln!("warning: {}", d);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Cannot read {}: {}", file_path, e);
                    std::process::exit(1);
                }
            }
        }
    }
}
