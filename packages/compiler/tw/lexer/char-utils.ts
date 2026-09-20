/**
 * Fast character classification -- lookup tables instead of regex.
 *
 * The old tokenizer used `/[a-zA-Z0-9-]/.test(ch)` on every character.
 * That's a regex compilation + match per character -- extremely slow.
 *
 * This module pre-computes lookup tables for all 128 ASCII characters
 * and provides O(1) lookup functions. Unicode chars fall through to
 * slower paths only when needed.
 *
 * Performance: ~10x faster than regex for char classification.
 */

// --- Character Sets (must be defined before tables that use them) -----

const OP_CHARS = new Set<number>([
  43, 45, 42, 47, 37, 61, 60, 62, 33, 38, 124, 94, 126, 63, 58, 59, 44, 46,
  40, 41, 91, 93, 123, 125, 64, 35, 36, 92,
  61, 33, 60, 62, 38, 124, 94, 42, 46, 63,
]);

const PUNCT_CHARS = new Set<number>([
  40, 41, 91, 93, 123, 125, 59, 44, 46, 58, 63, 33, 126,
]);

// --- Lookup Tables (256 entries, covers all ASCII + Latin-1) ----------

function buildTable(fn: (code: number) => boolean): Uint8Array {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    table[i] = fn(i) ? 1 : 0;
  }
  return table;
}

const TABLE_ALPHA_UPPER = buildTable((c) => c >= 65 && c <= 90);   // A-Z
const TABLE_ALPHA_LOWER = buildTable((c) => c >= 97 && c <= 122);  // a-z
export const TABLE_DIGIT       = buildTable((c) => c >= 48 && c <= 57);   // 0-9
const TABLE_HEX_DIGIT   = buildTable((c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102)); // 0-9a-fA-F
const TABLE_OCTAL       = buildTable((c) => c >= 48 && c <= 55);    // 0-7
const TABLE_BINARY      = buildTable((c) => c === 48 || c === 49); // 0-1
export const TABLE_WHITESPACE  = buildTable((c) => c === 32 || c === 9 || c === 11 || c === 12); // space, tab, vtab, formfeed
export const TABLE_LINE_TERM   = buildTable((c) => c === 10 || c === 13); // \n, \r
const TABLE_TAG_CHAR    = buildTable((c) => TABLE_ALPHA_UPPER[c] === 1 || TABLE_ALPHA_LOWER[c] === 1 || TABLE_DIGIT[c] === 1 || c === 45); // alphanumeric + -
export const TABLE_IDENT_START = buildTable((c) => TABLE_ALPHA_UPPER[c] === 1 || TABLE_ALPHA_LOWER[c] === 1 || c === 95 || c === 36); // letter, _, $
export const TABLE_IDENT_PART  = buildTable((c) => TABLE_IDENT_START[c] === 1 || TABLE_DIGIT[c] === 1); // ident_start + digit
const TABLE_ATTR_START  = buildTable((c) => TABLE_IDENT_START[c] === 1 || c === 58 || c === 64); // ident_start, :, @
const TABLE_ATTR_PART   = buildTable((c) => TABLE_IDENT_PART[c] === 1 || c === 58 || c === 64 || c === 46 || c === 45); // ident_part, :, @, ., -
export const TABLE_OP_CHAR     = buildTable((c) => OP_CHARS.has(c));
export const TABLE_PUNCT       = buildTable((c) => PUNCT_CHARS.has(c));
export const TABLE_STRING_DELIM = buildTable((c) => c === 34 || c === 39 || c === 96); // ", ', `
export const TABLE_VOID_TAG    = buildTable(() => false); // filled below

// (buildTable, OP_CHARS, PUNCT_CHARS defined above)

// --- Void / Raw Text Tags ---------------------------------------------

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const RAW_TEXT_TAGS = new Set([
  "script", "style", "textarea", "title", "xmp", "iframe",
  "noembed", "noframes", "plaintext",
]);

// --- Fast Lookup Functions --------------------------------------------

export function isAlphaUpper(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code > 255) return false;
  return TABLE_ALPHA_UPPER[code] === 1;
}

export function isAlphaLower(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code > 255) return false;
  return TABLE_ALPHA_LOWER[code] === 1;
}

export function isAlpha(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code > 255) return false;
  return TABLE_ALPHA_UPPER[code] === 1 || TABLE_ALPHA_LOWER[code] === 1;
}

export function isDigit(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code > 255) return false;
  return TABLE_DIGIT[code] === 1;
}

export function isHexDigit(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code > 255) return false;
  return TABLE_HEX_DIGIT[code] === 1;
}

export function isOctalDigit(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code > 255) return false;
  return TABLE_OCTAL[code] === 1;
}

export function isBinaryDigit(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code > 255) return false;
  return TABLE_BINARY[code] === 1;
}

export function isWhitespace(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code > 255) return ch === '\u00A0' || ch === '\uFEFF' || isUnicodeWhitespace(ch);
  return TABLE_WHITESPACE[code] === 1;
}

export function isLineTerminator(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code === 10 || code === 13) return true;
  // Unicode line terminators
  return ch === '\u2028' || ch === '\u2029';
}

