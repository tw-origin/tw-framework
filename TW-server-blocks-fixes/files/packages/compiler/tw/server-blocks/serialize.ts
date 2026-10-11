/**
 * Server-block serialization contract (Phase F).
 *
 * Values a server block returns cross to the template as JSON. Only
 * JSON-safe values may cross; everything else is a named error carrying
 * (file, variable, path, kind). Error messages NEVER contain the offending
 * VALUE (it could be a secret) -- only the location and the kind.
 */

import * as ts from "typescript";

export type NonSerializableKind =
  | "function" | "symbol" | "bigint" | "number" | "map" | "set" | "weakmap"
  | "promise" | "class-instance" | "buffer" | "cycle" | "depth";

export class ServerSerializationError extends Error {
  file: string; variable: string; path: string; kind: NonSerializableKind;
  constructor(kind: NonSerializableKind, file: string, variable: string, path: string) {
    // No VALUE in the message.
    super(`TW113: '${variable}'${path ? "." + path : ""} is not serializable (${kind}) [${file}]`);
    this.name = "ServerSerializationError";
    this.kind = kind; this.file = file; this.variable = variable; this.path = path;
  }
}

const MAX_DEPTH = 20;

/** Validate a value is JSON-safe, throwing a named error with the location. */
export function validateSerializable(value: unknown, file: string, variable: string, path = "", depth = 0, seen = new Set<unknown>()): void {
  const bad = (kind: NonSerializableKind) => { throw new ServerSerializationError(kind, file, variable, path); };
  if (depth > MAX_DEPTH) bad("depth");
  if (value === null || value === undefined) return;
  const t = typeof value;
  if (t === "string" || t === "boolean") return;
  if (t === "number") { if (!Number.isFinite(value as number)) bad("number"); return; }
  if (t === "function") bad("function");
  if (t === "symbol") bad("symbol");
  if (t === "bigint") bad("bigint");
  if (value instanceof Date) return; // -> ISO string
  if (value instanceof Map) bad("map");
  if (value instanceof Set) bad("set");
  if (value instanceof WeakMap) bad("weakmap");
  if (typeof Promise !== "undefined" && value instanceof Promise) bad("promise");
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) bad("buffer");
  if (ArrayBuffer.isView(value as any) || value instanceof ArrayBuffer) bad("buffer");
  if (Array.isArray(value)) {
    if (seen.has(value)) bad("cycle");
    seen.add(value);
    for (let i = 0; i < value.length; i++) validateSerializable(value[i], file, variable, path ? `${path}[${i}]` : `[${i}]`, depth + 1, seen);
    seen.delete(value);
    return;
  }
  // Plain object only (Object.prototype or null prototype).
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) bad("class-instance");
  if (seen.has(value)) bad("cycle");
  seen.add(value);
  for (const k of Object.keys(value as object)) {
    validateSerializable((value as any)[k], file, variable, path ? `${path}.${k}` : k, depth + 1, seen);
  }
  seen.delete(value);
}

/** JSON with Dates as ISO strings; no cycle surprises after validation. */
export function toJsonSafe(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (v instanceof Date ? v.toISOString() : v)) ?? "null";
}

/** Every identifier token referenced anywhere in a page's template. */
export function collectReferencedNames(templateSource: string): Set<string> {
  const out = new Set<string>();
  const src = templateSource.replace(/\/\*[\s\S]*?\*\//g, " ");
  // Interpolations `{expr}` and quoted expressions.
  const exprs: string[] = [];
  const brace = /\{([^{}]*)\}/g;
  let m;
  while ((m = brace.exec(src))) exprs.push(m[1]);
  const quoted = /"([^"]*)"/g;
  while ((m = quoted.exec(src))) exprs.push(m[1]);
  // A name can be referenced without sitting inside braces or quotes: the
  // iterable of `for x in <expr>` and the condition of `if <expr>`. Without
  // these, a block value used only as a loop source never crossed.
  const forRe = /\bfor\s+[A-Za-z_$][A-Za-z0-9_$]*\s+in\s+([^\n{}]+)/g;
  while ((m = forRe.exec(src))) exprs.push(m[1]);
  const ifRe = /\bif\s+([^\n{}]+)/g;
  while ((m = ifRe.exec(src))) exprs.push(m[1]);
  for (const e of exprs) {
    const id = /[A-Za-z_$][A-Za-z0-9_$]*/g;
    let t;
    while ((t = id.exec(e))) out.add(t[0]);
  }
  return out;
}

