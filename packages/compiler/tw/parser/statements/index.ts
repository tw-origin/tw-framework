/**
 * Statement parser -- parses elements, components, if/for/while,
 * script/style/twm blocks, attributes, styles, events, bindings.
 * The heart of the TW parser.
 */

import type { Token, TokenType } from "../../lexer/tokens";
import type {
  ASTNode, ElementNode, ComponentNode, TextNode, IfNode, ForNode,
  WhileNode, SwitchNode, TryNode, ScriptBlock, StyleBlock, TwmBlock,
  CommentNode, FragmentNode, SlotNode, AttributeNode, StyleDecl,
  EventBinding, PropertyBinding, ElementDirective, ComponentProp,
} from "../../ast/nodes";
import {
  createElement, createText, createComponent, createIf, createFor,
  createAttribute, createStyleDecl, createEventBinding, createPropertyBinding,
  createScriptBlock, createStyleBlock, createFragment, createSlot,
} from "../../ast/nodes";
import { ErrorCollector, CompilerError, CompilerState } from "../recovery";
import { isDirectiveKeyword, parseDirective } from "../directives";
import { TokenCursor } from "../expressions";
import { VOID_TAGS } from "@tw/shared";

/** Wrap a function with error handling, logging to console.error. */
function withErrorHandling<T extends (...args: any[]) => any>(fn: T, name: string): T {
  return ((...args: Parameters<T>) => {
    try {
      return fn(...args);
    } catch (e) {
      console.error("[TW] " + name + " error:", e);
      throw e instanceof Error ? e : new Error(String(e));
    }
  }) as T;
}

export interface StatementParserOptions {
  filePath?: string;
  state?: CompilerState;
  /** Token types that stop the top-level parseBody loop (e.g. ["RBRACE"]). */
  stopTypes?: TokenType[];
  /**
   * Value-based stop for top-level directive keywords (e.g. a trailing
   * `state { }` block). Only consulted by the OUTER statement loop --
   * nested element bodies must not stop on keywords like `body`/`head`.
   */
  stopKeywordCheck?: (value: string) => boolean;
}

