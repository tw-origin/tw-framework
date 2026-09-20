/** Type inference -- infer types from AST nodes and expressions. */

import type { ASTNode, LiteralExpr } from "../ast/nodes";
import type { TWType } from "./type-system";

export function inferNodeType(node: ASTNode): TWType {
  if (!node) return "any";
  switch (node.type) {
    case "Text": return "string";
    case "Element": return "element";
    case "Component": return "component";
    case "If": case "For": case "While": return "node";
    case "Fragment": return "node";
    case "Literal": return (node as LiteralExpr).dataType as TWType;
    case "Identifier": return "any";
    case "BinaryExpr": return inferBinary(node as any);
    case "UnaryExpr": return inferUnary(node as any);
    case "LogicalExpr": return "boolean";
    case "ArrayExpr": return "array";
    case "ObjectExpr": return "object";
    case "ArrowFn": return "function";
    default: return "any";
  }
}

function inferBinary(node: { operator: string; left: ASTNode; right: ASTNode }): TWType {
  const op = node.operator;
  if (["+", "-", "*", "/", "%"].includes(op)) {
    if (op === "+" && (inferNodeType(node.left) === "string" || inferNodeType(node.right) === "string")) return "string";
    return "number";
  }
  if (["==", "!=", "===", "!==", "<", ">", "<=", ">="].includes(op)) return "boolean";
  return "any";
}

function inferUnary(node: { operator: string; operand: ASTNode }): TWType {
  const op = node.operator;
  if (op === "!") return "boolean";
  if (op === "-" || op === "+" || op === "~") return "number";
  if (op === "typeof") return "string";
  return "any";
}

export function inferValueType(value: string): TWType {
  if (value === "true" || value === "false") return "boolean";
  if (value === "null" || value === "undefined" || value === "") return "null";
  if (/^-?\d+(\.\d+)?$/.test(value)) return "number";
  if (value.startsWith("[") || value.startsWith("{")) {
    try {
      const p = JSON.parse(value);
      if (Array.isArray(p)) return "array";
      if (typeof p === "object") return "object";
    } catch { /* ignored */ }
  }
  return "string";
}

export function inferArrayType(elements: ASTNode[]): TWType {
  if (elements.length === 0) return "any";
  const first = inferNodeType(elements[0]);
  return elements.every(e => inferNodeType(e) === first) ? first : "any";
}

export function inferLiteralType(value: string | number | boolean | null): TWType {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "any";
}
