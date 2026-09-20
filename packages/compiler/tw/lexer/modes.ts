/**
 * Context-aware lexer modes.
 *
 * A .tw file contains multiple "languages" mixed together:
 * - HTML markup
 * - CSS inside <style> blocks
 * - JavaScript inside <script> blocks
 * - TW expressions inside {interpolation}
 * - TSS (TW Style Sheets) inside <style tss>
 * - TW directives (@page, @state, etc.)
 *
 * The old tokenizer treated everything as one flat stream.
 * This module provides mode switching so each language gets
 * proper tokenization.
 *
 * Modes:
 *   HTML         -- tags, attributes, text
 *   CSS          -- selectors, properties, values
 *   JS           -- statements, expressions, operators
 *   TSS          -- TW style sheets (shorthand CSS)
 *   EXPR         -- expression inside {interpolation}
 *   DIRECTIVE    -- inside @directive { body }
 *   ATTR_VALUE   -- inside attribute="value"
 *   TEMPLATE     -- inside `template literal ${expr}`
 *
 * The mode stack allows nesting:
 *   HTML -> <style> -> CSS -> {interpolation} -> EXPR -> "string" -> STRING
 */

import type { TokenType } from "./tokens/types";

export type LexerMode =
  | "html"
  | "css"
  | "js"
  | "tss"
  | "expr"
  | "directive"
  | "attr_value"
  | "template"
  | "string"
  | "regex"
  | "comment";

export interface ModeFrame {
  mode: LexerMode;
  /** What triggered this mode (for error reporting) */
  trigger: string;
  /** Resume position after exiting this mode */
  resumePos?: number;
  /** Delimiter character (for string/regex modes) */
  delimiter?: string;
  /** Brace depth (for nested {} in expression mode) */
  depth: number;
  /** Original mode to return to */
  parentMode: LexerMode;
}

export class ModeStack {
  private stack: ModeFrame[] = [];
  private current: LexerMode = "html";

  /**
   * Enter a new mode.
   */
  push(mode: LexerMode, trigger: string, parentMode?: LexerMode): void {
    this.stack.push({
      mode: this.current,
      trigger,
      depth: 0,
      parentMode: parentMode ?? this.current,
    });
    this.current = mode;
  }

  /**
   * Exit the current mode, return to parent.
   */
  pop(): ModeFrame | undefined {
    const frame = this.stack.pop();
    if (frame) {
      this.current = frame.mode;
    }
    return frame;
  }

  /**
   * Get the current mode.
   */
  get mode(): LexerMode {
    return this.current;
  }

  /**
   * Get the depth of the mode stack.
   */
  get depth(): number {
    return this.stack.length;
  }

  /**
   * Check if we're inside a specific mode (or nested inside it).
   */
  isInMode(mode: LexerMode): boolean {
    if (this.current === mode) return true;
    return this.stack.some((f) => f.mode === mode);
  }

  /**
   * Get the parent mode.
   */
  get parentMode(): LexerMode {
    return this.stack.length > 0
      ? this.stack[this.stack.length - 1].parentMode
      : this.current;
  }

  /**
   * Increment brace depth in current frame.
   */
  incDepth(): void {
    if (this.stack.length > 0) {
      this.stack[this.stack.length - 1].depth++;
    }
  }

  /**
   * Decrement brace depth in current frame.
   */
  decDepth(): void {
    if (this.stack.length > 0) {
      this.stack[this.stack.length - 1].depth--;
    }
  }

  /**
   * Get current frame's brace depth.
   */
  get braceDepth(): number {
    return this.stack.length > 0
      ? this.stack[this.stack.length - 1].depth
      : 0;
  }

  /**
   * Reset to initial state.
   */
  reset(): void {
    this.stack = [];
    this.current = "html";
  }

  /**
   * Get a snapshot of the mode stack (for debugging).
   */
  snapshot(): LexerMode[] {
    return [...this.stack.map((f) => f.mode), this.current];
  }
}

// --- Mode-Specific Token Rules ----------------------------------------

/**
 * Determine which tokens are valid in each mode.
 * Used for context-sensitive parsing and error recovery.
 */