export function parseStatements(
  cursor: TokenCursor,
  errors: ErrorCollector,
  opts?: StatementParserOptions,
): ASTNode[] {
  const nodes: ASTNode[] = [];
  const state = opts?.state ?? new CompilerState(errors);
  const filePath = opts?.filePath ?? "<anonymous>";

  function parseBody(stopTypes: TokenType[] = opts?.stopTypes ?? ["EOF"]): ASTNode[] {
    const body: ASTNode[] = [];

    while (!cursor.done) {
      const token = cursor.peek();
      if (!token || token.type === "EOF") break;

      if (stopTypes.includes(token.type)) break;

      const node = parseNode(token);
      if (node) {
        if (Array.isArray(node)) {
          body.push(...node);
        } else {
          // Adjacent plain-text words become separate Text nodes because the
          // lexer tokenizes text content word-by-word (IDENT tokens) and
          // drops the whitespace between them -- merge consecutive plain
          // Text nodes back together so e.g. "Hello World" doesn't
          // round-trip as "HelloWorld". Whether to rejoin with a space
          // depends on whether there actually was a gap in the source: use
          // line/col to tell "Count" + ":" (adjacent, no space) apart from
          // "Hello" + "World" (separated by whitespace).
          const prev = body[body.length - 1];
          if (
            node.type === "Text" && !(node as any).isInterpolated &&
            prev && prev.type === "Text" && !(prev as any).isInterpolated
          ) {
            const prevRaw = (prev as any).raw ?? (prev as any).value;
            const prevEndCol = (prev as any).col + prevRaw.length;
            const sameLine = (prev as any).line === (node as any).line;
            const adjacent = sameLine && prevEndCol === (node as any).col;
            const joiner = adjacent ? "" : " ";
            (prev as any).value += joiner + (node as any).value;
            (prev as any).raw = prevRaw + joiner + ((node as any).raw ?? (node as any).value);
          } else {
            body.push(node);
          }
        }
      }
    }

    return body;
  }

  function parseNode(token: Token): ASTNode | ASTNode[] | null {
    switch (token.type) {
      case "OPEN_TAG":       return parseElement(cursor, errors, state, parseBody);
      case "COMPONENT_NAME": return parseComponent(cursor, errors, state, parseBody);
      case "CLOSE_TAG":      return parseCloseTag(cursor, errors);
      case "IDENT": {
        // `head { ... }` at statement level is a HeadDirective (defines
        // <head> content), not an element -- it lexes as IDENT, not KEYWORD,
        // so the program-level directive scan never catches it.
        if (token.value === "head") {
          const nextH = cursor.peek(1);
          if (nextH && nextH.type === "LBRACE") {
            cursor.advance(); // consume "head"
            const dir = parseDirective(cursor, token, () => parseBody(["RBRACE"]));
            if (dir) return dir as unknown as ASTNode;
          }
        }
        // `style { ... }` is an inline style block, not an element.
        if (token.value === "style") {
          const nextS = cursor.peek(1);
          if (nextS && nextS.type === "LBRACE") {
            cursor.advance(); // consume "style"
            cursor.advance(); // consume "{
            // Collect raw token text until the matching RBRACE.
            let depth = 1;
            const parts: string[] = [];
            while (!cursor.done) {
              const tk = cursor.peek();
              if (!tk || tk.type === "EOF") break;
              if (tk.type === "LBRACE") depth++;
              else if (tk.type === "RBRACE") depth--;
              if (depth === 0) { cursor.advance(); break; }
              parts.push(tk.value);
              cursor.advance();
            }
            const content = parts.join(" ").replace(/\s*\{\s*/g, " {").replace(/\s*\}\s*/g, "}").replace(/\s*:\s*/g, ": ").replace(/\s*;\s*/g, "; ");
            return {
              type: "StyleBlock",
              content,
              lang: "css",
              scoped: false,
              line: token.pos.line,
              col: token.pos.col,
            } as unknown as ASTNode;
          }
        }
        // Check if this is a CSS selector (followed by . # or {) or just text content
        const nextTok = cursor.peek(1);
        // `meta charset "utf-8"` / `link rel "stylesheet" href "..."` --
        // void/head elements followed by a bare IDENT are attribute lists,
        // not text content.
        const VOID_HEAD_TAGS = new Set(["meta", "link", "base", "area", "col", "embed", "param", "source", "track", "wbr", "hr", "br", "input", "img"]);
        const nextNext = cursor.peek(2);
        // `a href "/about" { "About" }` -- any tag followed by a known
        // attribute name and a string value is an attribute list (docs form).
        const KNOWN_ATTRS = new Set([
          "href", "src", "type", "id", "name", "value", "placeholder",
          "action", "method", "title", "alt", "rel", "target", "lang",
          "charset", "content", "width", "height", "loading", "for",
          "role", "min", "max", "step", "pattern", "accept", "list",
          "download", "tabindex", "cols", "rows", "wrap", "datetime",
        ]);
        const isSelector = nextTok && (
          nextTok.type === "DOT" || nextTok.type === "HASH" ||
          nextTok.type === "LBRACE" || nextTok.type === "STRING" ||
          // `width 800` — a bare IDENT followed by a NUMBER is a prop/value
          // pair (builtin component props accept numbers), not text content.
          nextTok.type === "NUMBER" ||
          (nextTok.type === "IDENT" && VOID_HEAD_TAGS.has(token.value)) ||
          (nextTok.type === "IDENT" && KNOWN_ATTRS.has(nextTok.value) && nextNext && nextNext.type === "STRING") ||
          // Event binding after the tag name: `button on:click "handler" { ... }`
          (nextTok.type === "IDENT" && nextTok.value === "on" && nextNext && nextNext.type === "COLON") ||
          (nextTok.type === "IDENT" && nextTok.value === "bind" && nextNext && nextNext.type === "COLON") ||
          (nextTok.type === "COLON" && nextNext && (nextNext.type === "IDENT" || nextNext.type === "KEYWORD"))
        );
        if (isSelector) {
          return parseTWSelector(cursor, errors, state, parseBody);
        }
        // `div class "demo"` -- `class` is a reserved keyword: classes use
        // dot syntax (div.demo). Without this check the tokens leak into the
        // page as raw text (e.g. a literal `demo}`) with no error at all.
        if (nextTok && nextTok.type === "KEYWORD" && nextTok.value === "class") {
          errors.add(new CompilerError(
            "class is not valid inline attribute syntax here -- classes use dot syntax: " +
              token.value + ".my-class { ... }",
            token.pos.line,
            token.pos.col,
            "TW044",
            "error",
          ));
          return parseText(cursor); // keep a node so error recovery continues
        }
        // Treat as text content
        return parseText(cursor);
      }
      case "STRING":         return parseTextFromString(cursor);
      case "TEXT":           return parseText(cursor);
      case "INTERP_START":   return parseInterpolation(cursor, errors);
      case "LBRACE": {
        // `{expr}` interpolation inside element/text body content. The
        // dedicated INTERP_START/INTERP_END token types exist in the type
        // system but the lexer never actually emits them for text-mode
        // braces (it only emits plain LBRACE/RBRACE here) -- parseInterpolation
        // already handles a plain closing RBRACE at depth 1 just as well, so
        // route bare LBRACE here too instead of silently dropping it (the
        // previous behavior: the { and } were discarded by the `default`
        // case below, and stray identifiers inside fell through as if they
        // were plain adjacent text).
        return parseInterpolation(cursor, errors);
      }
      case "COLON": {
        // A colon that reaches this top-level body dispatch as a standalone
        // token (rather than being consumed as part of attribute/selector
        // parsing) is just punctuation inside plain text, e.g. "Count: {x}"
        // -- treat it as literal text instead of silently dropping it (the
        // `default` case below just advances and discards the token).
        const colonTok = cursor.advance();
        return colonTok ? createText(":", colonTok.pos.line, colonTok.pos.col, false) : null;
      }
      case "SCRIPT_OPEN":    return parseScriptBlockNode(cursor, errors);
      case "STYLE_OPEN":     return parseStyleBlockNode(cursor, errors);
      case "COMMENT":        return parseCommentNode(cursor);
      case "KEYWORD": {
        // Check if this keyword is used as an HTML element selector
        // e.g. section.hero { ... } or body { ... } or head "title"
        const nextTok = cursor.peek(1);
        const isSelector = nextTok && (
          nextTok.type === "DOT" || nextTok.type === "HASH" ||
          nextTok.type === "LBRACE" || nextTok.type === "STRING"
        );
        // Keywords that are also HTML elements
        const htmlKeywords = new Set(["section", "body", "nav", "header", "footer", "main", "article", "aside"]);
        // `head { ... }` is a HeadDirective (defines <head> content), not an
        // element -- route it to the directive parser even though `head` is
        // also an HTML tag.
        if (token.value === "head" && isSelector) {
          cursor.advance(); // consume "head"
          const dir = parseDirective(cursor, token, () => parseBody(["RBRACE"]));
          if (dir) return dir as unknown as ASTNode;
        }
        if (isSelector && htmlKeywords.has(token.value)) {
          return parseTWSelector(cursor, errors, state, parseBody);
        }
        return parseKeywordStatement(cursor, errors, state, parseBody);
      }
      case "DIRECTIVE":      return parseDirectiveNode(cursor, errors, parseBody as any);
      case "WHITESPACE":
      case "NEWLINE":
        cursor.advance();
        return null;
      case "DOCTYPE":       return parseDoctype(cursor);
      case "CDATA":          return parseCDATA(cursor);
      case "SELF_CLOSE":     cursor.advance(); return null;
      case "EOF":            return null;
      default:
        cursor.advance();
        return null;
    }
  }

  while (!cursor.done) {
    const token = cursor.peek();
    if (!token || token.type === "EOF") break;
    // Directive block bodies (parseBlockBody callbacks) stop at RBRACE --
    // the top-level loop must respect the same stop types.
    if (opts?.stopTypes?.includes(token.type)) break;
    if (opts?.stopKeywordCheck && token.type === "KEYWORD" && opts.stopKeywordCheck(token.value)) {
      const n = cursor.peek(1);
      if (!(n && (n.type === "DOT" || n.type === "HASH"))) break;
    }

    const node = parseNode(token);
    if (node) {
      if (Array.isArray(node)) {
        nodes.push(...node);
      } else {
        nodes.push(node);
      }
    }
  }

  return nodes;
}

// Check if the content inside { } looks like attributes (IDENT STRING pairs)
function checkIsAttrBlock(cursor: TokenCursor): boolean {
  // Save position by checking pattern: IDENT STRING [IDENT STRING]* RBRACE
  let offset = 0;
  let isAttr = true;
  let foundPair = false;
  
  while (true) {
    const t = cursor.peek(offset);
    if (!t || t.type === "RBRACE" || t.type === "EOF") break;
    if (t.type === "WHITESPACE" || t.type === "NEWLINE") { offset++; continue; }
    
    if (t.type === "IDENT" || t.type === "KEYWORD") {
      // Next should be STRING or EQUALS or RBRACE
      let nextOffset = offset + 1;
      const next = cursor.peek(nextOffset);
      while (next && (next.type === "WHITESPACE" || next.type === "NEWLINE")) {
        nextOffset++;
      }
      if (next && (next.type === "STRING" || next.type === "NUMBER")) {
        foundPair = true;
        offset = nextOffset + 1;
        continue;
      } else if (next && next.type === "EQUALS") {
        foundPair = true;
        offset = nextOffset + 1;
        continue;
      } else {
        isAttr = false;
        break;
      }
    } else {
      isAttr = false;
      break;
    }
  }
  
  return isAttr && foundPair;
}

