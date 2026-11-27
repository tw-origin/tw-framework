/**
 * TSS (TW Style Sheets) -> CSS compiler.
 *
 * TSS is the documented styling format (see docs/styling-guide.md):
 *   - declarations are `prop value; prop value` (no colons)
 *   - shorthand properties expand: bg -> background, p -> padding, br -> border-radius...
 *   - selectors support nesting, pseudo-classes (:hover) and & (parent reference)
 *   - plain CSS declarations (with colons) pass through untouched
 */

/** TW301: plain .css / .module.css files must use standard CSS property
 * names -- TSS shorthands (bg, p, m, ...) are rejected with the documented
 * error (docs/error-reference.md). Declarations are the buffers terminated
 * by ';' or '}' (selectors end at '{' and are never treated as declarations). */
export function validatePlainCss(src: string, filePath: string): string {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "");
  let buf = "";
  let bufLine = 1;
  let line = 1;
  const checkDecl = (): void => {
    const t = buf.trim();
    buf = "";
    if (!t) return;
    const m = /^([a-zA-Z][\w-]*)\s*(:\s*|\s)/.exec(t);
    if (!m) return;
    const prop = m[1];
    if (!TSS_SHORTHANDS[prop]) return;
    throw new Error(
      'TW301: TSS shorthand "' + prop + '" is not valid in a .css file.\n' +
      "  → File: " + filePath + ":" + bufLine + ":1\n" +
      "  → Written: " + t + "\n" +
      '  → Problem: "' + prop + '" is a TSS shorthand, not a standard CSS property.\n' +
      "  TSS shorthands only work in .tss and .module.tss files.\n" +
      "  Fix:\n" +
      "    1. Use full CSS property:  " + TSS_SHORTHANDS[prop] + ": ...;\n" +
      "    2. Or rename the file to .tss (shorthands allowed)"
    );
  };
  for (let i = 0; i < noComments.length; i++) {
    const ch = noComments[i];
    if (ch === "\n") { line++; continue; }
    if (ch === "{") { buf = ""; continue; }            // selector ends here
    if (ch === ";" || ch === "}") { checkDecl(); continue; }
    if (buf === "") bufLine = line;
    buf += ch;
  }
  checkDecl();
  return src;
}

export const TSS_SHORTHANDS: Record<string, string> = {
  // background / color
  bg: "background", "bg-c": "background-color", "bg-i": "background-image",
  c: "color",
  // box model
  p: "padding", pt: "padding-top", pb: "padding-bottom", pl: "padding-left", pr: "padding-right",
  m: "margin", mt: "margin-top", mb: "margin-bottom", ml: "margin-left", mr: "margin-right",
  w: "width", h: "height", minw: "min-width", minh: "min-height", maxw: "max-width", maxh: "max-height",
  // Documented hyphenated box shorthands (docs/tss-syntax.md): without these
  // `min-w`/`max-w`/`min-h`/`max-h` passed through as invalid CSS properties.
  "min-w": "min-width", "max-w": "max-width", "min-h": "min-height", "max-h": "max-height",
  // borders
  bd: "border", "bd-t": "border-top", "bd-b": "border-bottom", "bd-l": "border-left", "bd-r": "border-right",
  br: "border-radius", "br-t": "border-top-left-radius", bxsh: "box-shadow", bxz: "box-sizing",
  // Documented in docs/tss-syntax.md but never implemented, so `br-tl 4px`
  // emitted the literal property name `br-tl` and the corner stayed square.
  "br-tl": "border-top-left-radius", "br-tr": "border-top-right-radius",
  "br-bl": "border-bottom-left-radius", "br-br": "border-bottom-right-radius",
  // `box` is the documented box-sizing shorthand (docs/tss-syntax.md).
  box: "box-sizing",
  // typography
  ff: "font-family", fs: "font-size", fw: "font-weight", lh: "line-height", ls: "letter-spacing",
  ta: "text-align", td: "text-decoration", tt: "text-transform", ws: "white-space",
  // layout
  d: "display", pos: "position", t: "top", r: "right", b: "bottom", l: "left",
  z: "z-index", ov: "overflow", "ov-x": "overflow-x", "ov-y": "overflow-y",
  ai: "align-items", jc: "justify-content", ac: "align-content", g: "gap",
  fx: "flex", "fx-d": "flex-direction", "fx-w": "flex-wrap", "fx-g": "flex-grow", "fx-s": "flex-shrink", "fx-b": "flex-basis",
  gtc: "grid-template-columns", gtr: "grid-template-rows",
  // misc
  cur: "cursor", op: "opacity", tr: "transition", tf: "transform", us: "user-select", pe: "pointer-events",
  // Also documented, also missing.
  fl: "float", cl: "clear", dir: "direction", ww: "word-wrap", va: "vertical-align",
};

