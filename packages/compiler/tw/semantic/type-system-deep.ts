/**
 * TW Type System -- deep type checker with generics, unions, intersections,
 * conditional types, mapped types, and template literal types.
 *
 * This is the real engine behind TW's compile-time type checking. It handles
 * type creation, comparison, unification, and pretty-printing.
 *
 * Used by: checker.ts, inference-deep.ts, validator.ts
 */

import type { ASTNode } from "../ast/nodes";

// --- Core Type Representation ----------------------------------------

export type TypeKind =
  | "primitive"    // string, number, boolean, null, undefined, void, never, any, unknown
  | "literal"     // "foo", 42, true
  | "union"       // A | B
  | "intersection" // A & B
  | "array"       // T[]
  | "tuple"       // [A, B, C]
  | "object"      // { a: A, b: B }
  | "function"    // (a: A) => B
  | "generic"     // T<U>
  | "conditional" // T extends U ? X : Y
  | "mapped"      // { [K in keyof T]: V }
  | "template"    // `hello ${T}`
  | "reference"   // type alias reference
  | "intrinsic"   // keyof, infer, etc
  | "component"   // component type
  | "element";    // DOM element type

export interface TWTypeNode {
  kind: TypeKind;
  // primitive name
  name?: string;
  // literal value
  value?: string | number | boolean | null;
  // union/intersection members
  members?: TWTypeNode[];
  // array/tuple element types
  elements?: TWTypeNode[];
  // object properties
  properties?: Map<string, PropertySig>;
  // function signature
  sig?: FunctionSig;
  // generic params and instantiation
  typeParams?: TypeParam[];
  typeArgs?: TWTypeNode[];
  // conditional: checkType, extendsType, trueType, falseType
  checkType?: TWTypeNode;
  extendsType?: TWTypeNode;
  trueType?: TWTypeNode;
  falseType?: TWTypeNode;
  // mapped type
  mappedKey?: TWTypeNode;
  mappedValue?: TWTypeNode;
  mappedConstraint?: TWTypeNode;
  // template literal parts
  parts?: TemplatePart[];
  // reference (alias)
  refName?: string;
  // original AST node for error reporting
  originNode?: ASTNode;
  // is this type readonly?
  readonly?: boolean;
  // is this type optional?
  optional?: boolean;
  // metadata for caching
  cachedHash?: number;
}

export interface PropertySig {
  name: string;
  type: TWTypeNode;
  optional: boolean;
  readonly: boolean;
}

export interface FunctionSig {
  params: ParamSig[];
  returnType: TWTypeNode;
  restParam?: ParamSig | null;
  thisType?: TWTypeNode | null;
  isAsync: boolean;
  isGenerator: boolean;
}

export interface ParamSig {
  name: string;
  type: TWTypeNode;
  optional: boolean;
  defaultValue?: boolean;
  decorators?: string[];
}

export interface TypeParam {
  name: string;
  constraint?: TWTypeNode | null;
  defaultType?: TWTypeNode | null;
  variance?: "in" | "out" | "inout";
}

export interface TemplatePart {
  isLiteral: boolean;
  text?: string;        // for literal parts
  exprType?: TWTypeNode; // for expression parts
}

// --- Predefined Types -------------------------------------------------

const _primCache = new Map<string, TWTypeNode>();

function prim(name: string): TWTypeNode {
  let t = _primCache.get(name);
  if (!t) {
    t = { kind: "primitive", name };
    _primCache.set(name, t);
  }
  return t;
}

export const STRING = prim("string");
export const NUMBER = prim("number");
export const BOOLEAN = prim("boolean");
export const NULL = prim("null");
export const UNDEFINED = prim("undefined");
export const VOID = prim("void");
export const NEVER = prim("never");
export const ANY = prim("any");
export const UNKNOWN = prim("unknown");
export const OBJECT = prim("object");
export const BIGINT = prim("bigint");
export const SYMBOL = prim("symbol");

// --- Type Constructors --------------------------------------------------

export function literalType(value: string | number | boolean | null): TWTypeNode {
  return { kind: "literal", value };
}

export function stringLiteral(value: string): TWTypeNode {
  return { kind: "literal", value };
}

export function numberLiteral(value: number): TWTypeNode {
  return { kind: "literal", value };
}

export function booleanLiteral(value: boolean): TWTypeNode {
  return { kind: "literal", value };
}

export function unionType(members: TWTypeNode[]): TWTypeNode {
  // flatten nested unions
  const flat = flattenUnion(members);
  // remove never (it's absorbed)
  const filtered = flat.filter(t => !isNever(t));
  if (filtered.length === 0) return NEVER;
  if (filtered.length === 1) return filtered[0];
  // remove duplicates
  const unique = dedupTypes(filtered);
  if (unique.length === 1) return unique[0];
  return { kind: "union", members: unique };
}

