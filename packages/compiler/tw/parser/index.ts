/**
 * Main parser entry -- orchestrates tokenization, directive parsing,
 * statement parsing, and AST assembly. Supports caching and batch parsing.
 */

import { tokenize, type TokenizerOptions } from "../lexer";
import type { Token } from "../lexer/tokens";
import type { Program, ASTNode } from "../ast/nodes";
import { createProgram } from "../ast/nodes";
import { TokenCursor } from "./expressions";
import { ErrorCollector, CompilerError, CompilerState } from "./recovery";
import { parseStatements } from "./statements";
import { parseDirective, isDirectiveKeyword } from "./directives";
import { sha256 } from "@tw/shared";

function deepClone<T>(obj: T): T {
  if (typeof structuredClone !== "undefined") {
    try { return structuredClone(obj); }
    catch { /* fall through */ }
  }
  try { return JSON.parse(JSON.stringify(obj)); }
  catch { return obj; }
}

export interface ParseOptions {
  filePath?: string;
  tokenizer?: TokenizerOptions;
  recoverFromErrors?: boolean;
  maxErrors?: number;
}

export interface ParseResult {
  program: Program;
  errors: CompilerError[];
  warnings: CompilerError[];
  tokens: Token[];
  parseTime: number;
  fromCache: boolean;
}

// --- Cache --------------------------------------------------------------------

interface CacheEntry {
  hash: string;
  program: Program;
  errors: CompilerError[];
  warnings: CompilerError[];
  timestamp: number;
}

const parseCache = new Map<string, CacheEntry>();
const MAX_CACHE = 128;

// --- Main Parse Function -----------------------------------------------------

export function parse(source: string, opts?: ParseOptions): Program {
  const result = parseWithDetails(source, opts);
  return result.program;
}

export function parseWithDetails(source: string, opts?: ParseOptions): ParseResult {
  const filePath = opts?.filePath ?? "<anonymous>";
  const startTime = performance.now();

  // Check cache
  const hash = sha256(source);
  const cached = parseCache.get(filePath);
  if (cached && cached.hash === hash) {
    return {
      program: cached.program,
      errors: cached.errors,
      warnings: cached.warnings,
      tokens: [],
      parseTime: 0,
      fromCache: true,
    };
  }

  // Tokenize
  const tokenizerResult = tokenize(source, {
    filePath,
    ...opts?.tokenizer,
  });

  // Set up error collector
  const errors = new ErrorCollector(opts?.maxErrors ?? 100);

  // Add tokenizer errors
  for (const err of tokenizerResult.errors) {
    errors.add(new CompilerError(
      err.message,
      err.line,
      err.col,
      "TW001",
      "error",
    ));
  }

  // Create cursor
  const cursor = new TokenCursor(tokenizerResult.tokens, errors);
  const state = new CompilerState(errors);

  // Create program
  const program = createProgram(filePath);
  program.source = source;

  // Parse directives first (at the top of the file)
  while (!cursor.done) {
    cursor.skipWhitespace();
    const token = cursor.peek();
    if (!token) break;

    // Check for directives -- but NOT if keyword is followed by . or # (CSS selector)
    if (token.type === "KEYWORD" && isDirectiveKeyword(token.value)) {
      const nextTok = cursor.peek(1);
      const isSelector = nextTok && (nextTok.type === "DOT" || nextTok.type === "HASH");
      if (!isSelector) {
        cursor.advance();
        const directive = parseDirective(cursor, token, (c) => parseStatements(c, errors, { filePath, state, stopTypes: ["RBRACE"] } as any));
        if (directive) {
          program.directives.push(directive);
        }
        continue;
      }
    }

    // Check for @directive
    if (token.type === "DIRECTIVE") {
      cursor.advance();
      const directive = parseDirective(cursor, token, (c) => parseStatements(c, errors, { filePath, state, stopTypes: ["RBRACE"] } as any));
      if (directive) {
        program.directives.push(directive);
      }
      continue;
    }

    break;
  }

  // Parse body. Top-level directives may also appear AFTER markup (e.g.
  // a trailing `state { }` block) -- collect them as directives instead of
  // silently swallowing them. parseBody for nested children uses hardcoded
  // stop types, so stopping at directive keywords here only affects the
  // top level.
  const body: ASTNode[] = [];
  let noProgress = 0;
  while (!cursor.done) {
    cursor.skipWhitespace();
    const token = cursor.peek();
    if (!token || token.type === "EOF") break;

    const isSelector = (t: Token) => {
      const n = cursor.peek(1);
      return !!(n && (n.type === "DOT" || n.type === "HASH"));
    };

    if (token.type === "KEYWORD" && isDirectiveKeyword(token.value) && !isSelector(token)) {
      cursor.advance();
      const directive = parseDirective(cursor, token, (c) => parseStatements(c, errors, { filePath, state, stopTypes: ["RBRACE"] } as any));
      if (directive) program.directives.push(directive);
      continue;
    }
    if (token.type === "DIRECTIVE") {
      cursor.advance();
      const directive = parseDirective(cursor, token, (c) => parseStatements(c, errors, { filePath, state, stopTypes: ["RBRACE"] } as any));
      if (directive) program.directives.push(directive);
      continue;
    }

    const before = cursor.position;
    const chunk = parseStatements(cursor, errors, { filePath, state, stopTypes: ["DIRECTIVE"], stopKeywordCheck: isDirectiveKeyword } as any);
    body.push(...chunk);
    if (cursor.position === before) {
      // No progress (stray keyword that is not a directive) -- skip a token.
      cursor.advance();
      noProgress++;
      if (noProgress > 1000) break;
    }
  }
  program.body = body;

  // Attach errors to program
  program.errors = errors.getAll().map(e => ({
    message: e.message,
    line: e.line,
    col: e.col,
    severity: e.severity,
    code: e.code,
  }));

  const parseTime = performance.now() - startTime;

  // Cache result
  if (parseCache.size >= MAX_CACHE) {
    // Evict oldest entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of parseCache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    if (oldestKey) parseCache.delete(oldestKey);
  }

  parseCache.set(filePath, {
    hash,
    program: deepClone(program),
    errors: errors.getErrors(),
    warnings: errors.getWarnings(),
    timestamp: Date.now(),
  });

  return {
    program,
    errors: errors.getErrors(),
    warnings: errors.getWarnings(),
    tokens: tokenizerResult.tokens,
    parseTime,
    fromCache: false,
  };
}

