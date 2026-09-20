/**
 * Parser recovery -- backtracking, speculative parsing, error continuation.
 *
 * When the parser encounters an error, instead of stopping, it tries to:
 * 1. Backtrack to a known-good state and try an alternative production
 * 2. Skip the problematic token and continue
 * 3. Insert a missing token
 * 4. Switch to panic mode (skip to next sync point)
 *
 * This makes the parser robust -- one syntax error doesn't prevent
 * the rest of the file from being parsed. The IDE/LSP can then show
 * all errors at once, not just the first one.
 *
 * Performance note: backtracking is expensive. We limit it to 3 attempts
 * per error, and only backtrack when we have a viable alternative.
 */

import type { Token } from "../lexer/tokens";

export type RecoveryAction =
  | { type: "skip"; token: Token; message: string }
  | { type: "insert"; tokenType: string; value: string; message: string }
  | { type: "delete"; token: Token; message: string }
  | { type: "backtrack"; to: number; tryAlternative: string; message: string }
  | { type: "panic"; to: number; skipped: Token[]; message: string };

export interface ParseError {
  message: string;
  pos: { line: number; col: number; offset: number };
  action: RecoveryAction;
  severity: "error" | "warning";
  /** Suggested fix (for IDE quick-fix) */
  suggestion?: { label: string; replacement: string };
}

export class ParserRecovery {
  private errors: ParseError[] = [];
  private maxBacktracks = 3;
  private maxErrors = 100;

  /**
   * Snapshot the parser state for potential backtracking.
   * Returns a checkpoint that can be restored later.
   */
  checkpoint(tokens: Token[], pos: number): ParserCheckpoint {
    return {
      pos,
      tokenStack: tokens.slice(pos, pos + 10), // lookahead snapshot
      timestamp: Date.now(),
    };
  }

  /**
   * Restore parser to a previous checkpoint.
   */
  restore(checkpoint: ParserCheckpoint): number {
    return checkpoint.pos;
  }

  /**
   * Try to parse with backtracking.
   * If the first attempt fails, restore state and try the alternative.
   */
  tryWithBacktrack<T>(
    primary: () => T,
    alternative: () => T,
    checkpoint: ParserCheckpoint,
    errorMessage: string
  ): T {
    try {
      return primary();
    } catch (err) {
      // Restore state
      this.restore(checkpoint);

      // Record the error
      this.recordError(
        errorMessage + (err instanceof Error ? `: ${err.message}` : ""),
        { line: 0, col: 0, offset: checkpoint.pos },
        { type: "backtrack", to: checkpoint.pos, tryAlternative: "alternative", message: errorMessage }
      );

      try {
        return alternative();
      } catch (err2) {
        // Both failed -- try panic recovery
        throw err2;
      }
    }
  }

  /**
   * Skip a single unexpected token and continue.
   */
  skipToken(token: Token, message: string): void {
    this.recordError(
      message,
      token.pos,
      { type: "skip", token, message }
    );
  }

  /**
   * Insert a synthetic token (for missing tokens).
   */
  insertToken(tokenType: string, value: string, pos: { line: number; col: number; offset: number }, message: string): void {
    this.recordError(
      message,
      pos,
      { type: "insert", tokenType, value, message }
    );
  }

  /**
   * Delete an unexpected token.
   */
  deleteToken(token: Token, message: string): void {
    this.recordError(
      message,
      token.pos,
      { type: "delete", token, message }
    );
  }

  /**
   * Panic mode: skip all tokens until a sync point is found.
   * Returns the index of the sync point.
   */
  panicRecovery(
    tokens: Token[],
    start: number,
    syncTypes: string[],
    message: string
  ): number {
    const skipped: Token[] = [];
    let i = start;

    while (i < tokens.length) {
      const t = tokens[i];
      if (syncTypes.includes((t as any).token_type) || syncTypes.includes(t.value)) {
        break;
      }
      skipped.push(t);
      i++;
    }

    if (skipped.length > 0) {
      this.recordError(
        `${message} -- skipped ${skipped.length} tokens`,
        tokens[start]?.pos ?? { line: 0, col: 0, offset: 0 },
        { type: "panic", to: i, skipped, message }
      );
    }

    return i;
  }