/** A referenced declared name whose initializer is syntactically non-serializable. */
export function scanNonSerializableInitializers(body: string, referenced: Set<string>): { name: string; kind: string }[] {
  const out: { name: string; kind: string }[] = [];
  if (!body.trim()) return out;
  const sf = ts.createSourceFile("s.ts", body, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const n = node.name.text;
      if (referenced.has(n)) {
        const init = node.initializer;
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) out.push({ name: n, kind: "function" });
        else if (ts.isClassExpression(init)) out.push({ name: n, kind: "class-instance" });
        else if (ts.isNewExpression(init) && ts.isIdentifier(init.expression)
          && ["Map", "Set", "WeakMap", "WeakSet", "Promise"].includes(init.expression.text)) out.push({ name: n, kind: init.expression.text.toLowerCase() });
        else if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === "Symbol") out.push({ name: n, kind: "symbol" });
        else if (ts.isBigIntLiteral(init)) out.push({ name: n, kind: "bigint" });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** A referenced declared name whose initializer reads `env` (one-level alias). */
export function scanEnvInMarkup(body: string, referenced: Set<string>): string[] {
  const out: string[] = [];
  if (!body.trim()) return out;
  const sf = ts.createSourceFile("s.ts", body, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const readsEnv = (n: ts.Node): boolean => {
    let found = false;
    const walk = (x: ts.Node) => {
      if (found) return;
      if (ts.isIdentifier(x) && x.text === "env") found = true;
      ts.forEachChild(x, walk);
    };
    walk(n);
    return found;
  };
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (referenced.has(node.name.text) && readsEnv(node.initializer)) out.push(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Env values that look like secrets (name matches + length >= 8). */
export function secretEnvValues(env: Record<string, string | undefined>): { name: string; value: string }[] {
  const re = /KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|DATABASE_URL|DSN/i;
  const out: { name: string; value: string }[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (value && re.test(name) && value.length >= 8) out.push({ name, value });
  }
  return out;
}

/** If any crossing string contains a secret value, return the secret's NAME. */
export function containsSecret(value: unknown, secrets: { name: string; value: string }[]): string | null {
  if (!secrets.length) return null;
  const check = (s: string) => { for (const sec of secrets) if (s.includes(sec.value)) return sec.name; return null; };
  if (typeof value === "string") return check(value);
  if (Array.isArray(value)) { for (const v of value) { const r = containsSecret(v, secrets); if (r) return r; } return null; }
  if (value && typeof value === "object") { for (const v of Object.values(value as object)) { const r = containsSecret(v, secrets); if (r) return r; } return null; }
  return null;
}

/** Best-effort lint: SQL-looking template literal interpolating request data. */
export function lintSql(body: string): string[] {
  const out: string[] = [];
  const re = /`[^`]*\b(SELECT|INSERT|UPDATE|DELETE|DROP|WHERE|UNION)\b[^`]*\$\{[^}]*\b(params|query|headers|cookies|getSession|requireUser)\b[^}]*\}[^`]*`/gi;
  let m;
  while ((m = re.exec(body))) out.push(m[0].slice(0, 40));
  return out;
}

/** Best-effort lint: fetch() whose URL interpolates request data (SSRF). */
export function lintSsrf(body: string): string[] {
  const out: string[] = [];
  const re = /fetch\s*\(\s*`[^`]*\$\{[^}]*\b(params|query|headers|cookies)\b[^}]*\}[^`]*`/g;
  let m;
  while ((m = re.exec(body))) out.push("fetch(<dynamic url>)");
  const concat = /fetch\s*\(\s*[^,)]*\b(params|query|headers|cookies)\b[^,)]*\+/g;
  while ((m = concat.exec(body))) out.push("fetch(<concatenated url>)");
  return out;
}