export function isTagChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code > 255) return false;
  return TABLE_TAG_CHAR[code] === 1;
}

export function isIdentStart(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code > 255) return isUnicodeIdentStart(ch);
  return TABLE_IDENT_START[code] === 1;
}

export function isIdentPart(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code > 255) return isUnicodeIdentPart(ch);
  return TABLE_IDENT_PART[code] === 1;
}

export function isAttrNameStart(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code > 255) return false;
  return TABLE_ATTR_START[code] === 1;
}

export function isAttrNameChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code > 255) return false;
  return TABLE_ATTR_PART[code] === 1;
}

export function isOpChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code > 255) return false;
  return TABLE_OP_CHAR[code] === 1;
}

export function isPunct(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code > 255) return false;
  return TABLE_PUNCT[code] === 1;
}

export function isStringDelimiter(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code > 255) return false;
  return TABLE_STRING_DELIM[code] === 1;
}

export function isVoidTag(tag: string): boolean {
  return VOID_TAGS.has(tag.toLowerCase());
}

export function isRawTextTag(tag: string): boolean {
  return RAW_TEXT_TAGS.has(tag.toLowerCase());
}

// --- Unicode Helpers (fallback for non-ASCII) -------------------------

function isUnicodeWhitespace(ch: string): boolean {
  // Common Unicode whitespace
  const code = ch.codePointAt(0)!;
  return code === 0x00A0 || code === 0x1680 || code === 0x2000 ||
         code === 0x2001 || code === 0x2002 || code === 0x2003 ||
         code === 0x2004 || code === 0x2005 || code === 0x2006 ||
         code === 0x2007 || code === 0x2008 || code === 0x2009 ||
         code === 0x200A || code === 0x202F || code === 0x205F ||
         code === 0x3000 || code === 0xFEFF;
}

function isUnicodeIdentStart(ch: string): boolean {
  const code = ch.codePointAt(0)!;
  // Unicode categories: Lu, Ll, Lt, Lm, Lo, Nl
  // Simplified: check common ranges
  if (code >= 0x00AA && code <= 0x00AA) return true; // ?
  if (code >= 0x00B5 && code <= 0x00B5) return true; // ?
  if (code >= 0x00BA && code <= 0x00BA) return true; // ?
  if (code >= 0x00C0 && code <= 0x00D6) return true; // ?-?
  if (code >= 0x00D8 && code <= 0x00F6) return true; // ?-?
  if (code >= 0x00F8 && code <= 0x02C1) return true; // ?-?
  if (code >= 0x0900 && code <= 0x097F) return true; // Devanagari
  if (code >= 0x0980 && code <= 0x09FF) return true; // Bengali
  if (code >= 0x0A00 && code <= 0x0A7F) return true; // Gurmukhi
  if (code >= 0x0A80 && code <= 0x0AFF) return true; // Gujarati
  if (code >= 0x0B00 && code <= 0x0B7F) return true; // Oriya
  if (code >= 0x0B80 && code <= 0x0BFF) return true; // Tamil
  if (code >= 0x0C00 && code <= 0x0C7F) return true; // Telugu
  if (code >= 0x0C80 && code <= 0x0CFF) return true; // Kannada
  if (code >= 0x0D00 && code <= 0x0D7F) return true; // Malayalam
  if (code >= 0x0E00 && code <= 0x0E7F) return true; // Thai
  // CJK
  if (code >= 0x4E00 && code <= 0x9FFF) return true;   // CJK Unified
  if (code >= 0x3040 && code <= 0x309F) return true;   // Hiragana
  if (code >= 0x30A0 && code <= 0x30FF) return true;   // Katakana
  return false;
}

function isUnicodeIdentPart(ch: string): boolean {
  if (isUnicodeIdentStart(ch)) return true;
  const code = ch.codePointAt(0)!;
  // Nd: Decimal number (0-9 in various scripts)
  if (code >= 0x0660 && code <= 0x0669) return true; // Arabic-Indic
  if (code >= 0x06F0 && code <= 0x06F9) return true; // Extended Arabic-Indic
  if (code >= 0x0966 && code <= 0x096F) return true; // Devanagari digits
  if (code >= 0x09E6 && code <= 0x09EF) return true; // Bengali digits
  return false;
}

// --- Character Code Helpers ------------------------------------------

export function charCode(ch: string): number {
  return ch.charCodeAt(0);
}

export function fromCode(code: number): string {
  return String.fromCharCode(code);
}

export function toHexDigit(code: number): string {
  return code < 10 ? String.fromCharCode(48 + code) : String.fromCharCode(87 + code);
}

export function isControlChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code < 0x20 || code === 0x7F;
}

export function isPrintable(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= 0x20 && code !== 0x7F;
}

// --- Multi-Char Operator Matching -------------------------------------

/**
 * 3-char operators sorted by frequency of occurrence.
 * Checked first because longest-match rule.
 */
const OPS_3: readonly string[] = [
  "===", "!==", ">>>", "**=", "...", "<<=", ">>=", ">>>=",
  "&&=", "||=", "??=", "?.",
];