export class ModeRules {
  /**
   * Check if a token type is valid in the given mode.
   */
  static isValid(mode: LexerMode, tt: TokenType): boolean {
    switch (mode) {
      case "html":
        return HTML_TOKENS.has(tt);

      case "css":
        return CSS_TOKENS.has(tt);

      case "js":
      case "expr":
        return JS_TOKENS.has(tt);

      case "tss":
        return TSS_TOKENS.has(tt);

      case "directive":
        return DIRECTIVE_TOKENS.has(tt);

      case "attr_value":
        return true; // attr values accept anything

      case "template":
        return TEMPLATE_TOKENS.has(tt);

      default:
        return true;
    }
  }

  /**
   * Get the token types that should trigger a mode switch.
   */
  static getModeTransitions(currentMode: LexerMode): Map<TokenType, { to: LexerMode; trigger: string }> {
    const transitions = new Map<TokenType, { to: LexerMode; trigger: string }>();

    switch (currentMode) {
      case "html":
        transitions.set("SCRIPT_OPEN" as TokenType, { to: "js", trigger: "<script>" });
        transitions.set("STYLE_OPEN" as TokenType, { to: "css", trigger: "<style>" });
        transitions.set("INTERP_START" as TokenType, { to: "expr", trigger: "{" });
        transitions.set("ATTR_VALUE" as TokenType, { to: "attr_value", trigger: "=" });
        break;

      case "css":
      case "tss":
        transitions.set("STYLE_CLOSE" as TokenType, { to: "html", trigger: "</style>" });
        transitions.set("INTERP_START" as TokenType, { to: "expr", trigger: "{" });
        break;

      case "js":
        transitions.set("SCRIPT_CLOSE" as TokenType, { to: "html", trigger: "</script>" });
        transitions.set("LBRACE" as TokenType, { to: "js", trigger: "{" }); // nested blocks
        break;

      case "expr":
        transitions.set("INTERP_END" as TokenType, { to: "html", trigger: "}" });
        transitions.set("STRING" as TokenType, { to: "string", trigger: "string" });
        break;

      case "attr_value":
        transitions.set("ATTR_VALUE" as TokenType, { to: "html", trigger: "value-end" });
        break;

      case "directive":
        transitions.set("RBRACE" as TokenType, { to: "html", trigger: "}" });
        break;
    }

    return transitions;
  }
}

// --- Token Sets per Mode ----------------------------------------------

const HTML_TOKENS = new Set<TokenType>([
  "OPEN_TAG", "CLOSE_TAG", "SELF_CLOSE", "COMPONENT_NAME",
  "ATTR_NAME", "ATTR_VALUE", "EVENT_PREFIX", "BIND_PREFIX",
  "DIRECTIVE", "TEXT", "COMMENT", "CDATA", "DOCTYPE",
  "SCRIPT_OPEN", "SCRIPT_CLOSE", "STYLE_OPEN", "STYLE_CLOSE",
  "INTERP_START", "INTERP_END", "WHITESPACE", "NEWLINE", "EOF",
] as TokenType[]);

const CSS_TOKENS = new Set<TokenType>([
  "IDENT", "TEXT", "LBRACE", "RBRACE", "COLON", "SEMICOLON",
  "COMMA", "DOT", "HASH", "STAR", "LBRACKET", "RBRACKET",
  "GT", "TILDE", "PIPE", "AMPERSAND", "AT", "STRING", "NUMBER",
  "PERCENT", "PARENT", "SLASH", "MINUS", "PLUS", "INTERP_START", "INTERP_END",
  "WHITESPACE", "NEWLINE", "EOF",
] as TokenType[]);

const JS_TOKENS = new Set<TokenType>([
  "IDENT", "KEYWORD", "STRING", "NUMBER", "REGEX", "TEMPLATE",
  "LBRACE", "RBRACE", "LBRACKET", "RBRACKET", "LPAREN", "RPAREN",
  "DOT", "COMMA", "SEMICOLON", "COLON", "QUESTION", "ARROW",
  "SPREAD", "ASSIGN", "PLUS", "MINUS", "STAR", "SLASH", "PERCENT",
  "BANG", "TILDE", "AMPERSAND", "PIPE", "CARET", "AND", "OR", "NULLISH",
  "EQ", "NEQ", "SEQ", "SNEQ", "LE", "GE", "LT", "GT",
  "DOUBLE_LT", "DOUBLE_GT", "TRIPLE_GT",
  "PLUS_ASSIGN", "MINUS_ASSIGN", "STAR_ASSIGN", "SLASH_ASSIGN",
  "PERCENT_ASSIGN", "AMP_ASSIGN", "PIPE_ASSIGN", "CARET_ASSIGN",
  "SHL_ASSIGN", "SHR_ASSIGN", "USHR_ASSIGN", "EXP_ASSIGN",
  "NULLISH_ASSIGN", "AND_ASSIGN", "OR_ASSIGN",
  "WHITESPACE", "NEWLINE", "EOF",
] as TokenType[]);

