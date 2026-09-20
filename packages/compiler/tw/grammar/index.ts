/** Grammar barrel -- re-exports. */

export { TW_GRAMMAR, getAllRules, getGrammarRule } from "./grammar";
export type { GrammarRule, GrammarSymbol, GrammarToken, Production } from "./grammar";
export { PRECEDENCE_TABLE, getAssociativity, getPrecedence, hasEqualPrecedence, hasHigherPrecedence, isRightAssociative } from "./precedence";
export type { PrecedenceEntry } from "./precedence";
export { SYNTAX_RULES, getRule, validateSyntax } from "./rules";
export type { SyntaxRule } from "./rules";