// --- TW Selector Parser (CSS-like syntax: div.container { ... }) --------------

function parseTWSelector(
  cursor: TokenCursor,
  errors: ErrorCollector,
  state: CompilerState,
  parseBody: (stop: TokenType[]) => ASTNode[],
): ElementNode | null {
  const tagToken = cursor.advance();
  if (!tagToken) return null;

  const tag = tagToken.value;
  const el = createElement(tag, tagToken.pos.line, tagToken.pos.col);
  el.voidElement = VOID_TAGS.has(tag.toLowerCase());

  state.pushTag(tag);

  // Parse selectors (.class, #id)
  while (!cursor.done) {
    const token = cursor.peek();
    if (!token) break;

    // .class
    if (token.type === "DOT") {
      cursor.advance();
      // Read class name -- may include hyphens (nav-link)
      let classVal = "";
      const classStart = cursor.peek()?.pos;
      while (!cursor.done) {
        const ct = cursor.peek();
        if (!ct) break;
        // Don't swallow `on:` event bindings: `div.btn on:click "handler"`
        // tokenizes as IDENT("on") COLON -- stop the class name there.
        if (ct.type === "IDENT" && ct.value === "on") {
          const after = cursor.peek(1);
          if (after && after.type === "COLON") break;
        }
        if (ct.type === "IDENT" || ct.type === "TEXT" || ct.type === "KEYWORD") {
          classVal += ct.value;
          cursor.advance();
        } else if (ct.type === "NUMBER") {
          // Utility classes carry numbers: gap-4, w-64, p-2
          classVal += ct.value;
          cursor.advance();
        } else if (ct.type === "SLASH" && classVal.length > 0) {
          // Fractional utilities: w-1/2, aspect-16/9
          classVal += "/";
          cursor.advance();
        } else if (ct.type === "MINUS") {
          classVal += "-";
          cursor.advance();
        } else {
          break;
        }
      }
      // Check for multiple classes: div.a.b
      while (!cursor.done && cursor.peek()?.type === "DOT") {
        cursor.advance();
        let nextClass = "";
        while (!cursor.done) {
          const ct = cursor.peek();
          if (!ct) break;
          if (ct.type === "IDENT" || ct.type === "TEXT" || ct.type === "KEYWORD") {
            nextClass += ct.value;
            cursor.advance();
          } else if (ct.type === "NUMBER") {
            nextClass += ct.value;
            cursor.advance();
          } else if (ct.type === "SLASH" && nextClass.length > 0) {
            nextClass += "/";
            cursor.advance();
          } else if (ct.type === "MINUS") {
            nextClass += "-";
            cursor.advance();
          } else {
            break;
          }
        }
        if (nextClass) classVal += " " + nextClass;
      }
      if (classVal && classStart) {
        el.attrs.push(createAttribute("class", classVal, classStart.line, classStart.col));
      }
      continue;
    }

    // #id
    if (token.type === "HASH") {
      cursor.advance();
      const idToken = cursor.peek();
      if (idToken && (idToken.type === "IDENT" || idToken.type === "TEXT")) {
        cursor.advance();
        el.attrs.push(createAttribute("id", idToken.value, idToken.pos.line, idToken.pos.col));
      }
      continue;
    }

    break;
  }

  // Parse inline attributes: method "post" action "/api/login"
  // These come AFTER selectors (.class/#id) and BEFORE { body }
  const VOID_HEAD_TAGS_ATTR = new Set(["meta", "link", "base", "area", "col", "embed", "param", "source", "track", "wbr", "hr", "br", "input", "img", "title", "script", "noscript"]);
  while (!cursor.done) {
    const t = cursor.peek();
    if (!t) break;
    if (t.type === "LBRACE" || t.type === "STRING") break;
    // A void/head element name followed by IDENT/STRING starts the NEXT
    // element (e.g. `meta charset "utf-8" link rel "stylesheet" ...`),
    // not another attribute of this one.
    if (t.type === "IDENT" && VOID_HEAD_TAGS_ATTR.has(t.value)) {
      const after = cursor.peek(1);
      if (after && (after.type === "IDENT" || after.type === "STRING")) break;
    }
    // Event binding: on:click "handler" (tokenizes as IDENT COLON IDENT STRING)
    if ((t.type === "IDENT" || t.type === "KEYWORD") && t.value === "on") {
      const colon = cursor.peek(1);
      const eventName = cursor.peek(2);
      if (colon && colon.type === "COLON" && eventName && (eventName.type === "IDENT" || eventName.type === "KEYWORD" || eventName.type === "TEXT")) {
        cursor.advance(); // on
        cursor.advance(); // :
        cursor.advance(); // eventName
        const modifiers: string[] = [];
        cursor.skipWhitespace();
        while (cursor.peek() && cursor.peek().type === "DOT") {
          cursor.advance();
          const modTok = cursor.peek();
          if (modTok && (modTok.type === "IDENT" || modTok.type === "KEYWORD" || modTok.type === "TEXT")) {
            cursor.advance();
            modifiers.push(modTok.value);
          } else break;
          cursor.skipWhitespace();
        }
        const handlerToken = cursor.peek();
        const binding = createEventBinding(eventName.value, "", t.pos.line, t.pos.col);
        binding.modifiers = modifiers as any;
        if (modifiers.includes("prevent")) binding.preventDefault = true;
        if (modifiers.includes("stop")) binding.stopPropagation = true;
        if (modifiers.includes("once")) binding.once = true;
        if (modifiers.includes("capture")) binding.capture = true;
        if (handlerToken && (handlerToken.type === "STRING" || handlerToken.type === "ATTR_VALUE" || handlerToken.type === "IDENT")) {
          cursor.advance();
          binding.handler = handlerToken.value;
        }
        el.events.push(binding);
        continue;
      }
    }
    // Property binding: bind:value "expression"
    if ((t.type === "IDENT" || t.type === "KEYWORD") && t.value === "bind") {
      const colonB = cursor.peek(1);
      const propB = cursor.peek(2);
      if (colonB && colonB.type === "COLON" && propB && (propB.type === "IDENT" || propB.type === "KEYWORD" || propB.type === "TEXT")) {
        cursor.advance(); cursor.advance(); cursor.advance();
        cursor.skipWhitespace();
        const exprB = cursor.peek();
        if (exprB && (exprB.type === "STRING" || exprB.type === "ATTR_VALUE" || exprB.type === "IDENT")) {
          cursor.advance();
          el.bindings.push(createPropertyBinding(propB.value, exprB.value, t.pos.line, t.pos.col));
        }
        continue;
      }
    }
    // Shorthand binding: :value "expression"
    if (t.type === "COLON") {
      const propS = cursor.peek(1);
      if (propS && (propS.type === "IDENT" || propS.type === "KEYWORD" || propS.type === "TEXT")) {
        cursor.advance(); cursor.advance();
        cursor.skipWhitespace();
        const exprS = cursor.peek();
        if (exprS && (exprS.type === "STRING" || exprS.type === "ATTR_VALUE" || exprS.type === "IDENT")) {
          cursor.advance();
          el.bindings.push(createPropertyBinding(propS.value, exprS.value, t.pos.line, t.pos.col));
        }
        continue;
      }
    }
    if (t.type === "IDENT" || t.type === "KEYWORD") {
      // An IDENT on a LATER line than the tag starts a new element, not an
      // attribute of this one — bare-word props (`priority`) must not swallow
      // the prop written on the next line.
      if (t.pos.line > tagToken.pos.line) break;
      const attrName = t.value;
      cursor.advance();
      const vToken = cursor.peek();
      if (vToken && (vToken.type === "STRING" || vToken.type === "NUMBER")) {
        cursor.advance();
        el.attrs.push(createAttribute(attrName, vToken.value, t.pos.line, t.pos.col));
      } else if (vToken && (vToken.type === "IDENT" || vToken.type === "KEYWORD")) {
        cursor.advance();
        el.attrs.push(createAttribute(attrName, vToken.value, t.pos.line, t.pos.col));
      } else {
        el.attrs.push(createAttribute(attrName, true, t.pos.line, t.pos.col));
      }
    } else if (t.type === "NUMBER") {
      // `width 800` — the element doubles as a prop name and the number is
      // its value: attach it as the text child (same shape as `src "/x.jpg"`),
      // then stop — each further prop on its own line parses as its own
      // element.
      cursor.advance();
      el.children.push(createText(String(t.value), t.pos.line, t.pos.col, false));
      break;
    } else {
      break;
    }
  }

  // Check for { body } or { attrs }
  if (cursor.match("LBRACE")) {
    // match already consumed the LBRACE
    // For void elements (img, input, br, etc.), { ... } is always attributes
    // For non-void elements, check if first token is a known HTML attribute
    // to decide between attrs vs children
    if (el.voidElement) {
      // Parse as attributes: src "/photo.jpg" alt "Photo"
      while (!cursor.done) {
        const t = cursor.peek();
        if (!t || t.type === "RBRACE" || t.type === "EOF") break;
        if (t.type === "IDENT" || t.type === "KEYWORD") {
          const attrName = t.value;
          cursor.advance();
          const vToken = cursor.peek();
          if (vToken && (vToken.type === "STRING" || vToken.type === "NUMBER")) {
            cursor.advance();
            el.attrs.push(createAttribute(attrName, vToken.value, t.pos.line, t.pos.col));
          } else {
            el.attrs.push(createAttribute(attrName, true, t.pos.line, t.pos.col));
          }
        } else {
          cursor.advance();
        }
      }
      cursor.consumeIf("RBRACE");
    } else {
      // Non-void element: check if content looks like attributes
      // Known HTML attributes that are NOT HTML elements
      const HTML_ATTRS_ONLY = new Set([
        "method", "action", "placeholder", "disabled", "required", "readonly",
        "checked", "selected", "target", "rel", "download", "autocomplete",
        "autofocus", "min", "max", "step", "pattern", "multiple", "size",
        "cols", "rows", "wrap", "for", "hidden", "width", "height",
        "loading", "loop", "muted", "controls", "poster", "preload",
        "contenteditable", "draggable", "spellcheck", "translate",
        "accesskey", "tabindex", "role", "slot", "is", "part",
        "enterkeyhint", "inert", "inputmode", "sandbox", "allow",
        "allowfullscreen", "referrerpolicy", "fetchpriority", "blocking",
        "property", "itemprop", "itemtype", "itemid", "itemref",
        "itemscope", "charset", "http-equiv", "data", "nonce",
        "crossorigin", "integrity", "async", "defer", "srcset",
        "sizes", "media", "ping", "coords", "shape", "usemap",
        "ismap", "kind", "srclang", "default", "autoplay",
        "playsinline", "max-age", "enctype", "novalidate", "formaction",
        "formmethod", "formtarget", "formenctype", "formnovalidate",
      ]);
      const first = cursor.peek();
      const second = cursor.peek(1);
      // Control-flow keywords (for item in {items} { ... }) must never be
      // treated as an attribute block even though `for` is also a valid HTML
      // attribute name -- otherwise the loop header is swallowed as attrs.
      const CONTROL_FLOW = new Set(["for", "if", "while", "switch", "else", "try", "catch"]);
      const isAttrBlock = first
        && (first.type === "IDENT" || first.type === "KEYWORD")
        && !CONTROL_FLOW.has(first.value)
        && HTML_ATTRS_ONLY.has(first.value)
        && second
        && (second.type === "STRING" || second.type === "NUMBER" || second.type === "IDENT" || second.type === "KEYWORD");
      if (isAttrBlock) {
        // Parse as attributes
        while (!cursor.done) {
          const t = cursor.peek();
          if (!t || t.type === "RBRACE" || t.type === "EOF") break;
          if (t.type === "IDENT" || t.type === "KEYWORD") {
            const attrName = t.value;
            cursor.advance();
            const vToken = cursor.peek();
            if (vToken && (vToken.type === "STRING" || vToken.type === "NUMBER")) {
              cursor.advance();
              el.attrs.push(createAttribute(attrName, vToken.value, t.pos.line, t.pos.col));
            } else {
              el.attrs.push(createAttribute(attrName, true, t.pos.line, t.pos.col));
            }
          } else {
            cursor.advance();
          }
        }
        cursor.consumeIf("RBRACE");
      } else {
        // Parse as child elements
        el.children = parseBody(["RBRACE"]);
        cursor.consumeIf("RBRACE");
      }
    }
  } else if (cursor.peek() && cursor.peek()!.type === "STRING") {
    // h1 "Hello World" -- string is text content
    const strToken = cursor.advance();
    el.children.push(createText(strToken!.value, strToken!.pos.line, strToken!.pos.col, false));
    // Check for { attrs } after text: a "About" { href "/about" }
    if (cursor.match("LBRACE")) {
      const first = cursor.peek();
      const second = cursor.peek(1);
      const isAttrBlock = first && (first.type === "IDENT" || first.type === "KEYWORD")
        && second && (second.type === "STRING" || second.type === "NUMBER");
      if (isAttrBlock) {
        while (!cursor.done) {
          const t = cursor.peek();
          if (!t || t.type === "RBRACE" || t.type === "EOF") break;
          if (t.type === "IDENT" || t.type === "KEYWORD") {
            const attrName = t.value;
            cursor.advance();
            const vToken = cursor.peek();
            if (vToken && (vToken.type === "STRING" || vToken.type === "NUMBER")) {
              cursor.advance();
              el.attrs.push(createAttribute(attrName, vToken.value, t.pos.line, t.pos.col));
            } else {
              el.attrs.push(createAttribute(attrName, true, t.pos.line, t.pos.col));
            }
          } else {
            cursor.advance();
          }
        }
        cursor.consumeIf("RBRACE");
      } else {
        el.children.push(...parseBody(["RBRACE"]));
        cursor.consumeIf("RBRACE");
      }
    }
  }

  state.popTag();
  return el;
}