const TSS_TOKENS = new Set<TokenType>([
  "IDENT", "TEXT", "LBRACE", "RBRACE", "COLON", "SEMICOLON",
  "COMMA", "DOT", "HASH", "AT", "STRING", "NUMBER",
  "PERCENT", "MINUS", "PLUS", "SLASH", "STAR",
  "INTERP_START", "INTERP_END",
  "WHITESPACE", "NEWLINE", "EOF",
] as TokenType[]);

const DIRECTIVE_TOKENS = new Set<TokenType>([
  "IDENT", "KEYWORD", "STRING", "NUMBER",
  "LBRACE", "RBRACE", "COLON", "SEMICOLON", "COMMA",
  "DOT", "ASSIGN", "PLUS", "MINUS", "STAR", "SLASH",
  "WHITESPACE", "NEWLINE", "EOF",
] as TokenType[]);

const TEMPLATE_TOKENS = new Set<TokenType>([
  "IDENT", "KEYWORD", "STRING", "NUMBER",
  "LBRACE", "RBRACE", "DOLLAR", "DOT",
  "WHITESPACE", "NEWLINE", "EOF",
] as TokenType[]);

// --- CSS Tokenizer ----------------------------------------------------

/**
 * Tokenize CSS source.
 * Handles selectors, properties, values, at-rules, and nested rules.
 */
export function tokenizeCSS(source: string): Array<{ type: string; value: string }> {
  const tokens: Array<{ type: string; value: string }> = [];
  let pos = 0;

  while (pos < source.length) {
    const ch = source[pos];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      let ws = "";
      while (pos < source.length && " \t\n\r".includes(source[pos])) {
        ws += source[pos];
        pos++;
      }
      tokens.push({ type: "WS", value: ws });
      continue;
    }

    // Comments
    if (ch === '/' && source[pos + 1] === '*') {
      let comment = "/*";
      pos += 2;
      while (pos < source.length && !(source[pos] === '*' && source[pos + 1] === '/')) {
        comment += source[pos];
        pos++;
      }
      comment += "*/";
      pos += 2;
      tokens.push({ type: "COMMENT", value: comment });
      continue;
    }

    // At-rules
    if (ch === '@') {
      let name = "@";
      pos++;
      while (pos < source.length && /[a-zA-Z-]/.test(source[pos])) {
        name += source[pos];
        pos++;
      }
      tokens.push({ type: "AT_RULE", value: name });
      continue;
    }

    // Selectors: #id, .class, :pseudo
    if (ch === '#' || ch === '.' || ch === ':') {
      let sel = ch;
      pos++;
      while (pos < source.length && /[a-zA-Z0-9_-]/.test(source[pos])) {
        sel += source[pos];
        pos++;
      }
      tokens.push({ type: ch === '#' ? "ID_SELECTOR" : ch === '.' ? "CLASS_SELECTOR" : "PSEUDO", value: sel });
      continue;
    }

    // Punctuation
    if (ch === '{' || ch === '}' || ch === ':' || ch === ';' || ch === ',' || ch === '(' || ch === ')') {
      tokens.push({ type: ch, value: ch });
      pos++;
      continue;
    }

    // Strings
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = quote;
      pos++;
      while (pos < source.length && source[pos] !== quote) {
        str += source[pos];
        pos++;
      }
      str += quote;
      pos++;
      tokens.push({ type: "STRING", value: str });
      continue;
    }

    // Numbers (with units)
    if (ch >= '0' && ch <= '9' || (ch === '-' && source[pos + 1] >= '0' && source[pos + 1] <= '9')) {
      let num = "";
      if (ch === '-') { num += '-'; pos++; }
      while (pos < source.length && (source[pos] >= '0' && source[pos] <= '9' || source[pos] === '.')) {
        num += source[pos];
        pos++;
      }
      // Unit
      while (pos < source.length && /[a-zA-Z%]/.test(source[pos])) {
        num += source[pos];
        pos++;
      }
      tokens.push({ type: "NUMBER", value: num });
      continue;
    }

    // Identifiers (property names, values, selectors)
    if (/[a-zA-Z_*-]/.test(ch)) {
      let ident = "";
      while (pos < source.length && /[a-zA-Z0-9_*-]/.test(source[pos])) {
        ident += source[pos];
        pos++;
      }
      tokens.push({ type: "IDENT", value: ident });
      continue;
    }

    // Unknown
    tokens.push({ type: "UNKNOWN", value: ch });
    pos++;
  }

  return tokens;
}

