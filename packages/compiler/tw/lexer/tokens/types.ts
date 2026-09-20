/**
 * Token types for the TW lexer.
 * Every token carries source position (line, col, offset) for diagnostics
 * and source map generation.
 */

export type TokenType =
  // Literals
  | "TEXT"           // Plain text content
  | "STRING"         // Quoted string "..." or '...'
  | "NUMBER"         // Numeric literal 42, 3.14, 0xFF
  | "BOOLEAN"        // true, false
  | "NULL"           // null, undefined
  | "REGEX"          // /pattern/flags
  | "TEMPLATE"       // `template literal`

  // Identifiers & Keywords
  | "IDENT"          // identifier (variable name, tag name)
  | "KEYWORD"        // TW keyword (page, state, render, etc.)
  | "TAG_NAME"       // HTML tag name
  | "ATTR_NAME"      // attribute name
  | "COMPONENT_NAME" // Component name (PascalCase)
  | "CSS_PROP"       // CSS property name
  | "CSS_VALUE"      // CSS value
  | "EVENT_NAME"      // event name (click, input, etc.)
  | "DIRECTIVE"      // @directive name

  // Punctuation & Operators
  | "LBRACE"         // {
  | "RBRACE"         // }
  | "LBRACKET"       // [
  | "RBRACKET"       // ]
  | "LPAREN"         // (
  | "RPAREN"         // )
  | "LT"             // <
  | "GT"             // >
  | "SLASH"          // /
  | "BACKSLASH"      // \
  | "EQUALS"         // =
  | "COLON"          // :
  | "SEMICOLON"      // ;
  | "COMMA"          // ,
  | "DOT"            // .
  | "AT"             // @
  | "HASH"           // #
  | "DOLLAR"         // $
  | "QUESTION"       // ?
  | "BANG"           // !
  | "TILDE"          // ~
  | "PIPE"           // |
  | "AMPERSAND"      // &
  | "CARET"          // ^
  | "PERCENT"        // %
  | "STAR"           // *
  | "PLUS"           // +
  | "MINUS"          // -
  | "ARROW"          // =>
  | "DOUBLE_ARROW"   // =>
  | "SPREAD"         // ...

  // Comparison
  | "EQ"             // ==
  | "NEQ"             // !=
  | "SEQ"            // ===
  | "SNEQ"           // !==
  | "LE"             // <=
  | "GE"             // >=
  | "DOUBLE_LT"      // <<
  | "DOUBLE_GT"      // >>
  | "TRIPLE_GT"      // >>>

  // Logical
  | "AND"            // &&
  | "OR"             // ||
  | "NULLISH"        // ??

  // Assignment
  | "ASSIGN"         // =
  | "PLUS_ASSIGN"    // +=
  | "MINUS_ASSIGN"  // -=
  | "STAR_ASSIGN"   // *=
  | "SLASH_ASSIGN"  // /=
  | "PERCENT_ASSIGN" // %=
  | "AMP_ASSIGN"    // &=
  | "PIPE_ASSIGN"   // |=
  | "CARET_ASSIGN"  // ^=
  | "SHL_ASSIGN"    // <<=
  | "SHR_ASSIGN"    // >>=
  | "USHR_ASSIGN"   // >>>=
  | "EXP_ASSIGN"    // **=
  | "NULLISH_ASSIGN" // ??=
  | "AND_ASSIGN"    // &&=
  | "OR_ASSIGN"     // ||=

  // TW-specific
  | "OPEN_TAG"       // <div
  | "CLOSE_TAG"      // </div>
  | "SELF_CLOSE"     // />
  | "ATTR_VALUE"     // ="value"
  | "INTERP_START"   // {
  | "INTERP_END"     // }
  | "STYLE_SEP"      // :
  | "STYLE_END"      // ;
  | "EVENT_PREFIX"   // on:
  | "BIND_PREFIX"    // :
  | "DIRECTIVE_AT"   // @
  | "COMMENT"        // <!-- -->
  | "CDATA"          // <![CDATA[ ]]>
  | "DOCTYPE"        // <!DOCTYPE html>

  // Block markers
  | "SCRIPT_OPEN"    // <script>
  | "SCRIPT_CLOSE"   // </script>
  | "STYLE_OPEN"     // <style>
  | "STYLE_CLOSE"    // </style>
  | "TW_SCRIPT_OPEN" // <script lang="tw">
  | "TW_STYLE_OPEN"  // <style lang="tss">

  // Special
  | "NEWLINE"        // \n
  | "WHITESPACE"     // space, tab
  | "EOF"            // End of file
  | "ILLEGAL"        // Unrecognized character
  | "ERROR"          // Lexer error token
