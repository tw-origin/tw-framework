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
import { parseDirective, isDirectiveKeyword, parseServerDirective } from "./directives";
import { sha256 } from "@tw/shared";

function deepClone<T>(obj: T): T {
  if (typeof structuredClone !== "undefined") {
    try { return structuredClone(obj); }
    catch { /* fall through */ }
  }
  try { return JSON.parse(JSON.stringify(obj)); }
  catch { return obj; }
}

/**
 * A top-level `server { ... }` or `server:defer { ... }` starts here.
 * `server` is already a keyword (used by `render server`), so the block form
 * is recognised by POSITION: a `server` at a statement start followed by `{`
 * (or `:defer {`). Any other use of the keyword parses exactly as before.
 */
function isServerBlockStart(cursor: TokenCursor): boolean {
  const t = cursor.peek();
  if (!t || t.type !== "KEYWORD" || t.value !== "server") return false;
  const n1 = cursor.peek(1);
  if (!n1) return false;
  if (n1.type === "LBRACE") return true;
  if (n1.type === "COLON") {
    const n2 = cursor.peek(2);
    const n3 = cursor.peek(3);
    // `server:<ident> {` -- any modifier name, so an unknown one is reported
    // by the parser rather than silently ignored.
    return !!n2 && (n2.type === "IDENT" || n2.type === "KEYWORD") && !!n3 && n3.type === "LBRACE";
  }
  return false;
}

export interface ParseOptions {
  filePath?: string;
  tokenizer?: TokenizerOptions;
  recoverFromErrors?: boolean;
  maxErrors?: number;
  /** compiler.incremental -- false bypasses the parse cache. Default: on. */
  cache?: boolean;
  /** Experimental syntax, off unless explicitly enabled. */
  experimental?: { serverBlocks?: boolean };
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
let maxCache = 128;

/**
 * compiler.cacheSize -- resize the parse cache. 0 disables it (and clears).
 * Evicts oldest-first when shrinking.
 */
export function setParseCacheSize(n: number): void {
  maxCache = Math.max(0, Math.trunc(Number.isFinite(n) ? n : 128));
  if (maxCache === 0) { parseCache.clear(); return; }
  while (parseCache.size > maxCache) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of parseCache) {
      if (entry.timestamp < oldestTime) { oldestTime = entry.timestamp; oldestKey = key; }
    }
    if (oldestKey) parseCache.delete(oldestKey); else break;
  }
}

/** The current parse-cache capacity (compiler.cacheSize). */
export function getParseCacheSize(): number {
  return maxCache;
}

// --- Main Parse Function -----------------------------------------------------

export function parse(source: string, opts?: ParseOptions): Program {
  const result = parseWithDetails(source, opts);
  return result.program;
}

export function parseWithDetails(source: string, opts?: ParseOptions): ParseResult {
  const filePath = opts?.filePath ?? "<anonymous>";
  const serverBlocksOn = opts?.experimental?.serverBlocks === true;
  const startTime = performance.now();

  // Check cache (compiler.incremental: opts.cache === false bypasses it)
  const hash = sha256(source);
  // The key carries the experimental flag: the same file parsed with a
  // different flag is a different program.
  const cacheKey = serverBlocksOn ? filePath + "\u0000experimental.serverBlocks" : filePath;
  const cached = opts?.cache === false ? undefined : parseCache.get(cacheKey);
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
  const cursor = new TokenCursor(tokenizerResult.tokens, errors, source);
  const state = new CompilerState(errors);

  // Create program
  const program = createProgram(filePath);
  program.source = source;

  // Parse directives first (at the top of the file)
  while (!cursor.done) {
    cursor.skipWhitespace();
    const token = cursor.peek();
    if (!token) break;

    // Top-level `server { }` / `server:defer { }` (experimental).
    if (serverBlocksOn && isServerBlockStart(cursor)) {
      cursor.advance();
      program.directives.push(parseServerDirective(cursor, token));
      continue;
    }

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

    // Top-level `server { }` / `server:defer { }` (experimental).
    if (serverBlocksOn && isServerBlockStart(cursor)) {
      cursor.advance();
      program.directives.push(parseServerDirective(cursor, token));
      continue;
    }

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
    const chunk = parseStatements(cursor, errors, { filePath, state, stopTypes: ["DIRECTIVE"], stopKeywordCheck: serverBlocksOn ? (v: string) => isDirectiveKeyword(v) || v === "server" : isDirectiveKeyword } as any);
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
  if (opts?.cache !== false) {
    if (parseCache.size >= maxCache) {
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

    parseCache.set(cacheKey, {
      hash,
      program: deepClone(program),
      errors: errors.getErrors(),
      warnings: errors.getWarnings(),
      timestamp: Date.now(),
    });
  }

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
  const serverBlocksOn = opts?.experimental?.serverBlocks === true;

  // Parse directives
  while (!cursor.done) {
    cursor.skipWhitespace();
    const token = cursor.peek();
    if (!token) break;

    // parseTokens has no source, so a server block's raw body cannot be
    // extracted -- report it clearly instead of silently mis-parsing.
    if (serverBlocksOn && isServerBlockStart(cursor)) {
      cursor.errors.add({
        type: "error",
        message: "server blocks require source text -- parse with parse()/parseFile(), not parseTokens()",
        line: token.pos.line,
        col: token.pos.col,
        code: "TW101",
        severity: "error",
      } as any);
      cursor.advance();
      continue;
    }

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
