/**
 * Deep type inference engine -- infers types from AST nodes, expressions,
 * and control flow. Handles contextual typing, best common type,
 * contextual signatures, and flow-based narrowing.
 *
 * This is the real workhorse of the semantic analysis phase. It walks
 * the AST and assigns types to every node, tracking how types flow
 * through the program.
 */

import type { ASTNode, Program } from "../ast/nodes";
import {
  STRING, NUMBER, BOOLEAN, NULL, UNDEFINED, ANY, UNKNOWN, NEVER, VOID,
  arrayType, unionType, objectType, functionType,
  stringLiteral, numberLiteral, booleanLiteral,
  type TWTypeNode, type PropertySig, type ParamSig,
  isAssignableTo, unifyTypes, widenType, typeToString,
  genericType, tupleType,
} from "./type-system-deep";
import {
  buildScopeTree, lookup, type Scope,
} from "./scope-deep";

// --- Inference Context -----------------------------------------------

export interface InferenceContext {
  scope: Scope;
  // Type environment: variable name -> inferred type
  typeEnv: Map<string, TWTypeNode>;
  // Return type stack for function inference
  returnTypeStack: TWTypeNode[];
  // Current contextual type (what type is expected here)
  contextualType: TWTypeNode | null;
  // Generic type parameter substitutions
  typeSubst: Map<string, TWTypeNode>;
  // Diagnostics
  diagnostics: InferenceDiagnostic[];
  // Cache: node -> type (memoized)
  typeCache: Map<ASTNode, TWTypeNode>;
  // Flow type: variable name -> narrowed type in current branch
  flowTypes: Map<string, TWTypeNode>;
  // Are we in a truthy branch?
  inTruthyBranch: boolean;
  // Are we in a falsy branch?
  inFalsyBranch: boolean;
  // Active narrowing conditions
  narrowing: Array<{ varName: string; type: TWTypeNode }>;
}

export interface InferenceDiagnostic {
  message: string;
  line: number;
  col: number;
  code: string;
  severity: "error" | "warning" | "info";
  expected?: string;
  actual?: string;
}

export function createInferenceContext(scope: Scope): InferenceContext {
  return {
    scope,
    typeEnv: new Map(),
    returnTypeStack: [],
    contextualType: null,
    typeSubst: new Map(),
    diagnostics: [],
    typeCache: new Map(),
    flowTypes: new Map(),
    inTruthyBranch: false,
    inFalsyBranch: false,
    narrowing: [],
  };
}

// --- Main Inference Function ------------------------------------------

/**
 * Infer types for an entire program.
 * Returns the inference context with all types and diagnostics.
 */
export function inferProgram(program: Program): InferenceContext {
  const scope = buildScopeTree(program);
  const ctx = createInferenceContext(scope);

  // First pass: collect type annotations from directives
  for (const directive of (program as any).directives || []) {
    inferDirective(directive, ctx);
  }

  // Second pass: infer types for body
  for (const node of program.body) {
    inferNode(node, ctx);
  }

  // Third pass: propagate types through scope
  propagateTypes(ctx);

  return ctx;
}

/**
 * Infer the type of a single AST node.
 * This is the core inference function -- dispatches based on node type.
 */
export function inferNode(node: ASTNode, ctx: InferenceContext): TWTypeNode {
  if (!node) return UNKNOWN;

  // Check cache
  const cached = ctx.typeCache.get(node);
  if (cached) return cached;

  const nodeType = (node as any).type;
  let result: TWTypeNode;

  switch (nodeType) {
    // Literals
    case "Text":
      result = STRING;
      break;

    case "Literal":
    case "StringLiteral":
      result = stringLiteral((node as any).value);
      break;

    case "NumberLiteral":
      result = numberLiteral(Number((node as any).value));
      break;

    case "BooleanLiteral":
      result = booleanLiteral((node as any).value === "true" || (node as any).value === true);
      break;

    case "NullLiteral":
      result = NULL;
      break;

    case "UndefinedLiteral":
      result = UNDEFINED;
      break;

    // Structural types
    case "Element":
      result = inferElement(node as unknown, ctx);
      break;

    case "Component":
      result = inferComponent(node as unknown, ctx);
      break;

    case "Fragment":
      result = inferFragment(node as unknown, ctx);
      break;

    case "Slot":
      result = inferSlot(node as unknown, ctx);
      break;

    // Control flow
    case "If":
      result = inferIf(node as unknown, ctx);
      break;

    case "For":
      result = inferFor(node as unknown, ctx);
      break;

    case "While":
      result = inferWhile(node as unknown, ctx);
      break;

    case "Switch":
      result = inferSwitch(node as unknown, ctx);
      break;

    // Expressions
    case "BinaryExpr":
    case "BinaryExpression":
      result = inferBinaryExpr(node as unknown, ctx);
      break;

    case "UnaryExpr":
    case "UnaryExpression":
      result = inferUnaryExpr(node as unknown, ctx);
      break;

    case "LogicalExpr":
    case "LogicalExpression":
      result = inferLogicalExpr(node as unknown, ctx);
      break;

    case "ConditionalExpr":
    case "ConditionalExpression":
      result = inferConditionalExpr(node as unknown, ctx);
      break;

    case "CallExpr":
    case "CallExpression":
      result = inferCallExpr(node as unknown, ctx);
      break;

    case "MemberExpr":
    case "MemberExpression":
      result = inferMemberExpr(node as unknown, ctx);
      break;

    case "ArrayExpr":
    case "ArrayExpression":
      result = inferArrayExpr(node as unknown, ctx);
      break;

    case "ObjectExpr":
    case "ObjectExpression":
      result = inferObjectExpr(node as unknown, ctx);
      break;

    case "ArrowFn":
    case "ArrowFunction":
      result = inferArrowFn(node as unknown, ctx);
      break;

    case "Identifier":
      result = inferIdentifier(node as unknown, ctx);
      break;

    case "TemplateLiteral":
      result = inferTemplateLiteral(node as unknown, ctx);
      break;

    case "Spread":
    case "SpreadElement":
      result = inferSpread(node as unknown, ctx);
      break;

    case "AwaitExpr":
      result = inferAwaitExpr(node as unknown, ctx);
      break;

    case "YieldExpr":
      result = inferYieldExpr(node as unknown, ctx);
      break;

    case "NewExpr":
    case "NewExpression":
      result = inferNewExpr(node as unknown, ctx);
      break;

    case "AssignmentExpr":
    case "AssignmentExpression":
      result = inferAssignmentExpr(node as unknown, ctx);
      break;

    case "SequenceExpr":
    case "SequenceExpression":
      result = inferSequenceExpr(node as unknown, ctx);
      break;

    // Directives
    case "StateDirective":
      result = inferStateDirective(node as unknown, ctx);
      break;

    case "ImportDirective":
      result = inferImportDirective(node as unknown, ctx);
      break;

    case "ScriptDirective":
    case "ScriptBlock":
      result = UNKNOWN;
      break;

    case "StyleDirective":
    case "StyleBlock":
      result = STRING;
      break;

    default:
      // Try to extract a type from the node directly
      if ((node as any).dataType) {
        result = parseDataType((node as any).dataType);
      } else if ((node as any).value !== undefined) {
        result = inferFromJSValue((node as any).value);
      } else {
        result = UNKNOWN;
      }
  }

  // Cache the result
  ctx.typeCache.set(node, result);
  return result;
}