export function intersectionType(members: TWTypeNode[]): TWTypeNode {
  const flat = flattenIntersection(members);
  // any in intersection -> any
  if (flat.some(isAny)) return ANY;
  // remove unknown (it's absorbed)
  const filtered = flat.filter(t => !isUnknown(t));
  if (filtered.length === 0) return UNKNOWN;
  if (filtered.length === 1) return filtered[0];
  // merge object types
  const objects = filtered.filter(t => t.kind === "object");
  const nonObjects = filtered.filter(t => t.kind !== "object");
  if (objects.length > 1) {
    const merged = mergeObjectTypes(objects);
    if (nonObjects.length === 0) return merged;
    return { kind: "intersection", members: [...nonObjects, merged] };
  }
  const unique = dedupTypes(filtered);
  if (unique.length === 1) return unique[0];
  return { kind: "intersection", members: unique };
}

export function arrayType(element: TWTypeNode): TWTypeNode {
  return { kind: "array", elements: [element] };
}

export function tupleType(elements: TWTypeNode[]): TWTypeNode {
  return { kind: "tuple", elements };
}

export function objectType(props: PropertySig[]): TWTypeNode {
  const map = new Map<string, PropertySig>();
  for (const p of props) map.set(p.name, p);
  return { kind: "object", properties: map };
}

export function functionType(
  params: ParamSig[],
  returnType: TWTypeNode,
  opts: { restParam?: ParamSig; isAsync?: boolean; isGenerator?: boolean } = {}
): TWTypeNode {
  return {
    kind: "function",
    sig: {
      params,
      returnType,
      restParam: opts.restParam ?? null,
      thisType: null,
      isAsync: opts.isAsync ?? false,
      isGenerator: opts.isGenerator ?? false,
    },
  };
}

export function genericType(
  refName: string,
  typeParams: TypeParam[],
  typeArgs: TWTypeNode[] = []
): TWTypeNode {
  return { kind: "generic", refName, typeParams, typeArgs };
}

export function conditionalType(
  checkType: TWTypeNode,
  extendsType: TWTypeNode,
  trueType: TWTypeNode,
  falseType: TWTypeNode
): TWTypeNode {
  return { kind: "conditional", checkType, extendsType, trueType, falseType };
}

export function mappedType(
  mappedConstraint: TWTypeNode,
  mappedValue: TWTypeNode,
  mappedKey: TWTypeNode
): TWTypeNode {
  return { kind: "mapped", mappedConstraint, mappedValue, mappedKey };
}

export function templateType(parts: TemplatePart[]): TWTypeNode {
  return { kind: "template", parts };
}

export function referenceType(refName: string): TWTypeNode {
  return { kind: "reference", refName };
}

// --- Type Predicates -------------------------------------------------

export function isPrimitive(t: TWTypeNode): boolean {
  return t.kind === "primitive";
}

export function isAny(t: TWTypeNode): boolean {
  return t.kind === "primitive" && t.name === "any";
}

export function isUnknown(t: TWTypeNode): boolean {
  return t.kind === "primitive" && t.name === "unknown";
}

export function isNever(t: TWTypeNode): boolean {
  return t.kind === "primitive" && t.name === "never";
}

export function isVoid(t: TWTypeNode): boolean {
  return t.kind === "primitive" && t.name === "void";
}

export function isNull(t: TWTypeNode): boolean {
  return t.kind === "primitive" && t.name === "null" ||
         (t.kind === "literal" && t.value === null);
}

export function isUndefined(t: TWTypeNode): boolean {
  return t.kind === "primitive" && t.name === "undefined";
}

export function isString(t: TWTypeNode): boolean {
  return t.kind === "primitive" && t.name === "string" ||
         (t.kind === "literal" && typeof t.value === "string");
}

export function isNumber(t: TWTypeNode): boolean {
  return t.kind === "primitive" && t.name === "number" ||
         (t.kind === "literal" && typeof t.value === "number");
}

export function isBoolean(t: TWTypeNode): boolean {
  return t.kind === "primitive" && t.name === "boolean" ||
         (t.kind === "literal" && typeof t.value === "boolean");
}

export function isLiteral(t: TWTypeNode): boolean {
  return t.kind === "literal";
}

export function isUnion(t: TWTypeNode): boolean {
  return t.kind === "union";
}

export function isIntersection(t: TWTypeNode): boolean {
  return t.kind === "intersection";
}

