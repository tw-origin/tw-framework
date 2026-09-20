/** Diagnostic formatting - human-readable output. */

import { type Diagnostic } from "./types";

export function formatDiagnostic(diag: Diagnostic): string {
  const sev = diag.severity.toUpperCase().padEnd(5);
  const loc = `${diag.filePath}:${diag.line}:${diag.col}`;
  let msg = `${sev} [${diag.code}] ${diag.message} at ${loc}`;

  if (diag.snippet) {
    msg += `\n  ${diag.snippet}`;
  }
  if (diag.suggestions && diag.suggestions.length > 0) {
    msg += `\n  Suggestions: ${diag.suggestions.join(", ")}`;
  }
  if (diag.autofix) {
    msg += `\n  Autofix available: ${diag.autofix.title}`;
  }

  return msg;
}

export function formatDiagnostics(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return "No diagnostics found.";
  return diagnostics.map(formatDiagnostic).join("\n\n");
}

export function countBySeverity(diagnostics: Diagnostic[]): { errors: number; warnings: number; info: number; hints: number } {
  let errors = 0, warnings = 0, info = 0, hints = 0;
  for (const d of diagnostics) {
    switch (d.severity) {
      case "error": errors++; break;
      case "warning": warnings++; break;
      case "info": info++; break;
      case "hint": hints++; break;
      default:
        break;

    }
  }
  return { errors, warnings, info, hints };
}

