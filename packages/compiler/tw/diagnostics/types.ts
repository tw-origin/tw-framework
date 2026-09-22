import type { Program } from "../ast/nodes/program";
/** Diagnostic types and interfaces. */

export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";


export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  line: number;
  col: number;
  filePath: string;
  code: string;
  snippet?: string;
  suggestions?: string[];
  autofix?: AutofixSuggestion;
  category: DiagnosticCategory;
}


export type DiagnosticCategory =
  | "syntax" | "semantic" | "performance" | "accessibility"
  | "security" | "best-practice" | "deprecation" | "style" | "type";


export type ErrorCode =
  // Syntax errors (TW001-TW019)
  | "TW001" | "TW002" | "TW003" | "TW004" | "TW005"
  | "TW006" | "TW007" | "TW008" | "TW009" | "TW010"
  | "TW011" | "TW012" | "TW013" | "TW014" | "TW015"
  | "TW016" | "TW017" | "TW018" | "TW019" | "TW020"
  // Semantic errors (TW021-TW039)
  | "TW021" | "TW022" | "TW023" | "TW024" | "TW025"
  | "TW026" | "TW027" | "TW028" | "TW029" | "TW030"
  | "TW031" | "TW032" | "TW033" | "TW034" | "TW035"
  | "TW036" | "TW037" | "TW038" | "TW039"
  // Accessibility (TW040-TW049)
  | "TW040" | "TW041" | "TW042" | "TW043" | "TW044"
  | "TW045" | "TW046" | "TW047" | "TW048" | "TW049"
  // Performance (TW050-TW059)
  | "TW050" | "TW051" | "TW052" | "TW053" | "TW054"
  | "TW055" | "TW056" | "TW057" | "TW058" | "TW059"
  // Security (TW060-TW069)
  | "TW060" | "TW061" | "TW062" | "TW063" | "TW064"
  | "TW065" | "TW066" | "TW067" | "TW068" | "TW069"
  // Best practices (TW070-TW079)
  | "TW070" | "TW071" | "TW072" | "TW073" | "TW074"
  | "TW075" | "TW076" | "TW077" | "TW078" | "TW079"
  // Deprecation (TW080-TW089)
  | "TW080" | "TW081" | "TW082" | "TW083" | "TW084"
  | "TW085" | "TW086" | "TW087" | "TW088" | "TW089"
  // Cache (TW090-TW093, docs/cache-tags.md)
  | "TW090" | "TW091" | "TW092" | "TW093";


export interface AutofixSuggestion {
  title: string;
  description: string;
  range: { startLine: number; startCol: number; endLine: number; endCol: number };
  replacement: string;
}


export interface DiagnosticRule {
  name: string;
  description: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  check: (program: Program, filePath: string) => Diagnostic[];
  enabled: boolean;
}