export function isArray(t: TWTypeNode): boolean {
  return t.kind === "array";
}

export function isTuple(t: TWTypeNode): boolean {
  return t.kind === "tuple";
}

export function isObject(t: TWTypeNode): boolean {
  return t.kind === "object" || (t.kind === "primitive" && t.name === "object");
}

export function isFunction(t: TWTypeNode): boolean {
  return t.kind === "function";
}

export function isConditional(t: TWTypeNode): boolean {
  return t.kind === "conditional";
}

export function isMapped(t: TWTypeNode): boolean {
  return t.kind === "mapped";
}

export function isTemplate(t: TWTypeNode): boolean {
  return t.kind === "template";
}

export function isReference(t: TWTypeNode): boolean {
  return t.kind === "reference";
}

// --- Type Comparison -------------------------------------------------

/**
 * Check if source is assignable to target.
 * This is the core of the type system -- it determines if one type
 * can be used where another is expected.
 *
 * Rules:
 * - any is assignable to and from everything
 * - unknown is only assignable to itself or any
 * - never is assignable to everything
 * - literals are assignable to their base type
 * - union: source assignable if all members assignable to target
 * - intersection: source assignable if assignable to all members
 * - function: contravariant params, covariant return
 */
export function isAssignableTo(source: TWTypeNode, target: TWTypeNode): boolean {
  // fast path: same reference
  if (source === target) return true;

  // any -> anything
  if (isAny(source) || isAny(target)) return true;

  // never -> anything
  if (isNever(source)) return true;

  // unknown is only assignable to unknown | any
  if (isUnknown(source)) {
    return isUnknown(target) || isAny(target);
  }

  // everything assignable to unknown
  if (isUnknown(target)) return true;

  // null/undefined handling
  if (isNull(source)) {
    return isNull(target) || isAny(target) ||
           (isUnion(target) && target.members!.some(m => isNull(m))) ||
           isObject(target);
  }
  if (isUndefined(source)) {
    return isUndefined(target) || isAny(target) ||
           (isUnion(target) && target.members!.some(m => isUndefined(m)));
  }

  // void -> undefined in strict mode, but we allow void -> void | any
  if (isVoid(source)) return isVoid(target) || isUndefined(target) || isAny(target);
  if (isVoid(target)) return isVoid(source) || isUndefined(source) || isAny(source);

  // literal -> primitive
  if (isLiteral(source)) {
    if (isLiteral(target)) {
      return source.value === target.value;
    }
    if (isPrimitive(target)) {
      if (target.name === "string") return typeof source.value === "string";
      if (target.name === "number") return typeof source.value === "number";
      if (target.name === "boolean") return typeof source.value === "boolean";
      if (target.name === "object") return source.value === null;
    }
    if (isUnion(target)) {
      return target.members!.some(m => isAssignableTo(source, m));
    }
    return false;
  }

  // union source -> target: all members must be assignable
  if (isUnion(source)) {
    return source.members!.every(m => isAssignableTo(m, target));
  }

  // source -> union target: source must match at least one
  if (isUnion(target)) {
    return target.members!.some(m => isAssignableTo(source, m));
  }

  // intersection source -> target: at least one member must be assignable
  if (isIntersection(source)) {
    return source.members!.some(m => isAssignableTo(m, target));
  }

  // source -> intersection target: source must be assignable to all members
  if (isIntersection(target)) {
    return target.members!.every(m => isAssignableTo(source, m));
  }

  // array -> array
  if (isArray(source) && isArray(target)) {
    return isAssignableTo(source.elements![0], target.elements![0]);
  }

  // tuple -> tuple
  if (isTuple(source) && isTuple(target)) {
    if (source.elements!.length !== target.elements!.length) return false;
    for (let i = 0; i < source.elements!.length; i++) {
      if (!isAssignableTo(source.elements![i], target.elements![i])) return false;
    }
    return true;
  }

  // array -> tuple (if lengths match)
  if (isArray(source) && isTuple(target)) {
    return target.elements!.every(e => isAssignableTo(source.elements![0], e));
  }

  // tuple -> array
  if (isTuple(source) && isArray(target)) {
    return source.elements!.every(e => isAssignableTo(e, target.elements![0]));
  }

  // object -> object
  if (isObject(source) && isObject(target) && source.properties && target.properties) {
    for (const [key, targetProp] of target.properties) {
      const sourceProp = source.properties.get(key);
      if (!sourceProp) {
        if (!targetProp.optional) return false;
        continue;
      }
      if (!isAssignableTo(sourceProp.type, targetProp.type)) return false;
    }
    return true;
  }

  // function -> function
  if (isFunction(source) && isFunction(target) && source.sig && target.sig) {
    return isFunctionAssignable(source.sig, target.sig);
  }

  // same primitive
  if (isPrimitive(source) && isPrimitive(target)) {
    return source.name === target.name;
  }

  // reference resolution (if same name)
  if (isReference(source) && isReference(target)) {
    return source.refName === target.refName;
  }

  // conditional type resolution
  if (isConditional(target)) {
    const resolved = resolveConditional(source, target);
    if (resolved) return isAssignableTo(source, resolved);
  }

  return false;
}