// --- Element & Component Inference ------------------------------------

function inferElement(node: any, ctx: InferenceContext): TWTypeNode {
  const props: PropertySig[] = [];

  for (const attr of node.attrs || []) {
    const attrType = attr.isInterpolated
      ? inferExpressionString(String(attr.value), ctx)
      : STRING;
    props.push({
      name: attr.name,
      type: attrType,
      optional: attr.value === undefined,
      readonly: true,
    });
  }

  for (const binding of node.bindings || []) {
    const bindType = inferExpressionString(binding.expression, ctx);
    props.push({
      name: binding.property,
      type: bindType,
      optional: false,
      readonly: false,
    });
  }

  // Infer children types
  const childTypes: TWTypeNode[] = [];
  for (const child of node.children || []) {
    childTypes.push(inferNode(child, ctx));
  }

  return {
    kind: "element",
    refName: node.tag,
    properties: new Map(props.map(p => [p.name, p])),
    originNode: node,
  };
}

function inferComponent(node: any, ctx: InferenceContext): TWTypeNode {
  const propTypes: PropertySig[] = [];

  for (const prop of node.props || []) {
    let propType: TWTypeNode;
    if (prop.value !== undefined) {
      propType = inferFromJSValue(prop.value);
    } else if (prop.dataType) {
      propType = parseDataType(prop.dataType);
    } else {
      propType = UNKNOWN;
    }
    propTypes.push({
      name: prop.name,
      type: propType,
      optional: prop.value === undefined,
      readonly: false,
    });
  }

  // Check if the component is registered
  const binding = lookup(ctx.scope, node.name);
  if (binding) {
    binding.references.push({
      line: node.line ?? 0,
      col: node.col ?? 0,
      kind: "call",
    });
  }

  return {
    kind: "component",
    refName: node.name,
    properties: new Map(propTypes.map(p => [p.name, p])),
    originNode: node,
  };
}

function inferFragment(node: any, ctx: InferenceContext): TWTypeNode {
  const childTypes: TWTypeNode[] = [];
  for (const child of node.children || []) {
    childTypes.push(inferNode(child, ctx));
  }
  return unionType(childTypes);
}

function inferSlot(node: any, ctx: InferenceContext): TWTypeNode {
  if (node.name) {
    const binding = lookup(ctx.scope, node.name);
    if (binding) {
      binding.references.push({
        line: node.line ?? 0,
        col: node.col ?? 0,
        kind: "read",
      });
    }
  }
  return UNKNOWN;
}

// --- Control Flow Inference -------------------------------------------

function inferIf(node: any, ctx: InferenceContext): TWTypeNode {
  // Infer condition type (should be truthy/falsy)
  const condType = inferExpressionString(String(node.condition || ""), ctx);

  // Save flow state
  const savedFlow = new Map(ctx.flowTypes);
  const savedTruthy = ctx.inTruthyBranch;
  const savedFalsy = ctx.inFalsyBranch;

  // In the if-branch, narrow types based on condition
  ctx.inTruthyBranch = true;
  applyNarrowing(node.condition, ctx, true);

  const ifTypes: TWTypeNode[] = [];
  for (const child of node.body || []) {
    ifTypes.push(inferNode(child, ctx));
  }

  // In the else-branch, narrow types inversely
  ctx.inTruthyBranch = false;
  ctx.inFalsyBranch = true;
  ctx.flowTypes = new Map(savedFlow);
  applyNarrowing(node.condition, ctx, false);

  const elseTypes: TWTypeNode[] = [];
  for (const child of node.elseBody || []) {
    elseTypes.push(inferNode(child, ctx));
  }

  // Restore flow state
  ctx.flowTypes = savedFlow;
  ctx.inTruthyBranch = savedTruthy;
  ctx.inFalsyBranch = savedFalsy;

  // Result is union of both branches
  const allTypes = [...ifTypes, ...elseTypes];
  if (allTypes.length === 0) return VOID;
  return unionType(allTypes);
}

