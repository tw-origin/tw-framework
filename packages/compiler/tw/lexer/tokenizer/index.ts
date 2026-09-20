/**
 * Main tokenizer -- converts .tw source into a stream of tokens.
 * Handles HTML-like syntax, TW directives, expressions, CSS, JS, and
 * all TW-specific syntax constructs.
 */

import {
  type Token,
  type TokenPosition,
  type TokenType,
  makeToken,
  isKeyword,
} from "../tokens/types";
import { readString, readNumber, readRegex } from "../strings";
import { readComment, readScriptBlock, readStyleBlock } from "../blocks";

// Enhanced lexer modules -- used for fast char classification,
// source map generation, error recovery, and token clustering
import {
  isAlphaUpper, isAlphaLower, isDigit, isWhitespace, isIdentStart, isIdentPart,
  isOpChar, isPunct, isStringDelimiter, isLineTerminator,
} from "../char-utils";
import { type RecoveryStrategy } from "../error-recovery";

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

export interface TokenizerOptions {
  filePath?: string;
  includeWhitespace?: boolean;
  includeNewlines?: boolean;
  includeComments?: boolean;
  recoverOnError?: boolean;
  maxErrors?: number;
  // Enhanced options
  generateSourceMap?: boolean;
  enableClustering?: boolean;
  recoveryStrategy?: RecoveryStrategy;
}

export interface TokenizerResult {
  tokens: Token[];
  errors: TokenizerError[];
  sourceMap?: string;
}

export interface TokenizerError {
  message: string;
  line: number;
  col: number;
  offset: number;
}