function isFunctionAssignable(source: FunctionSig, target: FunctionSig): boolean {
  // params: contravariant (target params assignable to source params)
  const sourceParams = source.params;
  const targetParams = target.params;

  // target can have fewer params (optional)
  if (targetParams.length > sourceParams.length + (source.restParam ? 100 : 0)) {
    return false;
  }

  for (let i = 0; i < targetParams.length; i++) {
    const tp = targetParams[i];
    const sp = sourceParams[i];
    if (!sp) {
      if (!tp.optional) return false;
      continue;
    }
    // contravariant: target param must be assignable to source param
    if (!isAssignableTo(tp.type, sp.type)) return false;
  }

  // return type: covariant (source return assignable to target return)
  if (!isAssignableTo(source.returnType, target.returnType)) return false;

  // async/generator must match
  if (target.isAsync && !source.isAsync) return false;
  if (target.isGenerator && !source.isGenerator) return false;

  return true;
}

/**
 * Resolve a conditional type: check if checkType extends extendsType,
 * and return trueType or falseType accordingly.
 */
export function resolveConditional(
  checkType: TWTypeNode,
  cond: TWTypeNode
): TWTypeNode | null {
  if (!isConditional(cond)) return null;

  const extendsResult = isAssignableTo(cond.checkType!, cond.extendsType!);
  return extendsResult ? cond.trueType! : cond.falseType!;
}

// --- Type Unification -------------------------------------------------

/**
 * Unify two types -- find the most specific type that both are assignable to.
 * Used for type narrowing and inference.
 */
export function unifyTypes(a: TWTypeNode, b: TWTypeNode): TWTypeNode {
  if (a === b) return a;

  if (isNever(a)) return b;
  if (isNever(b)) return a;

  if (isAny(a) || isAny(b)) return ANY;

  if (isUnknown(a)) return b;
  if (isUnknown(b)) return a;

  // literal -> primitive base
  const aBase = literalToBase(a);
  const bBase = literalToBase(b);

  if (isLiteral(a) && isLiteral(b)) {
    if (aBase === bBase) {
      // same base type -- create a union of literals or the primitive
      return unionType([a, b]);
    }
    // different base types -- union
    return unionType([a, b]);
  }

  if (isLiteral(a) && !isLiteral(b)) {
    if (isAssignableTo(a, b)) return b;
    return unionType([aBase, b]);
  }

  if (!isLiteral(a) && isLiteral(b)) {
    if (isAssignableTo(b, a)) return a;
    return unionType([a, bBase]);
  }

  // both unions -> merge
  if (isUnion(a) && isUnion(b)) {
    return unionType([...a.members!, ...b.members!]);
  }

  if (isUnion(a)) {
    if (isAssignableTo(b, a)) return a;
    return unionType([...a.members!, b]);
  }

  if (isUnion(b)) {
    if (isAssignableTo(a, b)) return b;
    return unionType([a, ...b.members!]);
  }

  // both intersections -> merge
  if (isIntersection(a) && isIntersection(b)) {
    return intersectionType([...a.members!, ...b.members!]);
  }

  // array + array -> array of unified element
  if (isArray(a) && isArray(b)) {
    return arrayType(unifyTypes(a.elements![0], b.elements![0]));
  }

  // object + object -> merge properties
  if (isObject(a) && isObject(b) && a.properties && b.properties) {
    const merged = new Map<string, PropertySig>(a.properties);
    for (const [key, prop] of b.properties) {
      const existing = merged.get(key);
      if (existing) {
        merged.set(key, {
          name: key,
          type: unifyTypes(existing.type, prop.type),
          optional: existing.optional && prop.optional,
          readonly: existing.readonly || prop.readonly,
        });
      } else {
        merged.set(key, prop);
      }
    }
    return { kind: "object", properties: merged };
  }

  // function + function -> union of signatures
  if (isFunction(a) && isFunction(b)) {
    // Try to find a common signature
    // If return types unify and param types match, unify the return
    if (a.sig && b.sig && a.sig.params.length === b.sig.params.length) {
      const paramsMatch = a.sig.params.every((p, i) =>
        isAssignableTo(p.type, b.sig!.params[i].type) ||
        isAssignableTo(b.sig!.params[i].type, p.type)
      );
      if (paramsMatch) {
        return functionType(
          a.sig.params.map((p, i) => ({
            name: p.name,
            type: unifyTypes(p.type, b.sig!.params[i].type),
            optional: p.optional || b.sig!.params[i].optional,
            defaultValue: p.defaultValue || b.sig!.params[i].defaultValue,
          })),
          unifyTypes(a.sig.returnType, b.sig.returnType)
        );
      }
    }
    return unionType([a, b]);
  }

  // same primitive -> that primitive
  if (isPrimitive(a) && isPrimitive(b) && a.name === b.name) {
    return a;
  }

  // default: union
  return unionType([a, b]);
}

