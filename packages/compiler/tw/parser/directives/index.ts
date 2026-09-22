/**
 * Directive parser -- parses all TW directives:
 * page, head, body, section, layout, load, state, render,
 * revalidate, redirect, rewrite, import, export, define, config, middleware, meta.
 */

import type { Token } from "../../lexer/tokens";
import type {
  DirectiveNode, PageDirective, HeadDirective, BodyDirective,
  SectionDirective, LayoutDirective, LoadDirective, StateDirective,
  StateDeclaration, RenderDirective, RevalidateDirective, RedirectDirective,
  RewriteDirective, ImportDirective, ExportDirective, DefineDirective,
  ConfigDirective, MiddlewareDirective, MetaDirective, ASTNode,
} from "../../ast/nodes";
import { TokenCursor } from "../expressions";
import { RENDER_MODES } from "@tw/shared";

const DIRECTIVE_KEYWORDS = new Set([
  "page", "head", "body", "section", "layout",
  "load", "state", "render", "revalidate", "redirect", "rewrite",
  "import", "export", "define", "config", "middleware", "meta",
]);

/** Wrap a function with error handling, logging to console.error. */
function withErrorHandling<T extends (...args: unknown[]) => any>(fn: T, name: string): T {
  return ((...args: Parameters<T>) => {
    try {
      return fn(...args);
    } catch (e) {
      console.error(`[TW] ${name} error:`, e);
      throw e instanceof Error ? e : new Error(String(e));
    }
  }) as T;
}

export function isDirectiveKeyword(value: string): boolean {
  return DIRECTIVE_KEYWORDS.has(value);
}

export function parseDirective(
  cursor: TokenCursor,
  keywordToken: Token,
  parseBody: (cursor: TokenCursor) => ASTNode[],
): DirectiveNode | null {
  // DIRECTIVE tokens carry the leading "@" in their value (e.g. "@page"),
  // while KEYWORD tokens (bare "page { ... }" syntax) do not -- normalize
  // so the switch below matches both forms.
  const keyword = keywordToken.value.startsWith("@") ? keywordToken.value.slice(1) : keywordToken.value;

  switch (keyword) {
    case "page":       return parsePageDirective(cursor, keywordToken);
    case "head":       return parseHeadDirective(cursor, keywordToken, parseBody);
    case "body":       return parseBodyDirective(cursor, keywordToken, parseBody);
    case "section":    return parseSectionDirective(cursor, keywordToken, parseBody);
    case "layout":     return parseLayoutDirective(cursor, keywordToken);
    case "load":       return parseLoadDirective(cursor, keywordToken);
    case "state":      return parseStateDirective(cursor, keywordToken);
    case "render":     return parseRenderDirective(cursor, keywordToken);
    case "revalidate": return parseRevalidateDirective(cursor, keywordToken);
    case "redirect":   return parseRedirectDirective(cursor, keywordToken);
    case "rewrite":    return parseRewriteDirective(cursor, keywordToken);
    case "import":      return parseImportDirective(cursor, keywordToken);
    case "export":      return parseExportDirective(cursor, keywordToken);
    case "define":      return parseDefineDirective(cursor, keywordToken);
    case "config":      return parseConfigDirective(cursor, keywordToken);
    case "middleware":  return parseMiddlewareDirective(cursor, keywordToken);
    case "meta":        return parseMetaDirective(cursor, keywordToken);
    default:
      cursor.errors.add({
        type: "error",
        message: `Unknown directive: ${keyword}`,
        line: keywordToken.pos.line,
        col: keywordToken.pos.col,
        code: "TW006",
        severity: "error",
      } as any);
      return null;
  }
}

// --- Page Directive ----------------------------------------------------------