;

export interface TokenPosition {
  line: number;
  col: number;
  offset: number;
}

export interface Token {
  type: TokenType;
  value: string;
  pos: TokenPosition;
  end: TokenPosition;
  // For multi-line tokens (strings, templates, comments)
  hasNewline: boolean;
  // Preceding whitespace (for context-sensitive parsing)
  precededByWhitespace: boolean;
  // Followed by whitespace
  followedByWhitespace: boolean;
  // Original source text (may differ from value for strings/regexes)
  raw: string;
  // For error tokens
  error?: string;
  // Token flags
  flags?: TokenFlags;
}

export interface TokenFlags {
  inInterpolation?: boolean;
  inTag?: boolean;
  inAttrValue?: boolean;
  inStyle?: boolean;
  inScript?: boolean;
  escaped?: boolean;
  // For template literals
  templateExpr?: boolean;
}

export interface SourceLocation {
  start: TokenPosition;
  end: TokenPosition;
  filePath?: string;
}

export interface SourceSpan {
  start: SourceLocation;
  end: SourceLocation;
}

export function makeToken(
  type: TokenType,
  value: string,
  pos: TokenPosition,
  end: TokenPosition,
  opts?: {
    raw?: string;
    hasNewline?: boolean;
    precededByWhitespace?: boolean;
    followedByWhitespace?: boolean;
    error?: string;
    flags?: TokenFlags;
  },
): Token {
  return {
    type,
    value,
    pos,
    end,
    hasNewline: opts?.hasNewline ?? false,
    precededByWhitespace: opts?.precededByWhitespace ?? false,
    followedByWhitespace: opts?.followedByWhitespace ?? false,
    raw: opts?.raw ?? value,
    error: opts?.error,
    flags: opts?.flags,
  };
}

// --- Token Type Helpers ------------------------------------------------------

const KEYWORDS = new Set([
  "page", "head", "body", "section", "layout",
  "load", "state", "render", "revalidate", "redirect", "rewrite",
  "import", "export", "default", "const", "let", "var",
  "if", "else", "elif", "for", "while", "switch", "case", "break", "continue",
  "function", "return", "class", "extends", "super", "new", "delete",
  "typeof", "instanceof", "in", "of", "as", "is",
  "true", "false", "null", "undefined",
  "try", "catch", "finally", "throw",
  "async", "await", "yield", "static", "get", "set",
  "this", "arguments", "globalThis",
  "void", "with", "debugger",
  // TW-specific
  "component", "slot", "props", "emit", "defineProps", "defineEmits",
  "defineExpose", "defineOptions", "defineSlots",
  "computed", "watch", "ref", "reactive", "shallowRef", "shallowReactive",
  "readonly", "shallowReadonly", "toRef", "toRefs", "unref",
  "provide", "inject", "h", "defineComponent", "createApp",
  "onMount", "onUnmount", "onUpdate", "useEffect", "useMemo", "useCallback",
  "useState", "useRef", "useContext", "useReducer",
  "scoped", "global", "module", "use",
  "static", "dynamic", "streaming", "edge", "server", "client", "ISR",
]);

const OPERATORS = new Set([
  "==", "===", "!=", "!==", "<", ">", "<=", ">=",
  "<<", ">>", ">>>", "+", "-", "*", "/", "%", "**",
  "&", "|", "^", "~", "!", "&&", "||", "??",
  "=", "+=", "-=", "*=", "/=", "%=", "**=",
  "&=", "|=", "^=", "<<=", ">>=", ">>>=",
  "&&=", "||=", "??=",
  "=>", "...", "?", ":", ";", ",", ".",
  "(", ")", "[", "]", "{", "}",
  "@", "#", "$", "~", "`",
]);

export function isKeyword(value: string): boolean {
  return KEYWORDS.has(value);
}

export function isOperator(value: string): boolean {
  return OPERATORS.has(value);
}