function literalToBase(t: TWTypeNode): TWTypeNode {
  if (!isLiteral(t)) return t;
  if (typeof t.value === "string") return STRING;
  if (typeof t.value === "number") return NUMBER;
  if (typeof t.value === "boolean") return BOOLEAN;
  if (t.value === null) return NULL;
  return UNKNOWN;
}

// --- Type Narrowing -------------------------------------------------

/**
 * Narrow a type based on a condition.
 * For example, narrowing `string | null` with a truthiness check gives `string`.
 */
export function narrowType(
  type: TWTypeNode,
  condition: NarrowCondition
): TWTypeNode {
  switch (condition.kind) {
    case "truthy":
      // remove null, undefined, false, 0, "" from the type
      return filterType(type, t => {
        if (isNull(t) || isUndefined(t)) return false;
        if (isLiteral(t)) {
          if (t.value === false || t.value === 0 || t.value === "") return false;
          return true;
        }
        return true;
      });

    case "falsy":
      return filterType(type, t => {
        if (isNull(t) || isUndefined(t)) return true;
        if (isLiteral(t)) {
          return t.value === false || t.value === 0 || t.value === "";
        }
        return false;
      });

    case "typeof":
      return filterType(type, t => {
        const base = literalToBase(t);
        if (base.kind === "primitive" && base.name === condition.typeName) return true;
        if (isPrimitive(t) && t.name === condition.typeName) return true;
        return false;
      });

    case "instanceof":
      // keep only types that could be instances of the given constructor
      return filterType(type, t => {
        if (isReference(t) && t.refName === condition.className) return true;
        return false;
      });

    case "equals":
      // narrow to the specific literal value
      return filterType(type, t => {
        if (isLiteral(t) && t.value === condition.value) return true;
        if (isPrimitive(t)) return true; // primitive might produce this value
        return false;
      });

    case "not-equals":
      return filterType(type, t => {
        if (isLiteral(t) && t.value === condition.value) return false;
        return true;
      });

    case "property-check":
      // narrow to objects that have the property
      return filterType(type, t => {
        if (isObject(t) && t.properties?.has(condition.propertyName)) return true;
        return false;
      });

    case "array-check":
      return filterType(type, t => isArray(t) || (isUnion(t) && t.members!.some(isArray)));

    default:
      return type;
  }
}

export interface NarrowCondition {
  kind: "truthy" | "falsy" | "typeof" | "instanceof" | "equals" | "not-equals" | "property-check" | "array-check";
  typeName?: string;
  className?: string;
  value?: string | number | boolean | null;
  propertyName?: string;
}

function filterType(
  type: TWTypeNode,
  pred: (t: TWTypeNode) => boolean
): TWTypeNode {
  if (isUnion(type)) {
    const filtered = type.members!.filter(pred);
    if (filtered.length === 0) return NEVER;
    if (filtered.length === 1) return filtered[0];
    return unionType(filtered);
  }
  return pred(type) ? type : NEVER;
}

// --- Type Widening ----------------------------------------------------

/**
 * Widen a literal type to its base primitive type.
 * Used when a variable is declared without explicit type annotation.
 */
export function widenType(type: TWTypeNode): TWTypeNode {
  if (isLiteral(type)) return literalToBase(type);
  if (isUnion(type)) {
    return unionType(type.members!.map(widenType));
  }
  if (isTuple(type)) {
    return arrayType(widenType(type.elements![0] ?? UNKNOWN));
  }
  return type;
}

// --- Helpers ----------------------------------------------------------

function flattenUnion(types: TWTypeNode[]): TWTypeNode[] {
  const out: TWTypeNode[] = [];
  for (const t of types) {
    if (isUnion(t)) out.push(...flattenUnion(t.members!));
    else out.push(t);
  }
  return out;
}