function parsePageDirective(cursor: TokenCursor, token: Token): PageDirective | null {
  cursor.skipWhitespace();
  
  // Handle page { key value key value } syntax
  // Also handle page key value (without braces)
  let hasBrace = false;
  if (cursor.match("LBRACE")) {
    // match already consumed the LBRACE
    hasBrace = true;
    cursor.skipWhitespace();
  }

  // First key-value pair: title "Test" or title = "Test"
  const key = cursor.consumeValue();
  cursor.skipWhitespace();

  let value: string | number | boolean | null = null;

  // Check for string value: title "Test"
  const valToken = cursor.peek();
  if (valToken && (valToken.type === "STRING" || valToken.type === "NUMBER")) {
    cursor.advance();
    value = valToken.value;
    if (valToken.type === "NUMBER") value = parseFloat(valToken.value);
  } else if (cursor.match("EQUALS") || cursor.match("COLON")) {
    cursor.skipWhitespace();
    const vToken = cursor.peek();
    if (vToken) {
      cursor.advance();
      value = vToken.value;
      if (vToken.type === "NUMBER") value = parseFloat(vToken.value);
      if (vToken.type === "BOOLEAN") value = vToken.value === "true";
    }
  } else if (valToken && (valToken.type === "IDENT" || valToken.type === "KEYWORD")) {
    // title Test (bare value)
    cursor.advance();
    value = valToken.value;
  }

  // Parse additional options: render ssr
  const options: Record<string, unknown> = {};
  cursor.skipWhitespace();
  while (cursor.peek() && cursor.peek()!.type !== "RBRACE" && cursor.peek()!.type !== "EOF") {
    const optToken = cursor.advance();
    if (!optToken) break;
    const optName = optToken.value;
    cursor.skipWhitespace();
    // Cache directive (docs/cache-tags.md): `cache { life "product",
    // tag "products" }` -- a nested key-value block, not a flat option.
    // Parse it structurally so the AST carries a real cache object and the
    // compiler can validate it (TW090/TW092).
    if (optName === "cache" && cursor.peek() && cursor.peek()!.type === "LBRACE") {
      cursor.advance(); // consume LBRACE
      options.cache = parseCacheBlockOptions(cursor, token);
      cursor.skipWhitespace();
      continue;
    }
    // Check if next is a value
    const nextToken = cursor.peek();
    if (nextToken && (nextToken.type === "STRING" || nextToken.type === "NUMBER" || nextToken.type === "IDENT" || nextToken.type === "KEYWORD")) {
      cursor.advance();
      options[optName] = nextToken.value;
    } else if (cursor.match("EQUALS")) {
      cursor.skipWhitespace();
      const optVal = cursor.consumeValue();
      options[optName] = optVal;
    } else {
      options[optName] = true;
    }
    cursor.skipWhitespace();
  }

  if (hasBrace) {
    cursor.consumeIf("RBRACE");
  }

  // Validate render mode if present (page { render <mode> }).
  // "ssr" is also accepted -- it is the documented default mode.
  const renderMode = options.render;
  if (typeof renderMode === "string" && renderMode &&
      !RENDER_MODES.has(renderMode) && renderMode !== "ssr") {
    cursor.errors.add({
      type: "error",
      message: `Invalid render mode: ${renderMode}. Expected one of: ${Array.from(RENDER_MODES).join(", ")}, ssr`,
      line: token.pos.line,
      col: token.pos.col,
      code: "TW004",
      severity: "error",
      category: "syntax",
    } as any);
  }

  return {
    type: "PageDirective",
    key,
    value,
    options,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Cache block inside page { } (docs/cache-tags.md) -------------------------

/**
 * Parse the body of a `cache { ... }` block: keys life/tag (string) and
 * revalidate/stale/expire (number, seconds), comma separators optional.
 * Cursor sits just past the opening LBRACE; consumes through the RBRACE.
 * Emits TW090 when neither `revalidate` nor `life` is present.
 */
function parseCacheBlockOptions(cursor: TokenCursor, pageToken: Token): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  cursor.skipWhitespace();
  while (cursor.peek() && cursor.peek()!.type !== "RBRACE" && cursor.peek()!.type !== "EOF") {
    const keyToken = cursor.advance();
    if (!keyToken) break;
    const key = keyToken.value;
    cursor.skipWhitespace();
    // Optional `=` / `:` separator
    cursor.match("EQUALS") || cursor.match("COLON");
    cursor.skipWhitespace();
    const valToken = cursor.peek();
    if (valToken && (valToken.type === "STRING" || valToken.type === "NUMBER")) {
      cursor.advance();
      out[key] = valToken.type === "NUMBER" ? parseFloat(valToken.value) : valToken.value;
    } else if (valToken && (valToken.type === "IDENT" || valToken.type === "KEYWORD")) {
      cursor.advance();
      out[key] = valToken.value;
    }
    cursor.skipWhitespace();
    // Optional comma separator between pairs
    cursor.match("COMMA");
    cursor.skipWhitespace();
  }
  cursor.consumeIf("RBRACE");

  // TW090: a cache block without a lifetime has no meaning.
  if (out.revalidate == null && out.life == null) {
    cursor.errors.add({
      type: "error",
      message: "cache { } requires a `revalidate N` window or a `life \"profile\"` (docs/cache-tags.md)",
      line: pageToken.pos.line,
      col: pageToken.pos.col,
      code: "TW090",
      severity: "error",
      category: "syntax",
    } as any);
  }
  return out;
}

// --- Head Directive ----------------------------------------------------------

function parseHeadDirective(cursor: TokenCursor, token: Token, parseBody: (c: TokenCursor) => ASTNode[]): HeadDirective {
  let title: string | undefined;
  const meta: unknown[] = [];
  const links: unknown[] = [];
  const scripts: unknown[] = [];

  cursor.skipWhitespace();
  if (cursor.peek() && cursor.peek()!.type === "STRING") {
    title = cursor.advance()!.value;
  }

  const body = parseBlockBody(cursor, parseBody);

  return {
    type: "HeadDirective",
    body,
    title,
    meta: meta as any,
    links: links as any,
    scripts: scripts as any,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Body Directive ----------------------------------------------------------

function parseBodyDirective(cursor: TokenCursor, token: Token, parseBody: (c: TokenCursor) => ASTNode[]): BodyDirective {
  const attrs: unknown[] = [];
  const classes: string[] = [];

  cursor.skipWhitespace();
  while (cursor.peek() && cursor.peek()!.type === "IDENT") {
    const attrToken = cursor.advance()!;
    if (cursor.match("EQUALS")) {
      cursor.skipWhitespace();
      const val = cursor.consumeValue();
      attrs.push({ type: "Attribute", name: attrToken.value, value: val, isInterpolated: false, isBoolean: false, line: attrToken.pos.line, col: attrToken.pos.col });
    } else {
      attrs.push({ type: "Attribute", name: attrToken.value, value: true, isInterpolated: false, isBoolean: true, line: attrToken.pos.line, col: attrToken.pos.col });
    }
    cursor.skipWhitespace();
  }

  const body = parseBlockBody(cursor, parseBody);

  return {
    type: "BodyDirective",
    body,
    attrs: attrs as any,
    classes,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Section Directive ------------------------------------------------------

function parseSectionDirective(cursor: TokenCursor, token: Token, parseBody: (c: TokenCursor) => ASTNode[]): SectionDirective {
  cursor.skipWhitespace();
  const name = cursor.consumeValue();
  const isDefault = name === "default" || name === "";
  const body = parseBlockBody(cursor, parseBody);

  return {
    type: "SectionDirective",
    name,
    body,
    isDefault,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Layout Directive --------------------------------------------------------

function parseLayoutDirective(cursor: TokenCursor, token: Token): LayoutDirective {
  cursor.skipWhitespace();
  const name = cursor.consumeValue();
  const props: unknown[] = [];
  let fallback = false;

  cursor.skipWhitespace();
  while (cursor.peek() && cursor.peek()!.type === "IDENT") {
    const propToken = cursor.advance()!;
    if (cursor.match("EQUALS")) {
      cursor.skipWhitespace();
      const val = cursor.consumeValue();
      props.push({
        type: "ComponentProp",
        name: propToken.value,
        value: val,
        isInterpolated: false,
        isExpression: false,
        line: propToken.pos.line, col: propToken.pos.col,
      });
    } else if (propToken.value === "fallback") {
      fallback = true;
    }
    cursor.skipWhitespace();
  }

  if (!name) {
    cursor.errors.add({
      type: "error",
      message: "Layout directive must specify a layout name",
      line: token.pos.line,
      col: token.pos.col,
      code: "TW008",
      severity: "error",
    } as any);
  }

  return {
    type: "LayoutDirective",
    name,
    props: props as any,
    fallback,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Load Directive ----------------------------------------------------------

function parseLoadDirective(cursor: TokenCursor, token: Token): LoadDirective {
  cursor.skipWhitespace();
  const source = cursor.consumeValue();
  cursor.skipWhitespace();
  let as = "";
  let isAsync = false;
  let isLazy = false;
  let isTypeOnly = false;

  while (cursor.peek() && cursor.peek()!.type === "IDENT") {
    const optToken = cursor.advance()!;
    switch (optToken.value) {
      case "as": cursor.skipWhitespace(); as = cursor.consumeValue(); break;
      case "async": isAsync = true; break;
      case "lazy": isLazy = true; break;
      case "type": isTypeOnly = true; break;
      default:
        break;

    }
    cursor.skipWhitespace();
  }

  if (!source) {
    cursor.errors.add({
      type: "error",
      message: "Load directive must specify a source path",
      line: token.pos.line,
      col: token.pos.col,
      code: "TW009",
      severity: "error",
    } as any);
  }

  return {
    type: "LoadDirective",
    source,
    as,
    isAsync,
    isLazy,
    isTypeOnly,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- State Directive ----------------------------------------------------------

function parseStateDirective(cursor: TokenCursor, token: Token): StateDirective {
  const declarations: StateDeclaration[] = [];
  let scope: "global" | "page" | "component" = "page";

  cursor.skipWhitespace();
  if (cursor.peek() && cursor.peek()!.type === "IDENT" && ["global", "page", "component"].includes(cursor.peek()!.value)) {
    scope = cursor.advance()!.value as any;
    cursor.skipWhitespace();
  }

  // Block form: state { name = "x" count = 0 ... }
  if (cursor.peek() && cursor.peek()!.type === "LBRACE") {
    cursor.advance(); // consume {
    while (!cursor.done) {
      cursor.skipWhitespace();
      const t = cursor.peek();
      if (!t || t.type === "EOF") break;
      if (t.type === "RBRACE") { cursor.advance(); break; }
      if (t.type !== "IDENT" && t.type !== "KEYWORD") { cursor.advance(); continue; }

      const nameToken = cursor.advance()!;
      cursor.skipWhitespace();

      let dataType = "string";
      if (cursor.peek() && cursor.peek()!.type === "COLON") {
        cursor.advance();
        cursor.skipWhitespace();
        dataType = cursor.consumeValue();
        cursor.skipWhitespace();
      }

      let value = "";
      let signalKind: "public" | "private" | "serverOnly" | "client" | "derived" | undefined;
      if (cursor.match("ASSIGN") || cursor.match("EQUALS")) {
        cursor.skipWhitespace();
        const sig = consumeSignalDeclaration(cursor);
        if (sig) {
          value = sig.value;
          signalKind = sig.signalKind;
        } else {
          value = consumeStateValue(cursor);
        }
      }

      declarations.push({
        name: nameToken.value,
        value,
        dataType,
        signalKind,
        isComputed: false,
        isReactive: true,
        line: nameToken.pos.line,
        col: nameToken.pos.col,
      });

      cursor.skipWhitespace();
      if (!cursor.match("COMMA")) {
        // Newline-separated declarations: keep looping until RBRACE.
      }
    }

    return {
      type: "StateDirective",
      declarations,
      scope,
      line: token.pos.line,
      col: token.pos.col,
    };
  }

  while (cursor.peek() && cursor.peek()!.type === "IDENT") {
    const nameToken = cursor.advance()!;
    cursor.skipWhitespace();

    let dataType = "string";
    if (cursor.peek() && cursor.peek()!.type === "COLON") {
      cursor.advance();
      cursor.skipWhitespace();
      dataType = cursor.consumeValue();
      cursor.skipWhitespace();
    }

    let value = "";
    if (cursor.match("EQUALS") || cursor.match("ASSIGN")) {
      cursor.skipWhitespace();
      value = cursor.consumeValue();
    }

    declarations.push({
      name: nameToken.value,
      value,
      dataType,
      isComputed: false,
      isReactive: true,
      line: nameToken.pos.line,
      col: nameToken.pos.col,
    });

    cursor.skipWhitespace();
    if (!cursor.match("COMMA")) break;
    cursor.skipWhitespace();
  }

  return {
    type: "StateDirective",
    declarations,
    scope,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Render Directive --------------------------------------------------------

/**
 * Consume a state declaration value: scalar (string/number/bool) or a
 * bracketed array/object literal (collected as raw token text).
 */
/**
 * Signal declaration forms (RFC: Signal Streaming, Phase 1):
 *   price  = publicSignal(150.25)    -> streamed to every client
 *   trend  = privateSignal("up")    -> seeded; per-user streaming lands with
 *                                      the auth binding (documented Phase 1
 *                                      limitation: broadcast to declaring pages)
 *   secret = serverOnlySignal(0)    -> never seeded, never streamed
 *   count  = signal(0)              -> plain client signal (no streaming)
 * Returns null when the next tokens are not a signal function call.
 */
const SIGNAL_FUNCTIONS = new Set([
  "publicSignal", "privateSignal", "serverOnlySignal",
  "signal", "serverSignal", "derivedSignal",
]);

function consumeSignalDeclaration(
  cursor: TokenCursor,
): { value: string; signalKind: "public" | "private" | "serverOnly" | "client" | "derived" } | null {
  const t = cursor.peek();
  if (!t || t.type !== "IDENT" || !SIGNAL_FUNCTIONS.has(t.value)) return null;
  const after = cursor.peek(1);
  if (!after || (after.type as any) !== "LPAREN") return null;

  const fn = t.value;
  cursor.advance(); // function name
  cursor.advance(); // (
  // Consume up to the matching RPAREN, capturing the first argument only.
  // Array/object initial values ([1,2,3], {a:1}) are captured whole as a
  // balanced literal; scalars as their raw token value.
  let depth = 1;
  let first = "";
  let literal: string[] = [];
  let inLiteral = false;
  while (!cursor.done) {
    const tk = cursor.peek();
    if (!tk || tk.type === "EOF") break;
    if ((tk.type as any) === "LPAREN") depth++;
    if ((tk.type as any) === "LBRACKET" || (tk.type as any) === "LBRACE" || (tk.type as any) === "LBRACK") {
      if (depth === 1 && first === "" && !inLiteral) inLiteral = true;
      if (inLiteral) literal.push(tk.value);
      cursor.advance();
      continue;
    }
    if ((tk.type as any) === "RBRACKET" || (tk.type as any) === "RBRACE" || (tk.type as any) === "RBRACK") {
      if (inLiteral) literal.push(tk.value);
      cursor.advance();
      continue;
    }
    if ((tk.type as any) === "RPAREN") {
      depth--;
      if (depth === 0) { cursor.advance(); break; }
    }
    if (inLiteral) {
      // Object keys must be quoted for JSON.parse: { name: "x" } -> {"name":"x"}
      const after = cursor.peek(1);
      if (tk.type === "IDENT" && after && (after.type as any) === "COLON") {
        literal.push(JSON.stringify(tk.value));
      } else if (tk.type === "STRING") {
        literal.push(JSON.stringify(tk.value));
      } else {
        literal.push(tk.value);
      }
    } else if (first === "" && (tk.type === "STRING" || tk.type === "NUMBER" ||
        tk.type === "IDENT" || tk.type === "KEYWORD")) {
      first = tk.value;
    }
    cursor.advance();
  }
  if (inLiteral) first = literal.join(" ");
  const kind: "public" | "private" | "serverOnly" | "client" | "derived" =
    fn === "publicSignal" ? "public"
    : fn === "privateSignal" || fn === "serverSignal" ? "private"
    : fn === "serverOnlySignal" ? "serverOnly"
    : fn === "derivedSignal" ? "derived"
    : "client";
  return { value: first, signalKind: kind };
}

function consumeStateValue(cursor: TokenCursor): string {
  const t = cursor.peek();
  if (!t) return "";
  if (t.type === "STRING" || t.type === "NUMBER" || t.type === "IDENT" || t.type === "KEYWORD") {
    cursor.advance();
    return t.value;
  }
  if (t.type as any === "LBRACKET" || t.type as any === "LBRACE" || t.type as any === "LBRACK") {
    let depth = 0;
    const parts: string[] = [];
    while (!cursor.done) {
      const tk = cursor.peek();
      if (!tk || tk.type === "EOF") break;
      if (tk.type as any === "LBRACKET" || tk.type as any === "LBRACE" || tk.type as any === "LBRACK") depth++;
      else if (tk.type as any === "RBRACKET" || tk.type as any === "RBRACE" || tk.type as any === "RBRACK") depth--;
      const after = cursor.peek(1);
      if (tk.type === "STRING") {
        parts.push(`"${tk.value}"`);
      } else if (tk.type === "IDENT" && after && after.type === "COLON" && depth > 0) {
        // Object keys inside a literal must be quoted for JSON.parse to work:
        // { name: "x" } -> {"name":"x"}
        parts.push(`"${tk.value}"`);
      } else {
        parts.push(tk.value);
      }
      cursor.advance();
      if (depth === 0) break;
    }
    return parts.join("");
  }
  cursor.advance();
  return t.value;
}

function parseRenderDirective(cursor: TokenCursor, token: Token): RenderDirective {
  cursor.skipWhitespace();
  const mode = cursor.consumeValue();
  const options: Record<string, unknown> = {};
  let key: string | undefined;

  cursor.skipWhitespace();
  while (cursor.peek() && cursor.peek()!.type === "IDENT") {
    const optToken = cursor.advance()!;
    if (cursor.match("EQUALS")) {
      cursor.skipWhitespace();
      const val = cursor.consumeValue();
      if (optToken.value === "key") key = val;
      else options[optToken.value] = val;
    } else {
      options[optToken.value] = true;
    }
    cursor.skipWhitespace();
  }

  if (!RENDER_MODES.has(mode)) {
    cursor.errors.add({
      type: "error",
      message: `Invalid render mode: ${mode}. Expected one of: ${Array.from(RENDER_MODES).join(", ")}`,
      line: token.pos.line,
      col: token.pos.col,
      code: "TW011",
      severity: "error",
    } as any);
  }

  return {
    type: "RenderDirective",
    mode,
    options,
    key,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Revalidate Directive -----------------------------------------------------

function parseRevalidateDirective(cursor: TokenCursor, token: Token): RevalidateDirective {
  cursor.skipWhitespace();
  let seconds: number | undefined;
  let tag: string | undefined;
  let path: string | undefined;
  let strategy = "time";

  const valToken = cursor.peek();
  if (valToken && valToken.type === "NUMBER") {
    cursor.advance();
    seconds = parseInt(valToken.value, 10);
    if (seconds < 0) {
      cursor.errors.add({
        type: "error",
        message: "Revalidate must be a positive number (seconds)",
        line: token.pos.line,
        col: token.pos.col,
        code: "TW012",
        severity: "error",
      } as any);
    }
  } else if (valToken && valToken.type === "IDENT") {
    cursor.advance();
    if (valToken.value === "tag") {
      cursor.skipWhitespace();
      tag = cursor.consumeValue();
      strategy = "tag";
    } else if (valToken.value === "path") {
      cursor.skipWhitespace();
      path = cursor.consumeValue();
      strategy = "path";
    } else if (valToken.value === "on-demand") {
      strategy = "on-demand";
    } else if (valToken.value === "ISR") {
      strategy = "ISR";
    } else if (valToken.value === "ssr") {
      strategy = "ssr";
    }
  }

  return {
    type: "RevalidateDirective",
    seconds,
    tag,
    path,
    strategy,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Redirect Directive -------------------------------------------------------

function parseRedirectDirective(cursor: TokenCursor, token: Token): RedirectDirective {
  cursor.skipWhitespace();
  const from = cursor.consumeValue();
  cursor.skipWhitespace();
  let to = "";
  if (cursor.match("ARROW") || (cursor.peek() && cursor.peek()!.value === "to")) {
    cursor.skipWhitespace();
    to = cursor.consumeValue();
  }
  cursor.skipWhitespace();

  let status: 301 | 302 | 307 | 308 = 301;
  if (cursor.peek() && cursor.peek()!.type === "NUMBER") {
    const statusVal = parseInt(cursor.advance()!.value, 10);
    if ([301, 302, 307, 308].includes(statusVal)) {
      status = statusVal as any;
    }
  }

  if (!to) {
    cursor.errors.add({
      type: "error",
      message: "Redirect must specify a target URL",
      line: token.pos.line,
      col: token.pos.col,
      code: "TW013",
      severity: "error",
    } as any);
  }

  return {
    type: "RedirectDirective",
    from,
    to,
    status,
    permanent: status === 301 || status === 308,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Rewrite Directive --------------------------------------------------------

function parseRewriteDirective(cursor: TokenCursor, token: Token): RewriteDirective {
  cursor.skipWhitespace();
  const from = cursor.consumeValue();
  cursor.skipWhitespace();
  let to = "";
  if (cursor.match("ARROW")) {
    cursor.skipWhitespace();
    to = cursor.consumeValue();
  }
  const has: unknown[] = [];

  cursor.skipWhitespace();
  while (cursor.peek() && cursor.peek()!.value === "has") {
    cursor.advance();
    cursor.skipWhitespace();
    const hasType = cursor.consumeValue();
    cursor.skipWhitespace();
    const hasKey = cursor.consumeValue();
    cursor.skipWhitespace();
    let hasValue: string | undefined;
    if (cursor.match("EQUALS")) {
      cursor.skipWhitespace();
      hasValue = cursor.consumeValue();
    }
    has.push({ type: hasType, key: hasKey, value: hasValue });
    cursor.skipWhitespace();
  }

  return {
    type: "RewriteDirective",
    from,
    to: to as any,
    has: (has.length > 0 ? has : undefined) as any,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Import Directive ----------------------------------------------------------

function parseImportDirective(cursor: TokenCursor, token: Token): ImportDirective {
  cursor.skipWhitespace();
  let isTypeOnly = false;
  if (cursor.peek() && cursor.peek()!.value === "type") {
    cursor.advance();
    isTypeOnly = true;
    cursor.skipWhitespace();
  }

  const items: string[] = [];
  let defaultImport: string | undefined;
  let namespaceImport: string | undefined;
  let isDynamic = false;

  // Check for dynamic import: import("module")
  if (cursor.peek() && cursor.peek()!.type === "LPAREN") {
    cursor.advance();
    cursor.skipWhitespace();
    const srcToken = cursor.peek();
    if (srcToken && srcToken.type === "STRING") {
      cursor.advance();
      const source = srcToken.value;
      cursor.expect("RPAREN");
      return {
        type: "ImportDirective",
        source,
        items: [],
        isTypeOnly,
        isDynamic: true,
        line: token.pos.line,
        col: token.pos.col,
      };
    }
  }

  // Default import
  if (cursor.peek() && cursor.peek()!.type === "IDENT" && cursor.peek()!.value !== "from") {
    defaultImport = cursor.advance()!.value;
    cursor.skipWhitespace();
    if (cursor.match("COMMA")) cursor.skipWhitespace();
  }

  // Namespace import: * as Name
  if (cursor.peek() && cursor.peek()!.type === "STAR") {
    cursor.advance();
    cursor.skipWhitespace();
    if (cursor.peek() && cursor.peek()!.value === "as") {
      cursor.advance();
      cursor.skipWhitespace();
      namespaceImport = cursor.advance()?.value;
      cursor.skipWhitespace();
    }
  }

  // Named imports: { a, b, c }
  if (cursor.peek() && cursor.peek()!.type === "LBRACE") {
    cursor.advance();
    cursor.skipWhitespace();
    do {
      const itemToken = cursor.peek();
      if (!itemToken || itemToken.type === "RBRACE") break;
      items.push(itemToken.value);
      cursor.advance();
      cursor.skipWhitespace();
    } while (cursor.match("COMMA"));
    cursor.expect("RBRACE");
  }

  // Side-effect import: import "./style/home.tss" -- no default/named
  // import, just a bare STRING source. Consume it here, otherwise it leaks
  // into the body as a stray Text node.
  if (!defaultImport && items.length === 0 && !namespaceImport) {
    const srcToken = cursor.peek();
    if (srcToken && srcToken.type === "STRING") {
      cursor.advance();
      return {
        type: "ImportDirective",
        source: srcToken.value,
        items: [],
        defaultImport: undefined,
        namespaceImport: undefined,
        isTypeOnly,
        isDynamic: false,
        line: token.pos.line,
        col: token.pos.col,
      };
    }
  }

  // from "source"
  cursor.skipWhitespace();
  if (cursor.peek() && cursor.peek()!.value === "from") {
    cursor.advance();
    cursor.skipWhitespace();
    const srcToken = cursor.peek();
    if (srcToken && srcToken.type === "STRING") {
      cursor.advance();
      return {
        type: "ImportDirective",
        source: srcToken.value,
        items,
        defaultImport,
        namespaceImport,
        isTypeOnly,
        isDynamic: false,
        line: token.pos.line,
        col: token.pos.col,
      };
    }
  }

  return {
    type: "ImportDirective",
    source: "",
    items,
    defaultImport,
    namespaceImport,
    isTypeOnly,
    isDynamic: false,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Export Directive ----------------------------------------------------------

function parseExportDirective(cursor: TokenCursor, token: Token): ExportDirective {
  cursor.skipWhitespace();
  let isTypeOnly = false;
  if (cursor.peek() && cursor.peek()!.value === "type") {
    cursor.advance();
    isTypeOnly = true;
    cursor.skipWhitespace();
  }

  let defaultExport: string | undefined;
  const items: string[] = [];

  if (cursor.peek() && cursor.peek()!.value === "default") {
    cursor.advance();
    cursor.skipWhitespace();
    defaultExport = cursor.consumeValue();
  } else if (cursor.peek() && cursor.peek()!.type === "LBRACE") {
    cursor.advance();
    cursor.skipWhitespace();
    do {
      const itemToken = cursor.peek();
      if (!itemToken || itemToken.type === "RBRACE") break;
      items.push(itemToken.value);
      cursor.advance();
      cursor.skipWhitespace();
    } while (cursor.match("COMMA"));
    cursor.expect("RBRACE");
  } else {
    // export const/let/var/function/class
    const keyword = cursor.consumeValue();
    cursor.skipWhitespace();
    const name = cursor.consumeValue();
    if (name) items.push(name);
  }

  return {
    type: "ExportDirective",
    items,
    defaultExport,
    isTypeOnly,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Define Directive ----------------------------------------------------------

function parseDefineDirective(cursor: TokenCursor, token: Token): DefineDirective {
  cursor.skipWhitespace();
  const name = cursor.consumeValue();
  cursor.skipWhitespace();
  let dataType: string | undefined;
  if (cursor.match("COLON")) {
    cursor.skipWhitespace();
    dataType = cursor.consumeValue();
  }
  cursor.skipWhitespace();
  let value = "";
  if (cursor.match("EQUALS")) {
    cursor.skipWhitespace();
    value = cursor.consumeValue();
  }

  return {
    type: "DefineDirective",
    name,
    value,
    dataType,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Config Directive ----------------------------------------------------------

function parseConfigDirective(cursor: TokenCursor, token: Token): ConfigDirective {
  cursor.skipWhitespace();
  const key = cursor.consumeValue();
  cursor.skipWhitespace();
  let scope = "page";
  if (cursor.peek() && cursor.peek()!.value === "scope") {
    cursor.advance();
    cursor.skipWhitespace();
    scope = cursor.consumeValue();
    cursor.skipWhitespace();
  }
  let value: unknown = "";
  if (cursor.match("EQUALS")) {
    cursor.skipWhitespace();
    value = cursor.consumeValue();
  }

  return {
    type: "ConfigDirective",
    key,
    value,
    scope,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Middleware Directive ----------------------------------------------------

function parseMiddlewareDirective(cursor: TokenCursor, token: Token): MiddlewareDirective {
  cursor.skipWhitespace();
  const path = cursor.consumeValue();
  cursor.skipWhitespace();
  let matcher: string | undefined;
  let priority = 0;

  while (cursor.peek() && cursor.peek()!.type === "IDENT") {
    const optToken = cursor.advance()!;
    if (cursor.match("EQUALS")) {
      cursor.skipWhitespace();
      const val = cursor.consumeValue();
      if (optToken.value === "matcher") matcher = val;
      if (optToken.value === "priority") priority = parseInt(val, 10) || 0;
    }
    cursor.skipWhitespace();
  }

  return {
    type: "MiddlewareDirective",
    path,
    matcher,
    priority,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Meta Directive ----------------------------------------------------------

function parseMetaDirective(cursor: TokenCursor, token: Token): MetaDirective {
  cursor.skipWhitespace();
  const key = cursor.consumeValue();
  cursor.skipWhitespace();
  let property: string | undefined;
  if (cursor.peek() && cursor.peek()!.value === "property") {
    cursor.advance();
    cursor.skipWhitespace();
    property = cursor.consumeValue();
    cursor.skipWhitespace();
  }
  let value = "";
  if (cursor.match("EQUALS") || cursor.match("COLON")) {
    cursor.skipWhitespace();
    value = cursor.consumeValue();
  }

  return {
    type: "MetaDirective",
    key,
    value,
    property,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Helpers ------------------------------------------------------------------

function parseBlockBody(cursor: TokenCursor, parseBody: (c: TokenCursor) => ASTNode[]): ASTNode[] {
  cursor.skipWhitespace();
  if (cursor.match("LBRACE")) {
    const body = parseBody(cursor);
    cursor.expect("RBRACE");
    return body;
  }
  return [];
}