// --- TSS Tokenizer (TW Style Sheets) ----------------------------------

/**
 * Tokenize TSS -- TW's shorthand CSS variant.
 *
 * TSS syntax:
 *   .box { bg: #f00; p: 10px; m: 20px; }
 *   v expands to v
 *   .box { background: #f00; padding: 10px; margin: 20px; }
 *
 * Shorthands:
 *   bg -> background       m -> margin        p -> padding
 *   w -> width             h -> height        d -> display
 *   c -> color             fs -> font-size    fw -> font-weight
 *   bd -> border           br -> border-radius
 *   ta -> text-align       td -> text-decoration
 *   pos -> position        z -> z-index
 */
export const TSS_SHORTHANDS: Record<string, string> = {
  bg: "background",
  "bg-c": "background-color",
  "bg-i": "background-image",
  m: "margin",
  mt: "margin-top",
  mr: "margin-right",
  mb: "margin-bottom",
  ml: "margin-left",
  p: "padding",
  pt: "padding-top",
  pr: "padding-right",
  pb: "padding-bottom",
  pl: "padding-left",
  w: "width",
  "min-w": "min-width",
  "max-w": "max-width",
  h: "height",
  "min-h": "min-height",
  "max-h": "max-height",
  d: "display",
  c: "color",
  fs: "font-size",
  fw: "font-weight",
  ff: "font-family",
  lh: "line-height",
  ls: "letter-spacing",
  ta: "text-align",
  td: "text-decoration",
  tt: "text-transform",
  bd: "border",
  "bd-t": "border-top",
  "bd-r": "border-right",
  "bd-b": "border-bottom",
  "bd-l": "border-left",
  br: "border-radius",
  "br-tl": "border-top-left-radius",
  "br-tr": "border-top-right-radius",
  "br-bl": "border-bottom-left-radius",
  "br-br": "border-bottom-right-radius",
  pos: "position",
  t: "top",
  r: "right",
  b: "bottom",
  l: "left",
  z: "z-index",
  fl: "float",
  cl: "clear",
  ov: "overflow",
  "ov-x": "overflow-x",
  "ov-y": "overflow-y",
  cur: "cursor",
  op: "opacity",
  tr: "transition",
  tf: "transform",
  box: "box-sizing",
  gap: "gap",
  dir: "direction",
  ws: "white-space",
  ww: "word-wrap",
  va: "vertical-align",
};

export function expandTSS(property: string): string {
  return TSS_SHORTHANDS[property] ?? property;
}

export function tokenizeTSS(source: string): Array<{ type: string; value: string }> {
  // TSS uses the same structure as CSS, just with shorthand properties
  const tokens = tokenizeCSS(source);

  // Expand shorthand property names
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].type === "IDENT" && tokens[i + 1].type === ":") {
      const expanded = expandTSS(tokens[i].value);
      tokens[i].value = expanded;
    }
  }

  return tokens;
}


export class LexerModeStack {
  private stack: LexerMode[] = [];
  push(mode: LexerMode): void { this.stack.push(mode); }
  pop(): LexerMode | undefined { return this.stack.pop(); }
  peek(): LexerMode | undefined { return this.stack[this.stack.length - 1]; }
  get current(): LexerMode | undefined { return this.peek(); }
  get isEmpty(): boolean { return this.stack.length === 0; }
}