function flattenIntersection(types: TWTypeNode[]): TWTypeNode[] {
  const out: TWTypeNode[] = [];
  for (const t of types) {
    if (isIntersection(t)) out.push(...flattenIntersection(t.members!));
    else out.push(t);
  }
  return out;
}

function mergeObjectTypes(types: TWTypeNode[]): TWTypeNode {
  const merged = new Map<string, PropertySig>();
  for (const t of types) {
    if (t.properties) {
      for (const [key, prop] of t.properties) {
        merged.set(key, prop);
      }
    }
  }
  return { kind: "object", properties: merged };
}

function dedupTypes(types: TWTypeNode[]): TWTypeNode[] {
  const seen: TWTypeNode[] = [];
  for (const t of types) {
    let found = false;
    for (const s of seen) {
      if (typeEquals(t, s)) { found = true; break; }
    }
    if (!found) seen.push(t);
  }
  return seen;
}

export function typeEquals(a: TWTypeNode, b: TWTypeNode): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;

  switch (a.kind) {
    case "primitive":
      return a.name === b.name;

    case "literal":
      return a.value === b.value && typeof a.value === typeof b.value;

    case "union":
    case "intersection":
      if (!a.members || !b.members) return false;
      if (a.members.length !== b.members.length) return false;
      return a.members.every(m => b.members!.some(n => typeEquals(m, n)));

    case "array":
      if (!a.elements || !b.elements) return false;
      return typeEquals(a.elements[0], b.elements[0]);

    case "tuple":
      if (!a.elements || !b.elements) return false;
      if (a.elements.length !== b.elements.length) return false;
      return a.elements.every((e, i) => typeEquals(e, b.elements![i]));

    case "object":
      if (!a.properties || !b.properties) return false;
      if (a.properties.size !== b.properties.size) return false;
      for (const [key, prop] of a.properties) {
        const other = b.properties.get(key);
        if (!other) return false;
        if (prop.optional !== other.optional) return false;
        if (!typeEquals(prop.type, other.type)) return false;
      }
      return true;

    case "function":
      if (!a.sig || !b.sig) return false;
      if (a.sig.params.length !== b.sig.params.length) return false;
      if (!typeEquals(a.sig.returnType, b.sig.returnType)) return false;
      return a.sig.params.every((p, i) =>
        typeEquals(p.type, b.sig!.params[i].type)
      );

    case "reference":
      return a.refName === b.refName;

    case "conditional":
      return typeEquals(a.checkType!, b.checkType!) &&
             typeEquals(a.extendsType!, b.extendsType!) &&
             typeEquals(a.trueType!, b.trueType!) &&
             typeEquals(a.falseType!, b.falseType!);

    default:
      return false;
  }
}

// --- Type Pretty Printing ---------------------------------------------

export function typeToString(t: TWTypeNode): string {
  if (!t) return "unknown";

  switch (t.kind) {
    case "primitive":
      return t.name ?? "unknown";

    case "literal":
      if (typeof t.value === "string") return `"${t.value}"`;
      if (t.value === null) return "null";
      return String(t.value);

    case "union":
      if (!t.members) return "unknown";
      return t.members.map(typeToString).join(" | ");

    case "intersection":
      if (!t.members) return "unknown";
      return t.members.map(typeToString).join(" & ");

    case "array":
      if (!t.elements?.[0]) return "unknown[]";
      return `${typeToString(t.elements[0])}[]`;

    case "tuple":
      if (!t.elements) return "[]";
      return `[${t.elements.map(typeToString).join(", ")}]`;

    case "object":
      if (!t.properties || t.properties.size === 0) return "{}";
      const props: string[] = [];
      for (const [key, prop] of t.properties) {
        const ro = prop.readonly ? "readonly " : "";
        const opt = prop.optional ? "?" : "";
        props.push(`${ro}${key}${opt}: ${typeToString(prop.type)}`);
      }
      return `{ ${props.join("; ")} }`;

    case "function":
      if (!t.sig) return "() => unknown";
      const params = t.sig.params.map(p =>
        `${p.name}${p.optional ? "?" : ""}: ${typeToString(p.type)}`
      );
      if (t.sig.restParam) {
        params.push(`...${t.sig.restParam.name}: ${typeToString(t.sig.restParam.type)}[]`);
      }
      const asyncKw = t.sig.isAsync ? "async " : "";
      const genKw = t.sig.isGenerator ? "*" : "";
      return `${asyncKw}(${params.join(", ")})${genKw} => ${typeToString(t.sig.returnType)}`;

    case "generic":
      if (!t.typeArgs || t.typeArgs.length === 0) return t.refName ?? "unknown";
      return `${t.refName}<${t.typeArgs.map(typeToString).join(", ")}>`;

    case "conditional":
      return `${typeToString(t.checkType)} extends ${typeToString(t.extendsType)} ? ${typeToString(t.trueType)} : ${typeToString(t.falseType)}`;

    case "mapped":
      return `{ [K in ${typeToString(t.mappedConstraint!)}]: ${typeToString(t.mappedValue!)} }`;

    case "template":
      if (!t.parts) return "``";
      return "`" + t.parts.map(p => p.isLiteral ? p.text : "${" + typeToString(p.exprType!) + "}") + "`";

    case "reference":
      return t.refName ?? "unknown";

    case "component":
      return `Component<${t.refName ?? ""}>`;

    case "element":
      return `Element<${t.refName ?? ""}>`;

    default:
      return "unknown";
  }
}