/**
 * Collapse runs of whitespace (including newlines) to one space, leaving the
 * inside of a quoted string alone. A multi-line value such as
 * `bg linear-gradient(\n to right,\n #fff\n )` used to be emitted with its
 * newlines, so one rule printed across five lines.
 */
function collapseWhitespace(text: string): string {
  let out = "";
  let quote: string | null = null;
  let pendingSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      out += ch;
      if (ch === "\\" && i + 1 < text.length) { out += text[i + 1]; i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { if (pendingSpace && out) out += " "; pendingSpace = false; quote = ch; out += ch; continue; }
    if (/\s/.test(ch)) { pendingSpace = true; continue; }
    if (pendingSpace && out) out += " ";
    pendingSpace = false;
    out += ch;
  }
  return out;
}

/** Expand a single declaration `bg #fff` -> `background: #fff`. */
function compileDecl(decl: string): string {
  const trimmed = decl.trim();
  if (!trimmed) return "";
  // Plain CSS passthrough (already has a colon): `color: red`
  // Normalize ONLY the property colon: `url(https://...)` holds colons
  // inside the value; a first-colon replace corrupted them.
  const cssForm = /^([-\w]+)\s*:\s*/.exec(trimmed);
  if (cssForm) return trimmed.replace(/^([-\w]+)\s*:\s*/, "$1: ");
  const spaceIdx = trimmed.search(/[\s]/);
  if (spaceIdx === -1) {
    // A bare token is a property with no value. Emitting `color` alone is
    // invalid CSS, and when it sat on its own line it used to swallow the next
    // declaration as its value (`c` + `p 4px` -> `color: p 4px`). Drop it.
    return "";
  }
  const prop = trimmed.slice(0, spaceIdx);
  const value = collapseWhitespace(trimmed.slice(spaceIdx).trim());
  const full = TSS_SHORTHANDS[prop] ?? prop;
  return `${full}: ${value}`;
}

function combineSelector(parent: string, child: string): string {
  if (child.includes("&")) return child.replace(/&/g, parent);
  return `${parent} ${child}`;
}

/**
 * String- and url()-aware comment stripper for TSS sources.
 */
function stripTssComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const q = c;
      out += c;
      i++;
      while (i < n && src[i] !== q) {
        if (src[i] === "\\") { out += src[i++]; if (i < n) out += src[i++]; continue; }
        out += src[i++];
      }
      out += src[i] ?? "";
      i++;
      continue;
    }
    if (c === "u" && /^url\s*\(/i.test(src.slice(i, i + 6))) {
      let depth = 0;
      let j = i;
      for (; j < n; j++) {
        if (src[j] === "(") depth++;
        else if (src[j] === ")") { depth--; if (depth === 0) { j++; break; } }
      }
      out += src.slice(i, j);
      i = j;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      out += " ";
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Compile a TSS source string into CSS. */
export function compileTSS(source: string): string {
  // a syntax-broken.tss used to compile into
  // garbage "CSS" and the whole stylesheet then vanished silently from
  // the page. Unbalanced braces are a hard syntax error now.
  {
    let depth = 0;
    let line = 1;
    let inString: string | null = null;
    let inComment = false;
    let inBlockComment = false;
    let inUrl = false;
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      const prev = i > 0 ? source[i - 1] : "";
      // /* ... */ comments may span lines and contain braces -- skip them
      // entirely so a `/* { */` cannot unbalance the scan (TW303 false positive).
      if (inBlockComment) {
        if (ch === "\n") line++;
        if (ch === "*" && source[i + 1] === "/") { inBlockComment = false; i++; }
        continue;
      }
      if (ch === "\n") { line++; inComment = false; continue; }
      if (inComment) continue;
      if (inString) { if (ch === inString && prev !== "\\") inString = null; continue; }
      // url(...) contents are opaque: `https://` is not a comment
      if (inUrl) { if (ch === ")") inUrl = false; continue; }
      if (ch === "/" && source[i + 1] === "/" && source.slice(Math.max(0, i - 3), i).includes(":")) { inUrl = true; continue; }
      if (ch === "u" && source.slice(i, i + 4) === "url(") { inUrl = true; i += 3; continue; }
      if (ch === "/" && source[i + 1] === "*") { inBlockComment = true; i++; continue; }
      if (ch === "/" && source[i + 1] === "/") { inComment = true; continue; }
      if (ch === '"' || ch === "'") { inString = ch; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth < 0) {
          throw new Error("TW303: unbalanced '}' in stylesheet (line " + line + ")\n  " + (source.split("\n")[line - 1] ?? "").trim().slice(0, 80));
        }
      }
    }
    if (depth !== 0) {
      throw new Error("TW303: " + depth + " unclosed '{' in stylesheet -- a rule block is never closed\n  last line: " + (source.split("\n").pop() ?? "").trim().slice(0, 80));
    }
  }
  const __twOut = __twCompileTSSInner(source);
  // an unsubstituted $var used to ship broken CSS silently
  // (`color: $main-color` where no such state var exists).
  const leftover = __twOut.match(/\$[A-Za-z_][\w-]*/g);
  if (leftover && !/\$\{/.test(__twOut)) {
    const seen = Array.from(new Set(leftover));
    console.warn("[tss] unsubstituted $var(s) in output: " + seen.join(", ") + " -- define them as state vars or fix the spelling");
  }
  return __twOut;
}

function __twCompileTSSInner(source: string): string {
  if (!source || !source.trim()) return "";
  // Strip comments (string- and url()-aware)
  let src = stripTssComments(source);

  // Variables: `$name: value` declarations are collected, removed from the
  // source and substituted into every `$name` use (SCSS-style).
  const vars: Record<string, string> = {};
  src = src.replace(/\$([A-Za-z_][\w-]*)\s*:\s*([^;{}\n]+);?/g, (_m: string, name: string, val: string) => {
    vars[name] = String(val).trim();
    return "";
  });
  if (Object.keys(vars).length > 0) {
    for (let pass = 0; pass < 5; pass++) {
      let changed = false;
      src = src.replace(/\$([A-Za-z_][\w-]*)/g, (m: string, name: string) => {
        if (Object.prototype.hasOwnProperty.call(vars, name)) { changed = true; return vars[name]; }
        return m;
      });
      if (!changed) break;
    }
  }

  // A rule tree, not a flat list of strings. The flat emitter wrapped every
  // rule in its own copy of an enclosing at-rule, so `@media { .a {...} .b {...} }`
  // became two @media blocks and `@keyframes` emitted one block per frame --
  // the later copy silently overrode the earlier one and the animation lost
  // frames. Building the tree first also lets declarations written directly
  // inside a nested at-rule find their selector.
  type TssNode =
    | { kind: "rule"; selector: string; decls: string[]; children: TssNode[] }
    | { kind: "at"; head: string; decls: string[]; children: TssNode[] };

  const root: TssNode[] = [];
  const stack: TssNode[] = [];
  let buf = "";

  const current = (): TssNode | null => (stack.length ? stack[stack.length - 1] : null);

  // Statement at-rules (`@import url(...)`, `@charset "utf-8"`,
  // `@namespace svg url(...)`) have no block. They used to fall through to
  // compileDecl and come out as `* { @import: url(...) }`.
  const statements: string[] = [];
  const isStatementAtRule = (t: string): boolean => /^@(import|charset|namespace|layer)\b/.test(t);

  const pushDecl = (text: string): void => {
    const raw = text.trim();
    if (!raw) return;
    if (isStatementAtRule(raw)) { statements.push(raw.endsWith(";") ? raw : raw + ";"); return; }
    const d = compileDecl(raw);
    if (!d) return;
    const node = current();
    if (node) node.decls.push(d);
    else root.push({ kind: "rule", selector: "*", decls: [d], children: [] });
  };

  // A line is a declaration when it starts with a property name (TSS
  // shorthand, full CSS property, custom property or vendor prefix) followed by
  // whitespace or a colon. `--main #fff` and `-webkit-transform none` used to
  // fail this and were pasted into the previous declaration's value.
  const isDeclLine = (l: string): boolean =>
    /^(--[A-Za-z][\w-]*|-?[A-Za-z][\w-]*)(\s|:)/.test(l) && !/^[>+~]/.test(l);

  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const ch = src[i];
    // A `;` or `}` inside a string is content, not syntax: `content "a;b"` and
    // `content "a}b"` used to split the declaration and break the block.
    if (quote) {
      buf += ch;
      if (ch === "\\" && i + 1 < src.length) { buf += src[i + 1]; i += 2; continue; }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; i++; continue; }
    if (ch === "{") {
      let sel = buf.trim();
      buf = "";
      if (!sel) { i++; continue; }
      // The buffer may mix declarations (written without `;`) with the nested
      // selector or at-rule. Earlier lines that look like declarations belong
      // to the CURRENT level; the last line is the selector. Multi-line values
      // (trailing `(` or `,`) are left intact so gradients work.
      const lines = sel.split(/\n+/).map((l: string) => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        const last = lines[lines.length - 1];
        const prior = lines.slice(0, -1);
        const priorComplete = !/[(,]\s*$/.test(prior[prior.length - 1] ?? "");
        // An at-rule as the last line is a selector too -- `.card { @media ... }`
        // used to be glued into one garbage selector.
        if (priorComplete && prior.every(isDeclLine)) {
          for (const p of prior) pushDecl(p);
          sel = last;
        }
      }
      const parent = current();
      if (sel.startsWith("@")) {
        const node: TssNode = { kind: "at", head: sel, decls: [], children: [] };
        (parent ? parent.children : root).push(node);
        stack.push(node);
      } else {
        // Inside an at-rule a selector stands on its own; inside a rule it nests.
        const full = parent && parent.kind === "rule" ? combineSelector(parent.selector, sel) : sel;
        const node: TssNode = { kind: "rule", selector: full, decls: [], children: [] };
        (parent ? parent.children : root).push(node);
        stack.push(node);
      }
      i++;
    } else if (ch === "}") {
      // Flush trailing declarations (no `;` before `}`). Several may be
      // stacked on separate lines inside the block -- push each one.
      if (buf.trim()) {
        const blines = buf.split(/\n+/).map((l: string) => l.trim()).filter(Boolean);
        // A value that continues onto the next line (an open `(` or a trailing
        // comma) must stay whole, so split only when every line is complete.
        const valueContinues = blines.some((l: string) => /[(,]\s*$/.test(l));
        if (blines.length > 1 && !valueContinues) {
          // One line at a time: a stray selector fragment or a bare property
          // must not eat the declarations that follow it.
          for (const l of blines) pushDecl(l);
        } else {
          pushDecl(buf);
        }
      }
      buf = "";
      stack.pop();
      i++;
    } else if (ch === ";") {
      if (buf.trim()) pushDecl(buf);
      buf = "";
      i++;
    } else {
      buf += ch;
      i++;
    }
  }
  if (buf.trim()) pushDecl(buf);

  const ser = (node: TssNode, parentSel: string): string[] => {
    if (node.kind === "rule") {
      const lines: string[] = [];
      if (node.decls.length) lines.push(node.selector + " { " + node.decls.join("; ") + " }");
      for (const c of node.children) lines.push(...ser(c, node.selector));
      return lines;
    }
    // An at-rule: its own declarations, if any, belong to the enclosing
    // selector -- `.card { @media ... { p 0 } }` must become
    // `@media { .card { padding: 0 } }`, never a selector-less rule.
    const inner: string[] = [];
    // `@font-face`, `@page`, `@property` hold declarations directly, so at the
    // top level they are emitted bare. Nested inside a selector the same
    // declarations belong to that selector instead.
    if (node.decls.length) {
      inner.push(parentSel ? parentSel + " { " + node.decls.join("; ") + " }" : node.decls.join("; "));
    }
    for (const c of node.children) inner.push(...ser(c, parentSel));
    return [node.head + " { " + inner.join(" ") + " }"];
  };

  const out: string[] = [...statements];
  for (const node of root) out.push(...ser(node, ""));
  return out.join("\n");
}

/**
 * Structural CSS checks for `tw check` -- zero dependency, no value grammar.
 *
 * Only reports what is unambiguously invalid:
 *   TW303  unbalanced braces (the code `compileTSS` already throws), now with a
 *          column as well as a line
 *   TW304  a declaration whose value is empty (`color: ;`)
 *   TW305  an unknown at-rule (`@medias`)
 *   TW306  a declaration without a colon in a `.css` file (`color red`)
 *
 * Deliberately NOT reported: unknown properties, invalid values, vendor
 * prefixes, custom properties, nesting, `@layer`/`@container`/`@property` and
 * anything else a value-level validator would need a spec grammar for. Those
 * would produce false positives on valid modern CSS.
 */
const KNOWN_AT_RULES = new Set([
  "media", "supports", "layer", "container", "scope", "property", "font-face",
  "keyframes", "-webkit-keyframes", "page", "import", "charset", "namespace",
  "font-feature-values", "counter-style", "starting-style", "view-transition",
  "position-try", "custom-media", "custom-selector", "nest", "document",
  "viewport", "-ms-viewport", "tailwind", "apply", "use", "forward", "mixin",
  "include", "extend", "if", "else", "each", "for", "function", "return",
  "debug", "warn", "error", "at-root", "content",
]);

export interface CssFinding {
  code: "TW303" | "TW304" | "TW305" | "TW306";
  message: string;
  line: number;
  col: number;
}

/** Strip comments and strings so a brace inside either cannot confuse the scan. */
function blankCommentsAndStrings(src: string): string {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const q = c;
      out[i] = " ";
      i++;
      while (i < n && src[i] !== q) {
        if (src[i] === "\\") { out[i] = " "; i++; if (i < n) { out[i] = " "; i++; } continue; }
        if (src[i] !== "\n") out[i] = " ";
        i++;
      }
      if (i < n) { out[i] = " "; i++; }
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      for (let j = i; j < stop; j++) if (out[j] !== "\n") out[j] = " ";
      i = stop;
      continue;
    }
    i++;
  }
  return out.join("");
}