function inferFor(node: any, ctx: InferenceContext): TWTypeNode {
  // Infer iterable type
  const iterableType = inferExpressionString(String(node.iterable || ""), ctx);

  // Set loop variable type
  if (node.varName) {
    let elemType = UNKNOWN;
    // If iterable is an array, get element type
    if (iterableType.kind === "array" && iterableType.elements?.[0]) {
      elemType = iterableType.elements[0];
    } else if (iterableType.kind === "primitive" && iterableType.name === "string") {
      elemType = STRING; // iterating string gives chars
    }
    ctx.typeEnv.set(node.varName, elemType);

    const binding = lookup(ctx.scope, node.varName);
    if (binding) binding.type = typeToString(elemType);
  }

  if (node.indexName) {
    ctx.typeEnv.set(node.indexName, NUMBER);
  }

  // Infer body
  const bodyTypes: TWTypeNode[] = [];
  for (const child of node.body || []) {
    bodyTypes.push(inferNode(child, ctx));
  }

  return arrayType(unionType(bodyTypes));
}

function inferWhile(node: any, ctx: InferenceContext): TWTypeNode {
  inferExpressionString(String(node.condition || ""), ctx);

  const bodyTypes: TWTypeNode[] = [];
  for (const child of node.body || []) {
    bodyTypes.push(inferNode(child, ctx));
  }

  return arrayType(unionType(bodyTypes));
}

function inferSwitch(node: any, ctx: InferenceContext): TWTypeNode {
  const discriminantType = inferExpressionString(String(node.discriminant || ""), ctx);

  const caseTypes: TWTypeNode[] = [];
  for (const caseNode of node.cases || []) {
    if (caseNode.test) {
      inferExpressionString(String(caseNode.test), ctx);
    }
    for (const child of caseNode.body || []) {
      caseTypes.push(inferNode(child, ctx));
    }
  }

  return unionType(caseTypes);
}

// --- Expression Inference ----------------------------------------------

function inferBinaryExpr(node: any, ctx: InferenceContext): TWTypeNode {
  const left = inferNode(node.left, ctx);
  const right = inferNode(node.right, ctx);
  const op = node.operator;

  // Arithmetic operators
  if (["+", "-", "*", "/", "%", "**"].includes(op)) {
    // Special case: string + anything = string
    if (op === "+") {
      if (isAssignableTo(left, STRING) || isAssignableTo(right, STRING)) {
        return STRING;
      }
    }
    return NUMBER;
  }

  // Comparison operators
  if (["==", "===", "!=", "!==", "<", ">", "<=", ">="].includes(op)) {
    return BOOLEAN;
  }

  // Bitwise operators
  if (["&", "|", "^", "<<", ">>", ">>>"].includes(op)) {
    return NUMBER;
  }

  // Nullish coalescing
  if (op === "??" || op === "||" || op === "&&") {
    return unifyTypes(left, right);
  }

  // Instanceof
  if (op === "instanceof") {
    return BOOLEAN;
  }

  // In
  if (op === "in") {
    return BOOLEAN;
  }

  return UNKNOWN;
}

function inferUnaryExpr(node: any, ctx: InferenceContext): TWTypeNode {
  const operand = inferNode(node.operand || node.argument, ctx);
  const op = node.operator;

  if (op === "!") return BOOLEAN;
  if (op === "-" || op === "+") return NUMBER;
  if (op === "~") return NUMBER;
  if (op === "typeof") return STRING;
  if (op === "void") return UNDEFINED;
  if (op === "delete") return BOOLEAN;

  return UNKNOWN;
}

function inferLogicalExpr(node: any, ctx: InferenceContext): TWTypeNode {
  const left = inferNode(node.left, ctx);
  const right = inferNode(node.right, ctx);
  const op = node.operator;

  if (op === "&&") {
    // false & T -> false, true & T -> T
    if (isDefinitelyFalsy(left)) return left;
    if (isDefinitelyTruthy(left)) return right;
    return unionType([left, right]);
  }

  if (op === "||") {
    if (isDefinitelyTruthy(left)) return left;
    if (isDefinitelyFalsy(left)) return right;
    return unionType([left, right]);
  }

  if (op === "??") {
    // null/undefined on left -> right, else left
    return unionType([left, right]);
  }

  return BOOLEAN;
}

function inferConditionalExpr(node: any, ctx: InferenceContext): TWTypeNode {
  inferNode(node.test || node.condition, ctx);
  const consequent = inferNode(node.consequent || node.body, ctx);
  const alternate = node.alternate ? inferNode(node.alternate, ctx) : UNDEFINED;
  return unifyTypes(consequent, alternate);
}

function inferCallExpr(node: any, ctx: InferenceContext): TWTypeNode {
  const callee = inferNode(node.callee, ctx);

  // Infer argument types
  for (const arg of node.arguments || []) {
    inferNode(arg, ctx);
  }

  // If callee is a function, return its return type
  if (callee.kind === "function" && callee.sig) {
    return callee.sig.returnType;
  }

  // If it's a known function from typeEnv
  if (node.callee?.type === "Identifier") {
    const name = node.callee.name;
    // Built-in functions
    if (BUILTIN_FN_RETURN.has(name)) {
      return BUILTIN_FN_RETURN.get(name)!;
    }
    // Check type environment
    const envType = ctx.typeEnv.get(name);
    if (envType?.kind === "function" && envType.sig) {
      return envType.sig.returnType;
    }
    // Check binding
    const binding = lookup(ctx.scope, name);
    if (binding) {
      binding.references.push({
        line: node.line ?? 0,
        col: node.col ?? 0,
        kind: "call",
      });
    }
  }

  return UNKNOWN;
}