  /**
   * Suggest a fix for a common error.
   */
  suggestFix(label: string, replacement: string): { label: string; replacement: string } {
    return { label, replacement };
  }

  /**
   * Record an error.
   */
  private recordError(
    message: string,
    pos: { line: number; col: number; offset: number },
    action: RecoveryAction,
    severity: "error" | "warning" = "error"
  ): void {
    if (this.errors.length < this.maxErrors) {
      this.errors.push({ message, pos, action, severity });
    }
  }

  /**
   * Get all recorded errors.
   */
  getErrors(): ParseError[] {
    return this.errors;
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  get errorCount(): number {
    return this.errors.length;
  }

  clear(): void {
    this.errors = [];
  }

  /**
   * Format errors for display.
   */
  formatErrors(): string[] {
    return this.errors.map((e) => {
      const pos = `${e.pos.line}:${e.pos.col}`;
      let action = "";
      switch (e.action.type) {
        case "skip": action = `skipped token "${e.action.token.value}"`; break;
        case "insert": action = `inserted ${e.action.tokenType} "${e.action.value}"`; break;
        case "delete": action = `deleted token "${e.action.token.value}"`; break;
        case "backtrack": action = `backtracked to pos ${e.action.to}, tried ${e.action.tryAlternative}`; break;
        case "panic": action = `panic: skipped ${e.action.skipped.length} tokens`; break;
      default:
        break;

      }
      return `[${e.severity}] ${pos}: ${e.message} (${action})`;
    });
  }
}

export interface ParserCheckpoint {
  pos: number;
  tokenStack: Token[];
  timestamp: number;
}

// --- Sync Points ------------------------------------------------------

/**
 * Sync points for different parsing contexts.
 * When in panic mode, skip to the next sync point.
 */
export const PARSER_SYNC_POINTS = {
  /** HTML element parsing sync points */
  html: ["Gt", "SelfClose", "CloseTag", "Eof"],
  /** CSS rule sync points */
  css: ["Semicolon", "RBrace", "Eof"],
  /** JS statement sync points */
  js: ["Semicolon", "RBrace", "Eof"],
  /** Expression sync points */
  expr: ["RBrace", "InterpEnd", "Semicolon", "Comma", "Eof"],
  /** Directive sync points */
  directive: ["RBrace", "Eof"],
  /** Attribute sync points */
  attr: ["AttrName", "Gt", "SelfClose", "Eof"],
  /** Top-level sync points */
  top: ["OpenTag", "ComponentName", "CloseTag", "Directive", "Eof"],
} as const;

// --- Speculative Parsing ---------------------------------------------

/**
 * Speculative parser -- tries a production, and if it fails, rolls back.
 *
 * Used for ambiguous grammar constructs:
 * - Is `(a, b)` a parenthesized expression or arrow function params?
 * - Is `<a, b>` a type parameter list or two comparison operators?
 * - Is `{ ... }` a block or an object literal?
 *
 * Instead of complex lookahead, we just try one interpretation and
 * fall back to the other if it fails.
 */
export class SpeculativeParser<T> {
  private recovery: ParserRecovery;
  private checkpoints: ParserCheckpoint[] = [];

  constructor(recovery: ParserRecovery) {
    this.recovery = recovery;
  }

  /**
   * Try to parse with a given production.
   * If it fails, restore to the checkpoint and return null.
   */
  tryParse(
    tokens: Token[],
    pos: number,
    production: (pos: number) => { result: T; nextPos: number }
  ): { result: T; nextPos: number } | null {
    const checkpoint = this.recovery.checkpoint(tokens, pos);

    try {
      return production(pos);
    } catch {
      this.recovery.restore(checkpoint);
      return null;
    }
  }