// --- Type Inference Helpers --------------------------------------------

/**
 * Infer the type of a value at runtime.
 * This is the JS-level typeof, used for fallback inference.
 */
export function inferFromValue(value: unknown): TWTypeNode {
  if (value === null) return NULL;
  if (value === undefined) return UNDEFINED;
  if (typeof value === "string") return stringLiteral(value);
  if (typeof value === "number") return numberLiteral(value);
  if (typeof value === "boolean") return booleanLiteral(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return arrayType(UNKNOWN);
    const elemTypes = value.map(inferFromValue);
    return arrayType(elemTypes.reduce((a, b) => unifyTypes(a, b)));
  }
  if (typeof value === "object") {
    const props: PropertySig[] = [];
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      props.push({
        name: key,
        type: inferFromValue(val),
        optional: false,
        readonly: false,
      });
    }
    return objectType(props);
  }
  if (typeof value === "function") {
    return functionType([], UNKNOWN);
  }
  return UNKNOWN;
}

/**
 * Get the common supertype of a list of types.
 * Used for array element inference and switch expression handling.
 */
export function getCommonSupertype(types: TWTypeNode[]): TWTypeNode {
  if (types.length === 0) return NEVER;
  if (types.length === 1) return types[0];
  return types.reduce((acc, t) => unifyTypes(acc, t));
}

/**
 * Check if a type is definitely truthy or falsy.
 * Returns null if it can't be determined.
 */
export function getTruthiness(t: TWTypeNode): boolean | null {
  if (isNever(t)) return null;
  if (isNull(t) || isUndefined(t)) return false;
  if (isLiteral(t)) {
    if (t.value === false || t.value === 0 || t.value === "") return false;
    return true;
  }
  if (isPrimitive(t)) {
    if (t.name === "boolean") return null;
    if (t.name === "string" || t.name === "number") return null;
    return true;
  }
  if (isUnion(t)) {
    const truths = t.members!.map(getTruthiness);
    if (truths.every(v => v === true)) return true;
    if (truths.every(v => v === false)) return false;
    return null;
  }
  return null;
}

/**
 * Check if a type has a property with the given name.
 */
export function hasProperty(t: TWTypeNode, propName: string): boolean {
  if (isObject(t) && t.properties) {
    return t.properties.has(propName);
  }
  if (isIntersection(t)) {
    return t.members!.some(m => hasProperty(m, propName));
  }
  return false;
}

/**
 * Get the type of a property on an object type.
 */
export function getPropertyType(t: TWTypeNode, propName: string): TWTypeNode | null {
  if (isObject(t) && t.properties) {
    const prop = t.properties.get(propName);
    return prop ? prop.type : null;
  }
  if (isIntersection(t)) {
    for (const m of t.members!) {
      const pt = getPropertyType(m, propName);
      if (pt) return pt;
    }
  }
  return null;
}

/**
 * Substitute type parameters with actual type arguments.
 * Used for generic instantiation.
 */
