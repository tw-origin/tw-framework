/**
 * Parser error recovery -- panic-mode resync, multi-point recovery,
 * error masking, and partial AST generation.
 */

import type { Token, TokenType } from "../../lexer/tokens";
import { TokenStream } from "../../lexer/tokens";

/** Wrap a function with error handling, logging to console.error. */
function withErrorHandling<T extends (...args: any[]) => any>(fn: T, name: string): T {
  return ((...args: Parameters<T>) => {
    try {
      return fn(...args);
    } catch (e) {
      console.error(`[TW] ${name} error:`, e);
      throw e instanceof Error ? e : new Error(String(e));
    }
  }) as T;
}

export class CompilerError extends Error {
  public line: number;
  public col: number;
  public code: string;
  public severity: "error" | "warning" | "info";
  public context?: string;
  public suggestions?: string[];

  constructor(
    message: string,
    line: number,
    col: number,
    code: string = "TW001",
    severity: "error" | "warning" | "info" = "error",
    context?: string,
    suggestions?: string[],
  ) {
    super(message);
    this.name = "CompilerError";
    this.line = line;
    this.col = col;
    this.code = code;
    this.severity = severity;
    this.context = context;
    this.suggestions = suggestions;
  }

  toString(): string {
    const sev = this.severity.toUpperCase();
    let msg = `${sev} [${this.code}] ${this.message} at ${this.line}:${this.col}`;
    if (this.context) msg += `\n  ${this.context}`;
    if (this.suggestions && this.suggestions.length > 0) {
      msg += `\n  Suggestions: ${this.suggestions.join(", ")}`;
    }
    return msg;
  }

  toJSON(): any {
    return {
      message: this.message,
      line: this.line,
      col: this.col,
      code: this.code,
      severity: this.severity,
      context: this.context,
      suggestions: this.suggestions,
    };
  }
}

// --- Error Collector ---------------------------------------------------------

export class ErrorCollector {
  private errors: CompilerError[] = [];
  private warnings: CompilerError[] = [];
  private infos: CompilerError[] = [];
  private maxErrors: number;
  private maskedRanges: Array<{ start: number; end: number }> = [];

  constructor(maxErrors: number = 100) {
    this.maxErrors = maxErrors;
  }

  add(error: CompilerError): void {
    switch (error.severity) {
      case "error":
        if (this.errors.length < this.maxErrors) {
          this.errors.push(error);
        }
        break;
      case "warning":
        this.warnings.push(error);
        break;
      case "info":
        this.infos.push(error);
        break;
      default:
        break;

    }
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  hasWarnings(): boolean {
    return this.warnings.length > 0;
  }

  getErrors(): CompilerError[] {
    return [...this.errors];
  }

  getWarnings(): CompilerError[] {
    return [...this.warnings];
  }

  getInfos(): CompilerError[] {
    return [...this.infos];
  }

  getAll(): CompilerError[] {
    return [...this.errors, ...this.warnings, ...this.infos];
  }

  getErrorCount(): number {
    return this.errors.length;
  }

  getWarningCount(): number {
    return this.warnings.length;
  }

  clear(): void {
    this.errors = [];
    this.warnings = [];
    this.infos = [];
    this.maskedRanges = [];
  }

  maskRange(start: number, end: number): void {
    this.maskedRanges.push({ start, end });
  }

  isMasked(offset: number): boolean {
    return this.maskedRanges.some(r => offset >= r.start && offset <= r.end);
  }

  formatAll(): string {
    return this.getAll().map(e => e.toString()).join("\n\n");
  }

  toJSON(): any {
    return {
      errors: this.errors.map(e => e.toJSON()),
      warnings: this.warnings.map(e => e.toJSON()),
      infos: this.infos.map(e => e.toJSON()),
      total: this.errors.length + this.warnings.length + this.infos.length,
    };
  }
}

// --- Panic-Mode Recovery ------------------------------------------------------

const SYNC_TOKENS: TokenType[] = [
  "CLOSE_TAG", "OPEN_TAG", "SELF_CLOSE",
  "LBRACE", "RBRACE",
  "NEWLINE", "EOF",
  "KEYWORD", // if, for, while etc.
  "DIRECTIVE",
];

const SYNC_KEYWORDS = new Set([
  "if", "else", "elif", "for", "while", "switch", "case",
  "break", "continue", "try", "catch", "finally",
  "page", "head", "body", "section", "layout",
  "state", "render", "import", "export",
]);

export function findSyncPoint(stream: TokenStream, maxLookahead: number = 50): Token | null {
  let looked = 0;

  while (!stream.done && looked < maxLookahead) {
    const token = stream.peek(0);
    if (!token) break;

    if (SYNC_TOKENS.includes(token.type)) {
      // For keyword tokens, check if it's a sync keyword
      if (token.type === "KEYWORD" && !SYNC_KEYWORDS.has(token.value)) {
        stream.advance();
        looked++;
        continue;
      }
      return token;
    }

    stream.advance();
    looked++;
  }

  return null;
}

export function skipToSync(stream: TokenStream, syncTypes: TokenType[] = SYNC_TOKENS): Token | null {
  while (!stream.done) {
    const token = stream.peek();
    if (!token) return null;

    if (syncTypes.includes(token.type)) {
      return token;
    }

    // Check for keyword sync points
    if (token.type === "KEYWORD" && SYNC_KEYWORDS.has(token.value)) {
      return token;
    }

    stream.advance();
  }

  return null;
}

// --- Multi-Point Recovery -----------------------------------------------------

export interface RecoveryPoint {
  token: Token;
  strategy: "skip-token" | "skip-to-sync" | "insert-token" | "wrap-in-error";
  insertedToken?: Token;
  errorNode?: any;
}

export function attemptRecovery(
  stream: TokenStream,
  expected: TokenType[],
  collector: ErrorCollector,
): RecoveryPoint | null {
  const current = stream.peek();
  if (!current) return null;

  // Strategy 1: Check if current token is a valid sync point
  if (SYNC_TOKENS.includes(current.type)) {
    return {
      token: current,
      strategy: "skip-token",
    };
  }

  // Strategy 2: Skip to next sync point
  const syncToken = skipToSync(stream);
  if (syncToken) {
    collector.add(new CompilerError(
      `Expected ${expected.join(" or ")} but found ${current.type}`,
      current.pos.line,
      current.pos.col,
      "TW002",
      "error",
      `near "${current.value}"`,
    ));
    return {
      token: syncToken,
      strategy: "skip-to-sync",
    };
  }

  // Strategy 3: Insert a synthetic token
  if (expected.length > 0) {
    const syntheticToken: Token = {
      type: expected[0],
      value: "",
      pos: current.pos,
      end: current.pos,
      hasNewline: false,
      precededByWhitespace: false,
      followedByWhitespace: false,
      raw: "",
    };

    collector.add(new CompilerError(
      `Missing ${expected[0]}, inserting synthetic token`,
      current.pos.line,
      current.pos.col,
      "TW003",
      "warning",
    ));

    return {
      token: syntheticToken,
      strategy: "insert-token",
      insertedToken: syntheticToken,
    };
  }

  return null;
}

// --- Error Masking -------------------------------------------------------------

export function maskError(
  collector: ErrorCollector,
  startOffset: number,
  endOffset: number,
  message: string,
): void {
  collector.maskRange(startOffset, endOffset);
  collector.add(new CompilerError(
    message,
    0, 0,
    "TW004",
    "warning",
    "This region was masked during error recovery",
  ));
}

// --- Partial AST --------------------------------------------------------------

export function createErrorNode(message: string, line: number, col: number): any {
  return {
    type: "ErrorNode",
    message,
    line,
    col,
    children: [],
  };
}

export function createMissingNode(expectedType: string, line: number, col: number): any {
  return {
    type: "MissingNode",
    expectedType,
    line,
    col,
    children: [],
  };
}

// --- Parser State ------------------------------------------------------------

export class CompilerState {
  public inTag: boolean = false;
  public inAttrValue: boolean = false;
  public inInterpolation: boolean = false;
  public inStyle: boolean = false;
  public inScript: boolean = false;
  public depth: number = 0;
  public tagStack: string[] = [];
  public directiveStack: string[] = [];
  public errors: ErrorCollector;

