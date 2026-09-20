/**
 * Advanced error recovery for the lexer.
 *
 * When the lexer encounters an error, instead of stopping or producing
 * garbage tokens, it uses these strategies to recover:
 *
 * 1. Sync Points: Skip to the next known synchronization point
 *    (e.g. > for HTML tags, } for expressions, ; for CSS)
 *
 * 2. Panic Mode: Skip characters until a safe boundary is found
 *
 * 3. Single-Token Insertion: If a token is missing, synthesize it
 *    (e.g. missing > -> insert virtual >)
 *
 * 4. Single-Token Deletion: If an unexpected token appears, skip it
 *
 * 5. Nested Recovery: Track brace/tag depth to find sync points
 */

import type { TokenType, Token, TokenPosition } from "./tokens/types";
import { makeToken } from "./tokens/types";

export type ErrorStrategy =
  | "skip"
  | "skip_to_sync"
  | "insert_token"
  | "delete_token"
  | "panic_mode"
  | "recover";

export interface RecoveryPoint {
  /** Position where error occurred */
  pos: TokenPosition;
  /** Error message */
  message: string;
  /** Strategy used to recover */
  strategy: ErrorStrategy;
  /** Tokens skipped during recovery */
  skippedTokens: Token[];
  /** Token inserted (if strategy = insert_token) */
  insertedToken?: Token;
  /** Position after recovery */
  resumePos: TokenPosition;
}

export class ErrorRecovery {
  private errors: RecoveryPoint[] = [];
  private maxErrors = 50;
  private _errorCount = 0;

  /**
   * Record an error and attempt recovery.
   */
  recover(
    message: string,
    pos: TokenPosition,
    strategy: ErrorStrategy,
    options?: {
      skipTokens?: Token[];
      insertToken?: Token;
      resumePos?: TokenPosition;
    }
  ): RecoveryPoint {
    const recovery: RecoveryPoint = {
      pos,
      message,
      strategy,
      skippedTokens: options?.skipTokens ?? [],
      insertedToken: options?.insertToken,
      resumePos: options?.resumePos ?? pos,
    };

    if (this.errorCount < this.maxErrors) {
      this.errors.push(recovery);
      this._errorCount++;
    }

    return recovery;
  }

  /**
   * Find the next synchronization point from the given position.
   *
   * Sync points are "safe" tokens where parsing can resume:
   * - HTML mode: > /> </  (tag boundaries)
   * - CSS mode: ; } (rule boundaries)
   * - JS mode: ; } (statement boundaries)
   * - Expr mode: } (interpolation end)
   */
  findSyncPoint(
    tokens: Token[],
    start: number,
    syncTypes: TokenType[]
  ): number {
    for (let i = start; i < tokens.length; i++) {
      if (syncTypes.includes((tokens[i] as any).token_type)) {
        return i;
      }
    }
    return tokens.length - 1; // End of token stream
  }

  /**
   * Skip tokens until a sync point is found.
   * Returns the skipped tokens and the sync position.
   */
  skipToSync(
    tokens: Token[],
    start: number,
    syncTypes: TokenType[]
  ): { skipped: Token[]; syncIndex: number } {
    const skipped: Token[] = [];

    for (let i = start; i < tokens.length; i++) {
      if (syncTypes.includes((tokens[i] as any).token_type)) {
        return { skipped, syncIndex: i };
      }
      skipped.push(tokens[i]);
    }

    return { skipped, syncIndex: tokens.length - 1 };
  }

  /**
   * Insert a synthetic token (for missing tokens).
   */
  insertToken(
    type: TokenType,
    value: string,
    pos: TokenPosition
  ): Token {
    return makeToken(type, value, pos, pos);
  }

  /**
   * Get all recovery points.
   */
  getErrors(): RecoveryPoint[] {
    return this.errors;
  }

  /**
   * Check if any errors occurred.
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /**
   * Get error count.
   */
  get errorCount(): number {
    return this._errorCount;
  }

  /**
   * Clear all errors.
   */
  clear(): void {
    this.errors = [];
    this._errorCount = 0;
  }

  /**
   * Format errors for display.
   */
  formatErrors(): string[] {
    return this.errors.map((e) => {
      const pos = `${e.pos.line}:${e.pos.col}`;
      let strategy = "";
      switch (e.strategy) {
        case "skip": strategy = "skipped"; break;
        case "skip_to_sync": strategy = `skipped to sync (${e.skippedTokens.length} tokens)`;
          break;
        case "insert_token": strategy = `inserted ${e.insertedToken?.type ?? "token"}`;
          break;
        case "delete_token": strategy = "deleted token"; break;
        case "panic_mode": strategy = "panic recovery"; break;
        case "recover": strategy = "recovered"; break;
      default:
        break;

      }
      return `Error at ${pos}: ${e.message} [${strategy}]`;
    });
  }
}

// --- Sync Point Definitions ------------------------------------------

export const SYNC_POINTS: Record<string, TokenType[]> = {
  html: ["Gt", "SelfClose", "CloseTag", "Eof"] as unknown as TokenType[],
  css: ["Semicolon", "RBrace", "Eof"] as unknown as TokenType[],
  js: ["Semicolon", "RBrace", "Eof"] as unknown as TokenType[],
  expr: ["InterpEnd", "RBrace", "Eof"] as unknown as TokenType[],
  directive: ["RBrace", "Eof"] as unknown as TokenType[],
  attr: ["AttrValue", "Gt", "SelfClose", "Eof"] as unknown as TokenType[],
};

// --- Common Recovery Patterns -----------------------------------------

/**
 * Try to recover from an unclosed tag.
 * Strategy: insert a virtual > token at the current position.
 */
export function recoverUnclosedTag(
  recovery: ErrorRecovery,
  pos: TokenPosition,
  tagName: string
): Token {
  return recovery.insertToken("Gt" as TokenType, ">", pos);
}

/**
 * Try to recover from a missing closing brace.
 * Strategy: insert a virtual } token.
 */
export function recoverMissingBrace(
  recovery: ErrorRecovery,
  pos: TokenPosition
): Token {
  return recovery.insertToken("RBrace" as TokenType, "}", pos);
}

/**
 * Try to recover from an unterminated string.
 * Strategy: insert a closing quote.
 */
export function recoverUnterminatedString(
  recovery: ErrorRecovery,
  pos: TokenPosition,
  quote: string
): Token {
  return recovery.insertToken("String" as TokenType, quote, pos);
}

/**
 * Panic mode recovery: skip everything until the next sync point.
 * Used when multiple consecutive errors suggest we're in a bad state.
 */
export function panicRecovery(
  recovery: ErrorRecovery,
  tokens: Token[],
  start: number,
  mode: string,
  pos: TokenPosition
): { skipped: Token[]; resumeIndex: number } {
  const syncTypes = SYNC_POINTS[mode] ?? ["Eof" as TokenType];
  const { skipped, syncIndex } = recovery.skipToSync(tokens, start, syncTypes);

  recovery.recover(
    "Panic mode recovery -- skipping to sync point",
    pos,
    "panic_mode",
    { skipTokens: skipped, resumePos: tokens[syncIndex]?.pos ?? pos }
  );

  return { skipped, resumeIndex: syncIndex };
}


export type RecoveryStrategy = "skip" | "sync" | "panic" | "skip-token" | "insert" | "delete";

export interface RecoveryResult {
  recovered: boolean;
  skipped: number;
  inserted: string[];
  deleted: number;
  errors: string[];
}