const OPS_2: readonly string[] = [
  "==", "!=", "<=", ">=", "&&", "||", "??", "=>",
  "<<", ">>", "**", "++", "--",
  "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "~=",
];

/**
 * Match the longest operator at position `pos` in `source`.
 * Returns the matched operator string or null.
 *
 * This is faster than the old approach (creating substrings and
 * calling startsWith) because it compares char codes directly.
 */
export function matchOperator(source: string, pos: number): string | null {
  const len = source.length;
  if (pos >= len) return null;

  // Try 3-char operators
  if (pos + 2 < len) {
    const c0 = source.charCodeAt(pos);
    const c1 = source.charCodeAt(pos + 1);
    const c2 = source.charCodeAt(pos + 2);

    // Quick filter by first char to avoid checking all 3-char ops
    if (c0 === 61 && c1 === 61 && c2 === 61) return "===";
    if (c0 === 33 && c1 === 61 && c2 === 61) return "!==";
    if (c0 === 62 && c1 === 62 && c2 === 62) return ">>>";
    if (c0 === 42 && c1 === 42 && c2 === 61) return "**=";
    if (c0 === 46 && c1 === 46 && c2 === 46) return "...";
    if (c0 === 60 && c1 === 60 && c2 === 61) return "<<=";
    if (c0 === 62 && c1 === 62 && c2 === 61) return ">>=";
    if (c0 === 38 && c1 === 38 && c2 === 61) return "&&=";
    if (c0 === 124 && c1 === 124 && c2 === 61) return "||=";
    if (c0 === 63 && c1 === 46) return "?.";
    // >>>= (5 chars but we handle 3 prefix + check =)
    if (c0 === 62 && c1 === 62 && c2 === 62 && pos + 3 < len && source.charCodeAt(pos + 3) === 61) return ">>>=";
    if (c0 === 63 && c1 === 63 && c2 === 61) return "??=";
  }

  // Try 2-char operators
  if (pos + 1 < len) {
    const c0 = source.charCodeAt(pos);
    const c1 = source.charCodeAt(pos + 1);

    if (c0 === 61 && c1 === 61) return "==";
    if (c0 === 33 && c1 === 61) return "!=";
    if (c0 === 60 && c1 === 61) return "<=";
    if (c0 === 62 && c1 === 61) return ">=";
    if (c0 === 38 && c1 === 38) return "&&";
    if (c0 === 124 && c1 === 124) return "||";
    if (c0 === 63 && c1 === 63) return "??";
    if (c0 === 61 && c1 === 62) return "=>";
    if (c0 === 60 && c1 === 60) return "<<";
    if (c0 === 62 && c1 === 62) return ">>";
    if (c0 === 42 && c1 === 42) return "**";
    if (c0 === 43 && c1 === 43) return "++";
    if (c0 === 45 && c1 === 45) return "--";
    if (c0 === 43 && c1 === 61) return "+=";
    if (c0 === 45 && c1 === 61) return "-=";
    if (c0 === 42 && c1 === 61) return "*=";
    if (c0 === 47 && c1 === 61) return "/=";
    if (c0 === 37 && c1 === 61) return "%=";
    if (c0 === 38 && c1 === 61) return "&=";
    if (c0 === 124 && c1 === 61) return "|=";
    if (c0 === 94 && c1 === 61) return "^=";
    if (c0 === 126 && c1 === 61) return "~=";
  }

  // 1-char operators
  const c = source.charCodeAt(pos);
  if (c === 43 || c === 45 || c === 42 || c === 47 || c === 37 ||
      c === 61 || c === 60 || c === 62 || c === 33 || c === 38 ||
      c === 124 || c === 94 || c === 126 || c === 63 || c === 58 ||
      c === 59 || c === 44 || c === 46 || c === 40 || c === 41 ||
      c === 91 || c === 93 || c === 123 || c === 125 || c === 64 ||
      c === 35 || c === 36 || c === 96 || c === 92) {
    return source[pos];
  }

  return null;
}

// --- Source Position Tracking ----------------------------------------

/**
 * Tracks line:col:offset while scanning.
 * Incremental update -- O(1) per character.
 */
export class PositionTracker {
  line = 1;
  col = 1;
  offset = 0;
  prevChar = "";

  advance(ch: string): void {
    if (ch === '\n') {
      this.line++;
      this.col = 1;
    } else if (ch === '\r') {
      // Handle \r\n -- don't count \r as a line if followed by \n
      // The \n will handle it
    } else {
      this.col++;
    }
    this.prevChar = ch;
    this.offset++;
  }

  advanceStr(s: string): void {
    for (let i = 0; i < s.length; i++) {
      this.advance(s[i]);
    }
  }

  snapshot(): { line: number; col: number; offset: number } {
    return { line: this.line, col: this.col, offset: this.offset };
  }

  reset(line: number, col: number, offset: number): void {
    this.line = line;
    this.col = col;
    this.offset = offset;
  }
}



export function isStringDelim(code: number): boolean {
  return code === 34 || code === 39 || code === 96;
}

export function isLineTerm(code: number): boolean {
  return code === 10 || code === 13;
}