// --- Parse Tokens (pre-tokenized) --------------------------------------------

export function parseTokens(tokens: Token[], opts?: ParseOptions): Program {
  const filePath = opts?.filePath ?? "<anonymous>";
  const errors = new ErrorCollector(opts?.maxErrors ?? 100);
  const cursor = new TokenCursor(tokens, errors);
  const state = new CompilerState(errors);
  const program = createProgram(filePath);

  // Parse directives
  while (!cursor.done) {
    cursor.skipWhitespace();
    const token = cursor.peek();
    if (!token) break;

    if ((token.type === "KEYWORD" && isDirectiveKeyword(token.value)) || token.type === "DIRECTIVE") {
      cursor.advance();
      const directive = parseDirective(cursor, token, (c) => parseStatements(c, errors, { filePath, state, stopTypes: ["RBRACE"] } as any));
      if (directive) program.directives.push(directive);
      continue;
    }

    break;
  }

  program.body = parseStatements(cursor, errors, { filePath, state });
  program.errors = errors.getAll().map(e => ({
    message: e.message,
    line: e.line,
    col: e.col,
    severity: e.severity,
    code: e.code,
  }));

  return program;
}

// --- Parse File ---------------------------------------------------------------

export function parseFile(source: string, filePath: string): Program {
  return parse(source, { filePath });
}

// --- Batch Parse --------------------------------------------------------------

export function parseBatch(
  files: Array<{ path: string; source: string }>,
  opts?: ParseOptions,
): Map<string, ParseResult> {
  const results = new Map<string, ParseResult>();

  for (const file of files) {
    const result = parseWithDetails(file.source, {
      ...opts,
      filePath: file.path,
    });
    results.set(file.path, result);
  }

  return results;
}

// --- Cache Management ----------------------------------------------------------

export function clearParseCache(): void {
  parseCache.clear();
}

export function invalidateCache(filePath: string): void {
  parseCache.delete(filePath);
}

export function getCacheStats(): { size: number; entries: Array<{ key: string; timestamp: number }> } {
  const entries = Array.from(parseCache.entries()).map(([key, entry]) => ({
    key,
    timestamp: entry.timestamp,
  }));
  return { size: parseCache.size, entries };
}

export { PARSER_SYNC_POINTS, ParserRecovery, SpeculativeParser, continueAfterError, detectCommonError } from "./parser-recovery";
export type { ParseError, ParserCheckpoint, RecoveryAction } from "./parser-recovery";
export { MEMBER_OPS, PRECEDENCE, getAssociativity, getNodeType, getPrecedence, hasHigherPrec, isArithmeticOp, isAssignmentOp, isBitwiseOp, isComparisonOp, isLogicalOp, isMemberOp, isOptionalChainStart, isRightAssociative, isSpreadOrRest, isUnaryPrefixOp, isUpdateOp, shouldContinue } from "./precedence-table";
export type { Associativity, PrecedenceEntry } from "./precedence-table";
export { PropParser, generateJSDoc, validateConstraints, validateProp } from "./props";
export type { PropConstraints, PropDef, PropType, PropsBlock } from "./props";
export { LayoutRegistry, extractSlots, fillSlots, parseLayout, renderLayoutWithSlots, resolveLayoutChain } from "./slots-layout";
export type { LayoutChain, LayoutDef, SlotContent, SlotDef } from "./slots-layout";
export { validateAst, validateDirectives, validateEventHandlers, validateRequiredAttrs, validateSlotRefs, validateStateRefs, validateTagNesting } from "./validator";
export type { ValidationError, ValidationOptions } from "./validator";
export { isDirectiveKeyword, parseDirective } from "./directives";
export { ExpressionParser, TokenCursor } from "./expressions";
export { CompilerError, CompilerState, ErrorCollector, attemptRecovery, createErrorNode, createMissingNode, findSyncPoint, maskError, reportInvalidValue, reportMissingToken, reportUnexpectedToken, skipToSync } from "./recovery";
export type { CompilerStateSnapshot, RecoveryPoint } from "./recovery";
export { parseStatements } from "./statements";
export type { StatementParserOptions } from "./statements";
