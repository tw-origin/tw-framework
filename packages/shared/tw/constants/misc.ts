/** MIME types, router keys, file conventions, JS reserved words, VLQ, perf marks. */

export const MIME_TYPES: Record<string, string> = {
  ".html": "text/html", ".htm": "text/html", ".css": "text/css",
  ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".xml": "application/xml",
  ".txt": "text/plain", ".md": "text/markdown", ".csv": "text/csv",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".avif": "image/avif", ".ico": "image/x-icon", ".bmp": "image/bmp",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".otf": "font/otf", ".pdf": "application/pdf", ".zip": "application/zip",
  ".gz": "application/gzip", ".tar": "application/x-tar",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg", ".wav": "audio/wav", ".wasm": "application/wasm",
  ".tw": "text/tw", ".tss": "text/tss", ".toml": "application/toml",
  ".yaml": "application/yaml", ".yml": "application/yaml",
  ".webmanifest": "application/manifest+json",
};

export const ROUTER_KEYS = new Set([
  "page", "layout", "loading", "error", "not-found", "template",
  "default", "route", "middleware", "handler",
]);

export const FILE_CONVENTIONS = new Set([
  "page.tw", "layout.tw", "loading.tw", "error.tw", "not-found.tw",
  "template.tw", "default.tw", "route.ts", "middleware.ts", "handler.ts",
  "head.tw",
]);

export const JS_RESERVED = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "export", "extends", "finally", "for",
  "function", "if", "import", "in", "instanceof", "new", "return", "super",
  "switch", "this", "throw", "try", "typeof", "var", "void", "while", "with",
  "yield", "let", "static", "enum", "await", "implements", "interface",
  "package", "private", "protected", "public", "null", "true", "false",
  "undefined", "NaN", "Infinity", "globalThis", "arguments",
]);

export const VLQ_BASE_SHIFT = 5;
export const VLQ_BASE = 1 << VLQ_BASE_SHIFT;
export const VLQ_BASE_MASK = VLQ_BASE - 1;
export const VLQ_CONTINUATION_BIT = VLQ_BASE;

export const VLQ_BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export const PERF_MARKS = {
  LEX_START: "tw:lex:start", LEX_END: "tw:lex:end",
  PARSE_START: "tw:parse:start", PARSE_END: "tw:parse:end",
  CODEGEN_START: "tw:codegen:start", CODEGEN_END: "tw:codegen:end",
  OPTIMIZE_START: "tw:optimize:start", OPTIMIZE_END: "tw:optimize:end",
  TRANSFORM_START: "tw:transform:start", TRANSFORM_END: "tw:transform:end",
  DIAGNOSE_START: "tw:diagnose:start", DIAGNOSE_END: "tw:diagnose:end",
  COMPILE_START: "tw:compile:start", COMPILE_END: "tw:compile:end",
} as const;