export function isLiteral(type: TokenType): boolean {
  return type === "STRING" || type === "NUMBER" || type === "BOOLEAN" || type === "NULL" || type === "REGEX" || type === "TEMPLATE";
}

export function isIdentifier(type: TokenType): boolean {
  return type === "IDENT" || type === "KEYWORD";
}

export function isPunctuation(type: TokenType): boolean {
  return [
    "LBRACE", "RBRACE", "LBRACKET", "RBRACKET", "LPAREN", "RPAREN",
    "LT", "GT", "SLASH", "BACKSLASH", "EQUALS", "COLON", "SEMICOLON",
    "COMMA", "DOT", "AT", "HASH", "DOLLAR", "QUESTION", "BANG", "TILDE",
    "PIPE", "AMPERSAND", "CARET", "PERCENT", "STAR", "PLUS", "MINUS",
  ].includes(type);
}

export function isComparison(type: TokenType): boolean {
  return ["EQ", "NEQ", "SEQ", "SNEQ", "LE", "GE", "LT", "GT"].includes(type);
}

export function isLogical(type: TokenType): boolean {
  return ["AND", "OR", "NULLISH"].includes(type);
}

export function isAssignment(type: TokenType): boolean {
  return [
    "ASSIGN", "PLUS_ASSIGN", "MINUS_ASSIGN", "STAR_ASSIGN",
    "SLASH_ASSIGN", "PERCENT_ASSIGN", "AMP_ASSIGN", "PIPE_ASSIGN",
    "CARET_ASSIGN", "SHL_ASSIGN", "SHR_ASSIGN", "USHR_ASSIGN",
    "EXP_ASSIGN", "NULLISH_ASSIGN", "AND_ASSIGN", "OR_ASSIGN",
  ].includes(type);
}

export function isArithmetic(type: TokenType): boolean {
  return ["PLUS", "MINUS", "STAR", "SLASH", "PERCENT"].includes(type);
}

export function isOpenToken(type: TokenType): boolean {
  return ["LBRACE", "LBRACKET", "LPAREN"].includes(type);
}

export function isCloseToken(type: TokenType): boolean {
  return ["RBRACE", "RBRACKET", "RPAREN"].includes(type);
}

export function matchingPair(open: TokenType): TokenType | null {
  switch (open) {
    case "LBRACE":   return "RBRACE";
    case "LBRACKET": return "RBRACKET";
    case "LPAREN":   return "RPAREN";
    default: return null;
  }
}

export function tokenTypeName(type: TokenType): string {
  return type;
}

export function describeToken(token: Token): string {
  const pos = `${token.pos.line}:${token.pos.col}`;
  if (token.error) {
    return `${token.type}(${pos}) ERROR: ${token.error}`;
  }
  const val = token.value.length > 40 ? token.value.slice(0, 37) + "..." : token.value;
  return `${token.type}(${pos}) "${val}"`;
}

// --- Token Stream -------------------------------------------------------------

