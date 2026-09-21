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
  // borders
  bd: "border", "bd-t": "border-top", "bd-b": "border-bottom", "bd-l": "border-left", "bd-r": "border-right",
  br: "border-radius", "br-t": "border-top-left-radius", bxsh: "box-shadow", bxz: "box-sizing",
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
};

/** Expand a single declaration `bg #fff` -> `background: #fff`. */
function compileDecl(decl: string): string {
  const trimmed = decl.trim();
  if (!trimmed) return "";
  // Plain CSS passthrough (already has a colon): `color: red`
  if (trimmed.includes(":")) return trimmed.replace(/\s*:\s*/, ": ");
  const spaceIdx = trimmed.search(/[\s]/);
  if (spaceIdx === -1) {
    // bare property (e.g. `hidden` for overflow?) -- expand if known, else keep
    return TSS_SHORTHANDS[trimmed] ?? trimmed;
  }
  const prop = trimmed.slice(0, spaceIdx);
  const value = trimmed.slice(spaceIdx).trim();
  const full = TSS_SHORTHANDS[prop] ?? prop;
  return `${full}: ${value}`;
}

function combineSelector(parent: string, child: string): string {
  if (child.includes("&")) return child.replace(/&/g, parent);
  return `${parent} ${child}`;
}

/** Compile a TSS source string into CSS. */
export function compileTSS(source: string): string {
  if (!source || !source.trim()) return "";
  // Strip comments
  let src = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

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

  const rules: string[] = [];
  const stack: string[] = [];       // selector / at-rule stack
  const declsByLevel: string[][] = [];
  let buf = "";

  const emit = (selector: string, decls: string[], wrapStack: string[]) => {
    if (decls.length === 0) return;
    let rule = `${selector} { ${decls.join("; ")} }`;
    for (let i = wrapStack.length - 1; i >= 0; i--) {
      if (wrapStack[i].startsWith("@")) rule = `${wrapStack[i]} { ${rule} }`;
    }
    rules.push(rule);
  };

  const pushDecl = (text: string): void => {
    const d = compileDecl(text);
    if (d) (declsByLevel[declsByLevel.length - 1] ??= []).push(d);
  };

  // A line is a declaration when it starts with a property name (TSS
  // shorthand or full CSS) followed by whitespace or a colon. Selector
  // lines (.card, &:hover, h2) do not match.
  const isDeclLine = (l: string): boolean =>
    /^[a-zA-Z][\w-]*(\s|:)/.test(l) && !/^[>+~]/.test(l);

  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "{") {
      let sel = buf.trim();
      buf = "";
      if (!sel) { i++; continue; }
      // The buffer may mix declarations (written without `;`) with the
      // nested selector. Earlier lines that look like declarations belong
      // to the CURRENT level; the last line is the selector. Multi-line
      // values (trailing `(` or `,`) are left intact so gradients work.
      const lines = sel.split(/\n+/).map((l: string) => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        const last = lines[lines.length - 1];
        const prior = lines.slice(0, -1);
        const priorComplete = !/[(,]\s*$/.test(prior[prior.length - 1] ?? "");
        if (priorComplete && prior.every(isDeclLine) && !last.startsWith("@")) {
          for (const p of prior) pushDecl(p);
          sel = last;
        }
      }
      const parent = stack.length ? stack[stack.length - 1] : "";
      let full: string;
      if (sel.startsWith("@")) {
        full = sel; // at-rule: @media, @keyframes, @supports
      } else if (parent && !parent.startsWith("@")) {
        full = combineSelector(parent, sel);
      } else {
        full = sel;
      }
      stack.push(full);
      declsByLevel.push([]);
      i++;
    } else if (ch === "}") {
      // Flush trailing declarations (no `;` before `}`). Several may be
      // stacked on separate lines inside the block -- push each one.
      if (buf.trim()) {
        const blines = buf.split(/\n+/).map((l: string) => l.trim()).filter(Boolean);
        if (blines.length > 1 && blines.every(isDeclLine)) {
          for (const l of blines) pushDecl(l);
        } else {
          pushDecl(buf);
        }
      }
      buf = "";
      const level = stack.pop();
      const decls = declsByLevel.pop() ?? [];
      if (level) {
        if (level.startsWith("@") && decls.length > 0) {
          // Declarations written directly inside an at-rule nested in a
          // selector (`.card { @media ... { p 0 } }`) belong to the nearest
          // enclosing real selector -- otherwise the rule loses its
          // selector and the CSS applies to nothing.
          let realSel: string | null = null;
          for (let j = stack.length - 1; j >= 0; j--) {
            if (!stack[j].startsWith("@")) { realSel = stack[j]; break; }
          }
          if (realSel) emit(realSel, decls, [...stack, level]);
          else emit(level, decls, stack);
        } else {
          emit(level, decls, stack);
        }
      }
      i++;
    } else if (ch === ";") {
      pushDecl(buf);
      buf = "";
      i++;
    } else {
      buf += ch;
      i++;
    }
  }
  // Trailing declaration without `;`
  if (buf.trim()) {
    const d = compileDecl(buf);
    if (d && stack.length === 0) rules.push(`* { ${d} }`);
  }
  return rules.join("\n");
}