function parseTextFromString(cursor: TokenCursor): TextNode | null {
  const token = cursor.advance();
  if (!token) return null;
  return createText(token.value, token.pos.line, token.pos.col, false);
}

// --- Element Parser ----------------------------------------------------------

function parseElement(
  cursor: TokenCursor,
  errors: ErrorCollector,
  state: CompilerState,
  parseBody: (stop: TokenType[]) => ASTNode[],
): ElementNode | null {
  const tagToken = cursor.advance();
  if (!tagToken) return null;

  const tag = tagToken.value;
  
  // Control flow tags: <if>, <for>, <while>, <switch> → control flow nodes
  const controlFlowTags: Record<string, string> = {
    "if": "if", "for": "for", "while": "while", "switch": "switch",
  };
  if (controlFlowTags[tag.toLowerCase()]) {
    // Parse as control flow: <if cond='...'>body</if>
    // Consume attributes to extract condition
    let condition = "";
    while (!cursor.done) {
      const token = cursor.peek();
      if (!token) break;
      if (token.type === "GT") { cursor.advance(); break; }
      if (token.type === "SELF_CLOSE") { cursor.advance(); break; }
      // Attribute: name=value
      if (token.type === "ATTR_NAME" || token.type === "IDENT") {
        const attrName = token.value;
        cursor.advance();
        const next = cursor.peek();
        if (next && next.type === "EQUALS") {
          cursor.advance();
          const val = cursor.peek();
          if (val && (val.type === "ATTR_VALUE" || val.type === "STRING")) {
            cursor.advance();
            if (attrName === "cond" || attrName === "condition") condition = val.value;
          }
        }
        continue;
      }
      cursor.advance();
    }
    
    // Parse children until CLOSE_TAG
    const children = parseBody(["CLOSE_TAG"]);
    // Consume close tag
    const closeTok = cursor.peek();
    if (closeTok && closeTok.type === "CLOSE_TAG") cursor.advance();
    
    if (tag.toLowerCase() === "if") {
      const node = createIf(condition, tagToken.pos.line, tagToken.pos.col);
      node.body = children;
      return node as any;
    }
    if (tag.toLowerCase() === "for") {
      // Parse "item in {items}" from condition
      const parts = condition.match(/(\w+)\s+(?:in|of)\s*\{?(\w+)\}?/);
      const varName = parts ? parts[1] : "";
      const iterable = parts ? parts[2] : condition;
      const node = createFor(varName, iterable, tagToken.pos.line, tagToken.pos.col);
      node.body = children;
      return node as any;
    }
    // For while/switch, just return as element with children
  }
  
  const el = createElement(tag, tagToken.pos.line, tagToken.pos.col);
  el.voidElement = VOID_TAGS.has(tag.toLowerCase());

  state.pushTag(tag);

  // Parse attributes
  while (!cursor.done) {
    const token = cursor.peek();
    if (!token) break;

    if (token.type === "SELF_CLOSE") {
      cursor.advance();
      el.selfClosing = true;
      state.popTag();
      return el;
    }

    if (token.type === "GT") {
      cursor.advance();
      break;
    }

    // Event binding: on:event
    if (token.type === "EVENT_PREFIX") {
      cursor.advance();
      const event = parseEventBinding(token, cursor);
      if (event) el.events.push(event);
      continue;
    }

    // Property binding: :prop="expr"  --  or the compound event-binding form
    // `:on:eventName="handler"`, which tokenizes as TWO separate BIND_PREFIX
    // tokens (":on" then ":eventName") rather than the single "on:eventName"
    // token that parseEventBinding() expects. Detect that two-token pattern
    // here and route it to an EventBinding instead of two bogus
    // PropertyBindings (property "on" with an empty expression, and property
    // "eventName" holding the handler text).
    if (token.type === "BIND_PREFIX" && token.value === ":on") {
      const next = cursor.peek(1);
      if (next && next.type === "BIND_PREFIX") {
        cursor.advance(); // consume ":on"
        cursor.advance(); // consume ":eventName"
        const eventName = next.value.slice(1);
        const binding = createEventBinding(eventName, "", token.pos.line, token.pos.col);
        cursor.skipWhitespace();
        if (cursor.peek() && (cursor.peek()!.type === "EQUALS" || cursor.peek()!.type === "ATTR_VALUE")) {
          if (cursor.peek()!.type === "EQUALS") cursor.advance();
          const handlerToken = cursor.peek();
          if (handlerToken && (handlerToken.type === "ATTR_VALUE" || handlerToken.type === "STRING" || handlerToken.type === "IDENT")) {
            cursor.advance();
            binding.handler = handlerToken.value;
          }
        }
        el.events.push(binding);
        continue;
      }
    }

    if (token.type === "BIND_PREFIX") {
      cursor.advance();
      const binding = parsePropertyBinding(token, cursor);
      if (binding) el.bindings.push(binding);
      continue;
    }

    // Directive: @if, @for, @show, etc.
    if (token.type === "DIRECTIVE") {
      cursor.advance();
      const directive = parseElementDirective(token, cursor);
      if (directive) el.directives.push(directive);
      continue;
    }

    // Attribute name
    if (token.type === "ATTR_NAME" || token.type === "IDENT") {
      cursor.advance();
      const attr = parseAttribute(token, cursor);
      if (attr) el.attrs.push(attr);
      continue;
    }

    // Style declaration: style:prop="value"
    if ((token.type as any) === "IDENT" && token.value === "style" && (cursor.peek(1)?.type as any) === "COLON") {
      cursor.advance();
      const style = parseInlineStyle(cursor);
      if (style) el.styles.push(style);
      continue;
    }

    cursor.advance();
  }

  // Parse children if not void or self-closing
  if (!el.voidElement && !el.selfClosing) {
    const children = parseBody(["CLOSE_TAG"]);
    el.children = children;

    // Consume closing tag
    const closeToken = cursor.peek();
    if (closeToken && closeToken.type === "CLOSE_TAG") {
      cursor.advance();
      if (closeToken.value.toLowerCase() !== tag.toLowerCase()) {
        errors.add(new CompilerError(
          "Mismatched closing tag: expected </" + tag + "> but got </" + closeToken.value + ">",
          closeToken.pos.line,
          closeToken.pos.col,
          "TW007",
          "error",
        ));
      }
    } else {
      // Missing closing tag
      errors.add(new CompilerError(
        "Missing closing tag for <" + tag + ">",
        el.line,
        el.col,
        "TW002",
        "error",
      ));
    }
  }

  state.popTag();
  return el;
}

