/**
 * Operator precedence table -- full JavaScript-like precedence.
 *
 * Precedence climbing algorithm: instead of recursive descent for each
 * precedence level (which creates deep call stacks), we use a single
 * parseBinaryExpr function that checks the current operator's precedence
 * and loops until a lower-precedence operator is found.
 *
 * This is the same approach used by V8, SWC, and Babel.
 * It's faster than naive recursive descent because:
 * - Fewer function calls (no one function per level)
 * - Better cache locality (single hot loop)
 * - Easier to extend (just add to the table)
 *
 * Reference: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_precedence
 */

export type Associativity = "left" | "right" | "none";

export interface PrecedenceEntry {
  /** Precedence level (higher = binds tighter) */
  level: number;
  /** Associativity direction */
  assoc: Associativity;
  /** Operator string (e.g. "+", "&&", "?.") */
  operators: string[];
  /** AST node type for this operator */
  nodeType: string;
}

/**
 * Full precedence table -- 15 levels, matching JavaScript spec.
 *
 * Level 15 (highest): grouping, member access, call
 * Level 14: new (with args), function call
 * Level 13: postfix ++ --
 * Level 12: ! ~ + - ++ -- typeof void delete await
 * Level 11: ** (right-assoc)
 * Level 10: * / %
 * Level 9: + -
 * Level 8: << >> >>>
 * Level 7: < <= > >= in instanceof
 * Level 6: === != === !==
 * Level 5: & (bitwise AND)
 * Level 4: ^ (bitwise XOR)
 * Level 3: | (bitwise OR)
 * Level 2: && (logical AND)
 * Level 1: || ?? (logical OR / nullish coalescing)
 * Level 0: ?: = += -= etc (conditional / assignment)
 */

export const PRECEDENCE: readonly PrecedenceEntry[] = [
  // Level 15: Member access, call, new with args
  // Handled separately in parsePrimary/parsePostfix

  // Level 14: Unary prefix
  { level: 14, assoc: "right", operators: ["!", "~", "+", "-", "typeof", "void", "delete", "await"], nodeType: "UnaryExpression" },

  // Level 13: Postfix ++ --
  { level: 13, assoc: "none", operators: ["++", "--"], nodeType: "UpdateExpression" },

  // Level 12: Exponentiation ** (right-assoc)
  { level: 12, assoc: "right", operators: ["**"], nodeType: "BinaryExpression" },

  // Level 11: Multiplication, division, modulo
  { level: 11, assoc: "left", operators: ["*", "/", "%"], nodeType: "BinaryExpression" },

  // Level 10: Addition, subtraction
  { level: 10, assoc: "left", operators: ["+", "-"], nodeType: "BinaryExpression" },

  // Level 9: Bitwise shifts
  { level: 9, assoc: "left", operators: ["<<", ">>", ">>>"], nodeType: "BinaryExpression" },

  // Level 8: Relational
  { level: 8, assoc: "left", operators: ["<", "<=", ">", ">=", "in", "instanceof"], nodeType: "BinaryExpression" },

  // Level 7: Equality
  { level: 7, assoc: "left", operators: ["==", "!=", "===", "!=="], nodeType: "BinaryExpression" },

  // Level 6: Bitwise AND
  { level: 6, assoc: "left", operators: ["&"], nodeType: "BinaryExpression" },

  // Level 5: Bitwise XOR
  { level: 5, assoc: "left", operators: ["^"], nodeType: "BinaryExpression" },

  // Level 4: Bitwise OR
  { level: 4, assoc: "left", operators: ["|"], nodeType: "BinaryExpression" },

  // Level 3: Logical AND
  { level: 3, assoc: "left", operators: ["&&"], nodeType: "LogicalExpression" },

  // Level 2: Logical OR, nullish coalescing
  { level: 2, assoc: "left", operators: ["||", "??"], nodeType: "LogicalExpression" },

  // Level 1: Conditional (ternary) -- right-assoc
  { level: 1, assoc: "right", operators: ["?"], nodeType: "ConditionalExpression" },

  // Level 0: Assignment -- right-assoc
  { level: 0, assoc: "right", operators: [
    "=", "+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>=", ">>>=",
    "&=", "|=", "^=", "&&=", "||=", "??=",
  ], nodeType: "AssignmentExpression" },
];

// --- Lookup Maps ------------------------------------------------------