export class TokenStream {
  private tokens: Token[];
  private index: number = 0;
  private saved: number[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  get length(): number { return this.tokens.length; }
  get position(): number { return this.index; }
  get done(): boolean { return this.index >= this.tokens.length; }

  peek(offset: number = 0): Token | null {
    const idx = this.index + offset;
    if (idx < 0 || idx >= this.tokens.length) return null;
    return this.tokens[idx];
  }

  next(): Token | null {
    if (this.index >= this.tokens.length) return null;
    return this.tokens[this.index++];
  }

  advance(): Token | null {
    return this.next();
  }

  expect(type: TokenType): Token {
    const token = this.peek();
    if (!token) throw new Error(`Expected ${type} but reached EOF`);
    if (token.type !== type) {
      throw new Error(`Expected ${type} but got ${token.type} at ${token.pos.line}:${token.pos.col}`);
    }
    this.advance();
    return token;
  }

  match(type: TokenType): boolean {
    const token = this.peek();
    if (token && token.type === type) {
      this.advance();
      return true;
    }
    return false;
  }

  matches(...types: TokenType[]): boolean {
    const token = this.peek();
    return token !== null && types.includes(token.type);
  }

  consumeWhile(predicate: (t: Token) => boolean): Token[] {
    const consumed: Token[] = [];
    while (!this.done) {
      const token = this.peek()!;
      if (!predicate(token)) break;
      consumed.push(token);
      this.advance();
    }
    return consumed;
  }

  skipWhitespace(): void {
    while (!this.done) {
      const t = this.peek()!;
      if (t.type === "WHITESPACE" || t.type === "NEWLINE") {
        this.advance();
      } else {
        break;
      }
    }
  }

  skipNewlines(): void {
    while (!this.done) {
      const t = this.peek()!;
      if (t.type === "NEWLINE" || t.type === "WHITESPACE") {
        this.advance();
      } else {
        break;
      }
    }
  }

  save(): void {
    this.saved.push(this.index);
  }

  restore(): void {
    if (this.saved.length > 0) {
      this.index = this.saved.pop()!;
    }
  }

  commit(): void {
    this.saved.pop();
  }

  reset(): void {
    this.index = 0;
    this.saved = [];
  }

  toArray(): Token[] {
    return [...this.tokens];
  }

  slice(start: number, end: number): Token[] {
    return this.tokens.slice(start, end);
  }

  filter(predicate: (t: Token) => boolean): Token[] {
    return this.tokens.filter(predicate);
  }

  // Find the matching close token for an open token
  findMatching(openType: TokenType, closeType: TokenType, startIndex?: number): number {
    const start = startIndex ?? this.index;
    let depth = 0;

    for (let i = start; i < this.tokens.length; i++) {
      const t = this.tokens[i];
      if (t.type === openType) depth++;
      else if (t.type === closeType) {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }
}

// --- Source Map Utilities -----------------------------------------------------

export interface SourceMapEntry {
  generatedLine: number;
  generatedCol: number;
  sourceLine: number;
  sourceCol: number;
  sourceFile?: string;
  name?: string;
}

export class SourceMapBuilder {
  private entries: SourceMapEntry[] = [];
  private names: string[] = [];

  add(entry: SourceMapEntry): void {
    if (entry.name && !this.names.includes(entry.name)) {
      this.names.push(entry.name);
      entry.name = entry.name;
    }
    this.entries.push(entry);
  }

  toJSON(): { version: number; mappings: string; names: string[]; sources: string[] } {
    return {
      version: 3,
      mappings: this.encodeMappings(),
      names: this.names,
      sources: [],
    };
  }

  private encodeMappings(): string {
    // VLQ encoded source map mappings
    let prevGenLine = 0;
    let prevGenCol = 0;
    let prevSrcLine = 0;
    let prevSrcCol = 0;
    const segments: string[] = [];

    for (const entry of this.entries) {
      const lineDelta = entry.generatedLine - prevGenLine;
      const fields: number[] = [];

      if (lineDelta > 0) {
        for (let i = 0; i < lineDelta; i++) segments.push(";");
        prevGenCol = 0;
      }

      const colDelta = entry.generatedCol - prevGenCol;
      const srcLineDelta = entry.sourceLine - prevSrcLine;
      const srcColDelta = entry.sourceCol - prevSrcCol;

      fields.push(colDelta);
      fields.push(0);
      fields.push(srcLineDelta);
      fields.push(srcColDelta);

      const nameIdx = entry.name ? this.names.indexOf(entry.name) : -1;
      if (nameIdx >= 0) fields.push(nameIdx);

      segments.push(fields.map(f => vlqEncode(f)).join(","));
      segments.push(",");

      prevGenLine = entry.generatedLine;
      prevGenCol = entry.generatedCol;
      prevSrcLine = entry.sourceLine;
      prevSrcCol = entry.sourceCol;
    }

    return segments.join("");
  }
}

const VLQ_BASE_SHIFT = 5;
const VLQ_BASE = 1 << VLQ_BASE_SHIFT;
const VLQ_BASE_MASK = VLQ_BASE - 1;
const VLQ_CONTINUATION_BIT = VLQ_BASE;
const VLQ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function vlqEncode(value: number): string {
  let result = "";
  let vlq = value < 0 ? (-value << 1) | 1 : value << 1;

  do {
    let digit = vlq & VLQ_BASE_MASK;
    vlq >>= VLQ_BASE_SHIFT;
    if (vlq > 0) digit |= VLQ_CONTINUATION_BIT;
    result += VLQ_CHARS[digit];
  } while (vlq > 0);

  return result;
}
