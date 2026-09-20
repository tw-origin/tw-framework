import type { SourceLocation } from "../../lexer/tokens/types";
/** Base AST node types - ASTNodeType, BaseNode, Comment. */


export type ASTNodeType = string;

export interface BaseNode {
  type: ASTNodeType;
  line: number;
  col: number;
  endLine?: number;
  endCol?: number;
  sourceLoc?: SourceLocation;
  leadingComments?: Comment[];
  trailingComments?: Comment[];
}

export interface Comment {
  type: "line" | "block" | "html";
  value: string;
  line: number;
  col: number;
}

