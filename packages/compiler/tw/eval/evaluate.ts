/** Expression evaluation - binary, unary, comparison, arithmetic. */

import { Sandbox } from "./sandbox";
import { callBuiltin, isBuiltinName } from "./builtins";
import { applyFilter } from "./builtins";
import { interpolate } from "./interpolate";

const defaultSandbox = new Sandbox();

export function evaluate(expr: string, vars: Record<string, string>, sandbox?: Sandbox): string {
  if (!expr) return "";
  const sb = sandbox ?? defaultSandbox;

  // Resolve variables
  if (vars[expr] !== undefined) {
    return vars[expr];
  }

  // `(expr)` -- a fully wrapping pair of parens is grouping, not part of the
  // expression. Without this, `a ? (b ? 'x' : 'y') : 'z'` resolved the
  // consequent with its parens attached and fell through to a boolean.
  if (expr.startsWith("(") && expr.endsWith(")")) {
    let d = 0;
    let wraps = true;
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (ch === "(") d++;
      else if (ch === ")") { d--; if (d === 0 && i < expr.length - 1) { wraps = false; break; } }
    }
    if (wraps && d === 0) return evaluate(expr.slice(1, -1).trim(), vars, sb);
  }

  // Numeric literal
  if (/^-?\d+(\.\d+)?$/.test(expr)) return expr;

  // String literal
  if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
    return expr.slice(1, -1);
  }

  // Boolean / null
  if (expr === "true") return "true";
  if (expr === "false") return "false";
  if (expr === "null" || expr === "undefined") return "";

  // Ternary (highest priority after primary expressions)
  // Ternary -- split at the TOP level only. The old regex took the first `?`
  // and the first `:`, so a ternary nested inside another collapsed to a bare
  // boolean (`a ? b ? 'x' : 'y' : 'z'` -> false/true). Ternaries are
  // right-associative: the first `:` that has no unmatched nested `?` closes
  // the outermost one.
  {
    let depth = 0;
    let pending = 0;
    let q = -1;
    let quote = "";
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (quote) {
        if (ch === "\\") { i++; continue; }
        if (ch === quote) quote = "";
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
      if (ch === "(" || ch === "[" || ch === "{") { depth++; continue; }
      if (ch === ")" || ch === "]" || ch === "}") { depth--; continue; }
      if (depth !== 0) continue;
      if (ch === "?") {
        if (pending === 0) q = i;
        pending++;
        continue;
      }
      if (ch === ":" && pending > 0) {
        pending--;
        if (pending > 0) continue;
        const cond = expr.slice(0, q).trim();
        const cons = expr.slice(q + 1, i).trim();
        const alt = expr.slice(i + 1).trim();
        if (cond && cons && alt) {
          return isTruthy(resolve(cond, vars, sb)) ? resolve(cons, vars, sb) : resolve(alt, vars, sb);
        }
        break;
      }
    }
  }

  // Real JS semantics for everything the branches below only approximate.
  // `{n > 3 && name}` used to render "true" instead of the operand,
  // `{items.map(x => x * 2)}` split on the `>` of the arrow and rendered
  // "false", and a call in a larger expression printed its own source. Only a
  // whitelisted shape is evaluated, so arbitrary code never runs; anything else
  // falls through to the branches below.
  const dyn = evalWithVars(expr, vars);
  if (dyn !== null) return dyn;

  // Logical OR
  const orParts = splitLogical(expr, "||");
  if (orParts.length > 1) {
    for (const part of orParts) {
      if (isTruthy(resolve(part.trim(), vars, sb))) return "true";
    }
    return "false";
  }

  // Logical AND
  const andParts = splitLogical(expr, "&&");
  if (andParts.length > 1) {
    for (const part of andParts) {
      if (!isTruthy(resolve(part.trim(), vars, sb))) return "false";
    }
    return "true";
  }

  // Nullish coalescing
  const nullishParts = splitLogical(expr, "??");
  if (nullishParts.length > 1) {
    for (const part of nullishParts) {
      const resolved = resolve(part.trim(), vars, sb);
      if (resolved !== "" && resolved !== "null" && resolved !== "undefined") return resolved;
    }
    return "";
  }

  // Comparison
  const compMatch = expr.match(/^(.+?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/);
  if (compMatch) {
    const left = resolve(compMatch[1].trim(), vars, sb);
    const op = compMatch[2];
    const right = resolve(compMatch[3].trim(), vars, sb);
    return compare(left, op, right);
  }

  // Arithmetic
  const arithMatch = expr.match(/^(.+?)\s*([+\-*/%])\s*(.+)$/);
  if (arithMatch) {
    const left = parseFloat(resolve(arithMatch[1].trim(), vars, sb));
    const op = arithMatch[2];
    const right = parseFloat(resolve(arithMatch[3].trim(), vars, sb));
    if (!isNaN(left) && !isNaN(right)) {
      return arith(left, op, right);
    }
  }


  // Member / index access: obj.prop, obj.a.b, obj["k"], obj[var], arr[1+1].
  // The old code only handled `obj.prop` and `obj[<digits>]` -- string
  // indexes, variable indexes and simple arithmetic indexes all failed and
  // fell through to "return raw".
  const access = parseMemberAccess(expr);
  if (access) {
    let current: any = vars[access.base];
    if (current === undefined) return "";
    for (const key of access.keys) {
      if (current === undefined || current === null) return "";
      if (typeof current === "string") {
        try { current = JSON.parse(current); } catch { /* keep the string */ }
      }
      let k: string;
      if (key.type === "prop") {
        k = key.value;
      } else {
        const inner = key.value.trim();
        if ((inner.startsWith('"') && inner.endsWith('"')) || (inner.startsWith("'") && inner.endsWith("'"))) {
          k = inner.slice(1, -1);
        } else if (/^-?\d+(\.\d+)?$/.test(inner)) {
          k = inner;
        } else if (vars[inner] !== undefined) {
          k = vars[inner];
        } else {
          k = evaluate(inner, vars, sb);
        }
      }
      if (typeof current === "object" && current !== null) {
        current = current[k];
      } else if (typeof current === "string" && /^\d+$/.test(k)) {
        current = current[parseInt(k, 10)];
      } else {
        return "";
      }
    }
    return current !== undefined && current !== null ? String(current) : "";
  }

  // Function call: fn(args). If the expression is not a call, fall through
  // to the pipe forms -- a duplicated `if (!fnMatch)` used to `return null`
  // here, which made every non-call expression (including ALL pipe/filter
  // syntax like `{name | uppercase}`) render as empty and left the pipe
  // branches below unreachable dead code.
  const fnMatch = expr.match(/^(\w+)\((.*)\)$/);
  // Only a known builtin. callBuiltin passes its argument through for an
  // unknown name, so `{greet('X')}` -- a helper from another module -- emitted
  // its argument ("X") instead of the call's result. An unknown callee falls
  // through so the expression stays visible rather than silently wrong.
  if (fnMatch && isBuiltinName(fnMatch[1])) {
    const fn = fnMatch[1];
    const arg = resolve(fnMatch[2].trim(), vars, sb);
    return callBuiltin(fn, arg, sb);
  }

  // Pipe: expr | filter
  const pipeMatch = expr.match(/^(.+?)\s*\|\s*(\w+)\((.*)\)$/);
  if (pipeMatch) {
    const value = resolve(pipeMatch[1].trim(), vars, sb);
    const filter = pipeMatch[2];
    const filterArgs = pipeMatch[3];
    return applyFilter(value, filter, filterArgs, vars, sb);
  }

  // Simple pipe: expr | filter
  const simplePipe = expr.match(/^(.+?)\s*\|\s*(\w+)$/);
  if (simplePipe) {
    const value = resolve(simplePipe[1].trim(), vars, sb);
    return applyFilter(value, simplePipe[2], "", vars, sb);
  }

  // Unknown -- return raw
  return expr;
}

