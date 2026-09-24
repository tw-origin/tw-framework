/**
 * SCSS/Sass subset compiler (documented in docs/extensions-guide.md):
 * nesting with `&` parent references, `$variables` (scoped, with `#{}`
 * interpolation), `@mixin`/`@include` (with parameters and defaults),
 * `@each`, `@if`/`@else if`/`@else`, `@media` nesting, line and block comments
 * comments, and the built-in color functions `lighten()`/`darken()`.
 */

interface Item {
  kind: "decl" | "block";
  text?: string;             // decl (without trailing ';')
  selector?: string;        // block head ("$x: 1" decls stay decls)
  items?: Item[];
}

interface MixinDef {
  params: Array<{ name: string; def?: string }>;
  items: Item[];
}

/** Strip line and block comments (string-literal aware for quotes). */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
    } else if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      out += " ";
    } else if (c === '"' || c === "'") {
      const q = c;
      out += c;
      i++;
      // honor escapes: \" inside the string must not end it
      while (i < n && src[i] !== q) {
        if (src[i] === "\\") { out += src[i++]; if (i < n) out += src[i++]; continue; }
        out += src[i++];
      }
      out += src[i] ?? "";
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Parse a source string into a flat item list (recursive on blocks). */
function parseItems(src: string): Item[] {
  const items: Item[] = [];
  let buf = "";
  let i = 0;
  let interp = 0; // #{ } interpolation depth
  const n = src.length;
  const flushDecl = () => {
    const t = buf.trim();
    if (t) items.push({ kind: "decl", text: t });
    buf = "";
  };
  while (i < n) {
    const c = src[i];
    if (c === "{") {
      // `#{` opens an interpolation, not a block
      if (interp > 0 || src[i - 1] === "#") {
        interp++;
        buf += c;
        i++;
        continue;
      }
      const selector = buf.trim();
      buf = "";
      // find matching close brace (skipping strings and #{...} interpolations)
      let depth = 1;
      let j = i + 1;
      while (j < n && depth > 0) {
        const ch = src[j];
        if (ch === '"' || ch === "'") {
          const q = ch;
          j++;
          while (j < n && src[j] !== q) j++;
          j++;
        } else if (ch === "#" && src[j + 1] === "{") {
          j += 2;
          while (j < n && src[j] !== "}") j++;
          j++;
        } else if (ch === "{") { depth++; j++; }
        else if (ch === "}") { depth--; if (depth > 0) j++; }
        else j++;
      }
      let body = src.slice(i + 1, j);
      // the last declaration in a body may omit its trailing ';'
      if (body.trim() !== "" && !/;\s*$/.test(body)) body += ";";
      items.push({ kind: "block", selector, items: parseItems(body) });
      i = j + 1;
    } else if (c === "}") {
      if (interp > 0) { interp--; buf += c; i++; continue; }
      i++; // stray close
    } else if (c === ";") {
      if (interp > 0) { buf += c; i++; continue; }
      flushDecl();
      i++;
    } else {
      buf += c;
      i++;
    }
  }
  flushDecl();
  return items;
}

type Env = Map<string, string>[];

function lookupVar(env: Env, name: string): string | undefined {
  for (let i = env.length - 1; i >= 0; i--) {
    if (env[i].has(name)) return env[i].get(name);
  }
  return undefined;
}

function setVar(env: Env, name: string, value: string): void {
  env[env.length - 1].set(name, value);
}

/** Replace $vars and #{$var} interpolation inside a value/selector. */
function resolveVars(text: string, env: Env): string {
  let out = text.replace(/#\{([^}]+)\}/g, (_m, inner: string) => resolveVars(inner.trim(), env));
  out = out.replace(/\$[\w-]+/g, (name: string) => {
    const v = lookupVar(env, name);
    return v === undefined ? name : v;
  });
  return out;
}

/* --- color helpers (lighten/darken) ------------------------------------ */

function parseColor(c: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map(x => x + x).join("");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return "#" + f(r) + f(g) + f(b);
}

/** Evaluate lighten(color, %) / darken(color, %) calls in a resolved value. */
function evalColorFns(value: string): string {
  const re = /(lighten|darken)\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)/;
  let out = value;
  for (let guard = 0; guard < 10; guard++) {
    const m = re.exec(out);
    if (!m) break;
    const rgb = parseColor(m[2]);
    const pct = parseFloat(m[3]);
    let rep = m[0];
    if (rgb && !Number.isNaN(pct)) {
      const f = pct / 100;
      if (m[1] === "lighten") rep = toHex(...(rgb.map(v => v + (255 - v) * f) as [number, number, number]));
      else rep = toHex(...(rgb.map(v => v * (1 - f)) as [number, number, number]));
    }
    out = out.replace(m[0], rep);
  }
  return out;
}

function resolveValue(text: string, env: Env): string {
  return evalColorFns(resolveVars(text, env)).trim();
}

/* --- @if condition evaluation ------------------------------------------- */

function evalCond(cond: string, env: Env): boolean {
  const c = resolveVars(cond.trim(), env);
  const m = /^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(c);
  if (m) {
    const a = m[1].trim(), op = m[2], b = m[3].trim();
    const na = parseFloat(a), nb = parseFloat(b);
    const cmp = !Number.isNaN(na) && !Number.isNaN(nb) && String(na) === a.trim().replace(/(px|em|rem|%|s|ms)$/, "") ? [na, nb] : null;
    const [x, y] = cmp ?? [a, b];
    switch (op) {
      case "==": return x == y; // eslint-disable-line eqeqeq
      case "!=": return x != y; // eslint-disable-line eqeqeq
      case ">=": return (x as number) >= (y as number);
      case "<=": return (x as number) <= (y as number);
      case ">": return (x as number) > (y as number);
      case "<": return (x as number) < (y as number);
    }
  }
  return c !== "" && c !== "false" && c !== "0";
}

/* --- mixin argument parsing --------------------------------------------- */

function splitArgs(s: string): string[] {
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function parseMixinParams(raw: string): Array<{ name: string; def?: string }> {
  return splitArgs(raw).map(p => {
    const eq = p.indexOf(":");
    if (eq >= 0) return { name: p.slice(0, eq).trim(), def: p.slice(eq + 1).trim() };
    return { name: p.trim() };
  });
}

/** Expand `@include name(args);` into the mixin's items, binding parameters. */
function expandInclude(decl: string, mixins: Map<string, MixinDef>, env: Env): Item[] {
  const m = /^@include\s+([\w-]+)\s*(?:\(([\s\S]*)\))?\s*$/.exec(decl);
  if (!m) return [];
  const def = mixins.get(m[1]);
  if (!def) return [];
  const args = splitArgs(m[2] ?? "");
  const scope = new Map<string, string>();
  def.params.forEach((p, i) => {
    const given = args[i] !== undefined ? resolveValue(args[i], env) : (p.def ? resolveValue(p.def, env) : "");
    scope.set(p.name, given);
  });
  // mixin body sees its parameters, then the call-site scope chain
  const callEnv: Env = [...env, scope];
  return resolveItemDeep(def.items, callEnv);
}

/** Deep-resolve $vars in a mixin body (baked at expansion time). */
function resolveItemDeep(items: Item[], env: Env): Item[] {
  return items.map(it => {
    if (it.kind === "decl") {
      let t = it.text ?? "";
      if (t.startsWith("@include")) {
        const m = /^@include\s+([\w-]+)\s*(?:\(([\s\S]*)\))?\s*$/.exec(t);
        if (m) t = "@include " + m[1] + (m[2] !== undefined ? "(" + resolveVars(m[2], env) + ")" : "");
      } else if (!t.startsWith("$")) {
        const eq = t.indexOf(":");
        if (eq > 0) t = t.slice(0, eq).trim() + ": " + resolveValue(t.slice(eq + 1), env);
      }
      return { kind: "decl", text: t };
    }
    const sel = (it.selector ?? "").trim();
    // @each/@mixin heads keep their own variable names
    if (sel.startsWith("@each") || sel.startsWith("@mixin")) return it;
    return { kind: "block", selector: resolveVars(sel, env), items: resolveItemDeep(it.items ?? [], env) };
  });
}

/* --- main evaluation ----------------------------------------------------- */

interface EvalCtx {
  env: Env;
  mixins: Map<string, MixinDef>;
  parent: string;
  out: string[];
}

function combineSelectors(parent: string, child: string): string {
  if (!parent) return child;
  if (child.includes("&")) return child.replace(/&/g, parent);
  return parent + " " + child;
}

/** Evaluate items, appending css to ctx.out. Returns expanded items. */
function evalItems(items: Item[], ctx: EvalCtx): { items: Item[] } {
  const expanded: Item[] = [];
  for (const it of items) {
    if (it.kind === "decl") {
      const t = (it.text ?? "").trim();
      // NOTE: $var declarations are intentionally left for absorb(), which
      // processes them in source order (a later reassignment must not leak
      // back into blocks that appeared before it)
      if (t.startsWith("@include")) {
        expanded.push(...expandInclude(t, ctx.mixins, ctx.env));
        continue;
      }
      expanded.push(it);
    } else {
      expanded.push(it);
    }
  }
  return { items: expanded };
}

/** Recursively emit css. */
function emit(items: Item[], parent: string, env: Env, mixins: Map<string, MixinDef>, out: string[]): void {
  const ctx: EvalCtx = { env, mixins, parent, out };
  const ev = evalItems(items, ctx);

  // absorb: flatten @if/@else/@each at this level, collecting this rule's
  // own declarations (ordered) and its sub-blocks (nested rules, @media).
  const decls: string[] = [];
  const blocks: Array<{ item: Item; benv: Env }> = [];
  let prevWasIf = false;
  let ifTaken = false;
  const absorb = (list: Item[], aenv: Env): void => {
    let pIf = false;
    let taken = false;
    for (const it of list) {
      if (it.kind === "decl") {
        const t = (it.text ?? "").trim();
        if (t.startsWith("$")) {
          const eq = t.indexOf(":");
          if (eq > 0) setVar(aenv, t.slice(0, eq).trim(), resolveValue(t.slice(eq + 1), aenv));
          pIf = false;
          continue;
        }
        const eq = t.indexOf(":");
        if (eq > 0 && !t.startsWith("@")) decls.push(resolveVars(t.slice(0, eq), aenv).trim() + ": " + resolveValue(t.slice(eq + 1), aenv) + ";");
        pIf = false;
        continue;
      }
      const sel = (it.selector ?? "").trim();

      const mixMatch = /^@mixin\s+([\w-]+)\s*(?:\(([\s\S]*)\))?$/.exec(sel);
      if (mixMatch) {
        mixins.set(mixMatch[1], { params: parseMixinParams(mixMatch[2] ?? ""), items: it.items ?? [] });
        pIf = false;
        continue;
      }

      if (/^@if\b/.test(sel) || (/^@else\b/.test(sel) && pIf)) {
        if (/^@if\b/.test(sel)) taken = false;
        let cond = true;
        if (/^@else\s+if\b/.test(sel)) cond = evalCond(sel.replace(/^@else\s+if/, "").replace(/^(\(|\))|$/g, "").trim(), aenv);
        else if (/^@if\b/.test(sel)) cond = evalCond(sel.replace(/^@if/, "").replace(/^(\(|\))|$/g, "").trim(), aenv);
        else cond = !taken;
        if (cond && !taken) {
          taken = true;
          absorb(it.items ?? [], aenv);
        }
        pIf = true;
        continue;
      }

      const eachMatch = /^@each\s+(\$[\w-]+)\s+in\s+(.+)$/.exec(sel);
      if (eachMatch) {
        const varName = eachMatch[1];
        const list2 = splitArgs(resolveValue(eachMatch[2], aenv));
        for (const v of list2) {
          absorb(it.items ?? [], [...aenv, new Map([[varName, v]])]);
        }
        pIf = false;
        continue;
      }

      // snapshot the visible variables: later reassignments must not leak
      // backwards into blocks that appeared before them
      blocks.push({ item: it, benv: aenv.map(m => new Map(m)) });
      pIf = false;
    }
  };
  absorb(ev.items, env);
  void prevWasIf; void ifTaken;

  // sub-blocks: nested rules resolve against this selector; @media wraps.
  const childCss: string[] = [];
  for (const { item: b, benv } of blocks) {
    const sel = (b.selector ?? "").trim();
    if (sel.startsWith("@media")) {
      const inner: string[] = [];
      emit(b.items ?? [], parent, benv, mixins, inner);
      if (inner.length > 0) {
        childCss.push(sel + " {");
        childCss.push(...inner.map(l => "  " + l));
        childCss.push("}");
      }
      continue;
    }
    if (sel.startsWith("@")) continue; // unknown at-rules are dropped
    // normal nested rule: emit its body with the combined selector
    const full = combineSelectors(parent, resolveVars(sel, benv));
    emit(b.items ?? [], full, [...benv, new Map()], mixins, childCss);
  }

  // this rule's own declarations (before nested rules, SCSS order)
  if (decls.length > 0 && parent !== "") {
    out.push(parent + " {");
    out.push(...decls.map(d => "  " + d));
    out.push("}");
  }
  out.push(...childCss);
}

/** Compile a SCSS source string to plain CSS. */
export function compileSCSS(source: string): string {
  // Round 4: silent data loss used to hide every unsupported construct
  // (unrecognized declarations and at-rules were dropped with no signal).
  const cleaned0 = stripComments(source);
  const UNSUPPORTED = /@(import|mixin|include|extend|use|forward|function|each|if)\b/g;
  const m = cleaned0.match(UNSUPPORTED);
  if (m) {
    const seen = Array.from(new Set(m.map((x) => x.trim())));
    console.warn("[scss] unsupported at-rule(s) ignored: " + seen.join(", ") + " -- TW's SCSS subset supports nesting, $vars and & references only");
  }
  const items = parseItems(stripComments(source));
  const out: string[] = [];
  emit(items, "", [new Map()], new Map(), out);
  if (out.length === 0 && cleaned0.replace(/[\s;]/g, "").length > 0) {
    console.warn("[scss] compileSCSS produced no output for a non-empty source -- check for unsupported syntax (TW uses `color: #fff` declarations, not `color #fff`)");
  }
  return out.join("\n");
}