function lineColOf(src: string, index: number): { line: number; col: number } {
  let line = 1, col = 1;
  for (let i = 0; i < index && i < src.length; i++) {
    if (src[i] === "\n") { line++; col = 1; } else col++;
  }
  return { line, col };
}

export function validateCssStructure(source: string, filePath: string): CssFinding[] {
  const findings: CssFinding[] = [];
  const scan = blankCommentsAndStrings(source);

  // TW303 -- braces, with a column this time
  const stack: number[] = [];
  for (let i = 0; i < scan.length; i++) {
    if (scan[i] === "{") stack.push(i);
    else if (scan[i] === "}") {
      if (!stack.length) {
        const { line, col } = lineColOf(source, i);
        findings.push({ code: "TW303", message: "unbalanced '}' -- nothing is open here", line, col });
      } else stack.pop();
    }
  }
  for (const open of stack) {
    const { line, col } = lineColOf(source, open);
    findings.push({ code: "TW303", message: "unclosed '{' -- this block never closes", line, col });
  }

  // TW305 -- at-rules
  for (const m of scan.matchAll(/(^|[;{}]\s*)@([a-zA-Z-]+)/g)) {
    const name = m[2].toLowerCase();
    if (KNOWN_AT_RULES.has(name)) continue;
    const at = (m.index ?? 0) + m[1].length;
    const { line, col } = lineColOf(source, at);
    findings.push({ code: "TW305", message: "unknown at-rule '@" + name + "'", line, col });
  }

  // TW304 -- empty value, TW306 -- no colon in a .css file
  //
  // Boundaries come from the blanked scan (so a `;` inside a string cannot end
  // a declaration), but the TEXT is read from the original source: blanking a
  // string would make `content: "a;b"` look like an empty value.
  const isPlainCss = /\.css$/i.test(filePath);
  for (const raw of scan.matchAll(/([^{};]+)[;}]/g)) {
    const start = raw.index ?? 0;
    const blanked = raw[1];
    const real = source.slice(start, start + blanked.length);
    const trimmed = real.trim();
    if (!trimmed || trimmed.startsWith("@")) continue;
    const at = start + (real.length - real.trimStart().length);
    const { line, col } = lineColOf(source, at);
    const colon = trimmed.indexOf(":");
    if (colon === -1) {
      // a selector ends at `{`, so anything here is a declaration
      if (isPlainCss && /^[-\w]+\s+\S/.test(trimmed)) {
        findings.push({ code: "TW306", message: "declaration has no colon: '" + trimmed.slice(0, 30) + "'", line, col });
      }
      continue;
    }
    const value = trimmed.slice(colon + 1).trim();
    if (!value) {
      findings.push({ code: "TW304", message: "declaration has an empty value", line, col });
    }
  }
  return findings;
}
