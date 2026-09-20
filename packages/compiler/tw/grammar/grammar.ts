/** Grammar definition -- TW language grammar rules and productions. */

export type GrammarSymbol = "terminal" | "non-terminal";

export interface Production {
  name: string;
  symbols: GrammarToken[];
  action?: string;
}

export interface GrammarToken {
  type: GrammarSymbol;
  value: string;
  optional?: boolean;
  repeat?: boolean;
  alternatives?: string[];
  value2?: any;
}

export interface GrammarRule {
  name: string;
  productions: Production[];
}

export const TW_GRAMMAR: GrammarRule[] = [
  {
    name: "Program",
    productions: [
      { name: "Program", symbols: [{ type: "non-terminal", value: "DirectiveList" }, { type: "non-terminal", value: "StatementList" }] },
    ],
  },
  {
    name: "Element",
    productions: [
      { name: "Element", symbols: [{ type: "terminal", value: "OPEN_TAG" }, { type: "non-terminal", value: "AttrList", optional: true }, { type: "terminal", value: "GT" }, { type: "non-terminal", value: "StatementList", optional: true }, { type: "terminal", value: "CLOSE_TAG" }] },
      { name: "VoidElement", symbols: [{ type: "terminal", value: "OPEN_TAG" }, { type: "non-terminal", value: "AttrList", optional: true }, { type: "terminal", value: "SELF_CLOSE" }] },
    ],
  },
  {
    name: "Component",
    productions: [
      { name: "Component", symbols: [{ type: "terminal", value: "COMPONENT_NAME" }, { type: "non-terminal", value: "PropList", optional: true }, { type: "terminal", value: "GT" }, { type: "non-terminal", value: "StatementList", optional: true }, { type: "terminal", value: "CLOSE_TAG" }] },
      { name: "SelfClosingComponent", symbols: [{ type: "terminal", value: "COMPONENT_NAME" }, { type: "non-terminal", value: "PropList", optional: true }, { type: "terminal", value: "SELF_CLOSE" }] },
    ],
  },
  {
    name: "IfStatement",
    productions: [
      { name: "IfStatement", symbols: [{ type: "terminal", value: "KEYWORD", value2: "if" as any }, { type: "non-terminal", value: "Expression" }, { type: "terminal", value: "LBRACE" }, { type: "non-terminal", value: "StatementList" }, { type: "terminal", value: "RBRACE" }, { type: "non-terminal", value: "ElseBlock", optional: true }] },
    ],
  },
  {
    name: "ForStatement",
    productions: [
      { name: "ForStatement", symbols: [{ type: "terminal", value: "KEYWORD", value2: "for" as any }, { type: "non-terminal", value: "Identifier" }, { type: "terminal", value: "KEYWORD", value2: "of" as any }, { type: "non-terminal", value: "Expression" }, { type: "terminal", value: "LBRACE" }, { type: "non-terminal", value: "StatementList" }, { type: "terminal", value: "RBRACE" }] },
    ],
  },
];

export function getGrammarRule(name: string): GrammarRule | null {
  return TW_GRAMMAR.find(r => r.name === name) ?? null;
}

export function getAllRules(): GrammarRule[] {
  return TW_GRAMMAR;
}