// --- Component Parser ---------------------------------------------------------

function parseComponent(
  cursor: TokenCursor,
  errors: ErrorCollector,
  state: CompilerState,
  parseBody: (stop: TokenType[]) => ASTNode[],
): ComponentNode | null {
  const nameToken = cursor.advance();
  if (!nameToken) return null;

  const comp = createComponent(nameToken.value, nameToken.pos.line, nameToken.pos.col);

  // Parse props
  while (!cursor.done) {
    const token = cursor.peek();
    if (!token) break;

    if (token.type === "SELF_CLOSE") {
      cursor.advance();
      return comp;
    }

    if (token.type === "GT") {
      cursor.advance();
      break;
    }

    // Props
    if (token.type === "ATTR_NAME" || token.type === "IDENT" || token.type === "BIND_PREFIX") {
      cursor.advance();
      const prop = parseComponentProp(token, cursor);
      if (prop) comp.props.push(prop);
      continue;
    }

    cursor.advance();
  }

  // Parse children (slots)
  const children = parseBody(["CLOSE_TAG"]);
  comp.children = children;

  const closeToken = cursor.peek();
  if (closeToken && closeToken.type === "CLOSE_TAG") {
    cursor.advance();
  }

  return comp;
}

// --- Attribute Parser ----------------------------------------------------------