export function tokenize(source: string, opts?: TokenizerOptions): TokenizerResult {
  const filePath = opts?.filePath ?? "<anonymous>";
  const includeWhitespace = opts?.includeWhitespace ?? false;
  const includeNewlines = opts?.includeNewlines ?? false;
  const includeComments = opts?.includeComments ?? false;
  const recoverOnError = opts?.recoverOnError ?? true;
  const maxErrors = opts?.maxErrors ?? 50;

  const tokens: Token[] = [];
  const errors: TokenizerError[] = [];

  let pos = 0;
  let line = 1;
  let col = 1;
  let prevChar = "";
  let errorCount = 0;

  function currentPos(): TokenPosition {
    return { line, col, offset: pos };
  }

  function advance(count: number = 1): void {
    for (let i = 0; i < count && pos < source.length; i++) {
      if (source[pos] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
      prevChar = source[pos];
      pos++;
    }
  }

  function peek(offset: number = 0): string {
    return source[pos + offset] ?? "";
  }

  function startsWith(str: string): boolean {
    return source.slice(pos, pos + str.length) === str;
  }

  function precededByWhitespace(): boolean {
    return prevChar === " " || prevChar === "\t" || prevChar === "\n" || prevChar === "\r" || pos === 0;
  }

  function pushToken(type: TokenType, value: string, startPos: TokenPosition, raw?: string, flags?: any): void {
    const endPos = currentPos();
    tokens.push(makeToken(type, value, startPos, endPos, {
      raw: raw ?? value,
      precededByWhitespace: startPos.offset > 0 ? precededByWhitespace() : true,
      followedByWhitespace: peek() === " " || peek() === "\t" || peek() === "\n" || peek() === "\r" || peek() === "",
      flags,
    }));
  }

  function addError(message: string): void {
    if (errorCount >= maxErrors) return;
    errors.push({ message, line, col, offset: pos });
    errorCount++;
  }

  while (pos < source.length) {
    const startPos = currentPos();
    const ch = source[pos];

    // --- Whitespace -------------------------------------------------------
    if (ch === " " || ch === "\t") {
      let ws = "";
      while (pos < source.length && (source[pos] === " " || source[pos] === "\t")) {
        ws += source[pos];
        advance();
      }
      if (includeWhitespace) {
        pushToken("WHITESPACE", ws, startPos);
      }
      continue;
    }

    // --- Newlines --------------------------------------------------------
    if (ch === "\n" || ch === "\r") {
      let nl = "";
      if (ch === "\r" && peek(1) === "\n") {
        nl = "\r\n";
        advance(2);
      } else {
        nl = ch;
        advance();
      }
      if (includeNewlines) {
        pushToken("NEWLINE", nl, startPos);
      }
      continue;
    }

    // --- Comments ----------------------------------------------------------
    if (startsWith("<!--")) {
      const block = readComment(source, pos);
      advance(block.end - pos);
      if (includeComments) {
        pushToken("COMMENT", block.content, startPos, block.raw);
      }
      if (block.error) addError(block.error);
      continue;
    }

    // --- CDATA -------------------------------------------------------------
    if (startsWith("<![CDATA[")) {
      const blockStart = pos;
      const closeIdx = source.indexOf("]]>", pos + 9);
      if (closeIdx === -1) {
        advance(source.length - pos);
        addError("Unclosed CDATA section");
      } else {
        let content = source.slice(pos + 9, closeIdx);
        advance(closeIdx + 3 - pos);
        pushToken("CDATA", content, startPos, source.slice(blockStart, closeIdx + 3));
      }
      continue;
    }

    // --- DOCTYPE ------------------------------------------------------------
    if (startsWith("<!doctype") || startsWith("<!DOCTYPE")) {
      const closeIdx = source.indexOf(">", pos);
      if (closeIdx === -1) {
        advance(source.length - pos);
        addError("Unclosed DOCTYPE");
      } else {
        const content = source.slice(pos, closeIdx + 1);
        advance(closeIdx + 1 - pos);
        pushToken("DOCTYPE", content, startPos);
      }
      continue;
    }

    // --- Script Block ------------------------------------------------------
    if (startsWith("<script") || startsWith("<SCRIPT")) {
      const block = readScriptBlock(source, pos);
      if (block.error) {
        addError(block.error);
        if (!recoverOnError) break;
        advance(Math.max(1, block.end - pos));
      } else {
        advance(block.end - pos);
        pushToken("SCRIPT_OPEN", block.attrs ?? "", startPos, block.raw);
        if (block.content) {
          pushToken("TEXT", block.content, { line: startPos.line, col: startPos.col + 7, offset: startPos.offset + 7 });
        }
        // Find or assume closing tag
        const closeIdx = source.indexOf("</script>", pos);
        if (closeIdx !== -1) {
          const closeStart = currentPos();
          advance(closeIdx + 9 - pos);
          pushToken("SCRIPT_CLOSE", "</script>", closeStart);
        }
      }
      continue;
    }

    // --- Style Block -------------------------------------------------------
    if (startsWith("<style") || startsWith("<STYLE")) {
      const block = readStyleBlock(source, pos);
      if (block.error) {
        addError(block.error);
        if (!recoverOnError) break;
        advance(Math.max(1, block.end - pos));
      } else {
        pushToken("STYLE_OPEN", block.attrs ?? "", startPos, block.raw);
        advance(block.end - pos);
        if (block.content) {
          pushToken("TEXT", block.content, { line: startPos.line, col: startPos.col + 6, offset: startPos.offset + 6 });
        }
        const closeIdx = source.indexOf("</style>", pos);
        if (closeIdx !== -1) {
          const closeStart = currentPos();
          advance(closeIdx + 8 - pos);
          pushToken("STYLE_CLOSE", "</style>", closeStart);
        }
      }
      continue;
    }

    // --- Closing Tag </tag> ------------------------------------------------
    if (startsWith("</")) {
      advance(2); // skip </
      let tagName = "";
      while (pos < source.length && /[a-zA-Z0-9-]/.test(source[pos])) {
        tagName += source[pos];
        advance();
      }
      // skip to >
      while (pos < source.length && source[pos] !== ">") {
        advance();
      }
      if (source[pos] === ">") advance();
      pushToken("CLOSE_TAG", tagName, startPos, `</${tagName}>`);
      continue;
    }

    // --- Opening Tag <tag --------------------------------------------------
    if (ch === "<" && /[a-zA-Z]/.test(peek(1))) {
      advance(); // skip <
      let tagName = "";
      while (pos < source.length && /[a-zA-Z0-9-]/.test(source[pos])) {
        tagName += source[pos];
        advance();
      }

      const isComponent = /^[A-Z]/.test(tagName);
      pushToken(isComponent ? "COMPONENT_NAME" : "OPEN_TAG", tagName, startPos, `<${tagName}`);

      // Read attributes until > or />
      while (pos < source.length) {
        const attrStart = currentPos();
        const attrCh = source[pos];

        // Skip whitespace
        if (attrCh === " " || attrCh === "\t" || attrCh === "\n") {
          advance();
          continue;
        }

        // Self-closing
        if (attrCh === "/" && peek(1) === ">") {
          advance(2);
          pushToken("SELF_CLOSE", "/>", attrStart);
          break;
        }

        // Closing
        if (attrCh === ">") {
          pushToken("GT", ">", attrStart);
          advance();
          break;
        }

        // Event binding on:event
        if (attrCh === "o" && source.slice(pos, pos + 3) === "on:") {
          advance(3);
          let eventName = "";
          while (pos < source.length && /[a-zA-Z]/.test(source[pos])) {
            eventName += source[pos];
            advance();
          }
          pushToken("EVENT_PREFIX", `on:${eventName}`, attrStart);
          continue;
        }

        // Bind prefix :prop
        if (attrCh === ":") {
          advance();
          let bindName = "";
          while (pos < source.length && /[a-zA-Z0-9-]/.test(source[pos])) {
            bindName += source[pos];
            advance();
          }
          pushToken("BIND_PREFIX", `:${bindName}`, attrStart);
          // Read = value
          if (source[pos] === "=") {
            advance();
            const valStart = currentPos();
            const quote = source[pos];
            if (quote === '"' || quote === "'") {
              const strResult = readString(source, pos, quote);
              advance(strResult.end - pos);
              pushToken("ATTR_VALUE", strResult.value, valStart, strResult.raw);
            }
          }
          continue;
        }

        // Directive @directive
        if (attrCh === "@") {
          advance();
          let dirName = "";
          while (pos < source.length && /[a-zA-Z0-9-]/.test(source[pos])) {
            dirName += source[pos];
            advance();
          }
          pushToken("DIRECTIVE", `@${dirName}`, attrStart);
          continue;
        }

        // Attribute name
        if (/[a-zA-Z_:@]/.test(attrCh)) {
          let attrName = "";
          while (pos < source.length && /[a-zA-Z0-9_:@.\-]/.test(source[pos])) {
            attrName += source[pos];
            advance();
          }
          pushToken("ATTR_NAME", attrName, attrStart);

          // Check for = value
          if (source[pos] === "=") {
            advance();
            const valStart = currentPos();
            const quote = source[pos];
            if (quote === '"' || quote === "'") {
              const strResult = readString(source, pos, quote);
              advance(strResult.end - pos);
              pushToken("ATTR_VALUE", strResult.value, valStart, strResult.raw);
            } else if (source[pos] === "{") {
              // Interpolated value {expr}
              advance();
              let expr = "";
              let depth = 1;
              while (pos < source.length && depth > 0) {
                if (source[pos] === "{") depth++;
                else if (source[pos] === "}") depth--;
                if (depth > 0) expr += source[pos];
                advance();
              }
              pushToken("ATTR_VALUE", expr, valStart, `{${expr}}`);
            }
          }
          continue;
        }

        // Unknown -- skip
        advance();
      }
      continue;
    }

    // --- Top-level Directive @name { body } --------------------------------
    if (ch === "@") {
      advance(); // skip @
      let dirName = "";
      while (pos < source.length && /[a-zA-Z0-9-]/.test(source[pos])) {
        dirName += source[pos];
        advance();
      }
      // Read the directive body (everything until next @directive or <tag or EOF)
      // The parser's parseDirective handles the { body } parsing
      let dirBody = "";
      // Skip whitespace before body (do not collect into dirBody -- it must
      // start at the opening brace so slice(1, -1) below strips just { and })
      while (pos < source.length && (source[pos] === " " || source[pos] === "\t" || source[pos] === "\n" || source[pos] === "\r")) {
        advance();
      }
      if (source[pos] === "{") {
        // Read the entire { body } block
        let depth = 0;
        while (pos < source.length) {
          if (source[pos] === "{") depth++;
          else if (source[pos] === "}") {
            depth--;
            if (depth === 0) {
              dirBody += source[pos];
              advance();
              break;
            }
          }
          dirBody += source[pos];
          advance();
        }
        pushToken("DIRECTIVE", `@${dirName}`, startPos, `@${dirName} ${dirBody}`);

        if (dirName === "state") {
          // @state { name[: type] [= value][, name2 ...] } -- parseStateDirective
          // consumes IDENT/COLON/EQUALS/COMMA tokens directly off the cursor (no
          // brace wrapper, no pre-digested key/value STRING pairs), unlike the
          // generic colon-keyed directives below (e.g. @page { title: 'x' }).
          let inner = dirBody.slice(1, -1).trim();
          const decls = inner.split(/[;\n]/).map((p: string) => p.trim()).filter((p: string) => p);
          decls.forEach((decl: string, i: number) => {
            const eqIdx = decl.indexOf("=");
            const namePart = (eqIdx >= 0 ? decl.slice(0, eqIdx) : decl).trim();
            const valuePart = eqIdx >= 0 ? decl.slice(eqIdx + 1).trim() : "";

            const colonIdx = namePart.indexOf(":");
            const name = (colonIdx >= 0 ? namePart.slice(0, colonIdx) : namePart).trim();
            const typeAnn = colonIdx >= 0 ? namePart.slice(colonIdx + 1).trim() : "";

            pushToken("IDENT", name, startPos);
            if (typeAnn) {
              pushToken("COLON", ":", startPos);
              pushToken("IDENT", typeAnn, startPos);
            }
            if (eqIdx >= 0) {
              pushToken("EQUALS", "=", startPos);
              if (/^-?\d+(\.\d+)?$/.test(valuePart)) {
                pushToken("NUMBER", valuePart, startPos);
              } else if (/^["'].*["']$/.test(valuePart)) {
                pushToken("STRING", valuePart.slice(1, -1), startPos);
              } else {
                pushToken("IDENT", valuePart, startPos);
              }
            }
            if (i < decls.length - 1) pushToken("COMMA", ",", startPos);
          });
        } else if (dirName === "import") {
          // @import { A, B } from '...' -- parseImportDirective expects real
          // LBRACE/IDENT/COMMA/RBRACE tokens for the named-imports list (unlike
          // @state above, which wants no brace tokens at all). The generic
          // colon/equals-keyed branch below only pushes a token when a line
          // contains ":" or "=", so a bare identifier like "Button" was
          // silently dropped entirely, leaving `items: []`.
          pushToken("LBRACE", "{", startPos);
          let importInner = dirBody.slice(1, -1).trim();
          if (importInner) {
            const names = importInner.split(",").map((p: string) => p.trim()).filter((p: string) => p);
            names.forEach((name: string, i: number) => {
              pushToken("IDENT", name, startPos);
              if (i < names.length - 1) pushToken("COMMA", ",", startPos);
            });
          }
          pushToken("RBRACE", "}", startPos);
        } else {
        // Push the body as a separate LBRACE + body + RBRACE tokens for the parser
        // Actually, let's push the body content as well
        pushToken("LBRACE", "{", startPos);
        // Parse inner content
        let inner = dirBody.slice(1, -1).trim(); // Remove outer { }
        if (inner) {
          // Tokenize inner content as key-value pairs
          // Simple approach: push as STRING tokens
          const parts = inner.split(/[;\n]/).map((p: string) => p.trim()).filter((p: string) => p);
          for (const part of parts) {
            const colonIdx = part.indexOf(":");
            if (colonIdx > 0) {
              const key = part.slice(0, colonIdx).trim();
              const val = part.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
              pushToken("IDENT", key, startPos);
              pushToken("STRING", val, startPos);
            } else {
              const eqIdx = part.indexOf("=");
              if (eqIdx > 0) {
                const key = part.slice(0, eqIdx).trim();
                const val = part.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
                pushToken("IDENT", key, startPos);
                pushToken("STRING", val, startPos);
              }
            }
          }
        }
        pushToken("RBRACE", "}", startPos);
        }
      } else if (source[pos] === "'") {
        // @layout 'default' — single-quoted string
        advance();
        let val = "";
        while (pos < source.length && source[pos] !== "'") {
          val += source[pos];
          advance();
        }
        if (source[pos] === "'") advance();
        pushToken("DIRECTIVE", `@${dirName}`, startPos, `@${dirName} '${val}'`);
        pushToken("STRING", val, startPos);
      } else if (source[pos] === '"') {
        // @layout "default" — double-quoted string
        advance();
        let val = "";
        while (pos < source.length && source[pos] !== '"') {
          val += source[pos];
          advance();
        }
        if (source[pos] === '"') advance();
        pushToken("DIRECTIVE", `@${dirName}`, startPos, `@${dirName} "${val}"`);
        pushToken("STRING", val, startPos);
      } else {
        // @export const name = 'value' — read rest of line
        let rest = "";
        while (pos < source.length && source[pos] !== "\n") {
          rest += source[pos];
          advance();
        }
        pushToken("DIRECTIVE", `@${dirName}`, startPos, `@${dirName} ${rest}`);
        // Parse rest as tokens
        if (rest.trim()) {
          // Simple tokenization of the rest
          const tokens = rest.trim().split(/\s+/);
          for (let t of tokens) {
            if (t === "const" || t === "let" || t === "var" || t === "function") {
              pushToken("KEYWORD", t, startPos);
            } else if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(t)) {
              pushToken("IDENT", t, startPos);
            } else if (/^["'].*["']$/.test(t)) {
              pushToken("STRING", t.slice(1, -1), startPos);
            } else if (/^-?\d+(\.\d+)?$/.test(t)) {
              pushToken("NUMBER", t, startPos);
            } else if (t === "=" || t === ";") {
              pushToken(t === "=" ? "ASSIGN" : "SEMICOLON", t, startPos);
            }
          }
        }
      }
      continue;
    }

    // --- TWM Block {% ... %} ------------------------------------------------
    if (startsWith("{%") || startsWith("{{")) {
      const blockStart = pos;
      const closeTag = startsWith("{%") ? "%}" : "}}";
      advance(2);
      let content = "";
      while (pos < source.length && !startsWith(closeTag)) {
        content += source[pos];
        advance();
      }
      if (startsWith(closeTag)) {
        advance(closeTag.length);
      } else {
        addError("Unclosed TWM block");
      }
      pushToken("TEXT", content, startPos, source.slice(blockStart, pos));
      continue;
    }

    // --- String Literals ----------------------------------------------------
    if (isStringDelimiter(ch)) {
      const strResult = readString(source, pos, ch);
      if (strResult.error) {
        addError(strResult.error);
        if (!recoverOnError) break;
      }
      advance(strResult.end - pos);
      pushToken("STRING", strResult.value, startPos, strResult.raw);
      continue;
    }

    // --- Numbers -------------------------------------------------------------
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(peek(1)))) {
      const numResult = readNumber(source, pos);
      advance(numResult.end - pos);
      pushToken("NUMBER", numResult.value, startPos, numResult.raw);
      continue;
    }

    // --- Line comments (`// ...` to end of line) -----------------------------
    // Must be checked BEFORE the regex branch: `// top comment` would
    // otherwise be consumed as a (broken) regex literal and leak into output.
    if (ch === "/" && peek(1) === "/") {
      while (pos < source.length && source[pos] !== "\n") {
        advance();
      }
      continue;
    }

    // --- Regex --------------------------------------------------------------
    if (ch === "/" && prevChar !== ")" && !/[a-zA-Z0-9_]/.test(prevChar)) {
      const regResult = readRegex(source, pos);
      if (!regResult.error) {
        advance(regResult.end - pos);
        pushToken("REGEX", `${regResult.pattern}/${regResult.flags}`, startPos, regResult.raw);
        continue;
      }
    }

    // --- Identifiers & Keywords ---------------------------------------------
    if (/[a-zA-Z_$]/.test(ch)) {
      let ident = "";
      while (pos < source.length && /[a-zA-Z0-9_$]/.test(source[pos])) {
        ident += source[pos];
        advance();
      }
      if (isKeyword(ident)) {
        pushToken("KEYWORD", ident, startPos);
      } else {
        pushToken("IDENT", ident, startPos);
      }
      continue;
    }

    // --- Operators & Punctuation --------------------------------------------
    const op = readOperator(source, pos);
    if (op) {
      advance(op.length);
      pushToken(opType(op), op, startPos);
      continue;
    }

    // --- Unknown character ---------------------------------------------------
    addError(`Unexpected character: ${ch}`);
    if (!recoverOnError) break;
    advance();
  }

  // EOF token
  const eofPos = currentPos();
  tokens.push(makeToken("EOF", "", eofPos, eofPos));

  return { tokens, errors };
}

