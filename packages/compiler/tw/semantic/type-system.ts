/** Type system -- TW's lightweight type checker. */

export type TWType =
  | "string" | "number" | "boolean" | "null" | "undefined"
  | "array" | "object" | "function" | "any" | "void" | "never"
  | "component" | "element" | "node";

export interface TypeConstraint {
  type: TWType;
  isArray?: boolean;
  isNullable?: boolean;
  elementType?: TWType;
  properties?: Record<string, TWType>;
  params?: TWType[];
  returnType?: TWType;
}

export function isAssignable(source: TWType, target: TWType): boolean {
  if (source === target) return true;
  if (target === "any") return true;
  if ((source as any) === "null" || (source as any) === "undefined") return (target as any) === "null" || (target as any) === "undefined" || (target as any) === "any";
  if (source === "number" && target === "string") return true;
  return false;
}

export function unify(a: TypeConstraint, b: TypeConstraint): TypeConstraint {
  if (a.type === b.type) return a;
  if (a.type === "any") return b;
  if (b.type === "any") return a;
  if (a.type === "null" || a.type === "undefined") return b;
  if (b.type === "null" || b.type === "undefined") return a;
  return { type: "any" };
}

export function typeToString(type: TWType | TypeConstraint): string {
  if (typeof type === "string") return type;
  let s = type.type;
  if (type.isArray) s += "[]";
  if (type.isNullable) s += " | null";
  return s;
}

export function parseType(typeStr: string): TypeConstraint {
  const t = typeStr.trim();
  if (t.endsWith("[]")) return { type: "array", isArray: true, elementType: parseType(t.slice(0, -2)).type };
  if (t.endsWith("| null")) return { type: parseType(t.slice(0, -6).trim()).type, isNullable: true };
  const valid: TWType[] = ["string", "number", "boolean", "null", "undefined", "array", "object", "function", "any", "void"];
  if (valid.includes(t as TWType)) return { type: t as TWType };
  return { type: "any" };
}