function parseAttribute(token: Token, cursor: TokenCursor): AttributeNode | null {
  const name = token.value;
  const line = token.pos.line;
  const col = token.pos.col;

  // Check for = value
  const next = cursor.peek();
  if (next && (next.type === "EQUALS" || next.type === "ATTR_VALUE")) {
    if (next.type === "EQUALS") cursor.advance();
    const valToken = cursor.peek();
    if (valToken && (valToken.type === "ATTR_VALUE" || valToken.type === "STRING")) {
      cursor.advance();
      return createAttribute(name, valToken.value, line, col, valToken.type === "ATTR_VALUE");
    }
  }

  // Boolean attribute
  return createAttribute(name, true, line, col);
}

// --- Event Binding Parser ------------------------------------------------------

function parseEventBinding(token: Token, cursor: TokenCursor): EventBinding | null {
  // token.value is "on:eventName"
  const parts = token.value.split(":");
  const eventName = parts[1] || "";
  const binding = createEventBinding(eventName, "", token.pos.line, token.pos.col);

  cursor.skipWhitespace();
  if (cursor.peek() && (cursor.peek()!.type === "EQUALS" || cursor.peek()!.type === "ATTR_VALUE")) {
    if (cursor.peek()!.type === "EQUALS") cursor.advance();
    const handlerToken = cursor.peek();
    if (handlerToken && (handlerToken.type === "ATTR_VALUE" || handlerToken.type === "STRING" || handlerToken.type === "IDENT")) {
      cursor.advance();
      binding.handler = handlerToken.value;
    }
  }

  return binding;
}

// --- Property Binding Parser --------------------------------------------------

function parsePropertyBinding(token: Token, cursor: TokenCursor): PropertyBinding | null {
  // token.value is ":propName"
  const parts = token.value.split(":");
  const propName = parts[1] || "";
  const binding = createPropertyBinding(propName, "", token.pos.line, token.pos.col);

  cursor.skipWhitespace();
  if (cursor.peek() && (cursor.peek()!.type === "EQUALS" || cursor.peek()!.type === "ATTR_VALUE")) {
    if (cursor.peek()!.type === "EQUALS") cursor.advance();
    const exprToken = cursor.peek();
    if (exprToken && (exprToken.type === "ATTR_VALUE" || exprToken.type === "STRING" || exprToken.type === "IDENT")) {
      cursor.advance();
      binding.expression = exprToken.value;
    }
  }

  return binding;
}

// --- Element Directive Parser --------------------------------------------------

function parseElementDirective(token: Token, cursor: TokenCursor): ElementDirective | null {
  // token.value is "@directiveName"
  const kind = token.value.slice(1) as ElementDirective["kind"];
  const dir: ElementDirective = {
    type: "ElementDirective",
    kind,
    line: token.pos.line,
    col: token.pos.col,
  };

  cursor.skipWhitespace();
  if (cursor.peek() && (cursor.peek()!.type === "EQUALS" || cursor.peek()!.type === "ATTR_VALUE")) {
    if (cursor.peek()!.type === "EQUALS") cursor.advance();
    const valToken = cursor.peek();
    if (valToken && (valToken.type === "ATTR_VALUE" || valToken.type === "STRING" || valToken.type === "IDENT")) {
      cursor.advance();
      dir.value = valToken.value;
      if (kind === "if" || kind === "else-if") dir.condition = valToken.value;
      if (kind === "for") {
        dir.varName = valToken.value;
        dir.iterable = valToken.value;
      }
    }
  }

  return dir;
}

// --- Inline Style Parser ------------------------------------------------------

function parseInlineStyle(cursor: TokenCursor): StyleDecl | null {
  cursor.skipWhitespace();
  const propToken = cursor.peek();
  if (!propToken) return null;
  cursor.advance();

  let property = propToken.value;
  if (cursor.match("COLON")) {
    cursor.skipWhitespace();
    // Could be part of the style property name
  }

  let value = "";
  if (cursor.peek() && (cursor.peek()!.type === "EQUALS" || cursor.peek()!.type === "ATTR_VALUE")) {
    if (cursor.peek()!.type === "EQUALS") cursor.advance();
    const valToken = cursor.peek();
    if (valToken && (valToken.type === "ATTR_VALUE" || valToken.type === "STRING")) {
      cursor.advance();
      value = valToken.value;
    }
  }

  return createStyleDecl(property, value, propToken.pos.line, propToken.pos.col);
}

// --- Component Prop Parser -----------------------------------------------------

