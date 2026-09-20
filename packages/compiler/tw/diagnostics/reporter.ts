/** Main diagnostic reporter and rule engine. */

import { type DiagnosticSeverity, type Diagnostic, type DiagnosticCategory, type ErrorCode, type AutofixSuggestion } from "./types";
import { ERROR_CODES } from "./codes";
import { type Program } from "../ast/nodes";
import { checkUnknownTags, checkCSSProperties, checkEventTypes, checkAttributes, checkAccessibility, checkPerformance, checkSecurity, checkBestPractices, checkSemanticErrors, checkDirectives, checkUnusedDeclarations } from "./rules";

export function createDiagnostic(
  code: ErrorCode,
  line: number,
  col: number,
  filePath: string,
  snippet?: string,
  suggestions?: string[],
  autofix?: AutofixSuggestion,
): Diagnostic {
  const info = ERROR_CODES[code];
  return {
    severity: info.severity,
    message: info.message,
    line,
    col,
    filePath,
    code,
    snippet,
    suggestions,
    autofix,
    category: info.category,
  };
}



export function diagnose(program: Program, filePath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Rule: check HTML tags
  checkUnknownTags(program, filePath, diagnostics);
  // Rule: check CSS properties
  checkCSSProperties(program, filePath, diagnostics);
  // Rule: check event types
  checkEventTypes(program, filePath, diagnostics);
  // Rule: check attributes
  checkAttributes(program, filePath, diagnostics);
  // Rule: check accessibility
  checkAccessibility(program, filePath, diagnostics);
  // Rule: check performance
  checkPerformance(program, filePath, diagnostics);
  // Rule: check security
  checkSecurity(program, filePath, diagnostics);
  // Rule: check best practices
  checkBestPractices(program, filePath, diagnostics);
  // Rule: check semantic errors
  checkSemanticErrors(program, filePath, diagnostics);
  // Rule: check directives
  checkDirectives(program, filePath, diagnostics);
  // Rule: check unused imports/state
  checkUnusedDeclarations(program, filePath, diagnostics);

  return diagnostics;
}



export interface DiagnosticRule {
  name: string;
  description: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  check: (program: Program, filePath: string) => Diagnostic[];
  enabled: boolean;
}

export class RuleEngine {
  private rules: Map<string, DiagnosticRule> = new Map();

  register(rule: DiagnosticRule): void {
    this.rules.set(rule.name, rule);
  }

  enable(name: string): void {
    const rule = this.rules.get(name);
    if (rule) rule.enabled = true;
  }

  disable(name: string): void {
    const rule = this.rules.get(name);
    if (rule) rule.enabled = false;
  }

  run(program: Program, filePath: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      diagnostics.push(...rule.check(program, filePath));
    }
    return diagnostics;
  }

  getRules(): string[] {
    return Array.from(this.rules.keys());
  }
}