  constructor(errors?: ErrorCollector) {
    this.errors = errors ?? new ErrorCollector();
  }

  pushTag(tag: string): void {
    this.tagStack.push(tag);
    this.depth++;
  }

  popTag(): string | null {
    const tag = this.tagStack.pop();
    if (tag) this.depth--;
    return tag ?? null;
  }

  currentTag(): string | null {
    return this.tagStack[this.tagStack.length - 1] ?? null;
  }

  snapshot(): CompilerStateSnapshot {
    return {
      inTag: this.inTag,
      inAttrValue: this.inAttrValue,
      inInterpolation: this.inInterpolation,
      inStyle: this.inStyle,
      inScript: this.inScript,
      depth: this.depth,
      tagStackLen: this.tagStack.length,
      directiveStackLen: this.directiveStack.length,
    };
  }

  restore(snapshot: CompilerStateSnapshot): void {
    this.inTag = snapshot.inTag;
    this.inAttrValue = snapshot.inAttrValue;
    this.inInterpolation = snapshot.inInterpolation;
    this.inStyle = snapshot.inStyle;
    this.inScript = snapshot.inScript;
    this.depth = snapshot.depth;
    this.tagStack.length = snapshot.tagStackLen;
    this.directiveStack.length = snapshot.directiveStackLen;
  }
}

export interface CompilerStateSnapshot {
  inTag: boolean;
  inAttrValue: boolean;
  inInterpolation: boolean;
  inStyle: boolean;
  inScript: boolean;
  depth: number;
  tagStackLen: number;
  directiveStackLen: number;
}

// --- Error Reporting Helpers ---------------------------------------------------

export function reportUnexpectedToken(
  collector: ErrorCollector,
  token: Token,
  expected?: string,
): void {
  let msg = expected
    ? `Expected ${expected} but got ${token.type} ("${token.value}")`
    : `Unexpected token ${token.type} ("${token.value}")`;

  collector.add(new CompilerError(
    msg,
    token.pos.line,
    token.pos.col,
    "TW001",
    "error",
    `near "${token.value}"`,
  ));
}

export function reportMissingToken(
  collector: ErrorCollector,
  tokenType: TokenType,
  line: number,
  col: number,
): void {
  collector.add(new CompilerError(
    `Missing ${tokenType}`,
    line,
    col,
    "TW002",
    "error",
  ));
}

export function reportInvalidValue(
  collector: ErrorCollector,
  value: string,
  line: number,
  col: number,
  validValues?: string[],
): void {
  const msg = `Invalid value: "${value}"`;
  const suggestions = validValues ? [`Valid values: ${validValues.join(", ")}`] : undefined;

  collector.add(new CompilerError(
    msg,
    line,
    col,
    "TW005",
    "error",
    undefined,
    suggestions,
  ));
}