function parseComponentProp(token: Token, cursor: TokenCursor): ComponentProp | null {
  let name = token.value;
  let isExpression = false;

  if (token.type === "BIND_PREFIX") {
    name = token.value.slice(1);
    isExpression = true;
  }

  cursor.skipWhitespace();
  let value: any = true;
  let isInterpolated = false;

  if (cursor.peek() && (cursor.peek()!.type === "EQUALS" || cursor.peek()!.type === "ATTR_VALUE")) {
    if (cursor.peek()!.type === "EQUALS") cursor.advance();
    const valToken = cursor.peek();
    if (valToken && (valToken.type === "ATTR_VALUE" || valToken.type === "STRING" || valToken.type === "IDENT")) {
      cursor.advance();
      value = valToken.value;
      isInterpolated = valToken.type === "ATTR_VALUE";
    }
  }

  return {
    type: "ComponentProp",
    name,
    value,
    isInterpolated,
    isExpression,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Text Parser ---------------------------------------------------------------

function parseText(cursor: TokenCursor): TextNode | null {
  const token = cursor.advance();
  if (!token) return null;
  return createText(token.value, token.pos.line, token.pos.col, false);
}

// --- Interpolation Parser ------------------------------------------------------

function parseInterpolation(cursor: TokenCursor, errors: ErrorCollector): TextNode | null {
  const startToken = cursor.advance(); // INTERP_START
  if (!startToken) return null;

  let expr = "";
  let depth = 1;

  while (!cursor.done) {
    const token = cursor.peek();
    if (!token) break;

    if (token.type === "INTERP_END" || (token.type === "RBRACE" && depth === 1)) {
      cursor.advance();
      break;
    }

    if (token.type === "LBRACE") depth++;
    else if (token.type === "RBRACE") depth--;

    expr += token.value + " ";
    cursor.advance();
  }

  return createText(expr.trim(), startToken.pos.line, startToken.pos.col, true);
}

// --- Script Block Parser ------------------------------------------------------

function parseScriptBlockNode(cursor: TokenCursor, errors: ErrorCollector): ScriptBlock | null {
  const openToken = cursor.advance();
  if (!openToken) return null;

  // Parse content between SCRIPT_OPEN and SCRIPT_CLOSE
  let content = "";
  while (!cursor.done) {
    const token = cursor.peek();
    if (!token) break;
    if (token.type === "SCRIPT_CLOSE") {
      cursor.advance();
      break;
    }
    content += token.value;
    cursor.advance();
  }

  const block = createScriptBlock(content, openToken.pos.line, openToken.pos.col);
  block.isModule = /type\s*=\s*["']module["']/i.test(openToken.value);

  return block;
}

// --- Style Block Parser --------------------------------------------------------

function parseStyleBlockNode(cursor: TokenCursor, errors: ErrorCollector): StyleBlock | null {
  const openToken = cursor.advance();
  if (!openToken) return null;

  let content = "";
  while (!cursor.done) {
    const token = cursor.peek();
    if (!token) break;
    if (token.type === "STYLE_CLOSE") {
      cursor.advance();
      break;
    }
    content += token.value;
    cursor.advance();
  }

  const block = createStyleBlock(content, openToken.pos.line, openToken.pos.col);
  block.scoped = /\bscoped\b/i.test(openToken.value);

  return block;
}

// --- Comment Parser ----------------------------------------------------------

function parseCommentNode(cursor: TokenCursor): CommentNode | null {
  const token = cursor.advance();
  if (!token) return null;

  return {
    type: "Comment",
    value: token.value,
    isConditional: token.value.trim().startsWith("[if"),
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- Doctype Parser ----------------------------------------------------------

function parseDoctype(cursor: TokenCursor): any {
  const token = cursor.advance();
  if (!token) return null;
  return {
    type: "Doctype",
    value: token.value,
    line: token.pos.line,
    col: token.pos.col,
  };
}

// --- CDATA Parser ------------------------------------------------------------

function parseCDATA(cursor: TokenCursor): TextNode | null {
  const token = cursor.advance();
  if (!token) return null;
  return createText(token.value, token.pos.line, token.pos.col, false);
}

// --- Close Tag Handler ---------------------------------------------------------

function parseCloseTag(cursor: TokenCursor, errors: ErrorCollector): null {
  const token = cursor.advance();
  if (token) {
    errors.add(new CompilerError(
      "Unexpected closing tag </" + token.value + ">",
      token.pos.line,
      token.pos.col,
      "TW001",
      "error",
    ));
  }
  return null;
}

// --- Keyword Statement Parser -------------------------------------------------

function parseKeywordStatement(
  cursor: TokenCursor,
  errors: ErrorCollector,
  state: CompilerState,
  parseBody: (stop: TokenType[]) => ASTNode[],
): ASTNode | null {
  const token = cursor.peek();
  if (!token) return null;

  if (isDirectiveKeyword(token.value)) {
    cursor.advance();
    // This is a directive -- parse it and return it as a directive node
    // The directive parser handles the rest
    return null; // Directives are handled at the program level
  }

  switch (token.value) {
    case "slot": {
      // slot { } / slot name "sidebar" { } -- marks where usage-site
      // children render inside a component.
      const slotToken = cursor.advance();
      if (!slotToken) return null;
      cursor.skipWhitespace();
      let name = "default";
      const t = cursor.peek();
      if (t && t.type === "IDENT" && t.value === "name") {
        cursor.advance();
        cursor.skipWhitespace();
        const v = cursor.peek();
        if (v && (v.type === "STRING" || v.type === "IDENT")) { cursor.advance(); name = v.value; }
      }
      let fallback: ASTNode[] = [];
      if (cursor.match("LBRACE")) {
        fallback = parseBody(["RBRACE"]);
        cursor.consumeIf("RBRACE");
      }
      const slot = createSlot(name, slotToken.pos.line, slotToken.pos.col);
      slot.fallback = fallback;
      return slot;
    }
    case "if":      return parseIfStatement(cursor, errors, parseBody);
    case "for":     return parseForStatement(cursor, errors, parseBody);
    case "while":   return parseWhileStatement(cursor, errors, parseBody);
    case "switch":  return parseSwitchStatement(cursor, errors, parseBody);
    case "try":     return parseTryStatement(cursor, errors, parseBody);
    default:
      cursor.advance();
      return null;
  }
}

// --- If Statement -------------------------------------------------------------

function parseIfStatement(
  cursor: TokenCursor,
  errors: ErrorCollector,
  parseBody: (stop: TokenType[]) => ASTNode[],
): IfNode | null {
  const ifToken = cursor.advance();
  if (!ifToken) return null;

  cursor.skipWhitespace();
  // Collect the FULL condition expression (identifiers, ==, !=, >, <, &&, ||,
  // string literals, etc.) up to the opening LBRACE -- not just the first token.
  let condition = "";
  const condParts: string[] = [];
  let guard = 0;
  while (!cursor.done && guard++ < 64) {
    const t = cursor.peek();
    if (!t || t.type === "EOF" || t.type === "LBRACE") break;
    if (t.type === "WHITESPACE" || t.type === "NEWLINE") { cursor.advance(); continue; }
    if (t.type === "LPAREN") condParts.push("(");
    else if (t.type === "RPAREN") condParts.push(")");
    else if (t.type === "STRING" || t.type === "ATTR_VALUE") condParts.push(`"${t.value}"`);
    else condParts.push(t.value);
    cursor.advance();
  }
  condition = condParts.join(" ");

  cursor.skipWhitespace();
  let ifBody: ASTNode[] = [];
  if (cursor.match("LBRACE")) {
    ifBody = parseBody(["RBRACE"]);
    cursor.consumeIf("RBRACE");
  }
  const elseBody: ASTNode[] = [];

  // Check for else / else if
  cursor.skipWhitespace();
  const elseToken = cursor.peek();
  if (elseToken && elseToken.type === "KEYWORD" && elseToken.value === "else") {
    cursor.advance();
    cursor.skipWhitespace();
    const nextTok = cursor.peek();
    if (nextTok && nextTok.type === "KEYWORD" && nextTok.value === "if") {
      // `else if <cond> { ... }` -- parse a nested if and attach it to elseBody.
      const nested = parseIfStatement(cursor, errors, parseBody);
      if (nested) elseBody.push(nested);
    } else if (cursor.match("LBRACE")) {
      elseBody.push(...parseBody(["RBRACE"]));
      cursor.consumeIf("RBRACE");
    }
  }

  const node = createIf(condition, ifToken.pos.line, ifToken.pos.col);
  node.body = ifBody;
  node.elseBody = elseBody;
  return node;
}

// --- For Statement -------------------------------------------------------------

function parseForStatement(
  cursor: TokenCursor,
  errors: ErrorCollector,
  parseBody: (stop: TokenType[]) => ASTNode[],
): ForNode | null {
  const forToken = cursor.advance();
  if (!forToken) return null;

  cursor.skipWhitespace();
  const varToken = cursor.peek();
  let varName = "";
  if (varToken) {
    varName = varToken.value;
    cursor.advance();
  }

  cursor.skipWhitespace();
  let indexName: string | undefined;
  if (cursor.match("COMMA")) {
    cursor.skipWhitespace();
    const idxToken = cursor.peek();
    if (idxToken) {
      indexName = idxToken.value;
      cursor.advance();
    }
  }

  cursor.skipWhitespace();
  let iterable = "";
  // Skip "in" or "of" keyword
  const inToken = cursor.peek();
  if (inToken && (inToken.value === "in" || inToken.value === "of")) {
    cursor.advance();
    cursor.skipWhitespace();
  }
  // Handle {items} syntax (LBRACE IDENT RBRACE) or bare IDENT
  if (cursor.match("LBRACE")) {
    cursor.skipWhitespace();
    const iterToken = cursor.peek();
    if (iterToken) {
      iterable = iterToken.value;
      cursor.advance();
    }
    cursor.skipWhitespace();
    cursor.consumeIf("RBRACE");
  } else {
    const iterToken = cursor.peek();
    if (iterToken) {
      iterable = iterToken.value;
      cursor.advance();
    }
  }

  cursor.skipWhitespace();
  let forBody: ASTNode[] = [];
  if (cursor.match("LBRACE")) {
    forBody = parseBody(["RBRACE"]);
    cursor.consumeIf("RBRACE");
  }
  const node = createFor(varName, iterable, forToken.pos.line, forToken.pos.col);
  node.indexName = indexName;
  node.body = forBody;
  return node;
}

// --- While Statement -----------------------------------------------------------

function parseWhileStatement(
  cursor: TokenCursor,
  errors: ErrorCollector,
  parseBody: (stop: TokenType[]) => ASTNode[],
): WhileNode | null {
  const whileToken = cursor.advance();
  if (!whileToken) return null;

  cursor.skipWhitespace();
  const condToken = cursor.peek();
  let condition = "";
  if (condToken) {
    condition = condToken.value;
    cursor.advance();
  }

  const body = parseBlockBody(cursor, parseBody);
  return {
    type: "While",
    condition,
    body,
    line: whileToken.pos.line,
    col: whileToken.pos.col,
  };
}

// --- Switch Statement ---------------------------------------------------------

function parseSwitchStatement(
  cursor: TokenCursor,
  errors: ErrorCollector,
  parseBody: (stop: TokenType[]) => ASTNode[],
): SwitchNode | null {
  const switchToken = cursor.advance();
  if (!switchToken) return null;

  cursor.skipWhitespace();
  const exprToken = cursor.peek();
  let expression = "";
  if (exprToken) {
    expression = exprToken.value;
    cursor.advance();
  }

  const cases: any[] = [];
  const defaultBody: ASTNode[] = [];

  cursor.skipWhitespace();
  if (cursor.match("LBRACE")) {
    while (!cursor.done) {
      cursor.skipWhitespace();
      const token = cursor.peek();
      if (!token || token.type === "RBRACE") break;

      if (token.type === "KEYWORD" && (token.value === "case" || token.value === "default")) {
        cursor.advance();
        if (token.value === "default") {
          defaultBody.push(...parseBlockBody(cursor, parseBody));
        } else {
          cursor.skipWhitespace();
          const valToken = cursor.peek();
          let value = "";
          if (valToken) {
            value = valToken.value;
            cursor.advance();
          }
          const caseBody = parseBlockBody(cursor, parseBody);
          cases.push({
            type: "SwitchCase",
            value,
            body: caseBody,
            fallthrough: false,
            line: token.pos.line,
            col: token.pos.col,
          });
        }
      } else {
        cursor.advance();
      }
    }
    cursor.expect("RBRACE");
  }

  return {
    type: "Switch",
    expression,
    cases,
    defaultBody,
    line: switchToken.pos.line,
    col: switchToken.pos.col,
  };
}

// --- Try Statement -------------------------------------------------------------

function parseTryStatement(
  cursor: TokenCursor,
  errors: ErrorCollector,
  parseBody: (stop: TokenType[]) => ASTNode[],
): TryNode | null {
  const tryToken = cursor.advance();
  if (!tryToken) return null;

  const body = parseBlockBody(cursor, parseBody);
  const catchBody: ASTNode[] = [];
  const finallyBody: ASTNode[] = [];
  let catchVar: string | undefined;

  cursor.skipWhitespace();
  const catchToken = cursor.peek();
  if (catchToken && catchToken.type === "KEYWORD" && catchToken.value === "catch") {
    cursor.advance();
    cursor.skipWhitespace();
    if (cursor.match("LPAREN")) {
      cursor.skipWhitespace();
      const varToken = cursor.peek();
      if (varToken) {
        catchVar = varToken.value;
        cursor.advance();
      }
      cursor.expect("RPAREN");
    }
    catchBody.push(...parseBlockBody(cursor, parseBody));
  }

  cursor.skipWhitespace();
  const finallyToken = cursor.peek();
  if (finallyToken && finallyToken.type === "KEYWORD" && finallyToken.value === "finally") {
    cursor.advance();
    finallyBody.push(...parseBlockBody(cursor, parseBody));
  }

  return {
    type: "Try",
    body,
    catchBody,
    catchVar,
    finallyBody,
    line: tryToken.pos.line,
    col: tryToken.pos.col,
  };
}

// --- Directive Node Parser ----------------------------------------------------

function parseDirectiveNode(
  cursor: TokenCursor,
  errors: ErrorCollector,
  parseBody: (c: TokenCursor) => ASTNode[],
): ASTNode | null {
  const token = cursor.advance();
  if (!token) return null;

  // Parse directive using the directive parser
  const directive = parseDirective(cursor, token, parseBody);
  return directive as any;
}

// --- Helpers ------------------------------------------------------------------

function parseBlockBody(cursor: TokenCursor, parseBody: (stop: TokenType[]) => ASTNode[]): ASTNode[] {
  cursor.skipWhitespace();
  if (cursor.match("LBRACE")) {
    const body = parseBody(["RBRACE"]);
    cursor.expect("RBRACE");
    return body;
  }
  // Single statement
  return parseBody(["KEYWORD", "RBRACE"]);
}