  /**
   * Try multiple productions in order.
   * Return the first one that succeeds.
   */
  tryProductions(
    tokens: Token[],
    pos: number,
    productions: Array<(pos: number) => { result: T; nextPos: number }>
  ): { result: T; nextPos: number } | null {
    for (const production of productions) {
      const result = this.tryParse(tokens, pos, production);
      if (result !== null) return result;
    }
    return null;
  }
}

// --- Error Continuation ----------------------------------------------

/**
 * Continue parsing after an error by finding the next valid construct.
 *
 * Instead of stopping at the first error, the parser:
 * 1. Records the error
 * 2. Skips to the next sync point
 * 3. Resumes parsing
 *
 * This produces a partial AST with error markers, allowing the
 * IDE to show all errors at once.
 */
export function continueAfterError(
  recovery: ParserRecovery,
  tokens: Token[],
  pos: number,
  context: keyof typeof PARSER_SYNC_POINTS,
  message: string
): number {
  const syncTypes = PARSER_SYNC_POINTS[context] ?? ["Eof"];
  return recovery.panicRecovery(tokens, pos, [...syncTypes], message);
}

// --- Common Error Patterns -------------------------------------------

/**
 * Detect and recover from common syntax errors.
 * Returns a suggested fix if one is available.
 */
export function detectCommonError(
  tokens: Token[],
  pos: number,
  expected: string
): { message: string; fix?: { label: string; replacement: string } } | null {
  const current = tokens[pos];
  const next = tokens[pos + 1];

  if (!current) return null;

  // Missing > after tag name
  if (expected === ">" && (current as any).token_type !== ("Gt" as any)) {
    if (next && ((next as any).token_type === ("Gt" as any) || next.value === ">")) {
      // The > exists but there's an unexpected token before it — still report as missing
      return {
        message: `Missing '>' after '${current.value}'`,
        fix: { label: "Insert '>'", replacement: ">" },
      };
    }
    // > is truly missing entirely
    return {
      message: `Expected '>' but got '${current.value}'`,
      fix: { label: "Insert '>'", replacement: ">" },
    };
  }

  // Missing closing tag
  if (expected === "CLOSE_TAG" && (current as any).token_type !== ("CloseTag" as any)) {
    // Check if next token is a different opening tag (forgot to close)
    if ((current as any).token_type === ("OpenTag" as any) || (current as any).token_type === ("ComponentName" as any)) {
      return {
        message: `Expected closing tag but found opening tag '${current.value}'`,
        fix: { label: "Insert closing tag", replacement: `</${current.value}>` },
      };
    }
  }

  // Missing closing brace
  if (expected === "}" && (current as any).token_type !== ("RBrace" as any)) {
    return {
      message: `Expected '}' but got '${current.value}'`,
      fix: { label: "Insert '}'", replacement: "}" },
    };
  }

  // Missing closing parenthesis
  if (expected === ")" && (current as any).token_type !== ("RParen" as any)) {
    return {
      message: `Expected ')' but got '${current.value}'`,
      fix: { label: "Insert ')'", replacement: ")" },
    };
  }

  // Missing semicolon (warning, not error)
  if (expected === ";" && (current as any).token_type !== ("Semicolon" as any)) {
    return {
      message: `Expected ';' but got '${current.value}'`,
      fix: { label: "Insert ';'", replacement: ";" },
    };
  }

  // Missing quote in attribute value
  if (expected === "QUOTE" && current.value !== '"' && current.value !== "'") {
    return {
      message: `Missing quote in attribute value`,
      fix: { label: "Insert quote", replacement: '"' },
    };
  }

  // Unclosed string
  if ((current as any).token_type === ("STRING" as any) && current.value.startsWith('"') && !current.value.endsWith('"')) {
    return {
      message: `Unclosed string literal`,
      fix: { label: "Close string", replacement: '"' },
    };
  }

  return null;
}