export function substituteTypeParams(
  type: TWTypeNode,
  substitutions: Map<string, TWTypeNode>
): TWTypeNode {
  // Check if this is a type param reference
  if (isReference(type) && substitutions.has(type.refName!)) {
    return substitutions.get(type.refName!)!;
  }

  switch (type.kind) {
    case "array":
      return arrayType(substituteTypeParams(type.elements![0], substitutions));

    case "tuple":
      return tupleType(type.elements!.map(e => substituteTypeParams(e, substitutions)));

    case "union":
      return unionType(type.members!.map(m => substituteTypeParams(m, substitutions)));

    case "intersection":
      return intersectionType(type.members!.map(m => substituteTypeParams(m, substitutions)));

    case "object":
      if (!type.properties) return type;
      const newProps = new Map<string, PropertySig>();
      for (const [key, prop] of type.properties) {
        newProps.set(key, {
          ...prop,
          type: substituteTypeParams(prop.type, substitutions),
        });
      }
      return { kind: "object", properties: newProps };

    case "function":
      if (!type.sig) return type;
      return {
        kind: "function",
        sig: {
          params: type.sig.params.map(p => ({
            ...p,
            type: substituteTypeParams(p.type, substitutions),
          })),
          returnType: substituteTypeParams(type.sig.returnType, substitutions),
          restParam: type.sig.restParam
            ? { ...type.sig.restParam, type: substituteTypeParams(type.sig.restParam.type, substitutions) }
            : null,
          thisType: type.sig.thisType
            ? substituteTypeParams(type.sig.thisType, substitutions)
            : null,
          isAsync: type.sig.isAsync,
          isGenerator: type.sig.isGenerator,
        },
      };

    case "generic":
      if (!type.typeArgs) return type;
      return {
        ...type,
        typeArgs: type.typeArgs.map(a => substituteTypeParams(a, substitutions)),
      };

    case "conditional":
      return conditionalType(
        substituteTypeParams(type.checkType!, substitutions),
        substituteTypeParams(type.extendsType!, substitutions),
        substituteTypeParams(type.trueType!, substitutions),
        substituteTypeParams(type.falseType!, substitutions)
      );

    default:
      return type;
  }
}

// --- Built-in Types ----------------------------------------------------

export const BUILTIN_TYPES: Record<string, TWTypeNode> = {
  string: STRING,
  number: NUMBER,
  boolean: BOOLEAN,
  null: NULL,
  undefined: UNDEFINED,
  void: VOID,
  never: NEVER,
  any: ANY,
  unknown: UNKNOWN,
  object: OBJECT,
  bigint: BIGINT,
  symbol: SYMBOL,
  Array: arrayType(UNKNOWN),
  Promise: genericType("Promise", [{ name: "T", constraint: null, defaultType: null }], [UNKNOWN]),
  Record: genericType("Record", [
    { name: "K", constraint: STRING, defaultType: null },
    { name: "V", constraint: null, defaultType: null },
  ]),
  Partial: genericType("Partial", [{ name: "T", constraint: null, defaultType: null }]),
  Required: genericType("Required", [{ name: "T", constraint: null, defaultType: null }]),
  Readonly: genericType("Readonly", [{ name: "T", constraint: null, defaultType: null }]),
  Pick: genericType("Pick", [
    { name: "T", constraint: null, defaultType: null },
    { name: "K", constraint: STRING, defaultType: null },
  ]),
  Omit: genericType("Omit", [
    { name: "T", constraint: null, defaultType: null },
    { name: "K", constraint: STRING, defaultType: null },
  ]),
  Exclude: genericType("Exclude", [
    { name: "U", constraint: null, defaultType: null },
    { name: "V", constraint: null, defaultType: null },
  ]),
  Extract: genericType("Extract", [
    { name: "U", constraint: null, defaultType: null },
    { name: "V", constraint: null, defaultType: null },
  ]),
  NonNullable: genericType("NonNullable", [{ name: "T", constraint: null, defaultType: null }]),
  ReturnType: genericType("ReturnType", [{ name: "T", constraint: null, defaultType: null }]),
  Parameters: genericType("Parameters", [{ name: "T", constraint: null, defaultType: null }]),
  ReadonlyArray: genericType("ReadonlyArray", [{ name: "T", constraint: null, defaultType: null }]),
  Map: genericType("Map", [
    { name: "K", constraint: null, defaultType: null },
    { name: "V", constraint: null, defaultType: null },
  ]),
  Set: genericType("Set", [{ name: "T", constraint: null, defaultType: null }]),
  Error: objectType([
    { name: "message", type: STRING, optional: false, readonly: true },
    { name: "name", type: STRING, optional: false, readonly: true },
    { name: "stack", type: unionType([STRING, UNDEFINED]), optional: true, readonly: true },
  ]),
};

// --- Error Type Helpers ------------------------------------------------

export function createTypeMismatchError(
  expected: TWTypeNode,
  actual: TWTypeNode,
  context: string
): string {
  return `Type '${typeToString(actual)}' is not assignable to type '${typeToString(expected)}'${context ? ` in ${context}` : ""}`;
}

export function isNumericLiteral(s: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(s) || /^0x[0-9a-fA-F]+$/.test(s) || /^0b[01]+$/.test(s) || /^0o[0-7]+$/.test(s);
}

export function isStringLiteralValue(s: string): boolean {
  return (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"));
}