/** Property names / methods an interpolation expression may use. */
const SAFE_MEMBERS = new Set([
  "length", "toUpperCase", "toLowerCase", "trim", "trimStart", "trimEnd",
  "slice", "substring", "substr", "charAt", "at", "includes", "indexOf",
  "lastIndexOf", "startsWith", "endsWith", "replace", "replaceAll", "split",
  "join", "concat", "repeat", "padStart", "padEnd", "toString", "toFixed",
  "map", "filter", "find", "some", "every", "reduce", "sort", "reverse",
  // Static helpers on the built-ins (JSON.stringify, Object.keys, Math.round).
  "stringify", "parse", "keys", "values", "entries", "from", "isArray",
  "isInteger", "isFinite", "abs", "ceil", "floor", "round", "max", "min",
  "pow", "sqrt", "random", "now", "toISOString",
]);

/**
 * Evaluate `expr` against the page's state values. Returns null when the
 * expression is not a whitelisted shape or throws, so the caller keeps the
 * literal text (the previous behaviour) rather than failing the build.
 */
function evalWithVars(expr: string, vars: Record<string, string>): string | null {
  if (!expr || /[`\\]/.test(expr)) return null;
  // Only identifiers, member/index access, literals, operators and calls.
  // Braces are allowed: an object literal in the expression
  // (`{JSON.stringify({a:1})}`) is ordinary JS.
  if (!/^[\w\s.$[\]{}()'"`,+\-*/%?:<>=!&|]*$/.test(expr)) return null;
  // Only CALLS are checked against the allow-list -- a plain property read
  // (`user.first`) must pass, or every object access bailed out of here.
  for (const m of expr.matchAll(/\.([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (!SAFE_MEMBERS.has(m[1])) return null;
  }
  const names: string[] = [];
  const vals: any[] = [];
  for (const k of Object.keys(vars)) {
    if (!/^[A-Za-z_$][\w$]*$/.test(k)) continue;
    names.push(k);
    try { vals.push(JSON.parse(vars[k])); } catch { vals.push(vars[k]); }
  }
  try {
    const fn = new Function(...names, `"use strict"; return (${expr});`);
    const out = fn(...vals);
    if (out === undefined || out === null) return null;
    return typeof out === "object" ? JSON.stringify(out) : String(out);
  } catch {
    return null;
  }
}

function resolve(token: string, vars: Record<string, string>, sandbox: Sandbox): string {
  const trimmed = token.trim();
  if (!trimmed) return "";

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  if (trimmed === "true") return "true";
  if (trimmed === "false") return "false";
  if (trimmed === "null" || trimmed === "undefined") return "";
  if (vars[trimmed] !== undefined) return vars[trimmed];
  if (trimmed.includes("{")) return interpolate(trimmed, vars);
  return evaluate(trimmed, vars, sandbox);
}



/**
 * Split `base.prop`, `base.a.b`, `base["k"]`, `base[var]`, `base[1+1]` into a
 * base identifier plus a list of accessors. Returns null when the whole
 * expression is not a pure member/index chain (so other branches can try).
 */
function parseMemberAccess(
  expr: string,
): { base: string; keys: Array<{ type: "prop" | "index"; value: string }> } | null {
  const baseMatch = expr.match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
  if (!baseMatch) return null;
  const base = baseMatch[0];
  const keys: Array<{ type: "prop" | "index"; value: string }> = [];
  let i = base.length;
  let sawAccess = false;

  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ".") {
      const nm = expr.slice(i + 1).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
      if (!nm) return null;
      keys.push({ type: "prop", value: nm[0] });
      i += 1 + nm[0].length;
      sawAccess = true;
    } else if (ch === "[") {
      let depth = 1;
      let j = i + 1;
      let inStr: string | null = null;
      while (j < expr.length && depth > 0) {
        const c = expr[j];
        if (inStr) {
          if (c === inStr && expr[j - 1] !== "\\") inStr = null;
        } else if (c === '"' || c === "'") {
          inStr = c;
        } else if (c === "[") {
          depth++;
        } else if (c === "]") {
          depth--;
          if (depth === 0) break;
        }
        j++;
      }
      if (depth !== 0) return null;
      keys.push({ type: "index", value: expr.slice(i + 1, j) });
      i = j + 1;
      sawAccess = true;
    } else {
      return null;
    }
  }

  if (!sawAccess) return null;
  return { base, keys };
}

function compare(left: string, op: string, right: string): string {
  const leftNum = parseFloat(left);
  const rightNum = parseFloat(right);
  const bothNumeric = !isNaN(leftNum) && !isNaN(rightNum);

  switch (op) {
    case "===": return left === right ? "true" : "false";
    case "!==": return left !== right ? "true" : "false";
    case "==": return bothNumeric ? (leftNum === rightNum ? "true" : "false") : (left === right ? "true" : "false");
    case "!=": return bothNumeric ? (leftNum !== rightNum ? "true" : "false") : (left !== right ? "true" : "false");
    case ">=": return bothNumeric ? (leftNum >= rightNum ? "true" : "false") : "false";
    case "<=": return bothNumeric ? (leftNum <= rightNum ? "true" : "false") : "false";
    case ">":  return bothNumeric ? (leftNum > rightNum ? "true" : "false") : "false";
    case "<":  return bothNumeric ? (leftNum < rightNum ? "true" : "false") : "false";
    default:   return "false";
  }
}



function arith(left: number, op: string, right: number): string {
  switch (op) {
    case "+": return String(left + right);
    case "-": return String(left - right);
    case "*": return String(left * right);
    case "/": return right === 0 ? "0" : String(left / right);
    case "%": return right === 0 ? "0" : String(left % right);
    default:  return "0";
  }
}



function splitLogical(expr: string, op: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inStr: string | null = null;
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];
    if (inStr) {
      current += ch;
      if (ch === inStr && expr[i - 1] !== "\\") inStr = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; current += ch; i++; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;

    if (depth === 0 && expr.slice(i, i + op.length) === op) {
      parts.push(current);
      current = "";
      i += op.length;
      continue;
    }

    current += ch;
    i++;
  }

  if (current.trim()) parts.push(current);
  return parts;
}

export function isTruthy(value: any): boolean {
  if (value === undefined || value === null) return false;
  if (value === false || value === "false" || value === "False") return false;
  if (value === 0 || value === "0") return false;
  if (value === "" || value === "null" || value === "undefined" || value === "None") return false;
  if (value === "[]") return false;
  if (value === "{}") return false;
  return true;
}

export function inferType(value: string): "string" | "number" | "boolean" | "array" | "object" | "null" {
  if (value === "null" || value === "undefined" || value === "") return "null";
  if (value === "true" || value === "false") return "boolean";
  if (/^-?\d+(\.\d+)?$/.test(value)) return "number";
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return "array";
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return "object";
  return "string";
}

export function coerce(value: string, targetType: string): string {
  switch (targetType) {
    case "number": case "int": {
      const num = parseFloat(value);
      return isNaN(num) ? "0" : String(num);
    }
    case "boolean": return isTruthy(value) ? "true" : "false";
    case "string": return String(value);
    case "float": return String(parseFloat(value) || 0);
    default: return value;
  }
}

