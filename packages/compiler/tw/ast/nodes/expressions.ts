/** Expression nodes - Literal, Binary, Unary, Call, etc. */

import { type BaseNode } from "./base";
import type { ASTNode } from "./types";

export type ExpressionNode =
  | LiteralExpr
  | IdentifierExpr
  | BinaryExpr
  | UnaryExpr
  | LogicalExpr
  | ConditionalExpr
  | MemberExpr
  | CallExpr
  | AssignmentExpr
  | ArrayExpr
  | ObjectExpr
  | ArrowFnExpr
  | TemplateExpr
  | SpreadExpr
  | AwaitExpr
  | YieldExpr
  | NewExpr
  | SequenceExpr;

export interface LiteralExpr extends BaseNode {
  type: "Literal";
  value: string | number | boolean | null;
  dataType: "string" | "number" | "boolean" | "null";
  raw: string;
}

export interface IdentifierExpr extends BaseNode {
  type: "Identifier";
  name: string;
}

export interface BinaryExpr extends BaseNode {
  type: "BinaryExpr";
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface UnaryExpr extends BaseNode {
  type: "UnaryExpr";
  operator: string;
  operand: ExpressionNode;
  prefix: boolean;
}

export interface LogicalExpr extends BaseNode {
  type: "LogicalExpr";
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface ConditionalExpr extends BaseNode {
  type: "ConditionalExpr";
  test: ExpressionNode;
  consequent: ExpressionNode;
  alternate: ExpressionNode;
}

export interface MemberExpr extends BaseNode {
  type: "MemberExpr";
  object: ExpressionNode;
  property: ExpressionNode;
  computed: boolean;
  optional: boolean;
}

export interface CallExpr extends BaseNode {
  type: "CallExpr";
  callee: ExpressionNode;
  args: ExpressionNode[];
  optional: boolean;
}

export interface AssignmentExpr extends BaseNode {
  type: "AssignmentExpr";
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface ArrayExpr extends BaseNode {
  type: "ArrayExpr";
  elements: (ExpressionNode | null)[];
}

export interface ObjectExpr extends BaseNode {
  type: "ObjectExpr";
  properties: ObjectProperty[];
}

export interface ObjectProperty {
  key: string;
  value: ExpressionNode;
  computed: boolean;
  shorthand: boolean;
  isMethod: boolean;
}

export interface ArrowFnExpr extends BaseNode {
  type: "ArrowFn";
  params: Param[];
  body: ExpressionNode | ASTNode[];
  expression: boolean;
  async: boolean;
}

export interface Param {
  name: string;
  default?: ExpressionNode;
  rest: boolean;
  type?: string;
}

export interface TemplateExpr extends BaseNode {
  type: "TemplateExpr";
  quasis: string[];
  expressions: ExpressionNode[];
}

export interface SpreadExpr extends BaseNode {
  type: "Spread";
  argument: ExpressionNode;
}

export interface AwaitExpr extends BaseNode {
  type: "Await";
  argument: ExpressionNode;
}

export interface YieldExpr extends BaseNode {
  type: "Yield";
  argument: ExpressionNode | null;
  delegate: boolean;
}

export interface NewExpr extends BaseNode {
  type: "NewExpr";
  callee: ExpressionNode;
  args: ExpressionNode[];
}

export interface SequenceExpr extends BaseNode {
  type: "SequenceExpr";
  expressions: ExpressionNode[];
}

export interface DestructurePattern {
  type: "array" | "object";
  properties: DestructureProperty[];
  rest?: string;
}

export interface DestructureProperty {
  key: string;
  value?: string;
  default?: string;
  rest: boolean;
}