// --- Operator Reader ---------------------------------------------------------

function readOperator(source: string, pos: number): string | null {
  const operators3 = ["===", "!==", ">>>", "**=", "...", "=>>", "<<=", ">>=", ">>>=", "&&=", "||=", "??=", "?.", "||>"];
  const operators2 = ["==", "!=", "<=", ">=", "&&", "||", "??", "=>", "<<", ">>", "**", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "~="];
  const operators1 = ["+", "-", "*", "/", "%", "=", "<", ">", "!", "&", "|", "^", "~", "?", ":", ";", ",", ".", "(", ")", "[", "]", "{", "}", "@", "#", "$", "`", "\\"];

  const remaining = source.slice(pos);

  for (const op of operators3) {
    if (remaining.startsWith(op)) return op;
  }
  for (const op of operators2) {
    if (remaining.startsWith(op)) return op;
  }
  for (const op of operators1) {
    if (remaining.startsWith(op)) return op;
  }

  return null;
}

function opType(op: string): TokenType {
  const map: Record<string, TokenType> = {
    "===": "SEQ", "!==": "SNEQ",
    "==": "EQ", "!=": "NEQ", "<=": "LE", ">=": "GE",
    "&&": "AND", "||": "OR", "??": "NULLISH",
    "=>": "ARROW", "...": "SPREAD",
    "<<": "DOUBLE_LT", ">>": "DOUBLE_GT", ">>>": "TRIPLE_GT",
    "**": "STAR", "++": "PLUS", "--": "MINUS",
    "+=": "PLUS_ASSIGN", "-=": "MINUS_ASSIGN", "*=": "STAR_ASSIGN",
    "/=": "SLASH_ASSIGN", "%=": "PERCENT_ASSIGN",
    "&=": "AMP_ASSIGN", "|=": "PIPE_ASSIGN", "^=": "CARET_ASSIGN",
    "<<=": "SHL_ASSIGN", ">>=": "SHR_ASSIGN", ">>>=": "USHR_ASSIGN",
    "&&=": "AND_ASSIGN", "||=": "OR_ASSIGN", "??=": "NULLISH_ASSIGN",
    "**=": "EXP_ASSIGN",
    "+": "PLUS", "-": "MINUS", "*": "STAR", "/": "SLASH", "%": "PERCENT",
    "=": "ASSIGN", "<": "LT", ">": "GT", "!": "BANG", "&": "AMPERSAND",
    "|": "PIPE", "^": "CARET", "~": "TILDE", "?": "QUESTION", ":": "COLON",
    ";": "SEMICOLON", ",": "COMMA", ".": "DOT", "(": "LPAREN", ")": "RPAREN",
    "[": "LBRACKET", "]": "RBRACKET", "{": "LBRACE", "}": "RBRACE",
    "@": "AT", "#": "HASH", "$": "DOLLAR", "`": "TEMPLATE", "\\": "BACKSLASH",
    "?.": "DOT",
  };
  return map[op] ?? "ILLEGAL";
}


// Convenience: returns just the tokens array (for tests/simple usage)
export function tokenizeArray(source: string, opts?: TokenizerOptions): Token[] {
  return tokenize(source, opts).tokens;
}
