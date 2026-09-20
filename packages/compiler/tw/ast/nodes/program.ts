/** Program root node and parse error node. */

import { type BaseNode } from "./base";
import type { ASTNode } from "./types";
import type { DirectiveNode } from "./directives";

export interface Program extends BaseNode {
  type: "Program";
  body: ASTNode[];
  directives: DirectiveNode[];
  filePath?: string;
  source?: string;
  comments?: Comment[];
  errors?: ParseError[];
}

export interface ParseError {
  message: string;
  line: number;
  col: number;
  severity: "error" | "warning" | "info";
  code?: string;
}

