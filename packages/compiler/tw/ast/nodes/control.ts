/** Control flow nodes - If, ElseIf, For, While, Switch, Try. */

import { type BaseNode } from "./base";
import type { ASTNode } from "./types";
import type { DestructurePattern } from "./expressions";

export interface IfNode extends BaseNode {
  type: "If";
  condition: string;
  body: ASTNode[];
  elseBody: ASTNode[];
  elseIfs: ElseIfNode[];
  isConstant: boolean;
}

export interface ElseIfNode extends BaseNode {
  type: "ElseIf";
  condition: string;
  body: ASTNode[];
}

export interface ForNode extends BaseNode {
  type: "For";
  varName: string;
  indexName?: string;
  iterable: string;
  body: ASTNode[];
  keyExpression?: string;
  destructured?: DestructurePattern;
}

export interface WhileNode extends BaseNode {
  type: "While";
  condition: string;
  body: ASTNode[];
}

export interface SwitchNode extends BaseNode {
  type: "Switch";
  expression: string;
  cases: SwitchCase[];
  defaultBody: ASTNode[];
}

export interface SwitchCase extends BaseNode {
  type: "SwitchCase";
  value: string;
  body: ASTNode[];
  fallthrough: boolean;
}

export interface TryNode extends BaseNode {
  type: "Try";
  body: ASTNode[];
  catchBody: ASTNode[];
  catchVar?: string;
  finallyBody: ASTNode[];
}