/** Operator -> precedence level */
const OP_LEVEL = new Map<string, number>();
/** Operator -> associativity */
const OP_ASSOC = new Map<string, Associativity>();
/** Operator -> AST node type */
const OP_NODE = new Map<string, string>();

for (const entry of PRECEDENCE) {
  for (const op of entry.operators) {
    OP_LEVEL.set(op, entry.level);
    OP_ASSOC.set(op, entry.assoc);
    OP_NODE.set(op, entry.nodeType);
  }
}

/**
 * Get precedence level for an operator.
 * Returns -1 if not a binary operator.
 */
export function getPrecedence(op: string): number {
  return OP_LEVEL.get(op) ?? -1;
}

/**
 * Get associativity for an operator.
 */
export function getAssociativity(op: string): Associativity {
  return OP_ASSOC.get(op) ?? "left";
}

/**
 * Get AST node type for an operator.
 */
export function getNodeType(op: string): string {
  return OP_NODE.get(op) ?? "BinaryExpression";
}

/**
 * Check if an operator is right-associative.
 */
export function isRightAssociative(op: string): boolean {
  return getAssociativity(op) === "right";
}

/**
 * Check if an operator has higher precedence than another.
 */
export function hasHigherPrec(op1: string, op2: string): boolean {
  const p1 = getPrecedence(op1);
  const p2 = getPrecedence(op2);
  if (p1 === p2) {
    // Same precedence: right-assoc operators bind right
    return isRightAssociative(op2);
  }
  return p1 > p2;
}

/**
 * Check if we should continue parsing a binary expression.
 * Returns true if the current operator should be consumed
 * (i.e. it has higher or equal precedence to the minimum).
 *
 * For left-assoc: continue if current > minLevel OR current === minLevel
 * For right-assoc: continue only if current > minLevel
 */
export function shouldContinue(op: string, minLevel: number): boolean {
  const level = getPrecedence(op);
  if (level < 0) return false;
  if (level > minLevel) return true;
  if (level === minLevel) {
    return !isRightAssociative(op);
  }
  return false;
}

// --- Member Access Operators ------------------------------------------

/** Operators that access members (level 15) */
export const MEMBER_OPS = new Set([".", "?.", "[", "("]);

/** Check if operator is member access */
export function isMemberOp(op: string): boolean {
  return MEMBER_OPS.has(op);
}

// --- Chain Expression Detection --------------------------------------

/**
 * Detect optional chaining chains.
 * a?.b?.c -> ChainExpression { expression: OptionalExpression }
 *
 * This is needed for correct evaluation of optional chaining.
 */
export function isOptionalChainStart(op: string): boolean {
  return op === "?.";
}

// --- Spread/Rest Detection -------------------------------------------

/**
 * Check if ... is spread (in call args) or rest (in params).
 * Context-dependent -- the parser determines which based on position.
 */
export function isSpreadOrRest(op: string): boolean {
  return op === "...";
}

// --- Assignment Detection --------------------------------------------

const ASSIGNMENT_OPS = new Set([
  "=", "+=", "-=", "*=", "/=", "%=", "**=",
  "<<=", ">>=", ">>>=", "&=", "|=", "^=",
  "&&=", "||=", "??=",
]);

export function isAssignmentOp(op: string): boolean {
  return ASSIGNMENT_OPS.has(op);
}

// --- Comparison Detection --------------------------------------------

const COMPARISON_OPS = new Set(["<", "<=", ">", ">=", "==", "!=", "===", "!=="]);

export function isComparisonOp(op: string): boolean {
  return COMPARISON_OPS.has(op);
}

// --- Logical Detection ------------------------------------------------

export function isLogicalOp(op: string): boolean {
  return op === "&&" || op === "||" || op === "??";
}

// --- Arithmetic Detection --------------------------------------------

export function isArithmeticOp(op: string): boolean {
  return op === "+" || op === "-" || op === "*" || op === "/" || op === "%" || op === "**";
}

// --- Bitwise Detection ------------------------------------------------

export function isBitwiseOp(op: string): boolean {
  return op === "&" || op === "|" || op === "^" || op === "<<" || op === ">>" || op === ">>>";
}

// --- Update Detection ------------------------------------------------

export function isUpdateOp(op: string): boolean {
  return op === "++" || op === "--";
}

// --- Unary Prefix Detection ------------------------------------------

const UNARY_PREFIX_OPS = new Set(["!", "~", "+", "-", "typeof", "void", "delete", "await"]);

export function isUnaryPrefixOp(op: string): boolean {
  return UNARY_PREFIX_OPS.has(op);
}
