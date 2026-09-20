/** Operator precedence table for TW expression grammar. */

export interface PrecedenceEntry {
  operator: string;
  precedence: number;
  associativity: "left" | "right";
}

export const PRECEDENCE_TABLE: PrecedenceEntry[] = [
  { operator: "**", precedence: 12, associativity: "right" },
  { operator: "*", precedence: 11, associativity: "left" },
  { operator: "/", precedence: 11, associativity: "left" },
  { operator: "%", precedence: 11, associativity: "left" },
  { operator: "+", precedence: 10, associativity: "left" },
  { operator: "-", precedence: 10, associativity: "left" },
  { operator: "<<", precedence: 9, associativity: "left" },
  { operator: ">>", precedence: 9, associativity: "left" },
  { operator: ">>>", precedence: 9, associativity: "left" },
  { operator: "<", precedence: 8, associativity: "left" },
  { operator: "<=", precedence: 8, associativity: "left" },
  { operator: ">", precedence: 8, associativity: "left" },
  { operator: ">=", precedence: 8, associativity: "left" },
  { operator: "==", precedence: 7, associativity: "left" },
  { operator: "!=", precedence: 7, associativity: "left" },
  { operator: "===", precedence: 7, associativity: "left" },
  { operator: "!==", precedence: 7, associativity: "left" },
  { operator: "&", precedence: 6, associativity: "left" },
  { operator: "^", precedence: 5, associativity: "left" },
  { operator: "|", precedence: 4, associativity: "left" },
  { operator: "&&", precedence: 3, associativity: "left" },
  { operator: "||", precedence: 2, associativity: "left" },
  { operator: "??", precedence: 2, associativity: "left" },
  { operator: "?", precedence: 1, associativity: "right" },
  { operator: "=", precedence: 0, associativity: "right" },
  { operator: "+=", precedence: 0, associativity: "right" },
  { operator: "-=", precedence: 0, associativity: "right" },
  { operator: "*=", precedence: 0, associativity: "right" },
  { operator: "/=", precedence: 0, associativity: "right" },
  { operator: "%=", precedence: 0, associativity: "right" },
  { operator: "**=", precedence: 0, associativity: "right" },
  { operator: "&=", precedence: 0, associativity: "right" },
  { operator: "|=", precedence: 0, associativity: "right" },
  { operator: "^=", precedence: 0, associativity: "right" },
  { operator: "<<=", precedence: 0, associativity: "right" },
  { operator: ">>=", precedence: 0, associativity: "right" },
  { operator: ">>>=", precedence: 0, associativity: "right" },
  { operator: "&&=", precedence: 0, associativity: "right" },
  { operator: "||=", precedence: 0, associativity: "right" },
  { operator: "??=", precedence: 0, associativity: "right" },
  { operator: ",", precedence: -1, associativity: "left" },
];

export function getPrecedence(op: string): number {
  const entry = PRECEDENCE_TABLE.find(e => e.operator === op);
  return entry?.precedence ?? -1;
}

export function getAssociativity(op: string): "left" | "right" {
  const entry = PRECEDENCE_TABLE.find(e => e.operator === op);
  return entry?.associativity ?? "left";
}

export function isRightAssociative(op: string): boolean {
  return getAssociativity(op) === "right";
}

export function hasHigherPrecedence(op1: string, op2: string): boolean {
  return getPrecedence(op1) > getPrecedence(op2);
}

export function hasEqualPrecedence(op1: string, op2: string): boolean {
  return getPrecedence(op1) === getPrecedence(op2);
}
