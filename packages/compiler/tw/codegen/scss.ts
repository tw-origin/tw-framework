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

interface FnDef { params: Array<{ name: string; def?: string }>; body: Item[]; }
const EXTENDS = new Map<string, Set<string>>();
let USER_FNS = new Map<string, FnDef>();

function lookupVar(env: Env, name: string): string | undefined {
  for (let i = env.length - 1; i >= 0; i--) {
    if (env[i].has(name)) return env[i].get(name);
  }
  return undefined;
}

function setVar(env: Env, name: string, value: string): void {
  env[env.length - 1].set(name, value);
}
function setVarGlobal(env: Env, name: string, value: string): void { env[0].set(name, value); }
function evalArithmetic(value: string): string {
  const op = /(-?\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg)?)\s*([+*\/-])\s*(-?\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg)?)/;
  let out = value;
  for (let guard = 0; guard < 30; guard++) {
    const m = op.exec(out);
    if (!m) break;
    const a = parseFloat(m[1]), b = parseFloat(m[3]);
    const unit = (m[1].match(/[a-z%]+$/) || m[3].match(/[a-z%]+$/) || [""])[0];
    let n: number;
    switch (m[2]) { case "+": n = a + b; break; case "-": n = a - b; break; case "*": n = a * b; break; case "/": n = b === 0 ? 0 : a / b; break; default: n = a; }
    out = out.replace(m[0], String(Number(n.toFixed(6))) + unit);
  }
  return out;
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