function inferMemberExpr(node: any, ctx: InferenceContext): TWTypeNode {
  const obj = inferNode(node.object, ctx);

  // Property access
  if (node.computed) {
    // obj[expr] -- need to infer expr type
    inferNode(node.property, ctx);
    if (obj.kind === "array" && obj.elements?.[0]) {
      return obj.elements[0];
    }
    if (obj.kind === "tuple" && obj.elements && typeof node.property?.value === "number") {
      const idx = node.property.value;
      if (idx >= 0 && idx < obj.elements.length) {
        return obj.elements[idx];
      }
    }
    return UNKNOWN;
  }

  // Named property access
  const propName = node.property?.name ?? node.property?.value;
  if (typeof propName === "string") {
    if (obj.kind === "object" && obj.properties) {
      const prop = obj.properties.get(propName);
      if (prop) return prop.type;
    }
    // Check built-in properties
    if (obj.kind === "primitive" || obj.kind === "array") {
      const builtin = getBuiltinProperty(obj, propName);
      if (builtin) return builtin;
    }
  }

  return UNKNOWN;
}

function inferArrayExpr(node: any, ctx: InferenceContext): TWTypeNode {
  const elementTypes: TWTypeNode[] = [];
  for (const elem of node.elements || []) {
    if (elem === null || elem === undefined) continue;
    if (elem.type === "Spread" || elem.type === "SpreadElement") {
      const spreadType = inferNode(elem.argument || elem.value, ctx);
      if (spreadType.kind === "array" && spreadType.elements?.[0]) {
        elementTypes.push(spreadType.elements[0]);
      }
    } else {
      elementTypes.push(inferNode(elem, ctx));
    }
  }

  if (elementTypes.length === 0) return arrayType(UNKNOWN);

  const elemType = elementTypes.reduce((a, b) => unifyTypes(a, b));
  return arrayType(elemType);
}

function inferObjectExpr(node: any, ctx: InferenceContext): TWTypeNode {
  const props: PropertySig[] = [];

  for (const prop of node.properties || []) {
    if (prop.type === "Spread" || prop.type === "SpreadElement") {
      const spreadType = inferNode(prop.argument || prop.value, ctx);
      if (spreadType.kind === "object" && spreadType.properties) {
        for (const [key, p] of spreadType.properties) {
          props.push({ ...p });
        }
      }
      continue;
    }

    const key = prop.key?.name ?? prop.key?.value ?? prop.key;
    if (typeof key !== "string") continue;

    const valueType = prop.value
      ? inferNode(prop.value, ctx)
      : UNKNOWN;

    props.push({
      name: key,
      type: valueType,
      optional: false,
      readonly: false,
    });
  }

  return objectType(props);
}

function inferArrowFn(node: any, ctx: InferenceContext): TWTypeNode {
  const params: ParamSig[] = [];

  for (const param of node.params || []) {
    const paramName = param.name ?? param;
    const paramType = param.dataType
      ? parseDataType(param.dataType)
      : UNKNOWN;
    params.push({
      name: String(paramName),
      type: paramType,
      optional: param.optional ?? false,
      defaultValue: param.default !== undefined,
    });
  }

  // Infer return type from body
  let returnType: TWTypeNode;
  if (node.body) {
    if (Array.isArray(node.body)) {
      const types = node.body.map((n: ASTNode) => inferNode(n, ctx));
      returnType = types.length > 0 ? unionType(types) : VOID;
    } else {
      returnType = inferNode(node.body, ctx);
    }
  } else {
    returnType = VOID;
  }

  return functionType(params, returnType, {
    isAsync: node.async ?? false,
    isGenerator: node.generator ?? false,
  });
}

function inferIdentifier(node: any, ctx: InferenceContext): TWTypeNode {
  const name = node.name;

  // Check flow types (narrowed types) first
  const flowType = ctx.flowTypes.get(name);
  if (flowType) return flowType;

  // Check type environment
  const envType = ctx.typeEnv.get(name);
  if (envType) return envType;

  // Check scope bindings
  const binding = lookup(ctx.scope, name);
  if (binding) {
    binding.references.push({
      line: node.line ?? 0,
      col: node.col ?? 0,
      kind: "read",
    });
    return parseDataType(binding.type);
  }

  // Built-in globals
  if (GLOBAL_TYPES.has(name)) {
    return GLOBAL_TYPES.get(name)!;
  }

  return UNKNOWN;
}

function inferTemplateLiteral(node: any, ctx: InferenceContext): TWTypeNode {
  // Template literals always produce strings, but we check expressions
  for (const expr of node.expressions || []) {
    inferNode(expr, ctx);
  }
  return STRING;
}

function inferSpread(node: any, ctx: InferenceContext): TWTypeNode {
  const inner = inferNode(node.argument || node.value, ctx);
  if (inner.kind === "array" && inner.elements?.[0]) {
    return inner.elements[0];
  }
  return inner;
}

function inferAwaitExpr(node: any, ctx: InferenceContext): TWTypeNode {
  const arg = inferNode(node.argument, ctx);
  // If arg is Promise<T>, unwrap to T
  if (arg.kind === "generic" && arg.refName === "Promise" && arg.typeArgs?.[0]) {
    return arg.typeArgs[0];
  }
  return arg;
}

