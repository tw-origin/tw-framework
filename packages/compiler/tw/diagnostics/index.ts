/** Diagnostics barrel - re-exports from split sub-modules. */

export { ERROR_CODES } from "./codes";
export { countBySeverity, formatDiagnostic, formatDiagnostics } from "./formatter";
export { RuleEngine, createDiagnostic, diagnose } from "./reporter";
export type { DiagnosticRule } from "./reporter";
export { BUILTIN_RULES, RulesEngine, createDefaultRulesEngine, createRulesEngine, formatDiagnosticReport, getBuiltinRuleCount, getBuiltinRulesByCategory, getBuiltinRulesBySeverity, getDiagnosticStats } from "./rules-engine";
export type { DiagnosticCategory, DiagnosticContext, DiagnosticMessage, DiagnosticReport, DiagnosticSeverity, DiagnosticSuggestion } from "./rules-engine";
export type { AutofixSuggestion, Diagnostic, ErrorCode } from "./types";