function parseMap(raw: string): Array<[string, string]> {
  const t = raw.trim();
  if (!(t.startsWith("(") && t.endsWith(")"))) return [];
  return splitArgs(t.slice(1, -1)).map(pair => {
    const eq = pair.indexOf(":");
    return eq < 0 ? [pair.trim(), ""] : [pair.slice(0, eq).trim(), pair.slice(eq + 1).trim()];
  });
}
function findKnownCall(s: string, pred: (name: string) => boolean): { name: string; args: string; start: number; end: number } | null {
  const re = /([\w.-]+)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (!pred(m[1])) continue;
    const open = m.index + m[1].length;
    let depth = 1, i = open + 1;
    while (i < s.length && depth > 0) { if (s[i] === "(") depth++; else if (s[i] === ")") depth--; i++; }
    if (depth === 0) return { name: m[1], args: s.slice(open + 1, i - 1), start: m.index, end: i };
  }
  return null;
}
function splitList(raw: string): string[] {
  const t = raw.trim().replace(/^[(]|[)]$/g, "").trim();
  if (t === "") return [];
  return t.includes(",") ? splitArgs(t) : t.split(/\s+/).filter(Boolean);
}
const BUILTIN_FNS = new Set(["map-get", "map-merge", "nth", "length", "math.div", "unquote"]);
function applyBuiltin(name: string, args: string[]): string {
  if (name === "map-get") { const hit = parseMap(args[0] ?? "").find(([k]) => k === (args[1] ?? "").trim()); return hit ? hit[1] : ""; }
  if (name === "map-merge") { const merged = new Map<string, string>(parseMap(args[0] ?? "")); for (const [k, v] of parseMap(args[1] ?? "")) merged.set(k, v); return "(" + Array.from(merged).map(([k, v]) => k + ": " + v).join(", ") + ")"; }
  if (name === "nth") { const list = splitList(args[0] ?? ""); return list[parseInt(args[1] ?? "1", 10) - 1] ?? ""; }
  if (name === "length") return String(splitList(args[0] ?? "").length);
  if (name === "math.div") { const a = parseFloat(args[0] ?? ""), b = parseFloat(args[1] ?? ""); return b === 0 ? "0" : String(a / b); }
  if (name === "unquote") return (args[0] ?? "").replace(/^["']|["']$/g, "");
  return "";
}
function evalBuiltinFns(value: string, env: Env): string {
  let out = value;
  for (let guard = 0; guard < 50; guard++) {
    const c = findKnownCall(out, (n) => BUILTIN_FNS.has(n));
    if (!c) break;
    const args = splitArgs(c.args).map(a => resolveValue(a, env));
    out = out.slice(0, c.start) + applyBuiltin(c.name, args) + out.slice(c.end);
  }
  return out;
}
function evalUserFns(value: string, env: Env, depth = 0): string {
  if (depth > 20) return value;
  let out = value;
  for (let guard = 0; guard < 50; guard++) {
    const c = findKnownCall(out, (n) => USER_FNS.has(n));
    if (!c) break;
    const def = USER_FNS.get(c.name)!;
    const args = splitArgs(c.args).map(a => resolveValue(a, env));
    const scope = new Map<string, string>();
    def.params.forEach((prm, i) => scope.set(prm.name, args[i] !== undefined ? args[i] : (prm.def ? resolveValue(prm.def, env) : "")));
    const bodyEnv: Env = [...env, scope];
    const ret = def.body.find(it => it.kind === "decl" && (it.text ?? "").trim().startsWith("@return"));
    const expr = ret ? (ret.text ?? "").replace(/^@return/, "").trim() : "";
    const r2 = evalUserFns(resolveValue(expr, bodyEnv), bodyEnv, depth + 1);
    out = out.slice(0, c.start) + r2 + out.slice(c.end);
  }
  return out;
}
function resolveValue(text: string, env: Env): string {
  return evalBuiltinFns(evalUserFns(evalColorFns(evalArithmetic(resolveVars(text, env))), env), env).trim();
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
        if (t.startsWith("@extend")) {
          const target = t.replace(/^@extend/, "").trim();
          if (target) { if (!EXTENDS.has(target)) EXTENDS.set(target, new Set()); EXTENDS.get(target)!.add(parent); }
          pIf = false; continue;
        }
        if (t.startsWith("$")) {
          const eq = t.indexOf(":");
          if (eq > 0) {
            const name = t.slice(0, eq).trim();
            let raw = t.slice(eq + 1).trim();
            let isDefault = false, isGlobal = false;
            if (/!default\s*$/.test(raw)) { isDefault = true; raw = raw.replace(/!default\s*$/, "").trim(); }
            if (/!global\s*$/.test(raw)) { isGlobal = true; raw = raw.replace(/!global\s*$/, "").trim(); }
            if (isDefault && lookupVar(aenv, name) !== undefined) { pIf = false; continue; }
            if (isGlobal) setVarGlobal(aenv, name, resolveValue(raw, aenv)); else setVar(aenv, name, resolveValue(raw, aenv));
          }
          pIf = false; continue;
        }
        const eq = t.indexOf(":");
        if (eq > 0 && !t.startsWith("@")) decls.push(resolveVars(t.slice(0, eq), aenv).trim() + ": " + resolveValue(t.slice(eq + 1), aenv) + ";");
        pIf = false;
        continue;
      }
      const sel = (it.selector ?? "").trim();

      const fnMatch = /^@function\s+([\w-]+)\s*(?:\(([\s\S]*)\))?$/.exec(sel);
      if (fnMatch) { USER_FNS.set(fnMatch[1], { params: parseMixinParams(fnMatch[2] ?? ""), body: it.items ?? [] }); pIf = false; continue; }
      const forMatch = /^@for\s+(\$[\w-]+)\s+from\s+(.+?)\s+(through|to)\s+(.+)$/.exec(sel);
      if (forMatch) {
        const varName = forMatch[1];
        const from = parseInt(resolveValue(forMatch[2], aenv), 10);
        const to = parseInt(resolveValue(forMatch[4], aenv), 10);
        const inclusive = forMatch[3] === "through";
        const ascending = from <= to;
        const end = inclusive ? to : (ascending ? to - 1 : to + 1);
        for (let v = from; ascending ? v <= end : v >= end; v += ascending ? 1 : -1) absorb(it.items ?? [], [...aenv, new Map([[varName, String(v)]])]);
        pIf = false; continue;
      }
      const whileMatch = /^@while\s+(.+)$/.exec(sel);
      if (whileMatch) {
        const loopEnv: Env = [...aenv, new Map()];
        let guard = 0;
        while (evalCond(whileMatch[1], loopEnv) && guard < 10000) { absorb(it.items ?? [], loopEnv); guard++; }
        if (guard >= 10000) console.warn("[scss] @while hit the 10000-iteration cap");
        pIf = false; continue;
      }
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

function applyExtends(lines: string[]): string[] {
  if (EXTENDS.size === 0) return lines.slice();
  const result: string[] = [];
  for (const line of lines) {
    if (line.endsWith(" {") && !line.trimStart().startsWith("@")) {
      const sel = line.slice(0, -2);
      const parts = sel.split(",").map(x => x.trim());
      const extra: string[] = [];
      for (const part of parts) { const ext = EXTENDS.get(part); if (ext) for (const e of ext) if (!parts.includes(e)) extra.push(e); }
      result.push((extra.length ? parts.concat(extra).join(", ") : sel) + " {");
    } else result.push(line);
  }
  return result;
}
/** Compile a SCSS source string to plain CSS. */
export function compileSCSS(source: string): string {
  // silent data loss used to hide every unsupported construct
  // (unrecognized declarations and at-rules were dropped with no signal).
  const cleaned0 = stripComments(source);
  // @mixin/@include ARE supported (they compile
  // to inlined output) -- the old warning called them "ignored" and
  // developers ripped out working mixins. Only genuinely unsupported
  // at-rules warn now.
  USER_FNS = new Map();
  EXTENDS.clear();
  const UNSUPPORTED = /@(import|use|forward)\b/g;
  const m = cleaned0.match(UNSUPPORTED);
  if (m) {
    const seen = Array.from(new Set(m.map((x) => x.trim())));
    console.warn("[scss] unsupported at-rule(s) ignored: " + seen.join(", ") + " -- TW's SCSS subset supports nesting, $vars, & references and @mixin/@include");
  }
  const items = parseItems(stripComments(source));
  const out: string[] = [];
  emit(items, "", [new Map()], new Map(), out);
  const folded = applyExtends(out.slice());
  out.length = 0;
  out.push(...folded);
  if (out.length === 0 && cleaned0.replace(/[\s;]/g, "").length > 0) {
    console.warn("[scss] compileSCSS produced no output for a non-empty source -- check for unsupported syntax (TW uses `color: #fff` declarations, not `color #fff`)");
  }
  return out.join("\n");
}
