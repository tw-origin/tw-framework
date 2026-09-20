/**
 * Pull Diagnostics Provider -- on-demand diagnostics (LSP 3.17 pull model).
 * @module lsp/pull-diagnostics/provider
 */
import type { Diagnostic, LSPDocument } from "../types";
import { DiagnosticsProvider } from "../diagnostics/provider";
import { DocumentSyncManager } from "../document-sync/manager";

export type DiagnosticCategory = "syntax" | "semantic" | "style" | "lint" | "accessibility";
export interface CategorizedDiagnostic extends Diagnostic { category: DiagnosticCategory; }
export interface PullDiagnosticsResult { kind: "full" | "unchanged"; items: CategorizedDiagnostic[]; resultId?: string; }

export class PullDiagnosticsProvider {
  private docManager: DocumentSyncManager;
  private diagProvider: DiagnosticsProvider;
  private cache: Map<string, { resultId: string; diagnostics: CategorizedDiagnostic[] }> = new Map();
  private nextResultId: number = 1;
  constructor(docManager: DocumentSyncManager, diagProvider?: DiagnosticsProvider) { this.docManager = docManager; this.diagProvider = diagProvider ?? new DiagnosticsProvider(); }

  getDiagnostics(uri: string, previousResultId?: string): PullDiagnosticsResult {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return { kind: "full", items: [] };
    const resultId = `${this.nextResultId++}`;
    const raw = this.diagProvider.analyze(doc);
    const categorized = raw.map(d => this.categorize(d));
    const cached = this.cache.get(uri);
    if (cached && cached.resultId === previousResultId && this.compareDiagnostics(cached.diagnostics, categorized)) return { kind: "unchanged", items: [], resultId: cached.resultId };
    this.cache.set(uri, { resultId, diagnostics: categorized });
    return { kind: "full", items: categorized, resultId };
  }

  private categorize(diag: Diagnostic): CategorizedDiagnostic {
    let category: DiagnosticCategory = "syntax";
    if (diag.code) { const num = parseInt(String(diag.code).slice(2), 10); if (num <= 2) category = "syntax"; else if (num <= 8) category = "semantic"; else if (num <= 12) category = "lint"; else if (num <= 18) category = "accessibility"; else category = "style"; }
    return { ...diag, category };
  }

  private compareDiagnostics(a: CategorizedDiagnostic[], b: CategorizedDiagnostic[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i].message !== b[i].message || a[i].code !== b[i].code || a[i].severity !== b[i].severity) return false;
    return true;
  }

  clearCache(uri: string): void { this.cache.delete(uri); }
  clearAllCache(): void { this.cache.clear(); }
}
export function createPullDiagnosticsProvider(docManager: DocumentSyncManager, diagProvider?: DiagnosticsProvider): PullDiagnosticsProvider { return new PullDiagnosticsProvider(docManager, diagProvider); }
