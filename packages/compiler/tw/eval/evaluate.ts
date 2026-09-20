/** Expression evaluation - binary, unary, comparison, arithmetic. */

import { Sandbox } from "./sandbox";
import { callBuiltin } from "./builtins";
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
  const ternMatch = expr.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
  if (ternMatch) {
    const cond = isTruthy(resolve(ternMatch[1].trim(), vars, sb));
    return cond ? resolve(ternMatch[2].trim(), vars, sb) : resolve(ternMatch[3].trim(), vars, sb);
  }

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

  // Member access: obj.prop
  if (expr.includes(".")) {
    const parts = expr.split(".");
    let current: any = vars[parts[0]];
    for (let k = 1; k < parts.length; k++) {
      if (current === undefined || current === null) return "";
      try { current = JSON.parse(current); } catch { /* ignored */ }
      if (typeof current === "object" && current !== null) {
        current = current[parts[k]];
      } else {
        return "";
      }
    }
    return current !== undefined ? String(current) : "";
  }

  // Array index: arr[0]
  const idxMatch = expr?.match(/^(\w+)\[(\d+)\]$/);
  if (idxMatch) {
    const arrVar = vars[idxMatch[1]];
    if (arrVar) {
      try {
        const arr = JSON.parse(arrVar);
        if (Array.isArray(arr)) {
          const idx = parseInt(idxMatch[2], 10);
          return arr[idx] !== undefined ? String(arr[idx]) : "";
        }
      } catch { /* ignored */ }
    }
    return "";
  }

  // Function call: fn(args). If the expression is not a call, fall through
  // to the pipe forms -- a duplicated `if (!fnMatch)` used to `return null`
  // here, which made every non-call expression (including ALL pipe/filter
  // syntax like `{name | uppercase}`) render as empty and left the pipe
  // branches below unreachable dead code.
  const fnMatch = expr.match(/^(\w+)\((.*)\)$/);
  if (fnMatch) {
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