function inferYieldExpr(node: any, ctx: InferenceContext): TWTypeNode {
  if (node.argument) {
    return inferNode(node.argument, ctx);
  }
  return VOID;
}

function inferNewExpr(node: any, ctx: InferenceContext): TWTypeNode {
  // new Constructor() -- return an instance type
  const callee = inferNode(node.callee, ctx);
  for (const arg of node.arguments || []) {
    inferNode(arg, ctx);
  }
  if (callee.kind === "reference" && callee.refName) {
    return { kind: "reference", refName: callee.refName };
  }
  return objectType([]);
}

function inferAssignmentExpr(node: any, ctx: InferenceContext): TWTypeNode {
  const left = inferNode(node.left, ctx);
  const right = inferNode(node.right, ctx);
  // Check assignability
  if (!isAssignableTo(right, left)) {
    ctx.diagnostics.push({
      message: `Type '${typeToString(right)}' is not assignable to type '${typeToString(left)}'`,
      line: node.line ?? 0,
      col: node.col ?? 0,
      code: "TW040",
      severity: "warning",
      expected: typeToString(left),
      actual: typeToString(right),
    });
  }
  return right;
}

function inferSequenceExpr(node: any, ctx: InferenceContext): TWTypeNode {
  let last: TWTypeNode = VOID;
  for (const expr of node.expressions || []) {
    last = inferNode(expr, ctx);
  }
  return last;
}

// --- Directive Inference ----------------------------------------------

function inferDirective(node: any, ctx: InferenceContext): void {
  switch (node.type) {
    case "StateDirective":
      inferStateDirective(node, ctx);
      break;
    case "ImportDirective":
      inferImportDirective(node, ctx);
      break;
    case "ExportDirective":
      for (const item of node.items || []) {
        const name = typeof item === "string" ? item : item.name;
        const t = ctx.typeEnv.get(name);
        if (t) ctx.typeEnv.set(name, t);
      }
      break;
      default:
        break;

  }
}

function inferStateDirective(node: any, ctx: InferenceContext): TWTypeNode {
  for (const decl of node.declarations || []) {
    let varType: TWTypeNode;
    if (decl.dataType) {
      varType = parseDataType(decl.dataType);
    } else if (decl.value !== undefined) {
      varType = inferFromJSValue(decl.value);
      // Widen literal types
      varType = widenType(varType);
    } else {
      varType = UNKNOWN;
    }

    if (decl.isComputed && decl.value) {
      // Computed property -- infer from expression
      const exprType = inferExpressionString(String(decl.value), ctx);
      varType = exprType;
    }

    ctx.typeEnv.set(decl.name, varType);

    const binding = lookup(ctx.scope, decl.name);
    if (binding) {
      binding.type = typeToString(varType);
    }
  }
  return VOID;
}

function inferImportDirective(node: any, ctx: InferenceContext): TWTypeNode {
  for (const item of node.items || []) {
    const name = typeof item === "string" ? item : item.name;
    // Imports start as unknown -- will be resolved when the module is checked
    ctx.typeEnv.set(name, UNKNOWN);
  }
  if (node.defaultImport) {
    ctx.typeEnv.set(node.defaultImport, UNKNOWN);
  }
  return VOID;
}

// --- Expression String Parsing ----------------------------------------

/**
 * Infer the type of an expression given as a string.
 * This is used for attribute bindings and interpolation expressions
 * where the expression is stored as a string rather than an AST.
 */
function inferExpressionString(expr: string, ctx: InferenceContext): TWTypeNode {
  if (!expr) return UNKNOWN;

  // Try to parse as a simple value first
  const trimmed = expr.trim();

  // Boolean literals
  if (trimmed === "true" || trimmed === "false") {
    return booleanLiteral(trimmed === "true");
  }

  // null/undefined
  if (trimmed === "null") return NULL;
  if (trimmed === "undefined") return UNDEFINED;

  // Number literals
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return numberLiteral(Number(trimmed));

  // Hex/Octal/Binary
  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return NUMBER;
  if (/^0o[0-7]+$/.test(trimmed)) return NUMBER;
  if (/^0b[01]+$/.test(trimmed)) return NUMBER;

  // String literals
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return stringLiteral(trimmed.slice(1, -1));
  }

  // Array literal
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return inferArrayString(trimmed, ctx);
  }

  // Object literal
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return inferObjectString(trimmed, ctx);
  }

  // Identifier -- look up in scope
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed)) {
    return inferIdentifier({ name: trimmed, line: 0, col: 0, type: "Identifier" }, ctx);
  }

  // Member access: a.b.c
  const memberMatch = trimmed?.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\.([a-zA-Z_$][a-zA-Z0-9_$]*)$/);
  if (memberMatch) {
    const objType = inferIdentifier({ name: memberMatch[1], line: 0, col: 0, type: "Identifier" }, ctx);
    if (objType.kind === "object" && objType.properties) {
      const prop = objType.properties.get(memberMatch[2]);
      if (prop) return prop.type;
    }
  }

  // Binary expression: check for comparison operators
  const compMatch = trimmed.match(/^(.+?)\s*(===|===|!==|!=|>=|<=|>|<)\s*(.+)$/);
  if (compMatch) {
    inferExpressionString(compMatch[1], ctx);
    inferExpressionString(compMatch[3], ctx);
    return BOOLEAN;
  }

  // Arithmetic
  const arithMatch = trimmed.match(/^(.+?)\s*([+\-*/%])\s*(.+)$/);
  if (arithMatch) {
    const left = inferExpressionString(arithMatch[1], ctx);
    const right = inferExpressionString(arithMatch[3], ctx);
    if (arithMatch[2] === "+" && (isAssignableTo(left, STRING) || isAssignableTo(right, STRING))) {
      return STRING;
    }
    return NUMBER;
  }

  // Logical operators
  if (trimmed.includes("&&") || trimmed.includes("||") || trimmed.includes("??")) {
    // Split and infer each part
    const parts = trimmed.split(/\s*(?:&&|\|\||\?\?)\s*/);
    for (const part of parts) {
      inferExpressionString(part, ctx);
    }
    return BOOLEAN;
  }

  // Ternary: cond ? a : b
  const ternaryMatch = trimmed.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
  if (ternaryMatch) {
    inferExpressionString(ternaryMatch[1], ctx);
    const trueType = inferExpressionString(ternaryMatch[2], ctx);
    const falseType = inferExpressionString(ternaryMatch[3], ctx);
    return unifyTypes(trueType, falseType);
  }

  // Function call
  const callMatch = trimmed?.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\((.*)\)$/);
  if (callMatch) {
    if (BUILTIN_FN_RETURN.has(callMatch[1])) {
      return BUILTIN_FN_RETURN.get(callMatch[1])!;
    }
    return UNKNOWN;
  }

  return UNKNOWN;
}

function inferArrayString(arrStr: string, ctx: InferenceContext): TWTypeNode {
  // Simple array parsing
  const inner = arrStr.slice(1, -1).trim();
  if (!inner) return arrayType(UNKNOWN);

  // Split by commas (naive -- doesn't handle nested arrays/objects)
  const elements = splitByComma(inner);
  const elemTypes = elements.map(e => inferExpressionString(e, ctx));
  if (elemTypes.length === 0) return arrayType(UNKNOWN);
  return arrayType(elemTypes.reduce((a, b) => unifyTypes(a, b)));
}

function inferObjectString(objStr: string, ctx: InferenceContext): TWTypeNode {
  const inner = objStr.slice(1, -1).trim();
  if (!inner) return objectType([]);

  const props: PropertySig[] = [];
  const pairs = splitByComma(inner);
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(":");
    if (colonIdx === -1) continue;
    const key = pair.slice(0, colonIdx).trim().replace(/["']/g, "");
    const valStr = pair.slice(colonIdx + 1).trim();
    const valType = inferExpressionString(valStr, ctx);
    props.push({ name: key, type: valType, optional: false, readonly: false });
  }

  return objectType(props);
}

function splitByComma(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of s) {
    if (ch === "[" || ch === "{" || ch === "(") depth++;
    if (ch === "]" || ch === "}" || ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// --- Flow-Based Narrowing ---------------------------------------------

function applyNarrowing(condition: any, ctx: InferenceContext, truthy: boolean): void {
  if (!condition) return;
  const condStr = String(condition);

  // typeof check: typeof x === "string"
  const typeofMatch = condStr.match(/typeof\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*===?\s*["'](\w+)["']/);
  if (typeofMatch) {
    const varName = typeofMatch[1];
    const typeName = typeofMatch[2];
    if (truthy) {
      ctx.flowTypes.set(varName, parseDataType(typeName));
    } else {
      // Remove the type from the variable
      ctx.flowTypes.delete(varName);
    }
    return;
  }

  // Equality check: x === value
  const eqMatch = condStr.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*===?\s*(.+)$/);
  if (eqMatch) {
    const varName = eqMatch[1];
    const valStr = eqMatch[2].trim();
    if (truthy) {
      const valType = inferExpressionString(valStr, ctx);
      ctx.flowTypes.set(varName, valType);
    }
    return;
  }

  // Truthiness check: just the variable name
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(condStr)) {
    if (truthy) {
      // Remove null/undefined from the type
      let current = ctx.flowTypes.get(condStr) ?? ctx.typeEnv.get(condStr);
      if (current) {
        const narrowed = narrowNonNull(current);
        ctx.flowTypes.set(condStr, narrowed);
      }
    }
    return;
  }
}

function narrowNonNull(t: TWTypeNode): TWTypeNode {
  if (t.kind === "union" && t.members) {
    const filtered = t.members.filter(m =>
      !(m.kind === "primitive" && (m.name === "null" || m.name === "undefined"))
    );
    if (filtered.length === 0) return NEVER;
    if (filtered.length === 1) return filtered[0];
    return { kind: "union", members: filtered };
  }
  return t;
}

// --- Type Propagation --------------------------------------------------

function propagateTypes(ctx: InferenceContext): void {
  // For each binding in scope, try to infer its type from references
  function walk(scope: Scope): void {
    for (const [name, binding] of scope.bindings) {
      if (binding.type === "any" || binding.type === "unknown") {
        const envType = ctx.typeEnv.get(name);
        if (envType) {
          binding.type = typeToString(envType);
        }
      }
    }
    for (const child of scope.children) {
      walk(child);
    }
  }
  walk(ctx.scope);
}

// --- Helpers ----------------------------------------------------------

function parseDataType(typeStr: string): TWTypeNode {
  if (!typeStr) return UNKNOWN;
  const t = typeStr.trim().toLowerCase();

  if (t === "string" || t === "str") return STRING;
  if (t === "number" || t === "num" || t === "int" || t === "float") return NUMBER;
  if (t === "boolean" || t === "bool") return BOOLEAN;
  if (t === "null") return NULL;
  if (t === "undefined") return UNDEFINED;
  if (t === "void") return VOID;
  if (t === "any") return ANY;
  if (t === "unknown") return UNKNOWN;
  if (t === "never") return NEVER;
  if (t === "object" || t === "record") return objectType([]);

  // Array type: T[]
  if (t.endsWith("[]")) {
    const elemType = parseDataType(t.slice(0, -2));
    return arrayType(elemType);
  }

  // Array<T>
  const arrayMatch = t.match(/^array<(.+)>$/);
  if (arrayMatch) return arrayType(parseDataType(arrayMatch[1]));

  // Union: A | B
  if (t.includes("|")) {
    const parts = t.split("|").map(s => s.trim());
    return unionType(parts.map(parseDataType));
  }

  return UNKNOWN;
}

function inferFromJSValue(value: any): TWTypeNode {
  if (value === null) return NULL;
  if (value === undefined) return UNDEFINED;
  if (typeof value === "string") return stringLiteral(value);
  if (typeof value === "number") return numberLiteral(value);
  if (typeof value === "boolean") return booleanLiteral(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return arrayType(UNKNOWN);
    const elemTypes = value.map(v => inferFromJSValue(v));
    return arrayType(elemTypes.reduce((a, b) => unifyTypes(a, b)));
  }
  if (typeof value === "object") {
    const props: PropertySig[] = [];
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      props.push({
        name: key,
        type: inferFromJSValue(val),
        optional: false,
        readonly: false,
      });
    }
    return objectType(props);
  }
  if (typeof value === "function") return functionType([], UNKNOWN);
  return UNKNOWN;
}

function isDefinitelyFalsy(t: TWTypeNode): boolean {
  if (t.kind === "literal") {
    return t.value === false || t.value === 0 || t.value === "" || t.value === null;
  }
  if (t.kind === "primitive") {
    return t.name === "null" || t.name === "undefined" || t.name === "never" || t.name === "void";
  }
  return false;
}

function isDefinitelyTruthy(t: TWTypeNode): boolean {
  if (t.kind === "literal") {
    return !(t.value === false || t.value === 0 || t.value === "" || t.value === null);
  }
  return false;
}

function getBuiltinProperty(objType: TWTypeNode, propName: string): TWTypeNode | null {
  // String methods
  if (objType.kind === "primitive" && objType.name === "string") {
    const strMethods: Record<string, TWTypeNode> = {
      length: NUMBER,
      charAt: functionType([{ name: "i", type: NUMBER, optional: false, defaultValue: false }], STRING),
      indexOf: functionType([{ name: "s", type: STRING, optional: false, defaultValue: false }], NUMBER),
      slice: functionType([
        { name: "start", type: NUMBER, optional: true, defaultValue: false },
        { name: "end", type: NUMBER, optional: true, defaultValue: false },
      ], STRING),
      split: functionType([{ name: "sep", type: STRING, optional: true, defaultValue: false }], arrayType(STRING)),
      toUpperCase: functionType([], STRING),
      toLowerCase: functionType([], STRING),
      trim: functionType([], STRING),
      replace: functionType([
        { name: "search", type: UNKNOWN, optional: false, defaultValue: false },
        { name: "replace", type: STRING, optional: false, defaultValue: false },
      ], STRING),
      includes: functionType([{ name: "s", type: STRING, optional: false, defaultValue: false }], BOOLEAN),
      startsWith: functionType([{ name: "s", type: STRING, optional: false, defaultValue: false }], BOOLEAN),
      endsWith: functionType([{ name: "s", type: STRING, optional: false, defaultValue: false }], BOOLEAN),
    };
    return strMethods[propName] ?? null;
  }

  // Array methods
  if (objType.kind === "array") {
    const arrMethods: Record<string, TWTypeNode> = {
      length: NUMBER,
      push: functionType([{ name: "item", type: UNKNOWN, optional: true, defaultValue: false }], NUMBER),
      pop: functionType([], UNKNOWN),
      shift: functionType([], UNKNOWN),
      unshift: functionType([{ name: "item", type: UNKNOWN, optional: true, defaultValue: false }], NUMBER),
      slice: functionType([
        { name: "start", type: NUMBER, optional: true, defaultValue: false },
        { name: "end", type: NUMBER, optional: true, defaultValue: false },
      ], arrayType(objType.elements?.[0] ?? UNKNOWN)),
      splice: functionType([
        { name: "start", type: NUMBER, optional: false, defaultValue: false },
        { name: "count", type: NUMBER, optional: true, defaultValue: false },
      ], arrayType(objType.elements?.[0] ?? UNKNOWN)),
      concat: functionType([{ name: "arr", type: UNKNOWN, optional: true, defaultValue: false }], arrayType(objType.elements?.[0] ?? UNKNOWN)),
      join: functionType([{ name: "sep", type: STRING, optional: true, defaultValue: false }], STRING),
      indexOf: functionType([{ name: "item", type: UNKNOWN, optional: false, defaultValue: false }], NUMBER),
      includes: functionType([{ name: "item", type: UNKNOWN, optional: false, defaultValue: false }], BOOLEAN),
      find: functionType([{ name: "fn", type: UNKNOWN, optional: false, defaultValue: false }], objType.elements?.[0] ?? UNKNOWN),
      filter: functionType([{ name: "fn", type: UNKNOWN, optional: false, defaultValue: false }], arrayType(objType.elements?.[0] ?? UNKNOWN)),
      map: functionType([{ name: "fn", type: UNKNOWN, optional: false, defaultValue: false }], arrayType(UNKNOWN)),
      reduce: functionType([{ name: "fn", type: UNKNOWN, optional: false, defaultValue: false }], UNKNOWN),
      forEach: functionType([{ name: "fn", type: UNKNOWN, optional: false, defaultValue: false }], VOID),
      sort: functionType([{ name: "fn", type: UNKNOWN, optional: true, defaultValue: false }], arrayType(objType.elements?.[0] ?? UNKNOWN)),
      reverse: functionType([], arrayType(objType.elements?.[0] ?? UNKNOWN)),
      flat: functionType([{ name: "depth", type: NUMBER, optional: true, defaultValue: false }], arrayType(UNKNOWN)),
      flatMap: functionType([{ name: "fn", type: UNKNOWN, optional: false, defaultValue: false }], arrayType(UNKNOWN)),
    };
    return arrMethods[propName] ?? null;
  }

  return null;
}

// --- Built-in Maps -----------------------------------------------------

const BUILTIN_FN_RETURN = new Map<string, TWTypeNode>([
  ["String", STRING],
  ["Number", NUMBER],
  ["Boolean", BOOLEAN],
  ["parseInt", NUMBER],
  ["parseFloat", NUMBER],
  ["isNaN", BOOLEAN],
  ["isFinite", BOOLEAN],
  ["Array", arrayType(UNKNOWN)],
  ["Object", objectType([])],
  ["JSON.stringify", STRING],
  ["JSON.parse", UNKNOWN],
  ["Math.floor", NUMBER],
  ["Math.ceil", NUMBER],
  ["Math.round", NUMBER],
  ["Math.abs", NUMBER],
  ["Math.max", NUMBER],
  ["Math.min", NUMBER],
  ["Math.pow", NUMBER],
  ["Math.sqrt", NUMBER],
  ["Math.random", NUMBER],
  ["Math.log", NUMBER],
  ["Math.exp", NUMBER],
  ["Math.sin", NUMBER],
  ["Math.cos", NUMBER],
  ["Math.tan", NUMBER],
  ["Object.keys", arrayType(STRING)],
  ["Object.values", arrayType(UNKNOWN)],
  ["Object.entries", arrayType(tupleType([STRING, UNKNOWN]))],
  ["Object.assign", objectType([])],
  ["Object.freeze", UNKNOWN],
  ["Array.from", arrayType(UNKNOWN)],
  ["Array.of", arrayType(UNKNOWN)],
  ["Array.isArray", BOOLEAN],
  ["String.fromCharCode", STRING],
  ["String.fromCodePoint", STRING],
  ["encodeURI", STRING],
  ["decodeURI", STRING],
  ["encodeURIComponent", STRING],
  ["decodeURIComponent", STRING],
]);

const GLOBAL_TYPES = new Map<string, TWTypeNode>([
  ["undefined", UNDEFINED],
  ["NaN", NUMBER],
  ["Infinity", NUMBER],
  ["Math", objectType([
    { name: "PI", type: NUMBER, optional: false, readonly: true },
    { name: "E", type: NUMBER, optional: false, readonly: true },
    { name: "LN2", type: NUMBER, optional: false, readonly: true },
    { name: "LN10", type: NUMBER, optional: false, readonly: true },
    { name: "LOG2E", type: NUMBER, optional: false, readonly: true },
    { name: "LOG10E", type: NUMBER, optional: false, readonly: true },
    { name: "SQRT2", type: NUMBER, optional: false, readonly: true },
    { name: "SQRT1_2", type: NUMBER, optional: false, readonly: true },
  ])],
  ["JSON", objectType([
    { name: "stringify", type: functionType([{ name: "v", type: UNKNOWN, optional: false, defaultValue: false }], STRING), optional: false, readonly: true },
    { name: "parse", type: functionType([{ name: "s", type: STRING, optional: false, defaultValue: false }], UNKNOWN), optional: false, readonly: true },
  ])],
  ["console", objectType([
    { name: "log", type: functionType([{ name: "args", type: UNKNOWN, optional: true, defaultValue: false }], VOID), optional: false, readonly: true },
    { name: "error", type: functionType([{ name: "args", type: UNKNOWN, optional: true, defaultValue: false }], VOID), optional: false, readonly: true },
    { name: "warn", type: functionType([{ name: "args", type: UNKNOWN, optional: true, defaultValue: false }], VOID), optional: false, readonly: true },
    { name: "info", type: functionType([{ name: "args", type: UNKNOWN, optional: true, defaultValue: false }], VOID), optional: false, readonly: true },
    { name: "debug", type: functionType([{ name: "args", type: UNKNOWN, optional: true, defaultValue: false }], VOID), optional: false, readonly: true },
  ])],
  ["Number", NUMBER],
  ["String", STRING],
  ["Boolean", BOOLEAN],
  ["Array", arrayType(UNKNOWN)],
  ["Object", objectType([])],
  ["Error", objectType([
    { name: "message", type: STRING, optional: false, readonly: true },
    { name: "name", type: STRING, optional: false, readonly: true },
  ])],
  ["Date", objectType([
    { name: "now", type: functionType([], NUMBER), optional: false, readonly: true },
  ])],
  ["Promise", genericType("Promise", [{ name: "T", constraint: null, defaultType: null }], [UNKNOWN])],
  ["Map", genericType("Map", [
    { name: "K", constraint: null, defaultType: null },
    { name: "V", constraint: null, defaultType: null },
  ])],
  ["Set", genericType("Set", [{ name: "T", constraint: null, defaultType: null }])],
  ["globalThis", UNKNOWN],
]);
